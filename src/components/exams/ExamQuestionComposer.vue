<script setup lang="ts">
/**
 * 考试内复用的选题工作台：只维护当前页面工作态，由父页面统一保存。
 * 来源题库 / 手动选题与抽题 / 已选题目、分值与难度分析。
 * 编辑时从考试题目详情回填；组件内没有试卷持久化入口。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Delete,
  Plus,
  Search,
  Refresh,
  CircleCheck,
  Warning,
  WarningFilled,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as examsApi from '@/api/exams';
import * as questionsApi from '@/api/questions';
import { templatesApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import {
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_DIFFICULTY_OPTIONS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
  PAPER_TARGET_DIFFICULTY,
} from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import {
  calcDifficultyIndex,
  calcTotalScore,
  difficultyVerdict,
  difficultyVerdictText,
  type DifficultyVerdict,
} from '@/services/examRules';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import type {
  DrawRules,
  DrawShortage,
  Question,
  QuestionDifficulty,
  QuestionType,
  PaperTemplate,
  PaperDetail,
} from '@/types';

/** 已选题目项（组卷工作态） */
interface SelectedQuestion {
  questionId: string;
  score: number;
  stem: string;
  type: QuestionType;
  /** 题目难度（v3.2；null = 未标注） */
  difficulty: QuestionDifficulty | null;
  /** 实测正确率（v3.3；0–100，null/未定义 = 无练题作答，难度系数取标注锚点估算） */
  correctRate?: number | null;
}

const props = defineProps<{ examName: string; initial?: PaperDetail | null; disabled?: boolean }>();
const settingsStore = useSettingsStore();

/* ------------------------------ 试卷基本信息 ------------------------------ */
const name = computed(() => props.examName);
const selectedBankIds = ref<string[]>([]);
const mode = ref<'manual' | 'draw'>('manual');
const selected = ref<SelectedQuestion[]>([]);
const paperTemplates = ref<PaperTemplate[]>([]);
const selectedTemplateId = ref('');
const templatesError = ref(false);
const templatesLoading = ref(false);

const hasBanks = computed<boolean>(() => selectedBankIds.value.length > 0);

/** 抽题规则表格行（QUESTION_TYPE_OPTIONS 为只读数组，转成可变副本供 el-table 使用） */
const typeOptions = QUESTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/* ------------------------------ 来源题库 ------------------------------ */
const { data: banks, loading: banksLoading, error: banksError, refresh: reloadBanks } = useRequest(() => banksApi.list());

/* ------------------------------ 抽题规则 ------------------------------ */
const drawRules = reactive<Record<QuestionType, { count: number; score: number }>>({
  single: { count: 0, score: 2 },
  multiple: { count: 0, score: 4 },
  judge: { count: 0, score: 4 },
  fill: { count: 0, score: 4 },
  short: { count: 0, score: 5 },
});

async function loadPaperTemplates(): Promise<void> {
  templatesLoading.value = true;
  templatesError.value = false;
  try { paperTemplates.value = await templatesApi.papers(); }
  catch { templatesError.value = true; }
  finally { templatesLoading.value = false; }
}

function applyPaperTemplate(): void {
  if (props.disabled || drawing.value) return;
  const template = paperTemplates.value.find((item) => item.id === selectedTemplateId.value);
  if (!template) return;
  const config = template.config as {
    bankIds?: string[]; mode?: 'manual' | 'draw'; rules?: Partial<Record<QuestionType, { count: number; score: number }>>;
  };
  if (Array.isArray(config.bankIds)) selectedBankIds.value = [...config.bankIds];
  if (config.mode === 'manual' || config.mode === 'draw') mode.value = config.mode;
  for (const option of QUESTION_TYPE_OPTIONS) {
    const rule = config.rules?.[option.value];
    if (rule) Object.assign(drawRules[option.value], { count: Number(rule.count) || 0, score: Number(rule.score) || 1 });
  }
  ElMessage.success(`已应用模板“${template.name}”`);
}

async function savePaperTemplate(): Promise<void> {
  if (props.disabled || drawing.value) return;
  try {
    const { value } = await ElMessageBox.prompt('保存当前题库范围、题型题量和分值', '保存组卷参数模板', {
      inputPlaceholder: '请输入模板名称', inputValidator: (v) => Boolean(v.trim()) || '请输入模板名称',
    });
    await templatesApi.savePaper({ name: value.trim(), description: '', config: {
      bankIds: [...selectedBankIds.value], mode: mode.value,
      rules: Object.fromEntries(QUESTION_TYPE_OPTIONS.map((o) => [o.value, { ...drawRules[o.value] }])),
      targetDifficulty: paperTarget.value,
      shuffleQuestions: settingsStore.settings.shuffleDefaultEnabled,
      shuffleOptions: settingsStore.settings.shuffleOptionsDefault,
    } });
    await loadPaperTemplates();
    ElMessage.success('组卷参数模板已保存');
  } catch { /* 用户取消 */ }
}
const shortages = ref<DrawShortage[]>([]);
const drawing = ref(false);

