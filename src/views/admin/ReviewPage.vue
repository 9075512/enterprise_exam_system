<script setup lang="ts">
/**
 * 人工阅卷（v1.6②，管理员 + 出题人）。
 * 列出待阅卷答卷（含简答题、status=pending_review），点击「阅卷」逐题给分。
 * 提交后总分 = 客观题（含填空）自动判分 + 主观题（简答）人工给分，状态转 submitted。
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as recordsApi from '@/api/records';
import { usePagination } from '@/composables/usePagination';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { ExamRecord, PaperSnapshotQuestion, RubricBand } from '@/types';

const settingsStore = useSettingsStore();

const {
  list,
  page,
  pageSize,
  total,
  loading,
  load,
  onPageChange,
  onSizeChange,
} = usePagination<ExamRecord>((p, ps) => recordsApi.listPending({ page: p, pageSize: ps }));

onMounted(() => {
  void settingsStore.load();
  void load();
});

/* ------------------------------ 阅卷弹窗 ------------------------------ */
const reviewVisible = ref(false);
const reviewing = ref<ExamRecord | null>(null);
const scores = ref<Record<string, number>>({});
const submittingReview = ref(false);

/** 该答卷的简答题 */
function shortQuestions(record: ExamRecord): PaperSnapshotQuestion[] {
  return record.paperSnapshot.questions.filter((sq) => sq.question.type === 'short');
}

/** 简答：考生作答（富文本 HTML，已经服务端白名单净化，v1.7③ S1） */
function shortUserHtml(record: ExamRecord, questionId: string): string {
  return ((record.answers[questionId] as string[] | undefined)?.[0] ?? '').trim();
}

/** 简答：该题是否配置了评分细则（分档 rubric，v1.7③ S1） */
function rubricBands(sq: PaperSnapshotQuestion): RubricBand[] {
  return sq.question.rubric ?? [];
}

/** 简答：参考答案文本 */
function shortReference(sq: PaperSnapshotQuestion): string {
  return (sq.question.answer as string[])[0] ?? '';
}

/** 分档快选：选中档位 → 填入该档分值 */
function applyBand(questionId: string, score: number): void {
  scores.value[questionId] = score;
}

function openReview(row: ExamRecord): void {
  reviewing.value = row;
  scores.value = {};
  for (const sq of shortQuestions(row)) {
    // 默认取细则最高档（若已配置），否则 0 分
    const bands = rubricBands(sq);
    scores.value[sq.questionId] = bands.length > 0 ? bands[0].score : 0;
  }
  reviewVisible.value = true;
}

async function handleSubmitReview(): Promise<void> {
  if (!reviewing.value) return;
  for (const sq of shortQuestions(reviewing.value)) {
    const given = scores.value[sq.questionId];
    if (!Number.isFinite(given) || given < 0 || given > sq.score) {
      ElMessage.warning(`请为所有简答题填写 0 ~ ${formatScore(sq.score)} 之间的得分`);
      return;
    }
  }
  submittingReview.value = true;
  try {
    await recordsApi.review(reviewing.value.id, scores.value);
    ElMessage.success('阅卷完成，最终成绩已生成');
    reviewVisible.value = false;
    void load();
  } catch {
    // 错误已由拦截器提示
  } finally {
    submittingReview.value = false;
  }
}
</script>

