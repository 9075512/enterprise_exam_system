<script setup lang="ts">
/**
 * 题库详情页（W3-T4，PRD §7.4）。
 * 科目结构只读；本页聚焦题量概览、筛选、分页与内容维护。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  EditPen,
  Plus,
  Upload,
  UploadFilled,
  Search,
  Refresh,
  ArrowLeft,
  Collection,
  List as ListIcon,
  CircleCheck,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as questionsApi from '@/api/questions';
import { qualityApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import { useConfirm } from '@/composables/useConfirm';
import {
  BANK_TEXT,
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_DIFFICULTY_OPTIONS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
} from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import BatchActionBar from '@/components/common/BatchActionBar.vue';
import StatCard from '@/components/common/StatCard.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import QuestionFormDialog from './QuestionFormDialog.vue';
import QuestionImportDialog from './QuestionImportDialog.vue';
import QuestionBatchEditDialog from './QuestionBatchEditDialog.vue';
import type { Question, QuestionBank, QuestionDifficulty, QuestionType } from '@/types';

const props = withDefaults(defineProps<{ selectedBankId?: string; embedded?: boolean }>(), { selectedBankId: '', embedded: false });

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const settingsStore = useSettingsStore();

const bankId = computed<string>(() => props.selectedBankId || String(route.params.bankId ?? ''));

/* ------------------------------ 题库信息 ------------------------------ */
const { data: bank, loading: bankLoading, refresh: refreshBank } = useRequest(() =>
  banksApi.detail(bankId.value),
);
const canEdit = computed<boolean>(() => bank.value?.canEdit === true);

/* ------------------------------ 题量与题型统计 ------------------------------ */
/**
 * 复用后端统计结果展示总量与题型分布；正确率和知识点健康度不再在题库管理中展示。
 */
const { data: stats, refresh: refreshStats } = useRequest(() =>
  banksApi.questionStats(bankId.value),
);

/** 题型分布（未加载时给全 0，避免模板判空） */
const typeCount = computed(
  (): Record<QuestionType, number> =>
    stats.value?.byType ?? { single: 0, multiple: 0, judge: 0, fill: 0, short: 0 },
);

/* ------------------------------ 试题筛选 ------------------------------ */
const filterType = ref<QuestionType | ''>('');
const filterStatus = ref<'active' | 'disabled' | ''>('');
const filterDifficulty = ref<QuestionDifficulty | ''>('');
const filterKeyword = ref('');

/* ------------------------------ 试题分页 ------------------------------ */
const {
  list: questions,
  page,
  pageSize,
  total,
  loading,
  load,
  onPageChange,
  onSizeChange,
  reset,
} = usePagination<Question>(
  (p, ps) =>
    banksApi.questions(bankId.value, {
      type: filterType.value,
      status: filterStatus.value,
      difficulty: filterDifficulty.value,
      keyword: filterKeyword.value.trim(),
      page: p,
      pageSize: ps,
    }),
  settingsStore.settings.defaultPageSize,
);

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路） */
const hasFilter = computed<boolean>(() =>
  Boolean(
    filterType.value ||
      filterStatus.value ||
      filterDifficulty.value ||
      filterKeyword.value.trim(),
  ),
);

function onSearch(): void {
  reset();
}

function onResetFilters(): void {
  filterType.value = '';
  filterStatus.value = '';
  filterDifficulty.value = '';
  filterKeyword.value = '';
  reset();
}

/** 新建/编辑/导入后统一刷新 */
function reloadAll(): void {
  void refreshBank();
  void refreshStats();
  void load();
}

/* ------------------------------ 批量编辑（v1.7②） ------------------------------ */
/** el-table 实例（仅用于清空勾选） */
const tableRef = ref<{ clearSelection: () => void } | null>(null);
const selectedRows = ref<Question[]>([]);
const batchVisible = ref(false);

/** 跨页保留勾选（row-key 已设置，用 reserve-selection 保证翻页不丢选） */
function onSelectionChange(rows: Question[]): void {
  selectedRows.value = rows;
}

function openBatchEdit(): void {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先勾选需要批量编辑的试题');
    return;
  }
  batchVisible.value = true;
}

/** 清空勾选（批量条「取消选择」/ 批量编辑完成后复用） */
function clearSelection(): void {
  tableRef.value?.clearSelection();
  selectedRows.value = [];
}

/** 批量编辑完成后清空勾选并刷新 */
function onBatchSaved(): void {
  clearSelection();
  reloadAll();
}

const migrateVisible = ref(false);
const migrateBanks = ref<QuestionBank[]>([]);
const migrateTargetBankId = ref('');
const qualityLoading = ref(false);

