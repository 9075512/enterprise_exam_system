<script setup lang="ts">
/**
 * 题目预览页（W3-T6）。
 * 左栏逐题卡片（题干/选项/正确答案/解析/来源题库）；右栏「试卷信息 / 预览设置 / 题目结构」。
 * 预览设置仅切换本页显隐（纯前端，不落库）；题目结构按题型聚合，并与试卷总分做真实核对。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Edit } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import { useRequest } from '@/composables/useRequest';
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_OPTIONS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { formatScore, optionLetter } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { Question, QuestionType } from '@/types';

const route = useRoute();
const router = useRouter();

const examId = computed<string>(() => String(route.params.id ?? ''));
const { data: paper, loading } = useRequest(() => examsApi.questions(examId.value));

function goBack(): void {
  void router.push('/admin/exams');
}

function goEdit(): void {
  void router.push(`/admin/exams/${examId.value}/edit`);
}

function isCorrectAnswer(answer: readonly number[], index: number): boolean {
  return answer.includes(index);
}

/** 客观题：有选项、可标注正确答案 */
function isObjective(type: QuestionType): boolean {
  return type === 'single' || type === 'multiple' || type === 'judge';
}

/** 填空/简答参考答案展示文案 */
function referenceText(question: Question): string {
  if (question.type === 'fill') {
    return (question.answer as string[]).map((a, i) => `第 ${i + 1} 空：${a}`).join('；');
  }
  if (question.type === 'short') return (question.answer as string[])[0] ?? '';
  return '';
}

/* ------------------------------ 预览设置（纯前端，不落库） ------------------------------ */
const showAnswer = ref(true);
const showAnalysis = ref(true);
const showScore = ref(true);

/* ------------------------------ 题目结构（按题型聚合，真实可算） ------------------------------ */
/** 结构行：题量 × 每题分值 × 小计 */
interface TypeStructRow {
  type: QuestionType;
  count: number;
  subtotal: number;
  /** 该题型每题分值一致时的分值；分值不一致为 null */
  uniformScore: number | null;
}

/** 题型展示顺序（与题型下拉选项同源） */
const TYPE_ORDER: readonly QuestionType[] = QUESTION_TYPE_OPTIONS.map((o) => o.value);

const structureRows = computed<TypeStructRow[]>(() => {
  const buckets = new Map<QuestionType, { count: number; subtotal: number; scores: Set<number> }>();
  for (const item of paper.value?.questions ?? []) {
    const bucket =
      buckets.get(item.question.type) ?? { count: 0, subtotal: 0, scores: new Set<number>() };
    bucket.count += 1;
    bucket.subtotal += item.score;
    bucket.scores.add(item.score);
    buckets.set(item.question.type, bucket);
  }
  return TYPE_ORDER.filter((type) => buckets.has(type)).map((type) => {
    const bucket = buckets.get(type)!;
    return {
      type,
      count: bucket.count,
      subtotal: bucket.subtotal,
      uniformScore: bucket.scores.size === 1 ? [...bucket.scores][0] : null,
    };
  });
});

/** 题目结构合计（各题型小计之和） */
const structureTotal = computed<number>(
  () => structureRows.value.reduce((sum, row) => sum + row.subtotal, 0),
);

/** 结构合计与试卷总分是否一致（真实核对） */
const totalMatches = computed<boolean>(
  () => paper.value !== null && structureTotal.value === paper.value.totalScore,
);
</script>