<template>
  <div class="review-page">
    <PageHeader title="人工阅卷" description="对含简答题的答卷进行逐题评分；客观题已自动判分" />

    <el-card class="review-page__panel" shadow="never">
      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column prop="examName" label="考试名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.examName || row.paperSnapshot.paperName }}</template>
        </el-table-column>
        <el-table-column prop="userName" label="考生姓名" width="110" />
        <el-table-column prop="departmentName" label="科室" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.departmentName || '—' }}</template>
        </el-table-column>
        <el-table-column label="作答次数" width="90" align="center">
          <template #default="{ row }">第 {{ row.attemptNo }} 次</template>
        </el-table-column>
        <el-table-column label="客观题得分" width="110" align="center">
          <template #default="{ row }">
            <span class="review-page__score num">{{ formatScore(row.score) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="简答题数" width="100" align="center">
          <template #default="{ row }">{{ shortQuestions(row as ExamRecord).length }}</template>
        </el-table-column>
        <el-table-column label="交卷时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openReview(row as ExamRecord)">阅卷</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState text="暂无待阅卷答卷" />
        </template>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        class="review-page__pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-card>

    <!-- 阅卷弹窗 -->
    <el-dialog
      v-model="reviewVisible"
      title="人工阅卷"
      width="760px"
      top="6vh"
      destroy-on-close
      class="review-page__dialog"
    >
      <div v-if="reviewing" class="review-page__dialog-body">
        <div class="review-page__head">
          <span class="review-page__head-name">{{ reviewing.userName }}</span>
          <span class="review-page__head-meta">
            {{ reviewing.departmentName || '未分配科室' }} · 第 {{ reviewing.attemptNo }} 次作答
          </span>
        </div>

        <el-alert
          class="review-page__notice"
          type="info"
          :closable="false"
          :title="`客观题（含填空）已自动判分 ${formatScore(reviewing.score)} 分，请在下方为简答题打分`"
        />

        <el-card
          v-for="(sq, i) in shortQuestions(reviewing)"
          :key="sq.questionId"
          class="review-page__question"
          shadow="never"
        >
          <div class="review-page__qhead">
            <span class="review-page__qindex">第 {{ i + 1 }} 题</span>
            <el-tag size="small" type="info" effect="plain">{{ formatScore(sq.score) }} 分</el-tag>
          </div>

          <p class="review-page__stem">{{ sq.question.stem }}</p>

          <div class="review-page__answer">
            <div class="review-page__answer-row">
              <span class="review-page__answer-label">考生答案</span>
              <!-- 富文本作答：内容已由服务端白名单净化（utils/richText.sanitizeRichText），此处渲染安全 -->
              <div
                v-if="shortUserHtml(reviewing, sq.questionId)"
                class="review-page__answer-text rich-text"
                v-html="shortUserHtml(reviewing, sq.questionId)"
              />
              <span v-else class="review-page__answer-text review-page__answer-text--empty">未作答</span>
            </div>
            <div class="review-page__answer-row review-page__answer-row--ref">
              <span class="review-page__answer-label">参考答案</span>
              <span class="review-page__answer-text">{{ shortReference(sq) }}</span>
            </div>
            <div v-if="rubricBands(sq).length > 0" class="review-page__answer-row review-page__answer-row--rubric">
              <span class="review-page__answer-label">评分细则</span>
              <div class="review-page__rubric-bands">
                <button
                  v-for="band in rubricBands(sq)"
                  :key="band.score"
                  type="button"
                  class="review-page__rubric-band"
                  :class="{ 'is-active': scores[sq.questionId] === band.score }"
                  @click="applyBand(sq.questionId, band.score)"
                >
                  <span class="review-page__rubric-score num">{{ formatScore(band.score) }} 分</span>
                  <span v-if="band.label" class="review-page__rubric-label">{{ band.label }}</span>
                  <span v-if="band.description" class="review-page__rubric-desc">{{ band.description }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="review-page__score-row">
            <span class="review-page__score-label">给分</span>
            <el-input-number
              v-model="scores[sq.questionId]"
              :min="0"
              :max="sq.score"
              :step="0.5"
              :precision="1"
              size="small"
            />
            <span class="review-page__score-max">/ {{ formatScore(sq.score) }} 分</span>
          </div>
        </el-card>

        <EmptyState v-if="shortQuestions(reviewing).length === 0" text="该答卷无简答题" />
      </div>

      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingReview" @click="handleSubmitReview">
          提交阅卷
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.review-page {
  &__panel {
    border-radius: $radius-lg;
  }

  &__pager {
    margin-top: 16px;
    justify-content: flex-end;
  }

  &__score {
    font-weight: 600;
    color: $color-primary;
  }

  &__dialog-body {
    max-height: 70vh;
    overflow-y: auto;
    padding-right: 4px;
  }

  &__head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;

    &-name {
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
    }

    &-meta {
      font-size: 13px;
      color: $text-secondary;
    }
  }

  &__notice {
    margin-bottom: 14px;
  }

  &__question {
    border-radius: $radius-base;
    margin-bottom: 12px;
    border-left: 4px solid $color-warning;
  }

  &__qhead {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  &__qindex {
    font-weight: 600;
    color: $text-primary;
  }

  &__stem {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.6;
    color: $text-primary;
  }

  &__answer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__answer-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;

    &--ref {
      padding: 8px 10px;
      border-radius: $radius-sm;
      background: $color-primary-soft;
      border: 1px solid rgba($color-primary, 0.16);
    }

    &--rubric {
      flex-direction: column;
      gap: 6px;
    }
  }

  &__answer-label {
    flex: 0 0 64px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__answer-text {
    flex: 1;
    min-width: 0;
    color: $text-primary;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;

    &--empty {
      color: $text-disabled;
    }
  }

  &__rubric-bands {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__rubric-band {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-paper;
    text-align: left;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast, box-shadow $transition-fast;

    &:hover {
      border-color: rgba($color-primary, 0.4);
      background: $color-primary-soft;
    }

    &.is-active {
      border-color: $color-primary;
      background: $color-primary-soft;
      box-shadow: 0 0 0 3px rgba($color-primary, 0.1);
    }
  }

  &__rubric-score {
    flex: 0 0 auto;
    font-weight: 700;
    color: $color-primary;
  }

  &__rubric-label {
    flex: 0 0 auto;
    font-weight: 600;
    color: $text-primary;
  }

  &__rubric-desc {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__score-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px dashed $border-color;
  }

  &__score-label {
    flex: 0 0 64px;
    font-weight: 600;
    color: $text-secondary;
    font-size: 13px;
  }

  &__score-max {
    font-size: 13px;
    color: $text-secondary;
  }
}
</style>
