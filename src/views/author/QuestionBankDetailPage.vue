<script setup lang="ts">
/**
 * 题库详情页（W3-T4，PRD §7.4）。
 * 左列：题库信息卡（名称/分类/题数/描述/创建信息 + 编辑/删除）。
 * 右列：试题表格（题型/科目/关键字筛选 + el-table + 分页）与「手动新增 / 批量导入」入口。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Edit, Delete, Plus, Upload, Search, Refresh, ArrowLeft } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as questionsApi from '@/api/questions';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import { useConfirm } from '@/composables/useConfirm';
import {
  BANK_TEXT,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
} from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import QuestionFormDialog from './QuestionFormDialog.vue';
import QuestionBankFormDialog from './QuestionBankFormDialog.vue';
import QuestionImportDialog from './QuestionImportDialog.vue';
import type { Question, QuestionType } from '@/types';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const settingsStore = useSettingsStore();

const bankId = computed<string>(() => String(route.params.bankId ?? ''));

/* ------------------------------ 题库信息 ------------------------------ */
const { data: bank, loading: bankLoading, refresh: refreshBank } = useRequest(() =>
  banksApi.detail(bankId.value),
);

/* ------------------------------ 试题筛选 ------------------------------ */
const filterType = ref<QuestionType | ''>('');
const filterSubject = ref('');
const filterKeyword = ref('');

const subjects = ref<string[]>([]);

async function loadSubjects(): Promise<void> {
  try {
    subjects.value = await questionsApi.subjects([bankId.value]);
  } catch {
    subjects.value = [];
  }
}

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
      subject: filterSubject.value,
      keyword: filterKeyword.value.trim(),
      page: p,
      pageSize: ps,
    }),
  settingsStore.settings.defaultPageSize,
);

function onSearch(): void {
  reset();
}

function onResetFilters(): void {
  filterType.value = '';
  filterSubject.value = '';
  filterKeyword.value = '';
  reset();
}

