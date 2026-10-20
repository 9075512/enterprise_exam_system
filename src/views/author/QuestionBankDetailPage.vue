<script setup lang="ts">
/**
 * 题库详情页（W3-T4，PRD §7.4）。
 * 科目结构只读；本页聚焦题量概览、筛选、分页与内容维护。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import ResponsivePagination from '@/components/common/ResponsivePagination.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
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
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
function isCurrentBank(id: string): boolean { return !disposed && bankId.value === id; }

/* ------------------------------ 题库信息 ------------------------------ */
const { data: bank, loading: bankLoading, error: bankError, refresh: refreshBank } = useRequest(() =>
  banksApi.detail(bankId.value),
  [], { keepPreviousData: false },
);
const canEdit = computed<boolean>(() => bank.value?.canEdit === true);

/* ------------------------------ 题量与题型统计 ------------------------------ */
/**
 * 复用后端统计结果展示总量与题型分布；正确率和知识点健康度不再在题库管理中展示。
 */
const { data: stats, error: statsError, refresh: refreshStats } = useRequest(() =>
  banksApi.questionStats(bankId.value),
  [], { immediate: false, keepPreviousData: false },
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
  error: questionsError,
  load,
  clear: clearQuestions,
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
  if (selectionLocked.value) return;
  reset();
}

function onResetFilters(): void {
  if (selectionLocked.value) return;
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
  if (!selectionLocked.value) selectedRows.value = rows;
}

function openBatchEdit(): void {
  if (!canEdit.value || workLocked.value) return;
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先勾选需要批量编辑的试题');
    return;
  }
  batchVisible.value = true;
}

/** 清空勾选（批量条「取消选择」/ 批量编辑完成后复用） */
function clearSelection(force = false): void {
  if (!force && selectionLocked.value) return;
  tableRef.value?.clearSelection();
  selectedRows.value = [];
}

/** 批量编辑完成后清空勾选并刷新 */
function onBatchSaved(): void {
  clearSelection(true);
  reloadAll();
}

const migrateVisible = ref(false);
const { data: migrateBanks, loading: migrateLoading, error: migrateError, refresh: refreshMigrateBanks } = useRequest(async () =>
  migrateVisible.value ? (await banksApi.list()).filter((item) => item.id !== bankId.value && item.canEdit) : [] as QuestionBank[],
  [migrateVisible, bankId], { immediate: false, keepPreviousData: false },
);
const migrateTargetBankId = ref('');
const qualityLoading = ref(false);
const confirming = ref(false);
const deletingId = ref('');
const operationError = ref('');
const operationErrorRef = ref<HTMLElement>();
const migrateErrorRef = ref<HTMLElement>();
const migrateSubmitError = ref('');
const migrateFormError = ref(false);
watch(operationError, async message => { if (message) { await nextTick(); operationErrorRef.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } });
watch(migrateSubmitError, async message => { if (message) { await nextTick(); migrateErrorRef.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } });
const migrateSelectRef = ref<{ focus: () => void }>();
interface SelectionContext { bankId: string; bankName: string; rows: Question[] }
const migrateContext = ref<SelectionContext | null>(null);
const validationVisible = ref(false);
const validationPage = ref(1);
const previewVisible = ref(false);
const previewQuestion = ref<Question | null>(null);
function showQuestion(question: Question): void { if (!operationBusy.value) { previewQuestion.value = { ...question }; previewVisible.value = true; } }
const validationResult = ref<{ context: SelectionContext; affected: number; checkedAt: string; issues: Array<{ questionId: string; stem: string; issues: string[] }> } | null>(null);
const validationIssues = computed(() => validationResult.value?.issues.slice((validationPage.value - 1) * 10, validationPage.value * 10) ?? []);
const operationBusy = computed(() => qualityLoading.value || confirming.value || Boolean(deletingId.value));
const selectionLocked = computed(() => operationBusy.value || migrateVisible.value || batchVisible.value);
const workLocked = computed(() => selectionLocked.value || loading.value || bankLoading.value);
function selectionContext(): SelectionContext {
  return { bankId: bankId.value, bankName: bank.value?.name ?? '', rows: selectedRows.value.map(row => ({ ...row })) };
}
function withinBatchLimit(): boolean {
  if (selectedRows.value.length <= 500) return true;
  operationError.value = '单次最多处理500道试题，请减少选择后重试。';
  return false;
}