/** 按题型重新抽题，成功后整体替换当前已选清单。 */
async function generateDraft(): Promise<void> {
  if (drawing.value || props.disabled) return;
  if (!hasBanks.value) {
    ElMessage.warning('请先选择至少一个题库');
    return;
  }
  const rules: DrawRules = {};
  for (const opt of QUESTION_TYPE_OPTIONS) {
    const rule = drawRules[opt.value];
    if (rule.count > 0) rules[opt.value] = { count: rule.count, score: rule.score };
  }
  if (Object.keys(rules).length === 0) {
    ElMessage.warning('请至少配置一种题型的抽题数量');
    return;
  }

  drawing.value = true;
  try {
    const result = await examsApi.drawQuestions({
      bankIds: [...selectedBankIds.value],
      rules,
    });
    if (result.shortages.length > 0) {
      // 题量不足：不生成任何题目，保留原有已选清单
      shortages.value = result.shortages;
      return;
    }
    shortages.value = [];
    selected.value = result.questions.map((item) => ({
      questionId: item.questionId,
      score: item.score,
      stem: item.stem,
      type: item.type,
      difficulty: item.difficulty,
      // 抽题结果不含实测作答统计，难度系数按标注锚点估算
      correctRate: null,
    }));
    sortSelected();
    ElMessage.success(`已生成 ${selected.value.length} 道题目草稿`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    drawing.value = false;
  }
}

/* ------------------------------ 手动题池 ------------------------------ */
const poolType = ref<QuestionType | ''>('');
const poolSubject = ref('');
const poolDifficulty = ref<QuestionDifficulty | ''>('');
const poolKeyword = ref('');
const { data: subjectsData, error: subjectsError, loading: subjectsLoading, refresh: loadPoolSubjects } = useRequest(
  () => hasBanks.value ? questionsApi.subjects([...selectedBankIds.value]) : Promise.resolve([] as string[]),
  [selectedBankIds], { keepPreviousData: false },
);
const subjects = computed(() => subjectsData.value ?? []);

const {
  list: poolList,
  page: poolPage,
  pageSize: poolPageSize,
  total: poolTotal,
  loading: poolLoading,
  error: poolError,
  load: loadPool,
  clear: clearPool,
  onPageChange: onPoolPageChange,
  onSizeChange: onPoolSizeChange,
  reset: resetPool,
} = usePagination<Question>(
  (p, ps) =>
    questionsApi.pool({
      bankIds: selectedBankIds.value,
      type: poolType.value,
      subject: poolSubject.value,
      difficulty: poolDifficulty.value,
      keyword: poolKeyword.value.trim(),
      page: p,
      pageSize: ps,
    }),
  settingsStore.settings.defaultPageSize,
);

/** 按当前题库/筛选重新拉题池；未选题库则清空 */
function refreshPool(): void {
  clearPool();
  if (!hasBanks.value) {
    return;
  }
  resetPool();
}

function onPoolSearch(): void {
  refreshPool();
}

function onPoolResetFilters(): void {
  poolType.value = '';
  poolSubject.value = '';
  poolDifficulty.value = '';
  poolKeyword.value = '';
  refreshPool();
}

/* ------------------------------ 已选清单 ------------------------------ */
const selectedIds = computed<Set<string>>(() => new Set(selected.value.map((q) => q.questionId)));

/** 题型展示顺序：单选 → 多选 → 判断 → 填空 → 简答（与后端保存及答题页题号一致） */
const QUESTION_TYPE_ORDER: Record<QuestionType, number> = {
  single: 0,
  multiple: 1,
  judge: 2,
  fill: 3,
  short: 4,
};

/** 已选题目按题型稳定排序（题型内部保持原有相对顺序），保证组卷页所见即所得。 */
function sortSelected(): void {
  selected.value = selected.value
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = QUESTION_TYPE_ORDER[a.item.type] - QUESTION_TYPE_ORDER[b.item.type];
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.item);
}

function isSelected(questionId: string): boolean {
  return selectedIds.value.has(questionId);
}

function addSelected(
  questionId: string,
  score: number,
  stem: string,
  type: QuestionType,
  difficulty: QuestionDifficulty | null,
  correctRate: number | null = null,
): void {
  if (isSelected(questionId)) return;
  selected.value.push({ questionId, score, stem, type, difficulty, correctRate });
  sortSelected();
}

function removeSelected(questionId: string): void {
  if (props.disabled || drawing.value) return;
  selected.value = selected.value.filter((q) => q.questionId !== questionId);
}

function clearSelected(): void {
  if (props.disabled || drawing.value) return;
  selected.value = [];
}

function togglePoolQuestion(row: Question, checked: boolean): void {
  if (props.disabled || drawing.value) return;
  if (checked) {
    addSelected(row.id, row.defaultScore, row.stem, row.type, row.difficulty, row.correctRate ?? null);
  } else {
    removeSelected(row.id);
  }
}

const totalScore = computed<number>(() => calcTotalScore(selected.value));

/* ---------------- C 类对齐：信息面板（选题范围 / 结构 / 分布 / 组题检查） ----------------
 * 全部由已选题目的真实数据推导，不引入后端未提供的字段。
 */
/** 保留 1 位小数（与 examRules.calcTotalScore 同口径） */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 已选来源题库对象（摘要卡展示题库名与题量） */
const scopeBanks = computed(() =>
  (banks.value ?? []).filter((bank) => selectedBankIds.value.includes(bank.id)),
);