/** 新建/编辑/导入后统一刷新 */
function reloadAll(): void {
  void refreshBank();
  void load();
  void loadSubjects();
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

/* ------------------------------ 题库编辑弹窗 ------------------------------ */
const bankFormVisible = ref(false);
function openEditBank(): void {
  bankFormVisible.value = true;
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

/** 删除题库后返回列表 */
async function handleDeleteBank(): Promise<void> {
  if (!bank.value) return;
  const questionCount = bank.value.questionCount;
  const cascade = questionCount > 0;
  const message =
    questionCount > 0
      ? `该题库下存在 ${questionCount} 道试题，确认连同试题一起删除？此操作不可恢复。`
      : `确认删除题库「${bank.value.name}」？`;
  const ok = await confirm(message, {
    title: BANK_TEXT.CASCADE_CONFIRM_TITLE,
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;
  try {
    await banksApi.remove(bank.value.id, cascade);
    ElMessage.success('题库已删除');
    void router.push('/author/banks');
  } catch {
    // 错误提示已由拦截器统一弹出
  }
}

function goBack(): void {
  void router.push('/author/banks');
}

/** bankId 变化时重新初始化（同一组件实例内切换路由参数） */
watch(bankId, () => {
  void refreshBank();
  loadSubjects();
  reset();
});

onMounted(() => {
  void settingsStore.load();
  loadSubjects();
  void load();
});
</script>

<template>
  <div class="bank-detail">
    <PageHeader title="题库详情" :description="bank?.name || '维护题库内的试题'">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      </template>
    </PageHeader>

    <div class="bank-detail__body">
      <!-- 左列：题库信息卡 -->
      <aside class="bank-detail__aside">
        <LoadingSkeleton v-if="bankLoading && !bank" :rows="4" />
        <el-card v-else-if="bank" class="bank-info" shadow="never">
          <h3 class="bank-info__name" :title="bank.name">{{ bank.name }}</h3>
          <div class="bank-info__row">
            <span class="bank-info__label">分类</span>
            <el-tag size="small" type="info" effect="plain">{{ bank.category }}</el-tag>
          </div>
          <div class="bank-info__row">
            <span class="bank-info__label">题目数</span>
            <span>{{ bank.questionCount }}</span>
          </div>
          <div class="bank-info__row">
            <span class="bank-info__label">创建人</span>
            <span>{{ bank.createdBy }}</span>
          </div>
          <div class="bank-info__row">
            <span class="bank-info__label">创建时间</span>
            <span>{{ formatDateTime(bank.createdAt) }}</span>
          </div>
          <div v-if="bank.description" class="bank-info__row bank-info__row--block">
            <span class="bank-info__label">描述</span>
            <span class="bank-info__desc">{{ bank.description }}</span>
          </div>
          <div class="bank-info__actions">
            <el-button :icon="Edit" @click="openEditBank">编辑题库</el-button>
            <el-button type="danger" :icon="Delete" @click="handleDeleteBank">删除题库</el-button>
          </div>
        </el-card>
      </aside>

      <!-- 右列：试题区 -->
      <section class="bank-detail__main">
        <el-card class="table-card" shadow="never">
          <div class="table-card__toolbar">
            <h3 class="bank-detail__title">试题（{{ total }}）</h3>
            <div class="bank-detail__toolbar-actions">
              <el-button type="primary" :icon="Plus" @click="openCreate">手动新增</el-button>
              <el-button :icon="Upload" @click="openImport">批量导入 Excel</el-button>
            </div>
          </div>

          <div class="table-card__toolbar-filters bank-detail__filter">
            <el-select v-model="filterType" class="bank-detail__filter-item" placeholder="全部题型" clearable>
              <el-option label="全部题型" value="" />
              <el-option
                v-for="opt in QUESTION_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select
              v-model="filterSubject"
              class="bank-detail__filter-item"
              placeholder="全部科目"
              clearable
            >
              <el-option label="全部科目" value="" />
              <el-option v-for="s in subjects" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input
              v-model="filterKeyword"
              class="bank-detail__filter-keyword"
              placeholder="按题干搜索"
              clearable
              :prefix-icon="Search"
              @keyup.enter="onSearch"
            />
            <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
            <el-button :icon="Refresh" @click="onResetFilters">重置</el-button>
          </div>

          <el-table v-loading="loading" :data="questions" row-key="id" stripe>
            <el-table-column label="题干" min-width="260">
              <template #default="{ row }">
                <el-tooltip :content="row.stem" placement="top" :show-after="300">
                  <span class="cell-stem">{{ row.stem }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="题型" width="100">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="row.type === 'judge' ? 'warning' : 'primary'">
                  {{ QUESTION_TYPE_LABELS[row.type as QuestionType] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="subject" label="科目" width="120" show-overflow-tooltip />
            <el-table-column label="默认分值" width="100" align="center">
              <template #default="{ row }">{{ formatScore(row.defaultScore) }}</template>
            </el-table-column>
            <el-table-column label="创建时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="openEditQuestion(row as Question)">编辑</el-button>
                <el-button type="danger" link @click="handleDeleteQuestion(row as Question)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState :text="BANK_TEXT.EMPTY_QUESTIONS" />
            </template>
          </el-table>

          <div class="table-card__pagination">
            <DataTablePagination
              :page="page"
              :page-size="pageSize"
              :total="total"
              @update:page="onPageChange"
              @update:page-size="onSizeChange"
            />
          </div>
        </el-card>
      </section>
    </div>

    <QuestionBankFormDialog v-model:visible="bankFormVisible" :bank="bank" @saved="reloadAll" />
    <QuestionFormDialog
      v-model:visible="formVisible"
      :bank-id="bankId"
      :question="editingQuestion"
      :default-subject="bank?.category"
      @saved="reloadAll"
    />
    <QuestionImportDialog
      v-model:visible="importVisible"
      :bank-id="bankId"
      :bank-name="bank?.name ?? ''"
      @imported="reloadAll"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-detail {
  &__back {
    margin-bottom: 12px;
  }

  &__body {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  &__aside {
    flex: 0 0 280px;
    width: 280px;
  }

  &__main {
    flex: 1;
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
    gap: 8px;
  }

  &__filter {
    margin-bottom: 12px;
  }

  &__filter-item {
    width: 140px;
  }

  &__filter-keyword {
    width: 220px;
  }
}

.bank-info {
  border-radius: $radius-lg;

  &__name {
    margin: 0 0 12px;
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: $text-primary;

    &--block {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  &__label {
    color: $text-secondary;
  }

  &__desc {
    margin-top: 4px;
    color: $text-primary;
    word-break: break-all;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;

    :deep(.el-button) {
      margin-left: 0;
      width: 100%;
    }
  }
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
</style>