async function runQualityAction(action: 'enable' | 'disable' | 'delete' | 'validate'): Promise<void> {
  if (!canEdit.value || workLocked.value || !selectedRows.value.length || !withinBatchLimit()) return;
  const context = selectionContext();
  operationError.value = '';
  if (action === 'delete') {
    confirming.value = true;
    let ok = false;
    try { ok = await confirm('确认物理删除“' + context.bankName + '”中所选的' + context.rows.length + '道试题？已被试卷引用或已有练题历史的题目会被后端拒绝，请改为停用。', { title: '批量删除' }); }
    finally { confirming.value = false; }
    if (!ok || !isCurrentBank(context.bankId) || !canEdit.value) return;
  }
  qualityLoading.value = true;
  if (action === 'validate') validationResult.value = null;
  try {
    const result = await qualityApi.batch(context.rows.map(q => q.id), action);
    if (!isCurrentBank(context.bankId)) return;
    if (action === 'validate') {
      validationResult.value = {
        context, affected: result.affected, checkedAt: new Date().toISOString(),
        issues: (result.issues ?? []).map(item => ({ ...item, stem: context.rows.find(q => q.id === item.questionId)?.stem ?? '原题干暂不可用' })),
      };
      validationPage.value = 1;
      validationVisible.value = true;
    } else ElMessage.success('已处理 ' + result.affected + ' 道试题');
    clearSelection(true);
    reloadAll();
  } catch {
    if (isCurrentBank(context.bankId)) operationError.value = '操作未完成，已保留所选试题；请核对结果后重试。';
  } finally { qualityLoading.value = false; }
}

function openMigrate(): void {
  if (!canEdit.value || workLocked.value || !selectedRows.value.length || !withinBatchLimit()) return;
  migrateContext.value = selectionContext();
  migrateTargetBankId.value = '';
  migrateFormError.value = false;
  migrateSubmitError.value = '';
  operationError.value = '';
  migrateVisible.value = true;
}

async function submitMigrate(): Promise<void> {
  const context = migrateContext.value;
  if (!context || !isCurrentBank(context.bankId) || qualityLoading.value || migrateLoading.value || migrateError.value || !canEdit.value || !context.rows.length) return;
  if (!migrateTargetBankId.value || !migrateBanks.value?.some(item => item.id === migrateTargetBankId.value)) {
    migrateFormError.value = true;
    await nextTick(); migrateSelectRef.value?.focus();
    return;
  }
  migrateFormError.value = false;
  migrateSubmitError.value = '';
  qualityLoading.value = true;
  try {
    const result = await qualityApi.batch(context.rows.map(q => q.id), 'migrate', migrateTargetBankId.value);
    if (!isCurrentBank(context.bankId)) return;
    ElMessage.success('已迁移 ' + result.affected + ' 道试题');
    migrateVisible.value = false;
    clearSelection(true);
    reloadAll();
  } catch {
    if (isCurrentBank(context.bankId)) migrateSubmitError.value = '迁移未完成，请核对结果后重试；已选目标与试题仍保留。';
  } finally { qualityLoading.value = false; }
}

function editValidatedQuestion(questionId: string): void {
  const result = validationResult.value;
  const question = result?.context.rows.find(q => q.id === questionId);
  if (!canEdit.value || operationBusy.value || result?.context.bankId !== bankId.value || !question) return;
  validationVisible.value = false;
  openEditQuestion(question);
}