/** 单个题型的聚合行（试卷结构 / 分布面板共用） */
interface TypeAggRow {
  type: QuestionType;
  label: string;
  /** 该题型已选题量 */
  count: number;
  /** 该题型分值小计 */
  total: number;
  /** 每题分值：一致给单值，否则给区间；无题给 — */
  scoreText: string;
  /** 题量占已选总数的百分比 */
  percent: number;
}

/** 按题型聚合已选题目（覆盖全部题型，供「题型齐全」判断；展示时再过滤空行） */
const typeAggRows = computed<TypeAggRow[]>(() => {
  const total = selected.value.length;
  return QUESTION_TYPE_OPTIONS.map((opt) => {
    const items = selected.value.filter((q) => q.type === opt.value);
    const scores = [...new Set(items.map((q) => q.score))];
    const scoreText =
      items.length === 0
        ? '—'
        : scores.length === 1
          ? `${scores[0]}`
          : `${Math.min(...scores)}–${Math.max(...scores)}`;
    return {
      type: opt.value,
      label: opt.label,
      count: items.length,
      total: calcTotalScore(items),
      scoreText,
      percent: total > 0 ? round1((items.length / total) * 100) : 0,
    };
  });
});

/** 试卷结构：仅展示有题目的题型 */
const structureRows = computed<TypeAggRow[]>(() => typeAggRows.value.filter((row) => row.count > 0));

/** 难度分布行（v3.2）：按已选题目难度聚合（低/中/高 + 未标注） */
interface DifficultyAggRow {
  key: QuestionDifficulty | 'none';
  label: string;
  count: number;
  percent: number;
  /** 是否有对应题目（0 人时表格仍展示，进度条为空） */
  hasValue: boolean;
}

const DIFFICULTY_DEFS: ReadonlyArray<{ key: QuestionDifficulty | 'none'; label: string }> = [
  { key: 'low', label: QUESTION_DIFFICULTY_LABELS.low },
  { key: 'medium', label: QUESTION_DIFFICULTY_LABELS.medium },
  { key: 'high', label: QUESTION_DIFFICULTY_LABELS.high },
  { key: 'none', label: '未标注' },
];

const difficultyRows = computed<DifficultyAggRow[]>(() => {
  const total = selected.value.length;
  return DIFFICULTY_DEFS.map((def) => {
    const count = selected.value.filter((q) =>
      def.key === 'none' ? q.difficulty === null : q.difficulty === def.key,
    ).length;
    return {
      key: def.key,
      label: def.label,
      count,
      percent: total > 0 ? round1((count / total) * 100) : 0,
      hasValue: count > 0,
    };
  });
});

/** 已标注难度的题数（用于分布卡文案口径） */
const difficultyTaggedCount = computed<number>(
  () => selected.value.filter((q) => q.difficulty !== null).length,
);

/** 是否含未标注难度的题目（决定是否给出提示） */
const hasUntaggedDifficulty = computed<boolean>(() =>
  selected.value.some((q) => q.difficulty === null),
);

/** 展示用难度行：低/中/高 恒定展示，「未标注」仅在有值时展示 */
const visibleDifficultyRows = computed<DifficultyAggRow[]>(() =>
  difficultyRows.value.filter((row) => row.key !== 'none' || row.count > 0),
);

/* ------------------------------ 难度系数（P 值，v3.3） ------------------------------
 * 把已选题目折算为单一难度系数并与目标值对标，给出发布建议（对齐设计稿 composer 难度分布卡）。
 * 口径见 `@/services/examRules`：实测正确率优先、人工难度标注回落、按分值加权。
 */

/** 当前难度系数（无可用数据 → null，不造数） */
const currentDifficulty = computed<number | null>(() => calcDifficultyIndex(selected.value));

/** 组卷难度目标值（管理员设置 paperTargetDifficulty；后端不可用时回退内置常量，不阻断评估） */
const paperTarget = computed<number>(() => {
  const t = settingsStore.settings.paperTargetDifficulty;
  return typeof t === 'number' && t > 0 ? t : PAPER_TARGET_DIFFICULTY;
});

/** 难度系数对标结论态（none / near / easy / hard） */
const difficultyIndicator = computed<DifficultyVerdict>(() =>
  difficultyVerdict(currentDifficulty.value, paperTarget.value),
);

/** 难度系数结论提示文案 */
const difficultyTip = computed<string>(() => difficultyVerdictText(currentDifficulty.value, paperTarget.value));

/** 组题检查项（均可由当前工作态真实算出，与 handleSave 的校验口径一致） */
interface CheckItem {
  label: string;
  pass: boolean;
}

const QUESTION_TYPE_TOTAL = QUESTION_TYPE_OPTIONS.length;

const publishChecks = computed<CheckItem[]>(() => {
  const typeCount = new Set(selected.value.map((q) => q.type)).size;
  return [
    { label: '考试名称非空', pass: name.value.trim().length > 0 },
    { label: '已选择来源题库', pass: selectedBankIds.value.length > 0 },
    { label: '已选题目数 > 0', pass: selected.value.length > 0 },
    { label: '试卷总分 > 0', pass: totalScore.value > 0 },
    {
      label: '每题分值均为正数',
      pass: selected.value.length > 0 && selected.value.every((q) => q.score > 0),
    },
    { label: `题型齐全（${QUESTION_TYPE_TOTAL} 类）`, pass: typeCount === QUESTION_TYPE_TOTAL },
  ];
});