async function runQualityAction(action: 'enable' | 'disable' | 'delete' | 'validate'): Promise<void> {
  if (!selectedRows.value.length) return;
  if (action === 'delete') {
    const ok = await confirm('确认物理删除所选试题？已被试卷引用的题目会被后端拒绝，请改为停用。', { title: '批量删除' });
    if (!ok) return;
  }
  qualityLoading.value = true;
  try {
    const result = await qualityApi.batch(selectedRows.value.map((q) => q.id), action);
    if (action === 'validate') {
      const issueCount = result.issues?.length ?? 0;
      ElMessage[issueCount ? 'warning' : 'success'](issueCount ? `校验完成，${issueCount} 道题存在问题` : '完整性校验通过');
    } else ElMessage.success(`已处理 ${result.affected} 道试题`);
    clearSelection();
    reloadAll();
  } finally { qualityLoading.value = false; }
}

async function openMigrate(): Promise<void> {
  migrateBanks.value = (await banksApi.list()).filter((item) => item.id !== bankId.value && item.canEdit);
  migrateTargetBankId.value = '';
  migrateVisible.value = true;
}

async function submitMigrate(): Promise<void> {
  if (!migrateTargetBankId.value) { ElMessage.warning('请选择目标题库'); return; }
  qualityLoading.value = true;
  try {
    const result = await qualityApi.batch(selectedRows.value.map((q) => q.id), 'migrate', migrateTargetBankId.value);
    ElMessage.success(`已迁移 ${result.affected} 道试题`);
    migrateVisible.value = false;
    clearSelection();
    reloadAll();
  } finally { qualityLoading.value = false; }
}

/* ------------------------------ 试题弹窗 ------------------------------ */
const formVisible = ref(false);
const editingQuestion = ref<Question | null>(null);

function openCreate(): void {
  editingQuestion.value = null;
  formVisible.value = true;
}

function openEditQuestion(question: Question): void {
  editingQuestion.value = question;
  formVisible.value = true;
}

const importVisible = ref(false);
function openImport(): void {
  importVisible.value = true;
}