/* ------------------------------ 试题弹窗 ------------------------------ */
const formVisible = ref(false);
const editingQuestion = ref<Question | null>(null);

function openCreate(): void {
  if (!canEdit.value || workLocked.value) return;
  editingQuestion.value = null;
  formVisible.value = true;
}

function openEditQuestion(question: Question): void {
  if (!canEdit.value || workLocked.value) return;
  editingQuestion.value = question;
  formVisible.value = true;
}

const importVisible = ref(false);
function openImport(): void {
  if (!canEdit.value || workLocked.value) return;
  importVisible.value = true;
}

/** 删除试题 */
async function handleDeleteQuestion(question: Question): Promise<void> {
  if (!canEdit.value || workLocked.value) return;
  const contextBankId = bankId.value;
  deletingId.value = question.id;
  operationError.value = '';
  try {
    const ok = await confirm('确认删除“' + (bank.value?.name ?? '') + '”中的试题？\n' + question.stem + '\n已被引用或已有练题历史的题目仍按服务端规则处理。', { title: '删除试题', confirmButtonText: '确认删除', type: 'warning' });
    if (!ok || !isCurrentBank(contextBankId) || !canEdit.value) return;
    await questionsApi.remove(question.id);
    if (!isCurrentBank(contextBankId)) return;
    ElMessage.success('试题已删除');
    clearSelection(true);
    reloadAll();
  } catch {
    if (isCurrentBank(contextBankId)) operationError.value = '删除未完成，请刷新核对结果后重试。';
  } finally { deletingId.value = ''; }
}

function goBack(): void {
  void router.push('/author/banks');
}

