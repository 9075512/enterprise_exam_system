<script setup lang="ts">
/**
 * 题库详情页（W3-T4，PRD §7.4）。
 * 左列：题库信息卡（名称/分类/题数/描述/创建信息 + 编辑/删除）。
 * 右列：试题表格（题型/科目/关键字筛选 + el-table + 分页）与「手动新增 / 批量导入」入口。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Edit,
  EditPen,
  Delete,
  Plus,
  Upload,
  UploadFilled,
  Search,
  Refresh,
  ArrowLeft,
  UserFilled,
  Collection,
  List as ListIcon,
  CircleCheck,
  TrendCharts,
  WarningFilled,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as questionsApi from '@/api/questions';
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
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import BatchActionBar from '@/components/common/BatchActionBar.vue';
import StatCard from '@/components/common/StatCard.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import QuestionFormDialog from './QuestionFormDialog.vue';
import QuestionBankFormDialog from './QuestionBankFormDialog.vue';
import QuestionImportDialog from './QuestionImportDialog.vue';
import QuestionBatchEditDialog from './QuestionBatchEditDialog.vue';
import BankAuthorBatchDialog from './BankAuthorBatchDialog.vue';
import type { BankQuestionStats, Question, QuestionDifficulty, QuestionType } from '@/types';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
/** 授权出题人批量维护仅管理员可用（v1.7③ S2） */
const isAdmin = computed<boolean>(() => authStore.hasRole('admin'));

const bankId = computed<string>(() => String(route.params.bankId ?? ''));

/* ------------------------------ 题库信息 ------------------------------ */
const { data: bank, loading: bankLoading, refresh: refreshBank } = useRequest(() =>
  banksApi.detail(bankId.value),
);

/* ------------------------------ 题目健康度统计（v3.3） ------------------------------ */
/**
 * 顶部统计卡数据源（题型分布 / 平均正确率 / 待完善），全部由后端实时聚合。
 * 口径：平均正确率 = 该题库全部练题作答记录的正确占比；无任何作答 → null（前端显示「—」）。
 */
const { data: stats, refresh: refreshStats } = useRequest(() =>
  banksApi.questionStats(bankId.value),
);

/** 题型分布（未加载时给全 0，避免模板判空） */
const typeCount = computed(
  (): Record<QuestionType, number> =>
    stats.value?.byType ?? { single: 0, multiple: 0, judge: 0, fill: 0, short: 0 },
);