const passedCheckCount = computed(() => publishChecks.value.filter((c) => c.pass).length);

/* ------------------------------ 交互 ------------------------------ */
function onBanksChanged(): void {
  shortages.value = [];
  // 来源题库变化会影响题池与科目选项；已选清单保留（用户可手动微调）
  if (mode.value === 'manual') {
    refreshPool();
  }
}

// 模式切换 / 题库变化 → 题池与科目联动
watch(mode, (value) => {
  if (value === 'manual') {
    refreshPool();
  }
});
watch(
  selectedBankIds,
  () => {
    onBanksChanged();
  },
  { deep: true },
);

/* ------------------------------ 保存 ------------------------------ */
function getPayload() {
  if (drawing.value) { ElMessage.warning('请等待抽题完成'); return null; }
  if (!selectedBankIds.value.length) { ElMessage.warning('请至少选择一个题库'); return null; }
  if (!selected.value.length) { ElMessage.warning('考试至少需要一道题目'); return null; }
  if (selected.value.some(q => !Number.isFinite(q.score) || q.score <= 0)) { ElMessage.warning('每题分值必须为正数'); return null; }
  return { bankIds: [...selectedBankIds.value], questions: selected.value.map(q => ({ questionId: q.questionId, score: q.score })) };
}
const summary = computed(() => ({ questionCount: selected.value.length, totalScore: totalScore.value }));
const busy = computed(() => drawing.value);
defineExpose({ getPayload, summary, busy });

/* ------------------------------ 编辑回填 ------------------------------ */
onMounted(async () => {
  void settingsStore.load();
  void loadPaperTemplates();
  if (!props.initial) return;
  try {
    const detail = props.initial;
    selectedBankIds.value = [...detail.bankIds];
    selected.value = detail.questions.map((q) => ({
      questionId: q.questionId,
      score: q.score,
      stem: q.question.stem,
      type: q.question.type,
      difficulty: q.question.difficulty,
      correctRate: q.question.correctRate ?? null,
    }));
    sortSelected();
  } catch {
    // 错误提示已由拦截器统一弹出
  }
});
</script>