/** bankId 变化时重新初始化（同一组件实例内切换路由参数） */
watch(bankId, () => {
  migrateVisible.value = false;
  formVisible.value = false;
  batchVisible.value = false;
  importVisible.value = false;
  clearSelection(true);
  migrateContext.value = null;
  validationVisible.value = false;
  validationResult.value = null;
  previewVisible.value = false;
  previewQuestion.value = null;
  operationError.value = '';
  migrateSubmitError.value = '';
  clearQuestions();
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
  <div data-ui-layout="tree" data-ui-page="QuestionBankDetailPage" class="bank-detail">
    <PageHeader v-if="!props.embedded" title="题库详情" :description="bank?.name || '维护题库内的试题'">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="bankLoading && !bank" :rows="2" />
    <RequestError v-else-if="bankError" text="科目信息加载失败" @retry="refreshBank" />
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
        <span>创建人 <strong>{{ bank.createdBy || '—' }}</strong></span>
        <span>授权出题人 <strong>{{ bank.authorNames?.length ? bank.authorNames.join('、') : '未授权' }}</strong></span>
        <span>创建于 <strong>{{ formatDateTime(bank.createdAt) }}</strong></span>
      </div>
    </section>

    <!-- 题目概览：仅保留题量与题型分布。 -->
    <p class="bank-detail__scope">当前科目全部题目 · 不受下方题目筛选影响</p>
    <el-alert v-if="statsError" type="warning" :closable="false" title="题量统计加载失败，请重试"><el-button type="primary" link @click="refreshStats">重新加载统计</el-button></el-alert>
    <div class="bank-detail__stats">
      <StatCard density="compact" label="题目总数" :value="stats?.total ?? '—'" unit="道" :icon="Collection" />
      <StatCard
        density="compact"
        label="单选 / 多选 / 判断"
        :value="stats ? `${typeCount.single} / ${typeCount.multiple} / ${typeCount.judge}` : '— / — / —'"
        :icon="ListIcon"
      />
      <StatCard
        density="compact"
        label="填空 / 简答"
        :value="stats ? `${typeCount.fill} / ${typeCount.short}` : '— / —'"
        :icon="CircleCheck"
      >
      </StatCard>
    </div>

    <section class="bank-detail__main">
        <el-card class="table-card" shadow="never">
          <div class="table-card__toolbar">
            <h3 class="bank-detail__title">{{ hasFilter ? '筛选结果' : '试题列表' }}（{{ questionsError || loading ? '—' : total }}）</h3>
            <div class="bank-detail__toolbar-actions">
              <el-button v-if="canEdit" type="primary" :icon="Plus" :disabled="workLocked" @click="openCreate">手动新增</el-button>
              <el-button v-if="canEdit" :icon="Upload" :disabled="workLocked" @click="openImport">批量导入 Excel</el-button>
            </div>
          </div>

          <div v-if="operationError" ref="operationErrorRef" class="bank-detail__operation-error"><el-alert :title="operationError" type="error" show-icon :closable="false" /></div>
          <div v-if="validationResult" class="bank-detail__validation-summary"><span>上次校验 {{ validationResult.affected }} 道 · {{ validationResult.issues.length }} 道有问题</span><el-button :disabled="operationBusy" @click="validationVisible=true">查看校验结果</el-button></div>
          <div class="bank-detail__filter" role="search" aria-label="试题筛选">
            <div class="bank-detail__filter-search">
              <el-input
                v-model="filterKeyword"
                :disabled="selectionLocked"
                class="bank-detail__filter-keyword"
                placeholder="按题干搜索"
                aria-label="按题干搜索"
                clearable
                :prefix-icon="Search"
                @keyup.enter="onSearch"
              />
              <el-button type="primary" :icon="Search" :disabled="selectionLocked" @click="onSearch">查询</el-button>
              <el-button :icon="Refresh" :disabled="selectionLocked" @click="onResetFilters">重置</el-button>
            </div>
            <div class="bank-detail__filter-options">
              <el-select v-model="filterType" :disabled="selectionLocked" class="bank-detail__filter-item" placeholder="全部题型" aria-label="题型" clearable>
                <el-option label="全部题型" value="" />
                <el-option
                  v-for="opt in QUESTION_TYPE_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-select v-model="filterStatus" :disabled="selectionLocked" class="bank-detail__filter-item" placeholder="全部状态" aria-label="状态" clearable>
                <el-option label="启用" value="active"/><el-option label="停用" value="disabled"/>
              </el-select>
              <el-select
                v-model="filterDifficulty" :disabled="selectionLocked"
                class="bank-detail__filter-item"
                placeholder="全部难度"
                aria-label="难度"
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
              <TableDensityToggle />
            </div>
          </div>

          <BatchActionBar v-if="canEdit" :count="selectedRows.length" noun="道试题" :disabled="selectionLocked" @clear="clearSelection">
            <el-button :icon="EditPen" :disabled="workLocked" @click="openBatchEdit">批量编辑</el-button>
            <el-button :loading="qualityLoading" :disabled="workLocked" @click="runQualityAction('enable')">启用</el-button>
            <el-button :loading="qualityLoading" @click="runQualityAction('disable')">停用</el-button>
            <el-button :disabled="workLocked" @click="openMigrate">迁移</el-button>
            <el-button :loading="qualityLoading" @click="runQualityAction('validate')">完整性校验</el-button>
            <el-button type="danger" :loading="qualityLoading" @click="runQualityAction('delete')">删除</el-button>
          </BatchActionBar>

          <el-alert v-if="questionsError" type="error" :closable="false" title="试题列表加载失败，请重试；当前数量尚未确认"><el-button type="primary" link @click="load">重新加载试题</el-button></el-alert>
          <el-table v-else
            ref="tableRef"
            v-loading="loading"
            :data="questions"
            row-key="id"
            stripe
            @selection-change="onSelectionChange"
          >
            <el-table-column type="selection" width="46" reserve-selection :selectable="() => canEdit && !workLocked" />
            <el-table-column label="题干" min-width="240">
              <template #default="{ row }">
                <button type="button" class="cell-stem cell-stem--button" :disabled="operationBusy" :aria-label="`查看题干：${row.stem}`" @click="showQuestion(row as Question)">{{ row.stem }}</button>
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
                <el-button v-if="canEdit" type="primary" link :disabled="workLocked" @click="openEditQuestion(row as Question)">
                  编辑
                </el-button>
                <el-button v-if="canEdit" type="danger" link :disabled="workLocked" @click="handleDeleteQuestion(row as Question)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :text="hasFilter ? '没有符合条件的试题' : BANK_TEXT.EMPTY_QUESTIONS"
                :filtered="hasFilter"
                @clear="onResetFilters"
              >
                <template v-if="!hasFilter && canEdit">
                  <el-button type="primary" :icon="Plus" :disabled="workLocked" @click="openCreate">手动新增</el-button>
                  <el-button :icon="Upload" :disabled="workLocked" @click="openImport">批量导入 Excel</el-button>
                </template>
              </EmptyState>
            </template>
          </el-table>

          <div v-if="!questionsError && total > 0" class="table-card__pagination">
            <DataTablePagination
              :page="page"
              :page-size="pageSize"
              :total="total"
              :disabled="selectionLocked"
              @update:page="onPageChange"
              @update:page-size="onSizeChange"
            />
          </div>
        </el-card>

        <aside v-if="canEdit" class="import-card" aria-label="批量导入提示">
            <el-icon class="import-card__icon"><UploadFilled /></el-icon>
            <div class="import-card__body">
              <h3 class="import-card__title">使用 Excel 快速导入试题</h3>
              <p class="import-card__hint">
                支持 .xlsx，单次最多 {{ settingsStore.settings.importMaxRows }} 行 · 单文件 ≤
                {{ settingsStore.settings.importMaxFileMb }}MB，可在导入弹窗下载模板
              </p>
            </div>
            <el-button :icon="Upload" :disabled="workLocked" @click="openImport">打开批量导入</el-button>
        </aside>
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
    <el-dialog v-model="migrateVisible" title="迁移试题" width="640px" append-to-body class="bank-task-dialog" :close-on-click-modal="!qualityLoading" :close-on-press-escape="!qualityLoading" :show-close="!qualityLoading">
      <div v-if="migrateContext" class="bank-task__context"><span>来源题库</span><strong>{{ migrateContext.bankName }}</strong><p>已选 {{ migrateContext.rows.length }} 道试题 · 仅列出本人可编辑的其他题库。</p><details><summary>查看所选试题</summary><ol><li v-for="q in migrateContext.rows" :key="q.id">{{ q.stem }}</li></ol></details></div>
      <p class="learner-scope">迁移会同时更新题库与科目归属；源和目标题库权限仍由服务端核验。</p>
      <div v-if="migrateSubmitError" ref="migrateErrorRef" class="bank-task__error"><el-alert :title="migrateSubmitError" type="error" show-icon :closable="false" /></div>
      <RequestError v-if="migrateError" text="目标题库加载失败" @retry="refreshMigrateBanks" />
      <EmptyState v-else-if="!migrateLoading && !migrateBanks?.length" text="暂无其他可编辑的目标题库" />
      <el-form v-else label-position="top" :disabled="qualityLoading || migrateLoading">
        <el-form-item label="目标题库" required :error="migrateFormError ? '请选择当前可编辑的目标题库' : ''">
          <el-select ref="migrateSelectRef" v-model="migrateTargetBankId" filterable :loading="migrateLoading" placeholder="请选择目标题库" aria-label="目标题库" popper-class="bank-migrate-options" style="width:100%" @change="migrateFormError=false;migrateSubmitError=''">
            <el-option v-for="item in migrateBanks ?? []" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <p v-if="migrateTargetBankId" class="bank-task__target">当前目标：{{ migrateBanks?.find(item => item.id === migrateTargetBankId)?.name ?? '该目标已不可用，请重新选择' }}</p>
      </el-form>
      <template #footer><el-button :disabled="qualityLoading" @click="migrateVisible=false">取消</el-button><el-button type="primary" :loading="qualityLoading" :disabled="migrateLoading || Boolean(migrateError) || !migrateBanks?.length || !migrateContext?.rows.length" @click="submitMigrate">确认迁移</el-button></template>
    </el-dialog>

    <el-dialog v-model="validationVisible" title="完整性校验结果" width="760px" append-to-body class="bank-task-dialog">
      <template v-if="validationResult">
        <div class="bank-task__context"><span>校验来源</span><strong>{{ validationResult.context.bankName }}</strong><p>本次已校验 {{ validationResult.affected }} 道 · {{ validationResult.issues.length }} 道存在问题</p><p>{{ formatDateTime(validationResult.checkedAt) }} · 仅为本次所选试题的校验结果，编辑后需重新校验。</p></div>
        <EmptyState v-if="!validationResult.issues.length" text="所选试题完整性校验通过" />
        <article v-for="issue in validationIssues" :key="issue.questionId" class="bank-task__issue">
          <p class="bank-task__question-id">试题 {{ issue.questionId }}</p><p class="bank-task__stem">{{ issue.stem }}</p>
          <ul><li v-for="(text,index) in issue.issues" :key="index">{{ text }}</li></ul>
          <el-button v-if="canEdit" :disabled="workLocked" @click="editValidatedQuestion(issue.questionId)">编辑这道题</el-button>
        </article>
      </template>
      <template #footer>
        <ResponsivePagination v-if="(validationResult?.issues.length ?? 0) > 10" v-model:current-page="validationPage" :total="validationResult?.issues.length ?? 0" :page-size="10" :pager-count="5" layout="total, prev, pager, next" aria-label="校验结果分页" />
        <el-button @click="validationVisible=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" title="完整题干" width="720px" append-to-body class="bank-task-dialog">
      <template v-if="previewQuestion"><div class="bank-task__context"><strong>{{ bank?.name }}</strong><p>{{ QUESTION_TYPE_LABELS[previewQuestion.type] }} · {{ previewQuestion.status === 'active' ? '启用' : '停用' }} · {{ previewQuestion.difficulty ? QUESTION_DIFFICULTY_LABELS[previewQuestion.difficulty] : '未设难度' }}</p></div><p class="bank-task__stem">{{ previewQuestion.stem }}</p></template>
      <template #footer><el-button @click="previewVisible=false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-detail {
  container: bank-detail / inline-size;
  min-width: 0;
  &__stats :deep(.stat-card__label) { word-break: keep-all; overflow-wrap: normal; line-height: 1.6; }
  &__scope { margin: 18px 0 0; color: $text-secondary; font-size: 12px; }
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
    display: grid;
    gap: 12px;
    margin-bottom: 16px;
    padding: 14px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-page;
  }

  &__filter-search,
  &__filter-options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    min-width: 0;

    .el-button + .el-button { margin-left: 0; }
  }

  &__filter-item {
    flex: 1 1 110px;
    width: 0;
    min-width: 100px;
  }

  &__filter-keyword {
    flex: 1 1 180px;
    min-width: 0;
  }

  // 顶部三张题量统计卡
  &__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 20px 0;
  }
}