/** 平均正确率数值文案（不带 %，% 由 StatCard 的 unit 承担）；无作答 → 「—」，不造数 */
const avgRateText = computed<string>(() => {
  const v = stats.value?.avgCorrectRate;
  if (v == null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
});

/** 待完善口径脚注（拆分「缺解析 / 未设知识点」，供统计卡 foot 使用） */
const incompleteFoot = computed<string>(() => {
  const s = stats.value;
  if (!s) return '';
  return `缺解析 ${s.missingAnalysisCount} · 未设知识点 ${s.missingTagsCount}`;
});

/* ------------------------------ 试题筛选 ------------------------------ */
const filterType = ref<QuestionType | ''>('');
const filterSubject = ref('');
const filterDifficulty = ref<QuestionDifficulty | ''>('');
const filterTag = ref('');
const filterKeyword = ref('');

const subjects = ref<string[]>([]);
const tags = ref<string[]>([]);

async function loadSubjects(): Promise<void> {
  try {
    subjects.value = await questionsApi.subjects([bankId.value]);
  } catch {
    subjects.value = [];
  }
}

async function loadTags(): Promise<void> {
  try {
    tags.value = await questionsApi.tags([bankId.value]);
  } catch {
    tags.value = [];
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
      difficulty: filterDifficulty.value,
      tag: filterTag.value,
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
      filterSubject.value ||
      filterDifficulty.value ||
      filterTag.value ||
      filterKeyword.value.trim(),
  ),
);

function onSearch(): void {
  reset();
}

function onResetFilters(): void {
  filterType.value = '';
  filterSubject.value = '';
  filterDifficulty.value = '';
  filterTag.value = '';
  filterKeyword.value = '';
  reset();
}

/** 新建/编辑/导入后统一刷新 */
function reloadAll(): void {
  void refreshBank();
  void refreshStats();
  void load();
  void loadSubjects();
  void loadTags();
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

/* ------------------------------ 授权出题人批量维护（v1.7③ S2，仅 admin） ------------------------------ */
const authorBatchVisible = ref(false);
function openAuthorBatch(): void {
  authorBatchVisible.value = true;
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

/* ------------------------------ 正确率展示（v3.3） ------------------------------ */
/** 正确率文案（整数不带小数，非整数保留 1 位） */
function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

/**
 * 正确率分档色调：≥80 主色 / 60–79 警示 / <60 错误。
 * 说明：设计稿示例色（61% 标红、48% 标琥珀）非单调，本实现按单调阈值工程化。
 * 文字一律走 `-text` 档（700），原色仅作进度条填充，符合 DESIGN-C 语义色铁律。
 */
function rateTone(rate: number): 'primary' | 'warn' | 'err' {
  if (rate >= 80) return 'primary';
  if (rate >= 60) return 'warn';
  return 'err';
}

/** 待完善判定：缺解析 或 未设置知识点（与后端 incompleteCount 同口径） */
function isIncomplete(question: Question): boolean {
  return !question.analysis?.trim() || !(question.tags?.length);
}

/** 待完善行高亮 */
function rowClassName({ row }: { row: Question }): string {
  return isIncomplete(row) ? 'row--incomplete' : '';
}

/* ------------------------------ 知识点分布 ------------------------------ */
/**
 * 知识点分布：由当前页已加载的题目列表（Question[]）聚合。
 * - tags 多标签：一条题目在每个命中的知识点各计一次（故各知识点题数之和 ≥ 题目数）；
 * - tags 为空的题目归入「未打标签」并单独统计；
 * - 占比 = 该知识点题数 / 当前页题目数。
 *
 * 数据缺口：后端未提供整库知识点聚合接口，分布仅基于当前页已加载题目（随翻页/筛选变化）。
 */
const knowledge = computed(() => {
  const list = questions.value ?? [];
  const total = list.length;
  const counter = new Map<string, number>();
  let untagged = 0;
  for (const question of list) {
    const questionTags = (question.tags ?? []).filter((tag) => tag && tag.trim());
    if (questionTags.length === 0) {
      untagged += 1;
      continue;
    }
    for (const tag of questionTags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  const percent = (count: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);
  const rows = Array.from(counter.entries())
    .map(([name, count]) => ({ name, count, percent: percent(count) }))
    .sort((a, b) => b.count - a.count);
  if (untagged > 0) {
    rows.push({ name: '未打标签', count: untagged, percent: percent(untagged) });
  }
  return { rows, total };
});

/** bankId 变化时重新初始化（同一组件实例内切换路由参数） */
watch(bankId, () => {
  void refreshBank();
  void refreshStats();
  loadSubjects();
  loadTags();
  reset();
});

onMounted(() => {
  void settingsStore.load();
  void refreshStats();
  loadSubjects();
  loadTags();
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

    <!-- 题目健康度统计（v3.3；对齐设计稿 bank-detail.html 顶部五张卡：题型分布 / 平均正确率 / 待完善） -->
    <div class="bank-detail__stats">
      <StatCard label="题目总数" :value="stats?.total ?? 0" unit="道" :icon="Collection" />
      <StatCard
        label="单选 / 多选"
        :value="`${typeCount.single} / ${typeCount.multiple}`"
        :icon="ListIcon"
      />
      <StatCard
        label="判断 / 简答"
        :value="`${typeCount.judge} / ${typeCount.short}`"
        :icon="CircleCheck"
      >
        <template v-if="typeCount.fill > 0" #foot>含填空 {{ typeCount.fill }} 道</template>
      </StatCard>
      <StatCard
        label="平均正确率"
        :value="avgRateText"
        :unit="stats?.avgCorrectRate != null ? '%' : ''"
        :icon="TrendCharts"
      >
        <template #foot>
          {{ stats && stats.answeredCount > 0 ? `${stats.answeredCount} 道有练题作答` : '暂无练题作答' }}
        </template>
      </StatCard>
      <StatCard
        label="待完善"
        :value="stats?.incompleteCount ?? 0"
        unit="道"
        tone="warning"
        :icon="WarningFilled"
      >
        <template #foot>{{ incompleteFoot }}</template>
      </StatCard>
    </div>

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
          <div class="bank-info__row bank-info__row--block">
            <span class="bank-info__label">授权出题人</span>
            <span v-if="bank.authorNames?.length" class="bank-info__desc">
              {{ bank.authorNames.join('、') }}
            </span>
            <span v-else class="bank-info__desc">未授权任何出题人</span>
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
            <el-button v-if="isAdmin" :icon="UserFilled" @click="openAuthorBatch">批量授权</el-button>
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
            <el-select
              v-model="filterTag"
              class="bank-detail__filter-item"
              placeholder="全部知识点"
              clearable
              filterable
            >
              <el-option label="全部知识点" value="" />
              <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
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
            <TableDensityToggle />
          </div>

          <BatchActionBar :count="selectedRows.length" noun="道试题" @clear="clearSelection">
            <el-button :icon="EditPen" @click="openBatchEdit">批量编辑</el-button>
          </BatchActionBar>

          <el-table
            ref="tableRef"
            v-loading="loading"
            :data="questions"
            row-key="id"
            stripe
            :row-class-name="rowClassName"
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
            <el-table-column prop="subject" label="科目" width="110" show-overflow-tooltip />
            <el-table-column label="难度" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.difficulty" size="small" effect="plain" type="info">
                  {{ QUESTION_DIFFICULTY_LABELS[row.difficulty as QuestionDifficulty] }}
                </el-tag>
                <span v-else class="bank-detail__muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="知识点" min-width="150">
              <template #default="{ row }">
                <template v-if="row.tags?.length">
                  <el-tag
                    v-for="tag in row.tags"
                    :key="tag"
                    size="small"
                    effect="plain"
                    type="info"
                    class="cell-tag"
                  >
                    {{ tag }}
                  </el-tag>
                </template>
                <span v-else class="cell-tag--empty">未设置</span>
              </template>
            </el-table-column>
            <el-table-column label="默认分值" width="90" align="center">
              <template #default="{ row }">{{ formatScore(row.defaultScore) }}</template>
            </el-table-column>
            <!-- 正确率（v3.3）：数值 + 内联进度条，三档单调着色；无作答 → 「—」 -->
            <el-table-column label="正确率" width="130" align="center">
              <template #default="{ row }">
                <div v-if="row.correctRate != null" class="rate-cell">
                  <span class="rate-cell__num" :class="`is-${rateTone(row.correctRate as number)}`">
                    {{ formatRate(row.correctRate as number) }}
                  </span>
                  <span class="rate-cell__track">
                    <i
                      class="rate-cell__fill"
                      :class="`is-${rateTone(row.correctRate as number)}`"
                      :style="{ width: `${Math.min(row.correctRate as number, 100)}%` }"
                    ></i>
                  </span>
                </div>
                <span v-else class="bank-detail__muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="openEditQuestion(row as Question)">
                  {{ isIncomplete(row as Question) ? '补齐' : '编辑' }}
                </el-button>
                <el-button type="danger" link @click="handleDeleteQuestion(row as Question)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :text="hasFilter ? '没有符合条件的试题' : BANK_TEXT.EMPTY_QUESTIONS"
                :filtered="hasFilter"
                action-text="手动新增"
                @clear="onResetFilters"
                @action="openCreate"
              />
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

        <div class="bank-detail__extras">
          <!-- 知识点分布（对齐设计稿 bank-detail.html「知识点分布」卡：名称 + 题数 + 进度条） -->
          <el-card class="knowledge-card" shadow="never">
            <template #header>
              <div class="card-head">
                <h3 class="card-head__title">知识点分布</h3>
                <span class="card-head__sub">基于当前页 {{ knowledge.total }} 道</span>
              </div>
            </template>
            <div v-if="knowledge.rows.length > 0" class="knowledge-card__bars">
              <div v-for="row in knowledge.rows" :key="row.name" class="knowledge-card__item">
                <div class="knowledge-card__bar-row">
                  <span class="knowledge-card__name" :title="row.name">{{ row.name }}</span>
                  <span class="knowledge-card__count num">{{ row.count }}（{{ row.percent }}%）</span>
                </div>
                <div class="knowledge-card__track">
                  <i class="knowledge-card__fill" :style="{ width: `${row.percent}%` }"></i>
                </div>
              </div>
            </div>
            <p v-else class="knowledge-card__empty">当前页暂无可统计的题目</p>
          </el-card>

          <!-- 批量导入模板（对齐设计稿形态：拖拽区 + 说明；点击打开已有导入弹窗，复用其模板下载） -->
          <el-card class="import-card" shadow="never">
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
    <QuestionBatchEditDialog
      v-model:visible="batchVisible"
      :question-ids="selectedRows.map((q) => q.id)"
      :bank-id="bankId"
      @saved="onBatchSaved"
    />
    <BankAuthorBatchDialog
      v-if="isAdmin"
      v-model:visible="authorBatchVisible"
      :bank-id="bankId"
      :current-author-ids="bank?.authorIds ?? []"
      @saved="refreshBank()"
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

  // 顶部五张健康度统计卡（对齐设计稿 .grid.g5）
  &__stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;

    @media (max-width: 1400px) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 900px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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

.cell-tag {
  margin: 0 4px 2px 0;

  &--empty {
    // 未设置知识点 → 待完善信号，用警示文本档（700，非原色）
    color: $color-warning-text;
  }
}

// 分页由 .table-card__pagination 统一控制间距，消除封装组件自带 margin 的双重叠加
.table-card__pagination :deep(.data-table-pagination) {
  margin-top: 0;
}

.bank-detail__extras {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
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

.knowledge-card {
  border-radius: $radius-lg;

  &__bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__bar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: $text-primary;
  }

  &__count {
    flex: 0 0 auto;
    color: $text-primary;
    font-weight: 600;
  }

  &__track {
    height: 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    overflow: hidden;
  }

  &__fill {
    display: block;
    height: 100%;
    border-radius: $radius-xs;
    background: $color-primary;
  }

  &__empty {
    margin: 0;
    font-size: 13px;
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

// 正确率单元格（v3.3）：数值 + 42px 内联进度条，三档单调着色
.rate-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &__num {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;

    &.is-primary {
      color: $text-primary;
    }

    &.is-warn {
      color: $color-warning-text;
    }

    &.is-err {
      color: $color-error-text;
    }
  }

  &__track {
    display: inline-block;
    width: 42px;
    height: 5px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    overflow: hidden;
  }

  &__fill {
    display: block;
    height: 100%;
    border-radius: $radius-xs;

    &.is-primary {
      background: $color-primary;
    }

    &.is-warn {
      background: $color-warning;
    }

    &.is-err {
      background: $color-error;
    }
  }
}

// 待完善行高亮（对齐设计稿 table 行 background: var(--warn-s)）。
// 双写类名 + 抬一级选择器压过 EP 斑马纹背景（EP 组件 CSS 懒加载、后于全局样式注入）。
.bank-detail__main {
  :deep(.el-table.el-table .row--incomplete > td.el-table__cell) {
    background: $color-warning-bg;
  }

  :deep(.el-table.el-table--striped .el-table__body tr.row--incomplete > td.el-table__cell) {
    background: $color-warning-bg;
  }
}
</style>