/** 删除试题 */
async function handleDeleteQuestion(question: Question): Promise<void> {
  const ok = await confirm('确认删除该试题？已组入试卷的历史快照不受影响。', {
    title: '删除试题',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;
  try {
    await questionsApi.remove(question.id);
    ElMessage.success('试题已删除');
    reloadAll();
  } catch {
    // 错误提示已由 http.server 拦截器统一弹出
  }
}

function goBack(): void {
  void router.push('/author/banks');
}

/** bankId 变化时重新初始化（同一组件实例内切换路由参数） */
watch(bankId, () => {
  void refreshBank();
  void refreshStats();
  reset();
});

onMounted(() => {
  void settingsStore.load();
  void refreshStats();
  void load();
});
</script>

<template>
  <div class="bank-detail">
    <PageHeader v-if="!props.embedded" title="题库详情" :description="bank?.name || '维护题库内的试题'">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="bankLoading && !bank" :rows="2" />
    <section v-else-if="bank" class="bank-overview">
      <div class="bank-overview__heading">
        <div class="bank-overview__title-row">
          <h2 :title="bank.name">{{ bank.name }}</h2>
          <el-tag :type="bank.effectiveStatus === 'active' ? 'success' : 'info'" effect="plain">
            {{ bank.effectiveStatus === 'active' ? '启用' : '停用' }}
          </el-tag>
          <el-tag v-if="bank.allowPractice" type="success" effect="plain">练题已开放</el-tag>
        </div>
        <p v-if="bank.description">{{ bank.description }}</p>
      </div>
      <div class="bank-overview__meta">
        <span>题目 <strong>{{ bank.questionCount }}</strong></span>
        <span>创建人 <strong>{{ bank.createdBy || '—' }}</strong></span>
        <span>授权出题人 <strong>{{ bank.authorNames?.length ? bank.authorNames.join('、') : '未授权' }}</strong></span>
        <span>创建于 <strong>{{ formatDateTime(bank.createdAt) }}</strong></span>
      </div>
    </section>

    <!-- 题目概览：仅保留题量与题型分布。 -->
    <div class="bank-detail__stats">
      <StatCard density="compact" label="题目总数" :value="stats?.total ?? 0" unit="道" :icon="Collection" />
      <StatCard
        density="compact"
        label="单选 / 多选"
        :value="`${typeCount.single} / ${typeCount.multiple}`"
        :icon="ListIcon"
      />
      <StatCard
        density="compact"
        label="判断 / 简答"
        :value="`${typeCount.judge} / ${typeCount.short}`"
        :icon="CircleCheck"
      >
        <template v-if="typeCount.fill > 0" #foot>含填空 {{ typeCount.fill }} 道</template>
      </StatCard>
    </div>

    <section class="bank-detail__main">
        <el-card class="table-card" shadow="never">
          <div class="table-card__toolbar">
            <h3 class="bank-detail__title">试题（{{ total }}）</h3>
            <div class="bank-detail__toolbar-actions">
              <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">手动新增</el-button>
              <el-button v-if="canEdit" :icon="Upload" @click="openImport">批量导入 Excel</el-button>
            </div>
          </div>

          <div class="table-card__toolbar-filters bank-detail__filter">
            <el-input
              v-model="filterKeyword"
              class="bank-detail__filter-keyword"
              placeholder="按题干搜索"
              clearable
              :prefix-icon="Search"
              @keyup.enter="onSearch"
            />
            <el-select v-model="filterType" class="bank-detail__filter-item" placeholder="全部题型" clearable>
              <el-option label="全部题型" value="" />
              <el-option
                v-for="opt in QUESTION_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="filterStatus" class="bank-detail__filter-item" placeholder="全部状态" clearable>
              <el-option label="启用" value="active"/><el-option label="停用" value="disabled"/>
            </el-select>
            <el-select
              v-model="filterDifficulty"
              class="bank-detail__filter-item"
              placeholder="全部难度"
              clearable
            >
              <el-option label="全部难度" value="" />
              <el-option
                v-for="opt in QUESTION_DIFFICULTY_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
            <el-button :icon="Refresh" @click="onResetFilters">重置</el-button>
            <TableDensityToggle />
          </div>

          <BatchActionBar v-if="canEdit" :count="selectedRows.length" noun="道试题" @clear="clearSelection">
            <el-button :icon="EditPen" @click="openBatchEdit">批量编辑</el-button>
            <el-button :loading="qualityLoading" @click="runQualityAction('enable')">启用</el-button>
            <el-button :loading="qualityLoading" @click="runQualityAction('disable')">停用</el-button>
            <el-button @click="openMigrate">迁移</el-button>
            <el-button :loading="qualityLoading" @click="runQualityAction('validate')">完整性校验</el-button>
            <el-button type="danger" :loading="qualityLoading" @click="runQualityAction('delete')">删除</el-button>
          </BatchActionBar>

          <el-table
            ref="tableRef"
            v-loading="loading"
            :data="questions"
            row-key="id"
            stripe
            @selection-change="onSelectionChange"
          >
            <el-table-column type="selection" width="46" reserve-selection />
            <el-table-column label="题干" min-width="240">
              <template #default="{ row }">
                <el-tooltip :content="row.stem" placement="top" :show-after="300">
                  <span class="cell-stem">{{ row.stem }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="题型" width="90">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="row.type === 'judge' ? 'warning' : 'primary'">
                  {{ QUESTION_TYPE_LABELS[row.type as QuestionType] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80"><template #default="{ row }"><el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag></template></el-table-column>
            <el-table-column label="难度" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.difficulty" size="small" effect="plain" type="info">
                  {{ QUESTION_DIFFICULTY_LABELS[row.difficulty as QuestionDifficulty] }}
                </el-tag>
                <span v-else class="bank-detail__muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column class-name="table-actions-cell" label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button v-if="canEdit" type="primary" link @click="openEditQuestion(row as Question)">
                  编辑
                </el-button>
                <el-button v-if="canEdit" type="danger" link @click="handleDeleteQuestion(row as Question)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :text="hasFilter ? '没有符合条件的试题' : BANK_TEXT.EMPTY_QUESTIONS"
                :filtered="hasFilter"
                @clear="onResetFilters"
              >
                <template v-if="!hasFilter && canEdit">
                  <el-button type="primary" :icon="Plus" @click="openCreate">手动新增</el-button>
                  <el-button :icon="Upload" @click="openImport">批量导入 Excel</el-button>
                </template>
              </EmptyState>
            </template>
          </el-table>

          <div v-if="total > 0" class="table-card__pagination">
            <DataTablePagination
              :page="page"
              :page-size="pageSize"
              :total="total"
              @update:page="onPageChange"
              @update:page-size="onSizeChange"
            />
          </div>
        </el-card>

        <div class="bank-detail__extras">
          <!-- 批量导入模板（对齐设计稿形态：拖拽区 + 说明；点击打开已有导入弹窗，复用其模板下载） -->
          <el-card v-if="canEdit" class="import-card" shadow="never">
            <template #header>
              <h3 class="card-head__title">批量导入模板</h3>
            </template>
            <div
              class="import-card__dropzone"
              role="button"
              tabindex="0"
              @click="openImport"
              @keyup.enter="openImport"
            >
              <el-icon class="import-card__icon"><UploadFilled /></el-icon>
              <p class="import-card__title">点击打开批量导入，按模板上传 Excel</p>
              <p class="import-card__hint">
                支持 .xlsx，单次最多 {{ settingsStore.settings.importMaxRows }} 行 · 单文件 ≤
                {{ settingsStore.settings.importMaxFileMb }}MB
              </p>
            </div>
            <div class="import-card__actions">
              <el-button :icon="Upload" @click="openImport">打开批量导入</el-button>
              <span class="import-card__cols">含题干 / 题型 / 选项 / 答案 / 解析列，弹窗内可下载模板</span>
            </div>
          </el-card>
        </div>
    </section>

    <QuestionFormDialog
      v-model:visible="formVisible"
      :bank-id="bankId"
      :question="editingQuestion"
      @saved="reloadAll"
    />
    <QuestionImportDialog
      v-model:visible="importVisible"
      :bank-id="bankId"
      :bank-name="bank?.name ?? ''"
      @imported="reloadAll"
    />
    <QuestionBatchEditDialog
      v-model:visible="batchVisible"
      :question-ids="selectedRows.map((q) => q.id)"
      @saved="onBatchSaved"
    />
    <el-dialog v-model="migrateVisible" title="迁移试题" width="460px" append-to-body>
      <el-form label-width="90px"><el-form-item label="目标题库" required><el-select v-model="migrateTargetBankId" filterable style="width:100%"><el-option v-for="item in migrateBanks" :key="item.id" :label="item.name" :value="item.id"/></el-select></el-form-item></el-form>
      <template #footer><el-button @click="migrateVisible=false">取消</el-button><el-button type="primary" :loading="qualityLoading" @click="submitMigrate">确认迁移</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-detail {
  &__back {
    margin-bottom: 12px;
  }

  &__main {
    min-width: 0;
  }

  &__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
  }

  &__toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .el-button + .el-button { margin-left: 0; }
  }

  &__filter {
    margin-bottom: 12px;
  }

  &__filter-item {
    width: 140px;
  }

  &__filter-keyword {
    flex: 1 1 260px;
    min-width: min(260px, 100%);
  }

  // 顶部三张题量统计卡
  &__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 12px 0;
  }
}

.bank-overview {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 2px 2px 12px;
  border-bottom: 1px solid $border-color;
}

.bank-overview__heading {
  min-width: 180px;
  flex: 1;
}

.bank-overview__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.bank-overview__title-row h2 {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  color: $text-primary;
  font-size: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bank-overview__heading p {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.bank-overview__meta {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 16px;
  max-width: 64%;
  color: $text-secondary;
  font-size: 12px;
}

.bank-overview__meta span {
  white-space: nowrap;
}

.bank-overview__meta strong {
  margin-left: 4px;
  color: $text-primary;
  font-weight: 600;
}

.cell-stem {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

// 分页由 .table-card__pagination 统一控制间距，消除封装组件自带 margin 的双重叠加
.table-card__pagination :deep(.data-table-pagination) {
  margin-top: 0;
}

.bank-detail__extras {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 16px;
  margin-top: 16px;
}

.bank-detail__muted {
  color: $text-disabled;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  &__title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__sub {
    font-size: 12px;
    color: $text-secondary;
  }
}

.import-card {
  border-radius: $radius-lg;

  &__dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 24px 16px;
    text-align: center;
    cursor: pointer;
    border: 1px dashed $line-strong;
    border-radius: $radius-sm;
    background: $bg-page;
    transition: border-color $transition-fast;

    &:hover,
    &:focus-visible {
      border-color: $color-primary;
      outline: none;
    }
  }

  &__icon {
    font-size: 26px;
    color: $color-primary;
  }

  &__title {
    margin: 0;
    font-size: 13px;
    color: $text-primary;
  }

  &__hint {
    margin: 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }

  &__cols {
    font-size: 12px;
    color: $text-secondary;
  }
}

@media (max-width: 1100px) {
  .bank-detail__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bank-overview { flex-direction: column; gap: 10px; }
  .bank-overview__meta { justify-content: flex-start; max-width: none; }
}

@media (min-width: 1101px) and (max-width: 1450px) {
  .bank-detail__stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .bank-detail__stats { grid-template-columns: 1fr; }
  .bank-detail__filter-item { width: 100%; }
  .bank-detail__filter-keyword { flex-basis: 100%; }
}
</style>