.bank-overview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid $border-color;
}

.bank-overview__heading {
  min-width: 0;
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
  color: $text-primary;
  font-size: 22px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.bank-overview__heading p {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.6;
}

.bank-overview__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  width: 100%;
  color: $text-secondary;
  font-size: 12px;
}

.bank-overview__meta span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.bank-overview__meta span:last-child { grid-column: 1 / -1; }

.bank-overview__meta strong {
  margin-left: 4px;
  color: $text-primary;
  font-weight: 600;
}

.cell-stem {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  vertical-align: bottom;
}

// 分页由 .table-card__pagination 统一控制间距，消除封装组件自带 margin 的双重叠加
.table-card__pagination :deep(.data-table-pagination) {
  margin-top: 0;
}

.bank-detail__muted {
  color: $text-disabled;
}

.import-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 16px;
  padding: 16px;
  border: 1px dashed $color-primary-border;
  border-radius: $radius-lg;
  background: $color-primary-soft;

  &__body { flex: 1 1 200px; min-width: 0; }

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
    margin: 5px 0 0;
    font-size: 12px;
    color: $text-secondary;
    line-height: 1.7;
  }
}

@container bank-detail (min-width: 720px) {
  .bank-overview__meta { grid-template-columns: auto minmax(0, 1fr) auto; }
  .bank-overview__meta span:last-child { grid-column: auto; }
}

