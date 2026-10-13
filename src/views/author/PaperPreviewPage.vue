<script setup lang="ts">
/**
 * 试卷预览页（W3-T6）。
 * 顶部信息卡（名称/描述/来源题库/总分/题数/创建信息）+ 逐题卡片（题干/选项/正确答案/解析/来源题库）。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Edit } from '@element-plus/icons-vue';
import * as papersApi from '@/api/papers';
import { useRequest } from '@/composables/useRequest';
import { QUESTION_TYPE_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { formatScore, optionLetter } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { Question, QuestionType } from '@/types';

const route = useRoute();
const router = useRouter();

const paperId = computed<string>(() => String(route.params.paperId ?? ''));
const { data: paper, loading } = useRequest(() => papersApi.detail(paperId.value));

function goBack(): void {
  void router.push('/author/papers');
}

function goEdit(): void {
  void router.push(`/author/papers/composer?paperId=${paperId.value}`);
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
</script>

<template>
  <div class="preview">
    <PageHeader title="试卷预览" :description="paper?.name || '查看试卷结构与题目明细'">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
        <el-button type="primary" :icon="Edit" :disabled="!paper" @click="goEdit">编辑试卷</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !paper" :rows="6" />

    <EmptyState v-else-if="!paper" text="试卷不存在或已被删除" />

    <template v-else>
      <!-- 信息卡 -->
      <el-card class="preview__info" shadow="never">
        <h3 class="preview__info-name">{{ paper.name }}</h3>
        <p v-if="paper.description" class="preview__info-desc">{{ paper.description }}</p>
        <div class="preview__info-row">
          <span class="preview__info-label">来源题库</span>
          <span>
            <template v-if="paper.bankNames.length">
              <el-tag
                v-for="(bankName, index) in paper.bankNames"
                :key="index"
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
          <span class="preview__info-label">题目数</span>
          <span>{{ paper.questions.length }} 题</span>
        </div>
        <div class="preview__info-row">
          <span class="preview__info-label">总卷面分</span>
          <strong class="preview__info-total">{{ formatScore(paper.totalScore) }} 分</strong>
        </div>
        <div class="preview__info-row">
          <span class="preview__info-label">创建信息</span>
          <span>{{ paper.createdBy }} · {{ formatDateTime(paper.createdAt) }}</span>
        </div>
      </el-card>

      <!-- 题目列表 -->
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
          <el-tag size="small" type="success" effect="plain">{{ formatScore(item.score) }} 分</el-tag>
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
              v-if="isCorrectAnswer(item.question.answer as number[], optIndex)"
              size="small"
              type="success"
              effect="dark"
            >
              正确答案
            </el-tag>
          </li>
        </ul>

        <div v-else class="preview__reference">
          <span class="preview__reference-label">参考答案</span>
          <span class="preview__reference-text">{{ referenceText(item.question) }}</span>
        </div>

        <el-alert
          v-if="item.question.analysis"
          type="info"
          :closable="false"
          class="preview__analysis"
          title="解析"
          :description="item.question.analysis"
        />
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.preview {
  &__info {
    border-radius: $radius-lg;
    margin-bottom: 16px;

    &-name {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
    }

    &-desc {
      margin: 0 0 12px;
      font-size: 13px;
      color: $text-secondary;
    }

    &-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 13px;
      color: $text-primary;
    }

    &-label {
      flex: 0 0 72px;
      color: $text-secondary;
    }

    &-total {
      color: $color-primary;
      font-size: 15px;
    }
  }

  &__bank-tag {
    margin-right: 6px;
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
    border: 1px solid rgba($color-primary, 0.16);
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