<template>
  <div class="preview">
    <PageHeader title="试卷预览" :description="paper?.name || '查看试卷结构与题目明细'">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
        <el-button type="primary" :icon="Edit" :disabled="!paper" @click="goEdit">返回考试编辑</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !paper" :rows="6" />

    <EmptyState v-else-if="!paper" text="试卷不存在或已被删除" />

    <div v-else class="preview__body">
      <!-- 左栏：逐题明细 -->
      <div class="preview__main">
        <EmptyState v-if="paper.questions.length === 0" text="该试卷暂无题目" />

        <el-card
          v-for="(item, index) in paper.questions"
          :key="item.questionId"
          class="preview__question"
          shadow="never"
        >
          <div class="preview__question-head">
            <span class="preview__question-index">第 {{ index + 1 }} 题</span>
            <el-tag
              size="small"
              effect="plain"
              :type="item.question.type === 'judge' ? 'warning' : 'primary'"
            >
              {{ QUESTION_TYPE_LABELS[item.question.type as QuestionType] }}
            </el-tag>
            <el-tag v-if="showScore" size="small" type="success" effect="plain">
              {{ formatScore(item.score) }} 分
            </el-tag>
            <el-tag v-if="item.bankName" size="small" type="info" effect="plain">
              来源：{{ item.bankName }}
            </el-tag>
          </div>

          <p class="preview__question-stem">{{ item.question.stem }}</p>

          <ul v-if="isObjective(item.question.type)" class="preview__options">
            <li v-for="(option, optIndex) in item.question.options" :key="optIndex" class="preview__option">
              <span class="preview__option-letter">{{ optionLetter(optIndex) }}</span>
              <span class="preview__option-text">{{ option }}</span>
              <el-tag
                v-if="showAnswer && isCorrectAnswer(item.question.answer as number[], optIndex)"
                size="small"
                type="success"
                effect="dark"
              >
                正确答案
              </el-tag>
            </li>
          </ul>

          <div v-else-if="showAnswer" class="preview__reference">
            <span class="preview__reference-label">参考答案</span>
            <span class="preview__reference-text">{{ referenceText(item.question) }}</span>
          </div>

          <el-alert
            v-if="showAnalysis && item.question.analysis"
            type="info"
            :closable="false"
            class="preview__analysis"
            title="解析"
            :description="item.question.analysis"
          />
        </el-card>
      </div>

      <!-- 右栏：信息 / 设置 / 结构 -->
      <aside class="preview__aside">
        <!-- 试卷信息 -->
        <el-card class="preview__panel" shadow="never">
          <template #header>
            <span class="preview__panel-title">试卷信息</span>
          </template>
          <div class="preview__info-row">
            <span class="preview__info-label">试卷名称</span>
            <span class="preview__info-value">{{ paper.name }}</span>
          </div>
          <div class="preview__info-row">
            <span class="preview__info-label">题目总数</span>
            <span class="preview__info-value">{{ paper.questions.length }} 题</span>
          </div>
          <div class="preview__info-row">
            <span class="preview__info-label">试卷总分</span>
            <span class="preview__info-value preview__info-total">
              {{ formatScore(paper.totalScore) }} 分
            </span>
          </div>
          <div class="preview__info-row">
            <span class="preview__info-label">来源题库</span>
            <span class="preview__info-value">
              <template v-if="paper.bankNames.length">
                <el-tag
                  v-for="(bankName, bankIndex) in paper.bankNames"
                  :key="bankIndex"
                  class="preview__bank-tag"
                  size="small"
                  type="info"
                  effect="plain"
                >
                  {{ bankName }}
                </el-tag>
              </template>
              <span v-else>—</span>
            </span>
          </div>
          <div class="preview__info-row">
            <span class="preview__info-label">创建信息</span>
            <span class="preview__info-value">{{ paper.createdBy }} · {{ formatDateTime(paper.createdAt) }}</span>
          </div>
          <p v-if="paper.description" class="preview__panel-desc">{{ paper.description }}</p>
          <!-- 数据缺口：PaperDetail 无「试卷类型 / 组卷方式 / 及格线 / 考试时长 / 难度系数」字段，
               设计稿对应行（正式卷 / 固定试题卷 / 60 分 / 60 分钟 / 0.72）不可真实计算，故不展示。 -->
        </el-card>

        <!-- 预览设置（纯前端，仅切换本页显隐，不落库） -->
        <el-card class="preview__panel" shadow="never">
          <template #header>
            <span class="preview__panel-title">预览设置</span>
          </template>
          <div class="preview__switch">
            <span class="preview__switch-label">显示答案</span>
            <el-switch v-model="showAnswer" />
          </div>
          <div class="preview__switch">
            <span class="preview__switch-label">显示解析</span>
            <el-switch v-model="showAnalysis" />
          </div>
          <div class="preview__switch">
            <span class="preview__switch-label">显示分值</span>
            <el-switch v-model="showScore" />
          </div>
        </el-card>

        <!-- 题目结构（按题型聚合，真实可算） -->
        <el-card class="preview__panel" shadow="never">
          <template #header>
            <span class="preview__panel-title">题目结构</span>
          </template>
          <EmptyState v-if="structureRows.length === 0" text="暂无题目结构" />
          <template v-else>
            <div v-for="row in structureRows" :key="row.type" class="preview__struct-row">
              <span class="preview__info-label">{{ QUESTION_TYPE_LABELS[row.type] }}</span>
              <span class="preview__struct-value">
                <template v-if="row.uniformScore !== null">
                  {{ row.count }} × {{ formatScore(row.uniformScore) }} =
                  {{ formatScore(row.subtotal) }}
                </template>
                <template v-else>{{ row.count }} 题 · 小计 {{ formatScore(row.subtotal) }}</template>
              </span>
            </div>
            <div class="preview__struct-row preview__struct-row--total">
              <span class="preview__info-label">合计</span>
              <span class="preview__struct-value">{{ formatScore(structureTotal) }} 分</span>
            </div>
            <div class="preview__struct-check">
              <el-tag v-if="totalMatches" type="success" effect="plain" size="small">
                结构小计与试卷总分一致
              </el-tag>
              <el-tag v-else type="warning" effect="plain" size="small">
                小计 {{ formatScore(structureTotal) }} 分 ≠ 试卷总分 {{ formatScore(paper.totalScore) }} 分
              </el-tag>
            </div>
          </template>
        </el-card>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.preview {
  &__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
    gap: 16px;

    @media (max-width: 1100px) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__main {
    min-width: 0;
  }

  &__aside {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 12px;

    @media (max-width: 1100px) {
      position: static;
    }
  }

  &__panel {
    border-radius: $radius-lg;

    &-title {
      font-size: 13.5px;
      font-weight: 600;
      color: $text-primary;
    }

    &-desc {
      margin: 8px 0 0;
      font-size: 12.5px;
      line-height: 1.6;
      color: $text-secondary;
    }
  }

  &__info-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
    color: $text-body;

    &:last-of-type {
      margin-bottom: 0;
    }
  }

  &__info-label {
    flex: 0 0 68px;
    color: $text-secondary;
  }

  &__info-value {
    flex: 1;
    min-width: 0;
    color: $text-body;
    word-break: break-word;
  }

  &__info-total {
    color: $color-primary;
    font-weight: 600;
  }

  &__bank-tag {
    margin: 0 6px 4px 0;
  }

  &__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 0;
    font-size: 13px;
    color: $text-body;

    &-label {
      color: $text-body;
    }
  }

  &__struct-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    font-size: 13px;
    color: $text-body;

    &--total {
      margin-top: 4px;
      padding-top: 10px;
      border-top: 1px solid $line-strong;
      font-weight: 600;

      .preview__info-label,
      .preview__struct-value {
        color: $text-primary;
      }
    }
  }

  &__struct-value {
    font-variant-numeric: tabular-nums;
  }

  &__struct-check {
    margin-top: 10px;
  }

  &__question {
    border-radius: $radius-lg;
    margin-bottom: 12px;

    &-head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }

    &-index {
      font-weight: 600;
      color: $text-primary;
    }

    &-stem {
      margin: 0 0 12px;
      font-size: 14px;
      color: $text-primary;
      line-height: 1.6;
    }
  }

  &__options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;
    color: $text-primary;

    &-letter {
      flex: 0 0 20px;
      text-align: center;
      font-weight: 600;
      color: $text-secondary;
    }

    &-text {
      flex: 1;
      min-width: 0;
    }
  }

  &__analysis {
    margin-top: 12px;
  }

  &__reference {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-primary-soft;
    border: 1px solid $color-primary-border;
    font-size: 13px;

    &-label {
      flex-shrink: 0;
      font-weight: 600;
      color: $color-primary;
    }

    &-text {
      color: $text-primary;
      line-height: 1.6;
    }
  }
}
</style>