@container bank-detail (max-width: 560px) {
  .bank-detail__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bank-detail__stats > :first-child { grid-column: 1 / -1; }
  .bank-detail__filter-options .density-toggle { margin-left: auto; }
  .bank-detail__filter-keyword { flex-basis: 100%; }
}

@container bank-detail (max-width: 360px) {
  .bank-overview__meta { grid-template-columns: minmax(0, 1fr); }
  .bank-detail__toolbar-actions { width: 100%; }
  .bank-detail__toolbar-actions .el-button { flex: 1 1 auto; }
  .bank-detail__filter-item { flex-basis: 100%; }
  .bank-detail__stats { gap: 8px; }
}
.cell-stem--button { width: 100%; min-height: 44px; padding: 0; border: 0; background: transparent; color: $color-primary; font: inherit; text-align: left; cursor: pointer; &:focus-visible { outline: 2px solid $color-primary; outline-offset: -2px; } &:disabled { color: $text-secondary; cursor: not-allowed; } }
.bank-detail__operation-error { scroll-margin-top: 110px; margin-bottom: 16px; overflow-wrap: anywhere; }
.bank-detail__validation-summary { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 12px 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; .el-button { min-height: 44px; } }
.bank-task__context, .bank-task__issue { min-width: 0; padding: 16px; margin-bottom: 16px; border: 1px solid $border-color; border-radius: $radius-lg; overflow-wrap: anywhere; }
.bank-task__context { background: $bg-page; display: grid; gap: 8px; > span, p { margin: 0; color: $text-secondary; font-size: 13px; line-height: 1.7; } strong { color: $text-primary; line-height: 1.7; } summary { min-height: 44px; display: list-item; line-height: 44px; color: $color-primary; cursor: pointer; } li { white-space: pre-wrap; line-height: 1.8; margin-bottom: 12px; } }
.bank-task__issue { .el-button { min-height: 44px; } li { margin-bottom: 8px; color: $color-warning-text; line-height: 1.7; } }
.bank-task__stem { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.85; margin: 0 0 16px; }
.bank-task__question-id { color: $text-secondary; font-size: 12px; overflow-wrap: anywhere; }
.bank-task__target { margin: 0; padding: 12px; border-radius: $radius-base; background: $bg-page; color: $text-secondary; overflow-wrap: anywhere; line-height: 1.8; }
.bank-task__error { margin-bottom: 16px; overflow-wrap: anywhere; }
:global(.bank-task-dialog .el-dialog__footer) { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; }
:global(.bank-migrate-options .el-select-dropdown__item) { height: auto; min-height: 44px; padding-block: 10px; white-space: normal; overflow-wrap: anywhere; line-height: 1.7; }
@media (max-width: 600px) {
  :global(.bank-task-dialog.el-dialog.el-dialog) { width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh; margin: 0 !important; border-radius: 0; }
  :global(.bank-task-dialog.el-dialog .el-dialog__body) { flex: 1; }
  :global(.bank-task-dialog.el-dialog .el-dialog__footer) { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  :global(.bank-task-dialog .el-dialog__footer .el-pagination) { flex: 1; min-width: 0; }
}
</style>
