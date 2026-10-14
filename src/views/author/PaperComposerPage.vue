<script setup lang="ts">
/**
 * 组卷页（W3-T6，PRD §7.6）。
 * 三区：顶部（试卷名称/描述 + 来源题库多选）/ 左中（手动勾选 或 按题型抽题）/ 右侧（已选清单 + 总卷面分）。
 * 编辑模式：route.query.paperId 存在时回填并走 papers.update。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Delete, Plus, ArrowLeft, Search, Refresh, CircleCheck } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as papersApi from '@/api/papers';
import * as questionsApi from '@/api/questions';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
} from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import { calcTotalScore } from '@/services/examRules';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type {
  DrawRules,
  DrawShortage,
  DrawTagRule,
  DrawTagShortage,
  Question,
  QuestionType,
} from '@/types';

/** 已选题目项（组卷工作态） */
interface SelectedQuestion {
  questionId: string;
  score: number;
  stem: string;
  type: QuestionType;
}

const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();

/* ------------------------------ 试卷基本信息 ------------------------------ */
const paperId = computed<string>(() => (route.query.paperId as string) || '');
const name = ref('');
const description = ref('');
const selectedBankIds = ref<string[]>([]);
const mode = ref<'manual' | 'draw'>('manual');
const selected = ref<SelectedQuestion[]>([]);
const saving = ref(false);

const hasBanks = computed<boolean>(() => selectedBankIds.value.length > 0);

/** 抽题规则表格行（QUESTION_TYPE_OPTIONS 为只读数组，转成可变副本供 el-table 使用） */
const typeOptions = QUESTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/* ------------------------------ 来源题库 ------------------------------ */
const { data: banks, loading: banksLoading } = useRequest(() => banksApi.list());

/* ------------------------------ 抽题规则 ------------------------------ */
const drawRules = reactive<Record<QuestionType, { count: number; score: number }>>({
  single: { count: 0, score: 2 },
  multiple: { count: 0, score: 4 },
  judge: { count: 0, score: 4 },
  fill: { count: 0, score: 4 },
  short: { count: 0, score: 5 },
});
const shortages = ref<DrawShortage[]>([]);
const tagShortages = ref<DrawTagShortage[]>([]);
const drawing = ref(false);

/* ------------------------ 按知识点配比抽题（v1.7②） ------------------------ */
/** 标签抽题规则行（可增删） */
const drawTagRules = ref<DrawTagRule[]>([]);
/** 可选题库内的已有标签 */
const drawTagOptions = ref<string[]>([]);

function addTagRule(): void {
  drawTagRules.value.push({ tag: '', count: 1, score: 2 });
}

function removeTagRule(index: number): void {
  drawTagRules.value.splice(index, 1);
}

/** 拉取当前题库集合下的标签候选（失败静默降级为纯手输） */
async function loadDrawTags(): Promise<void> {
  if (selectedBankIds.value.length === 0) {
    drawTagOptions.value = [];
    return;
  }
  try {
    drawTagOptions.value = await questionsApi.tags([...selectedBankIds.value]);
  } catch {
    drawTagOptions.value = [];
  }
}