<template>
  <div class="composer">
    <!-- 左侧选择题目，右侧维护已选题目与分值。 -->
    <div class="composer__body">
      <!-- 左中：抽题 / 题池 -->
      <section class="composer__main">
        <div class="composer__source">
          <div class="composer__source-head"><h3>来源题库<small>可多选</small></h3><div class="composer__template-actions"><el-select v-model="selectedTemplateId" clearable :loading="templatesLoading" :disabled="disabled || templatesError || drawing" placeholder="应用组卷模板" @change="applyPaperTemplate"><el-option v-for="item in paperTemplates" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-button :disabled="disabled || drawing" @click="savePaperTemplate">保存为模板</el-button></div></div>
          <p v-if="templatesError" class="admin-hint">组卷模板加载失败，<el-button link type="primary" @click="loadPaperTemplates">重新加载</el-button></p>
          <LoadingSkeleton v-if="banksLoading && !banks" :rows="2" />
          <RequestError v-else-if="banksError" text="来源题库加载失败" @retry="reloadBanks" />
          <EmptyState v-else-if="!banks?.length" text="暂无可用题库，请先在科目题库中维护题目" />
          <el-checkbox-group v-else v-model="selectedBankIds" :disabled="disabled || drawing" class="composer__banks" aria-label="来源题库">
            <el-checkbox
              v-for="bank in banks || []"
              :key="bank.id"
              :value="bank.id"
              class="composer__bank-item"
            >
              <span class="composer__bank-name">{{ bank.name }}</span>
              <span class="composer__bank-count">（{{ bank.questionCount }} 题）</span>
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <el-radio-group v-model="mode" :disabled="disabled || drawing" class="composer__mode" aria-label="选题方式">
          <el-radio-button value="manual">手动勾选</el-radio-button>
          <el-radio-button value="draw">按题型抽题</el-radio-button>
        </el-radio-group>

        <el-alert
          v-if="!hasBanks"
          class="composer__notice"
          type="info"
          :closable="false"
          title="请先选择至少一个题库"
        />

        <!-- 抽题模式 -->
        <template v-if="mode === 'draw'">
          <div class="composer__rule-grid" aria-label="按题型抽题规则">
            <section v-for="row in typeOptions" :key="row.value" class="composer__rule-row" :aria-label="row.label">
              <h3>{{ row.label }}</h3>
              <div class="composer__rule-field"><span>抽题数量</span>
                <el-input-number
                  v-model="drawRules[row.value as QuestionType].count"
                  :min="0"
                  :max="200"
                  :disabled="!hasBanks || disabled || drawing"
                  :aria-label="`${row.label}抽题数量`"
                />
              </div>
              <div class="composer__rule-field"><span>每题分值</span>
                <el-input-number
                  v-model="drawRules[row.value as QuestionType].score"
                  :min="0.5"
                  :max="100"
                  :step="0.5"
                  :disabled="!hasBanks || disabled || drawing"
                  :aria-label="`${row.label}每题分值`"
                />
              </div>
            </section>
          </div>
          <p class="composer__rule-hint">
            随机抽题仅支持单选 / 多选 / 判断题；填空题与简答题请在「手动勾选」中按题选取。
          </p>

          <el-alert
            v-if="shortages.length > 0"
            class="composer__shortage"
            type="error"
            :closable="false"
            title="题量不足，未生成任何题目"
          >
            <ul class="composer__shortage-list">
              <li v-for="s in shortages" :key="s.type">
                {{ QUESTION_TYPE_LABELS[s.type] }}题量不足：需要 {{ s.required }} 题，实际 {{ s.available }} 题
              </li>
            </ul>
          </el-alert>

          <el-button
            type="primary"
            :icon="Plus"
            :loading="drawing"
            :disabled="disabled || !hasBanks"
            @click="generateDraft"
          >
            生成试卷草稿
          </el-button>
        </template>

        <!-- 手动勾选题池 -->
        <template v-else>
          <div class="composer__filter">
            <el-select v-model="poolType" :disabled="disabled" class="composer__filter-item" aria-label="题型" placeholder="全部题型" clearable>
              <el-option label="全部题型" value="" />
              <el-option
                v-for="opt in QUESTION_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="poolSubject" :loading="subjectsLoading" :disabled="disabled || Boolean(subjectsError)" class="composer__filter-item" aria-label="科目" placeholder="全部科目" clearable>
              <el-option label="全部科目" value="" />
              <el-option v-for="s in subjects" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select
              v-model="poolDifficulty"
              :disabled="disabled"
              aria-label="难度"
              class="composer__filter-item"
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
            <el-input
              v-model="poolKeyword"
              class="composer__filter-keyword"
              placeholder="按题干搜索"
              clearable
              :prefix-icon="Search"
              :disabled="disabled || !hasBanks"
              @keyup.enter="onPoolSearch"
            />
            <div class="composer__filter-actions"><el-button type="primary" :icon="Search" :disabled="disabled || !hasBanks" @click="onPoolSearch">查询</el-button><el-button :icon="Refresh" :disabled="disabled || !hasBanks" @click="onPoolResetFilters">重置</el-button></div>
          </div>

          <p v-if="subjectsError" class="admin-hint">科目选项加载失败，<el-button link type="primary" @click="loadPoolSubjects">重新加载</el-button></p>
          <p class="admin-scope">当前题库与筛选范围 · {{ poolLoading ? '加载中' : poolError ? '数量未知' : poolTotal + ' 道匹配题目' }}</p>
          <RequestError v-if="poolError" text="题池加载失败，已选题目已保留" @retry="loadPool" />
          <el-table v-else
            v-loading="poolLoading"
            :data="poolList"
            row-key="id"
            stripe
            :empty-text="hasBanks ? '没有匹配的题目' : '请先选择题库'"
          >
            <el-table-column width="52" align="center">
              <template #default="{ row }">
                <el-checkbox
                  :model-value="isSelected((row as Question).id)"
                  :disabled="!hasBanks || disabled"
                  :aria-label="`选择题目：${row.stem}`"
                  @change="(val: unknown) => togglePoolQuestion(row as Question, Boolean(val))"
                />
              </template>
            </el-table-column>
            <el-table-column label="题目内容" min-width="220">
              <template #default="{ row }">
                <el-tooltip :content="row.stem" placement="top" :show-after="300"><span class="composer__stem">{{ row.stem }}</span></el-tooltip>
                <span class="composer__question-meta">{{ row.subject || '未标注科目' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="题型 / 难度" width="110">
              <template #default="{ row }"><div class="composer__question-tags"><el-tag size="small" effect="plain" :type="row.type === 'judge' ? 'warning' : 'primary'">{{ QUESTION_TYPE_LABELS[row.type as QuestionType] }}</el-tag><span>{{ row.difficulty ? QUESTION_DIFFICULTY_LABELS[row.difficulty as QuestionDifficulty] : '未标注难度' }}</span></div></template>
            </el-table-column>
            <el-table-column label="分值" width="70" align="right"><template #default="{ row }">{{ row.defaultScore }} 分</template></el-table-column>
            <template #empty><EmptyState :text="hasBanks ? '没有匹配的题目' : '请先选择来源题库'" :filtered="hasBanks && Boolean(poolType || poolSubject || poolDifficulty || poolKeyword)" @clear="onPoolResetFilters" /></template>
          </el-table>

          <DataTablePagination v-if="hasBanks && !poolError"
            :page="poolPage"
            :page-size="poolPageSize"
            :total="poolTotal"
            @update:page="onPoolPageChange"
            @update:page-size="onPoolSizeChange"
          />
        </template>
      </section>

      <!-- 右侧：已选清单 -->
      <aside id="exam-selected-questions" class="composer__aside" aria-label="已选题目">
        <div class="composer__aside-head">
          <span>已选题目</span>
          <div class="composer__aside-actions">
            <el-button type="danger" link size="small" :disabled="disabled || selected.length === 0 || drawing" @click="clearSelected">清空全部</el-button>
            <el-tag size="small" effect="plain">{{ selected.length }} 题</el-tag>
          </div>
        </div>
        <p class="composer__aside-hint">按题型整理，可逐题调整分值。</p>
        <div v-if="selected.length === 0" class="composer__selected-empty"><span class="composer__empty-mark">＋</span><strong>还没有选择题目</strong><span>从左侧题库选题，所选题目将在这里汇总。</span></div>
        <ul v-else class="composer__selected-list">
          <li v-for="(item, index) in selected" :key="item.questionId" class="composer__selected-item">
            <span class="composer__selected-index">{{ index + 1 }}</span>
            <span class="composer__selected-stem">{{ item.stem }}</span>
            <div class="composer__selected-controls">
              <span class="composer__selected-type">{{ QUESTION_TYPE_LABELS[item.type] }}<template v-if="item.difficulty"> · {{ QUESTION_DIFFICULTY_LABELS[item.difficulty] }}</template></span>
              <div class="composer__score-control"><el-input-number v-model="item.score" class="composer__selected-score" :min="0.5" :max="100" :step="0.5" :disabled="disabled || drawing" :aria-label="'第' + (index + 1) + '题分值'" /><span>分</span><el-button type="danger" link :icon="Delete" :disabled="disabled || drawing" :aria-label="'移除第' + (index + 1) + '题'" @click="removeSelected(item.questionId)" /></div>
            </div>
          </li>
        </ul>

        <div class="composer__total">
          <span>总卷面分</span>
          <strong class="composer__total-value">{{ totalScore }} 分</strong>
        </div>


      </aside>
    </div>

    <details class="composer__analysis">
      <summary><span><strong>题目结构与难度分析</strong><small>查看选题范围、题型分布与组题检查</small></span><span class="composer__analysis-total">{{ selected.length }} 题 · {{ totalScore }} 分</span></summary>
      <div class="composer__analysis-body">
    <!-- 选题范围摘要（C 类对齐：来源题库 / 题型范围） -->
    <el-card class="composer__panel" shadow="never">
      <template #header><span class="composer__card-title">选题范围</span></template>
      <div class="composer__scope">
        <div class="composer__scope-item">
          <div class="composer__scope-label">来源题库</div>
          <div v-if="scopeBanks.length" class="composer__scope-tags">
            <el-tag v-for="bank in scopeBanks" :key="bank.id" size="small" effect="plain">
              {{ bank.name }}（{{ bank.questionCount }}）
            </el-tag>
          </div>
          <div v-else class="composer__scope-empty">— 未选择题库</div>
        </div>
        <div class="composer__scope-item">
          <div class="composer__scope-label">题型范围</div>
          <div v-if="structureRows.length" class="composer__scope-tags">
            <el-tag v-for="row in structureRows" :key="row.type" size="small" effect="plain">
              {{ row.label }} {{ row.count }}
            </el-tag>
          </div>
          <div v-else class="composer__scope-empty">— 尚未选题</div>
        </div>
      </div>
      <p class="composer__scope-note">
        来源题库取自当前选择，题型范围按已选题目实时统计。
      </p>
    </el-card>

    <!-- 信息面板（C 类对齐）：试卷结构 / 难度分布（降级）/ 组题检查 -->
    <div class="composer__insights">
      <!-- 试卷结构：按题型聚合的 题量 × 每题分值 × 小计 -->
      <el-card class="composer__insight" shadow="never">
        <template #header><span class="composer__card-title">试卷结构</span></template>
        <template v-if="structureRows.length">
          <div class="composer__struct-head">
            <span>题型</span><span>题量</span><span>每题分值</span><span>小计</span>
          </div>
          <div v-for="row in structureRows" :key="row.type" class="composer__struct-row">
            <span class="composer__struct-type">{{ row.label }}</span>
            <span class="num">{{ row.count }}</span>
            <span class="num">{{ row.scoreText }}</span>
            <span class="num">{{ row.total }}</span>
          </div>
          <div class="composer__struct-total">
            <span>合计</span>
            <span class="num">{{ selected.length }} 题</span>
            <span class="num">—</span>
            <span class="num composer__struct-total-score">{{ totalScore }} 分</span>
          </div>
          <!-- 数据缺口：试卷无「目标总分」字段，不做分值完成度对比 -->
        </template>
        <div v-else class="composer__insight-empty">尚未选择题目</div>
      </el-card>

      <!-- 难度分布（v3.2）：按已选题目难度聚合；难度系数对标目标值（v3.3） -->
      <el-card class="composer__insight" shadow="never">
        <template #header>
          <div class="composer__card-head">
            <span class="composer__card-title">难度分布</span>
            <el-tag size="small" effect="plain" type="info">目标 {{ paperTarget.toFixed(2) }}</el-tag>
          </div>
        </template>
        <div v-if="selected.length" class="composer__bars">
          <div v-for="row in visibleDifficultyRows" :key="row.key" class="composer__bar">
            <div class="composer__bar-head">
              <span>{{ row.label }}</span>
              <span class="composer__bar-meta num">{{ row.count }} 题 · {{ row.percent }}%</span>
            </div>
            <div class="composer__bar-track">
              <i class="composer__bar-fill" :style="{ width: `${row.percent}%` }" />
            </div>
          </div>
        </div>
        <div v-else class="composer__insight-empty">尚未选择题目</div>
        <p v-if="selected.length" class="composer__insight-note">
          {{ difficultyTaggedCount }} / {{ selected.length }} 题已标注难度<template v-if="hasUntaggedDifficulty">；「未标注」不影响组卷，可在题库详情页补充</template>。
        </p>
        <div
          v-if="selected.length"
          class="composer__verdict"
          :class="`is-${difficultyIndicator}`"
        >
          <el-icon class="composer__verdict-icon">
            <CircleCheck v-if="difficultyIndicator === 'near'" />
            <WarningFilled v-else-if="difficultyIndicator === 'easy' || difficultyIndicator === 'hard'" />
            <Warning v-else />
          </el-icon>
          <span>{{ difficultyTip }}</span>
        </div>
      </el-card>

      <!-- 组题检查：可真实算出的校验项清单 -->
      <el-card class="composer__insight" shadow="never">
        <template #header><span class="composer__card-title">组题检查</span></template>
        <ul class="composer__checks">
          <li v-for="item in publishChecks" :key="item.label" class="composer__check">
            <span class="composer__check-mark" :class="{ 'is-pass': item.pass }">
              <el-icon v-if="item.pass"><CircleCheck /></el-icon>
            </span>
            <span class="composer__check-label">{{ item.label }}</span>
          </li>
        </ul>
        <p class="composer__insight-note">{{ passedCheckCount }} / {{ publishChecks.length }} 项通过</p>
      </el-card>
    </div>
      </div>
    </details>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.composer {
  container: composer / inline-size;
  &__template-actions { display: flex; align-items: center; gap: 8px; :deep(.el-select) { width: 160px; } }
  &__source { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid $border-color; }
  &__source-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; h3 { margin: 0; color: $text-primary; font-size: 13px; } small { margin-left: 8px; font-size: 12px; font-weight: 400; color: $text-secondary; } }
  &__bank-item { border: 1px solid $border-color; border-radius: $radius-sm; padding: 6px 10px; &.is-checked { border-color: $color-primary-border; background: $color-primary-soft; } }
  &__filter-actions { display: flex; gap: 8px; :deep(.el-button + .el-button) { margin-left: 0; } }
  &__question-meta { display: block; font-size: 12px; color: $text-secondary; margin-top: 6px; }
  &__question-tags { display: grid; justify-items: start; gap: 6px; span:last-child { font-size: 12px; color: $text-secondary; } }
  &__aside-head { display: flex; justify-content: space-between; align-items: center; }
  &__aside-actions { display: flex; align-items: center; gap: 10px; }
  &__aside-hint { margin: -4px 0 8px; color: $text-secondary; font-size: 12px; line-height: 1.6; }
  &__empty-mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: $color-primary-dark; background: $color-primary-soft; font-size: 24px; }
  &__selected-controls { grid-column: 2; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  &__selected-type { font-size: 12px; color: $text-secondary; }
  &__score-control { display: flex; align-items: center; gap: 6px; font-size: 12px; color: $text-secondary; }
  &__analysis { border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-paper; summary { display: flex; align-items: center; gap: 16px; padding: 18px 20px; cursor: pointer; list-style: none; } summary::-webkit-details-marker { display: none; } summary::after { content: '+'; margin-left: auto; font-size: 20px; color: $text-secondary; } &[open] summary::after { content: '−'; } strong, small { display: block; } strong {font-size: 13px; color: $text-primary; } small { margin-top: 6px; font-size: 12px; color: $text-secondary; } }
  &__analysis-total { margin-left: auto; color: $text-body; font-size: 12px; font-variant-numeric: tabular-nums; }
  &__analysis-body { padding: 0 16px 16px; }
  &__header {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: $text-primary;
  }

  &__header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__panel.el-card {
    border-radius: $radius-lg;
    margin-bottom: 16px;
  }

  &__banks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }

  &__bank-item {
    margin-right: 0;
    max-width: 100%;
    height: auto;
    min-height: 32px;

    :deep(.el-checkbox__label) {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  &__bank-name {
    margin-right: 6px;
    font-weight: 500;
  }

  &__bank-count {
    margin-left: 6px;
    color: $text-secondary;
    font-size: 12px;
  }

  &__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    align-items: start;
    gap: 16px;
    margin-bottom: 16px;
  }

  &__main {
    flex: 1;
    min-width: 0;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    padding: 16px;
  }

  &__mode {
    margin-bottom: 12px;
  }

  &__notice {
    margin-bottom: 12px;
  }

  &__rule-table {
    margin-bottom: 8px;
  }

  &__rule-hint {
    margin: 0 0 16px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__shortage {
    margin-bottom: 16px;

    &-list {
      margin: 4px 0 0;
      padding-left: 18px;
      font-size: 13px;
    }
  }

  &__filter {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__filter-item {
    width: 100%;
  }

  &__filter-keyword {
    width: 100%;
  }

  &__stem {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  &__aside {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    position: sticky;
    top: 20px;
    scroll-margin-top: 20px;
    max-height: calc(100dvh - 180px);
    overflow: hidden;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    padding: 16px;
  }

  &__aside-head,
  &__selected-empty,
  &__total,
  &__save {
    flex-shrink: 0;
  }

  &__aside-head {
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 12px;
  }

  &__selected-empty {
    display: grid; justify-items: center; gap: 12px; padding: 36px 12px; text-align: center; color: $text-secondary; font-size: 12px; line-height: 1.7;
    strong { font-size: 13px; font-weight: 500; color: $text-body; }
  }

  &__selected-list {
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 520px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &__selected-item {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: 10px 8px;
    padding: 14px 0;
    border-bottom: 1px dashed $border-color;
  }

  &__selected-index {
    flex: 0 0 auto;
    min-width: 20px;
    text-align: center;
    color: $text-secondary;
    font-size: 12px;
  }

  &__selected-stem {
    flex: 1;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.7;
    font-size: 13px;
    color: $text-primary;
  }

  &__selected-diff {
    flex: 0 0 auto;
  }

  &__muted {
    color: $text-disabled;
  }

  &__selected-score {
    width: 136px;
  }

  &__total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid $border-color;
    color: $text-secondary;

    &-value {
      font-size: 22px;
      color: $color-primary;
    }
  }

  &__save {
    width: 100%;
  }

  /* -------------------------- C 类对齐：信息面板 -------------------------- */
  &__card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__scope {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  &__scope-item {
    min-width: 0;
  }

  &__scope-label {
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: $text-body;
  }

  &__scope-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    :deep(.el-tag) { height: auto; max-width: 100%; white-space: normal; overflow-wrap: anywhere; line-height: 22px; }
  }

  &__scope-empty {
    font-size: 13px;
    color: $text-secondary;
  }

  &__scope-note {
    margin: 12px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__insights {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: 16px;
    margin-top: 16px;
  }

  &__insight.el-card {
    border-radius: $radius-lg;
  }

  &__insight-empty {
    padding: 16px 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__insight-note {
    margin: 12px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  // 难度系数结论条：文字一律走语义色 -text 档，原色只作底/描边（方向 C 语义色铁律）
  &__verdict {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    font-size: 12.5px;
    line-height: 1.6;
    color: $text-body;

    &-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    &.is-near {
      border-color: $color-info-border;
      background: $color-info-bg;
      color: $color-info-text;
    }

    &.is-easy,
    &.is-hard {
      border-color: $color-warning-border;
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &.is-none {
      background: $color-neutral-bg;
      color: $text-secondary;
    }
  }

  &__struct-head,
  &__struct-row,
  &__struct-total {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: center;
    gap: 8px;
  }

  &__struct-head {
    padding-bottom: 6px;
    font-size: 12px;
    color: $text-secondary;
    border-bottom: 1px solid $border-color;
  }

  &__struct-row {
    padding: 6px 0;
    font-size: 13px;
    color: $text-body;
    border-bottom: 1px dashed $border-color;
  }

  &__struct-type {
    color: $text-primary;
  }

  &__struct-total {
    margin-top: 4px;
    padding-top: 10px;
    font-size: 13px;
    font-weight: 600;
    color: $text-body;
    border-top: 1px solid $line-strong;
  }

  &__struct-total-score {
    font-size: 15px;
    color: $color-primary;
  }

  &__bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__bar-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 13px;
    color: $text-primary;
  }

  &__bar-meta {
    font-size: 12px;
    color: $text-secondary;
  }

  &__bar-track {
    height: 6px;
    border-radius: $radius-xs;
    background: $color-neutral-bg;
    overflow: hidden;
  }

  &__bar-fill {
    display: block;
    height: 100%;
    border-radius: $radius-xs;
    background: $color-primary;
  }

  &__checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: $text-body;
  }

  &__check-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 16px;
    width: 16px;
    height: 16px;

    /* 未通过：灰点 */
    &::after {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $line-strong;
    }

    /* 已通过：主色系语义绿勾（图形档） */
    &.is-pass {
      font-size: 16px;
      color: $color-success;

      &::after {
        content: none;
      }
    }
  }
}

@container composer (max-width: 980px) { .composer__body { grid-template-columns: minmax(0, 1fr); } .composer__aside { position: static; max-height: none; } .composer__selected-list { max-height: 360px; } }
@container composer (max-width: 720px) {
  .composer__body { grid-template-columns: minmax(0, 1fr); }
  .composer__aside { position: static; max-height: none; }
  .composer__selected-list { max-height: 360px; }
  .composer__insights { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
  .composer__filter, .composer__scope { grid-template-columns: minmax(0, 1fr); }
  .composer__main { padding: 12px; }
  .composer__template-actions { flex-wrap: wrap; width: 100%; }
  .composer__analysis-total { display: none; }
}
.composer__rule-grid { display: grid; gap: 12px; margin-bottom: 12px; }
.composer__rule-row { display: grid; grid-template-columns: minmax(70px, .6fr) repeat(2, minmax(0, 1fr)); gap: 12px; align-items: center; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; h3 { margin: 0; font-size: 14px; } }
.composer__rule-field { display: grid; gap: 8px; min-width: 0; > span { font-size: 12px; color: $text-secondary; } :deep(.el-input-number) { width: 100%; max-width: 180px; } }
@container composer (max-width: 640px) { .composer__rule-row { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 900px) {
  .composer__mode :deep(.el-radio-button__inner), .composer__bank-item { min-height: 44px; }
  .composer__mode :deep(.el-radio-button__inner) { display: flex; align-items: center; }
  .composer__selected-controls { flex-wrap: wrap; }
  .composer__score-control { flex-wrap: wrap; }
  .composer__selected-score { width: 180px; }
  .composer__score-control > .el-button, .composer__aside-actions .el-button { min-width: 44px; min-height: 44px; }
  .composer__stem { white-space: normal; overflow-wrap: anywhere; }
}
</style>