/** 生成试卷草稿（按题型 / 知识点随机抽题） */
async function generateDraft(): Promise<void> {
  if (!hasBanks.value) {
    ElMessage.warning('请先选择至少一个题库');
    return;
  }
  const rules: DrawRules = {};
  for (const opt of QUESTION_TYPE_OPTIONS) {
    const rule = drawRules[opt.value];
    if (rule.count > 0) rules[opt.value] = { count: rule.count, score: rule.score };
  }
  const tagRules: DrawTagRule[] = [];
  for (const rule of drawTagRules.value) {
    const tag = rule.tag.trim();
    if (!tag || rule.count <= 0) continue;
    if (tagRules.some((r) => r.tag === tag)) {
      ElMessage.warning(`知识点「${tag}」配置重复，请合并后再抽题`);
      return;
    }
    tagRules.push({ tag, count: rule.count, score: rule.score });
  }
  if (Object.keys(rules).length === 0 && tagRules.length === 0) {
    ElMessage.warning('请至少配置一种题型或一个知识点的抽题数量');
    return;
  }

  drawing.value = true;
  try {
    const result = await papersApi.drawQuestions({
      bankIds: [...selectedBankIds.value],
      rules,
      tagRules,
    });
    if (result.shortages.length > 0 || result.tagShortages.length > 0) {
      // 题量不足：不生成任何题目，保留原有已选清单
      shortages.value = result.shortages;
      tagShortages.value = result.tagShortages;
      return;
    }
    shortages.value = [];
    tagShortages.value = [];
    const existing = new Set(selected.value.map((q) => q.questionId));
    let added = 0;
    for (const item of result.questions) {
      if (existing.has(item.questionId)) continue;
      selected.value.push({
        questionId: item.questionId,
        score: item.score,
        stem: item.stem,
        type: item.type,
      });
      existing.add(item.questionId);
      added += 1;
    }
    sortSelected();
    ElMessage.success(`已生成 ${added} 道题目草稿`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    drawing.value = false;
  }
}

/* ------------------------------ 手动题池 ------------------------------ */
const poolType = ref<QuestionType | ''>('');
const poolSubject = ref('');
const poolTag = ref('');
const poolKeyword = ref('');
const subjects = ref<string[]>([]);
const poolTags = ref<string[]>([]);

const {
  list: poolList,
  page: poolPage,
  pageSize: poolPageSize,
  total: poolTotal,
  loading: poolLoading,
  load: loadPool,
  onPageChange: onPoolPageChange,
  onSizeChange: onPoolSizeChange,
  reset: resetPool,
} = usePagination<Question>(
  (p, ps) =>
    questionsApi.pool({
      bankIds: selectedBankIds.value,
      type: poolType.value,
      subject: poolSubject.value,
      tag: poolTag.value,
      keyword: poolKeyword.value.trim(),
      page: p,
      pageSize: ps,
    }),
  settingsStore.settings.defaultPageSize,
);

async function loadPoolSubjects(): Promise<void> {
  if (selectedBankIds.value.length === 0) {
    subjects.value = [];
    return;
  }
  try {
    subjects.value = await questionsApi.subjects([...selectedBankIds.value]);
  } catch {
    subjects.value = [];
  }
}

async function loadPoolTags(): Promise<void> {
  if (selectedBankIds.value.length === 0) {
    poolTags.value = [];
    return;
  }
  try {
    poolTags.value = await questionsApi.tags([...selectedBankIds.value]);
  } catch {
    poolTags.value = [];
  }
}

/** 按当前题库/筛选重新拉题池；未选题库则清空 */
function refreshPool(): void {
  if (!hasBanks.value) {
    poolList.value = [];
    poolTotal.value = 0;
    return;
  }
  resetPool();
}

function onPoolSearch(): void {
  resetPool();
}

function onPoolResetFilters(): void {
  poolType.value = '';
  poolSubject.value = '';
  poolTag.value = '';
  poolKeyword.value = '';
  resetPool();
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

function addSelected(questionId: string, score: number, stem: string, type: QuestionType): void {
  if (isSelected(questionId)) return;
  selected.value.push({ questionId, score, stem, type });
  sortSelected();
}

function removeSelected(questionId: string): void {
  selected.value = selected.value.filter((q) => q.questionId !== questionId);
}

function togglePoolQuestion(row: Question, checked: boolean): void {
  if (checked) {
    addSelected(row.id, row.defaultScore, row.stem, row.type);
  } else {
    removeSelected(row.id);
  }
}

const totalScore = computed<number>(() => calcTotalScore(selected.value));

/* ---------------- C 类对齐：信息面板（选题范围 / 结构 / 分布 / 发布检查） ----------------
 * 全部由已选题目的真实数据推导，不引入后端未提供的字段。
 * 数据缺口：Question 无 difficulty 字段，故「难度分布」降级为「按题型/分值分布」。
 */
/** 保留 1 位小数（与 examRules.calcTotalScore 同口径） */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 已选来源题库对象（摘要卡展示题库名与题量） */
const scopeBanks = computed(() =>
  (banks.value ?? []).filter((bank) => selectedBankIds.value.includes(bank.id)),
);

/** 知识点范围：手动模式取当前题池筛选的知识点，抽题模式取已配置的知识点配比规则（均为用户真实选择） */
const scopeTags = computed<string[]>(() => {
  if (mode.value === 'manual') return poolTag.value ? [poolTag.value] : [];
  return drawTagRules.value.map((rule) => rule.tag.trim()).filter((tag) => tag);
});

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

/** 分布面板（难度分布降级）：与试卷结构同源，仅展示有题目的题型 */
const distributionRows = computed<TypeAggRow[]>(() => structureRows.value);

/** 发布检查项（均可由当前工作态真实算出，与 handleSave 的校验口径一致） */
interface CheckItem {
  label: string;
  pass: boolean;
}

const QUESTION_TYPE_TOTAL = QUESTION_TYPE_OPTIONS.length;

const publishChecks = computed<CheckItem[]>(() => {
  const typeCount = new Set(selected.value.map((q) => q.type)).size;
  return [
    { label: '试卷名称非空', pass: name.value.trim().length > 0 },
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
function goBack(): void {
  void router.push('/author/papers');
}

function onBanksChanged(): void {
  shortages.value = [];
  tagShortages.value = [];
  void loadDrawTags();
  // 来源题库变化会影响题池与科目/标签选项；已选清单保留（用户可手动微调）
  if (mode.value === 'manual') {
    void loadPoolSubjects();
    void loadPoolTags();
    refreshPool();
  }
}

// 模式切换 / 题库变化 → 题池与科目联动
watch(mode, (value) => {
  if (value === 'manual') {
    void loadPoolSubjects();
    void loadPoolTags();
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
async function handleSave(): Promise<void> {
  if (!name.value.trim()) {
    ElMessage.warning('请输入试卷名称');
    return;
  }
  if (selectedBankIds.value.length === 0) {
    ElMessage.warning('请至少选择一个题库');
    return;
  }
  if (selected.value.length === 0) {
    ElMessage.warning('试卷至少需要包含一道题目');
    return;
  }
  if (selected.value.some((q) => !(q.score > 0))) {
    ElMessage.warning('每题分值必须为正数');
    return;
  }

  const payload = {
    name: name.value.trim(),
    description: description.value.trim(),
    bankIds: [...selectedBankIds.value],
    questions: selected.value.map((q) => ({ questionId: q.questionId, score: q.score })),
  };

  saving.value = true;
  try {
    if (paperId.value) {
      await papersApi.update(paperId.value, payload);
      ElMessage.success('试卷已更新');
    } else {
      await papersApi.create(payload);
      ElMessage.success('试卷已保存');
    }
    void router.push('/author/papers');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    saving.value = false;
  }
}

/* ------------------------------ 编辑回填 ------------------------------ */
onMounted(async () => {
  void settingsStore.load();
  if (!paperId.value) return;
  try {
    const detail = await papersApi.detail(paperId.value);
    name.value = detail.name;
    description.value = detail.description;
    selectedBankIds.value = [...detail.bankIds];
    selected.value = detail.questions.map((q) => ({
      questionId: q.questionId,
      score: q.score,
      stem: q.question.stem,
      type: q.question.type,
    }));
    sortSelected();
    await loadPoolSubjects();
    await loadPoolTags();
    await loadDrawTags();
    refreshPool();
  } catch {
    // 错误提示已由拦截器统一弹出
  }
});
</script>

<template>
  <div class="composer">
    <PageHeader :title="paperId ? '编辑试卷' : '开始组卷'" description="从多个题库组合生成试卷">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存试卷</el-button>
      </template>
    </PageHeader>

    <!-- 顶部：基本信息 + 来源题库 -->
    <el-card class="composer__panel" shadow="never">
      <el-form label-position="top">
        <el-form-item label="试卷名称">
          <el-input v-model="name" maxlength="120" show-word-limit placeholder="如：安全知识月考卷" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="description"
            type="textarea"
            :rows="2"
            maxlength="255"
            show-word-limit
            placeholder="选填"
          />
        </el-form-item>
        <el-form-item label="来源题库（可多选，至少选 1 个）">
          <LoadingSkeleton v-if="banksLoading && !banks" :rows="2" />
          <el-checkbox-group v-else v-model="selectedBankIds" class="composer__banks">
            <el-checkbox
              v-for="bank in banks || []"
              :key="bank.id"
              :value="bank.id"
              class="composer__bank-item"
            >
              <span class="composer__bank-name">{{ bank.name }}</span>
              <el-tag size="small" type="info" effect="plain">{{ bank.category }}</el-tag>
              <span class="composer__bank-count">（{{ bank.questionCount }} 题）</span>
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="composer__body">
      <!-- 左中：抽题 / 题池 -->
      <section class="composer__main">
        <el-radio-group v-model="mode" class="composer__mode">
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
          <el-table :data="typeOptions" class="composer__rule-table">
            <el-table-column label="题型" width="140">
              <template #default="{ row }">{{ row.label }}</template>
            </el-table-column>
            <el-table-column label="抽题数量" width="180">
              <template #default="{ row }">
                <el-input-number
                  v-model="drawRules[row.value as QuestionType].count"
                  :min="0"
                  :max="200"
                  :disabled="!hasBanks"
                />
              </template>
            </el-table-column>
            <el-table-column label="每题分值">
              <template #default="{ row }">
                <el-input-number
                  v-model="drawRules[row.value as QuestionType].score"
                  :min="0.5"
                  :max="100"
                  :step="0.5"
                  :disabled="!hasBanks"
                />
              </template>
            </el-table-column>
          </el-table>
          <p class="composer__rule-hint">
            随机抽题仅支持单选 / 多选 / 判断题；填空题与简答题请在「手动勾选」中按题选取。
          </p>

          <!-- 按知识点配比抽题（v1.7②） -->
          <div class="composer__tag-rules">
            <div class="composer__tag-rules-head">
              <span class="composer__tag-rules-title">按知识点配比（可选）</span>
              <el-button
                size="small"
                :icon="Plus"
                :disabled="!hasBanks || drawTagRules.length >= 20"
                @click="addTagRule"
              >
                添加知识点
              </el-button>
            </div>
            <p v-if="drawTagRules.length === 0" class="composer__tag-rules-empty">
              未配置知识点规则；与上方题型规则可同时使用，抽到的题目会自动去重。
            </p>
            <div v-for="(rule, index) in drawTagRules" :key="index" class="composer__tag-rule-row">
              <el-select
                v-model="rule.tag"
                class="composer__tag-rule-tag"
                placeholder="选择或输入知识点"
                filterable
                allow-create
                default-first-option
                :disabled="!hasBanks"
              >
                <el-option v-for="t in drawTagOptions" :key="t" :label="t" :value="t" />
              </el-select>
              <el-input-number
                v-model="rule.count"
                :min="1"
                :max="200"
                :disabled="!hasBanks"
                controls-position="right"
              />
              <el-input-number
                v-model="rule.score"
                :min="0.5"
                :max="100"
                :step="0.5"
                :disabled="!hasBanks"
                controls-position="right"
              />
              <el-button type="danger" link :icon="Delete" @click="removeTagRule(index)" />
            </div>
          </div>

          <el-alert
            v-if="shortages.length > 0 || tagShortages.length > 0"
            class="composer__shortage"
            type="error"
            :closable="false"
            title="题量不足，未生成任何题目"
          >
            <ul class="composer__shortage-list">
              <li v-for="s in shortages" :key="s.type">
                {{ QUESTION_TYPE_LABELS[s.type] }}题量不足：需要 {{ s.required }} 题，实际 {{ s.available }} 题
              </li>
              <li v-for="s in tagShortages" :key="`tag-${s.tag}`">
                知识点「{{ s.tag }}」题量不足：需要 {{ s.required }} 题，实际 {{ s.available }} 题
              </li>
            </ul>
          </el-alert>

          <el-button
            type="primary"
            :icon="Plus"
            :loading="drawing"
            :disabled="!hasBanks"
            @click="generateDraft"
          >
            生成试卷草稿
          </el-button>
        </template>

        <!-- 手动勾选题池 -->
        <template v-else>
          <div class="composer__filter">
            <el-select v-model="poolType" class="composer__filter-item" placeholder="全部题型" clearable>
              <el-option label="全部题型" value="" />
              <el-option
                v-for="opt in QUESTION_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="poolSubject" class="composer__filter-item" placeholder="全部科目" clearable>
              <el-option label="全部科目" value="" />
              <el-option v-for="s in subjects" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select
              v-model="poolTag"
              class="composer__filter-item"
              placeholder="全部知识点"
              clearable
              filterable
            >
              <el-option label="全部知识点" value="" />
              <el-option v-for="t in poolTags" :key="t" :label="t" :value="t" />
            </el-select>
            <el-input
              v-model="poolKeyword"
              class="composer__filter-keyword"
              placeholder="按题干搜索"
              clearable
              :prefix-icon="Search"
              :disabled="!hasBanks"
              @keyup.enter="onPoolSearch"
            />
            <el-button type="primary" :icon="Search" :disabled="!hasBanks" @click="onPoolSearch">查询</el-button>
            <el-button :icon="Refresh" :disabled="!hasBanks" @click="onPoolResetFilters">重置</el-button>
          </div>

          <el-table
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
                  :disabled="!hasBanks"
                  @change="(val: unknown) => togglePoolQuestion(row as Question, Boolean(val))"
                />
              </template>
            </el-table-column>
            <el-table-column label="题干" min-width="240">
              <template #default="{ row }">
                <el-tooltip :content="row.stem" placement="top" :show-after="300">
                  <span class="composer__stem">{{ row.stem }}</span>
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
              <template #default="{ row }">{{ row.defaultScore }}</template>
            </el-table-column>
          </el-table>

          <DataTablePagination
            :page="poolPage"
            :page-size="poolPageSize"
            :total="poolTotal"
            @update:page="onPoolPageChange"
            @update:page-size="onPoolSizeChange"
          />
        </template>
      </section>

      <!-- 右侧：已选清单 -->
      <aside class="composer__aside">
        <div class="composer__aside-head">已选题目（{{ selected.length }}）</div>

        <div v-if="selected.length === 0" class="composer__selected-empty">尚未选择题目</div>

        <ul v-else class="composer__selected-list">
          <li v-for="(item, index) in selected" :key="item.questionId" class="composer__selected-item">
            <span class="composer__selected-index">{{ index + 1 }}</span>
            <el-tooltip :content="item.stem" placement="top" :show-after="300">
              <span class="composer__selected-stem">{{ item.stem }}</span>
            </el-tooltip>
            <el-input-number
              v-model="item.score"
              class="composer__selected-score"
              :min="0.5"
              :max="100"
              :step="0.5"
              size="small"
              controls-position="right"
            />
            <el-button type="danger" link :icon="Delete" @click="removeSelected(item.questionId)" />
          </li>
        </ul>

        <div class="composer__total">
          <span>总卷面分</span>
          <strong class="composer__total-value">{{ totalScore }} 分</strong>
        </div>

        <el-button type="primary" class="composer__save" :loading="saving" @click="handleSave">
          保存试卷
        </el-button>
      </aside>
    </div>

    <!-- 选题范围摘要（C 类对齐：来源题库 / 知识点范围 / 题型范围） -->
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
          <div class="composer__scope-label">知识点范围</div>
          <div v-if="scopeTags.length" class="composer__scope-tags">
            <el-tag v-for="tag in scopeTags" :key="tag" size="small" type="info" effect="plain">
              {{ tag }}
            </el-tag>
          </div>
          <div v-else class="composer__scope-empty">— 未限定知识点</div>
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
        知识点范围取自当前抽题配置，题型范围按已选题目实时统计。
      </p>
    </el-card>

    <!-- 信息面板（C 类对齐）：试卷结构 / 难度分布（降级）/ 发布检查 -->
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

      <!-- 难度分布（降级为按题型/分值分布） -->
      <el-card class="composer__insight" shadow="never">
        <template #header><span class="composer__card-title">难度分布</span></template>
        <div v-if="distributionRows.length" class="composer__bars">
          <div v-for="row in distributionRows" :key="row.type" class="composer__bar">
            <div class="composer__bar-head">
              <span>{{ row.label }}</span>
              <span class="composer__bar-meta num">{{ row.count }} 题 · {{ row.total }} 分</span>
            </div>
            <div class="composer__bar-track">
              <i class="composer__bar-fill" :style="{ width: `${row.percent}%` }" />
            </div>
          </div>
        </div>
        <div v-else class="composer__insight-empty">尚未选择题目</div>
        <p class="composer__insight-note">
          <!-- 数据缺口：Question 无 difficulty 字段，暂以题型/分值分布替代 -->
          Question 无 difficulty 字段，暂以题型 / 分值分布替代。
        </p>
      </el-card>

      <!-- 发布检查：可真实算出的校验项清单 -->
      <el-card class="composer__insight" shadow="never">
        <template #header><span class="composer__card-title">发布检查</span></template>
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
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.composer {
  &__header {
    display: flex;
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
    gap: 8px;
  }

  &__panel.el-card {
    border-radius: $radius-base;
    margin-bottom: 16px;
  }

  &__banks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }

  &__bank-item {
    margin-right: 0;
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
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  &__main {
    flex: 1;
    min-width: 0;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    padding: 16px;
  }

  &__mode {
    margin-bottom: 16px;
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

  &__tag-rules {
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
  }

  &__tag-rules-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  &__tag-rules-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__tag-rules-empty {
    margin: 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__tag-rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  &__tag-rule-tag {
    flex: 1;
    min-width: 0;
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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__filter-item {
    width: 140px;
  }

  &__filter-keyword {
    width: 200px;
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
    flex: 0 0 380px;
    width: 380px;
    position: sticky;
    top: 80px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    padding: 16px;
  }

  &__aside-head {
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 12px;
  }

  &__selected-empty {
    padding: 24px 0;
    text-align: center;
    color: $text-secondary;
    font-size: 13px;
  }

  &__selected-list {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 420px;
    overflow-y: auto;
  }

  &__selected-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px dashed $border-color;
  }

  &__selected-index {
    flex: 0 0 20px;
    text-align: center;
    color: $text-secondary;
    font-size: 12px;
  }

  &__selected-stem {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: $text-primary;
  }

  &__selected-score {
    flex: 0 0 110px;
    width: 110px;
  }

  &__total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 16px 0;
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

  &__scope {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    border-radius: $radius-base;
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

  &__struct-head,
  &__struct-row,
  &__struct-total {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 88px 72px;
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
</style>
