<script setup lang="ts">
/**
 * 人工阅卷（v1.6②，管理员 + 出题人）。
 *
 * v3.1 方向 C：按设计稿 docs/ui-v3b/pages/reviews.html 重排为三区：
 *   ① 待阅队列 —— 左栏，逐条待阅考生；点击切换当前记录（当前项主色软底选中态）
 *   ② 逐题评分 —— 中栏，当前记录的简答题（题干 / 考生作答 / 参考答案 / 评分细则）
 *                  + 数字给分 + 「本题评分」确认
 *   ③ 总分汇总 —— 右栏，客观题得分 + 主观题得分 = 合计；未评完时提示剩余题数
 *
 * 数据与提交契约均未改动：
 *   - 队列数据仍走 recordsApi.listPending(...)（分页沿用 usePagination）；
 *   - 逐题给分汇总后仍走 recordsApi.review(id, subjectiveScores)。
 *
 * v1.9④：支持按考试收窄（`?examId=`，与「考试管理」行操作直达链接打通）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as recordsApi from '@/api/records';
import { useExamScope } from '@/composables/useExamScope';
import { usePagination } from '@/composables/usePagination';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import ExamScopeSelect from '@/components/common/ExamScopeSelect.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { ExamRecord, PaperSnapshotQuestion, RubricBand } from '@/types';

const settingsStore = useSettingsStore();

/** 考试范围（与路由 ?examId= 双向同步） */
const { examId } = useExamScope();

const {
  list,
  page,
  pageSize,
  total,
  loading,
  load,
  onPageChange,
} = usePagination<ExamRecord>((p, ps) =>
  recordsApi.listPending({ page: p, pageSize: ps, examId: examId.value || undefined }),
);

/* ------------------------------ 当前记录 ------------------------------ */

/** 当前选中的答卷 id（默认回退到队列首条） */
const currentId = ref('');

const current = computed<ExamRecord | null>(
  () => list.value.find((row) => row.id === currentId.value) ?? null,
);

/** 该答卷的简答题 */
function shortQuestions(record: ExamRecord): PaperSnapshotQuestion[] {
  return record.paperSnapshot.questions.filter((sq) => sq.question.type === 'short');
}

/** 简答：该题是否配置了评分细则（分档 rubric，v1.7③ S1） */
function rubricBands(sq: PaperSnapshotQuestion): RubricBand[] {
  return sq.question.rubric ?? [];
}

/** 简答：考生作答（富文本 HTML，已经服务端白名单净化，v1.7③ S1） */
function shortUserHtml(record: ExamRecord, questionId: string): string {
  return ((record.answers[questionId] as string[] | undefined)?.[0] ?? '').trim();
}

/** 简答：参考答案文本 */
function shortReference(sq: PaperSnapshotQuestion): string {
  return (sq.question.answer as string[])[0] ?? '';
}

/* ------------------------------ 给分状态 ------------------------------ */

/** 已填得分：Record<questionId, number>（提交时原样交给 recordsApi.review） */
const scores = ref<Record<string, number>>({});

/** 已点「本题评分」确认的题（本地状态，用于汇总进度提示；不改变提交契约） */
const rated = ref<Record<string, boolean>>({});

/** 为当前记录初始化给分：默认取评分细则最高档，否则 0 分（沿用既有默认） */
function resetScores(): void {
  scores.value = {};
  rated.value = {};
  const record = current.value;
  if (!record) return;
  for (const sq of shortQuestions(record)) {
    const bands = rubricBands(sq);
    scores.value[sq.questionId] = bands.length > 0 ? bands[0].score : 0;
  }
}

/** 选中队列项 → 成为当前记录 */
function selectRecord(record: ExamRecord): void {
  if (record.id === currentId.value) return;
  currentId.value = record.id;
  resetScores();
}

/** 列表刷新后保持有效选中（当前项被阅完 / 被筛掉则回退到首条） */
function ensureSelection(): void {
  if (!list.value.some((row) => row.id === currentId.value)) {
    currentId.value = list.value[0]?.id ?? '';
    resetScores();
  }
}

async function refresh(): Promise<void> {
  await load();
  ensureSelection();
}

onMounted(() => {
  void settingsStore.load();
  void refresh();
});

/** 考试范围变化 → 回到第 1 页重查 */
watch(examId, () => {
  page.value = 1;
  void refresh();
});

/** 空态文案随筛选范围变化 */
const emptyText = computed(() => (examId.value ? '该考试暂无待阅卷答卷' : '暂无待阅卷答卷'));

/** 页头副标题：待阅总量取自分页 total；「今日已阅」后端无聚合，留 — */
const headerText = computed(
  // 数据缺口：listPending 仅返回待阅分页数据，无「今日已阅」统计
  () => `待阅 ${total.value} 份 · 今日已阅 —`,
);

/* ------------------------------ 待阅队列展示 ------------------------------ */

/** 队列条目：姓名首字（头像占位）；无姓名兜底 — */
function initial(name: string | undefined): string {
  return (name ?? '').trim().charAt(0) || '—';
}

/** 队列条目：交卷时间（列表接口返回，缺值兜底） */
function submittedText(record: ExamRecord): string {
  return record.submittedAt ? formatDateTime(record.submittedAt) : '—';
}

/** 队列条目进度：该卷待阅主观题数（提交前同卷无逐题进度，故按题数表达） */
function pendingQuestionCount(record: ExamRecord): number {
  return shortQuestions(record).length;
}

/** 记录补全显示名（列表接口可能缺 userName，兜底 —） */
function displayName(record: ExamRecord): string {
  return record.userName || '—';
}

/* ------------------------------ 当前记录指标 ------------------------------ */

/** 主观题满分（= 试卷总分 − 各简答题分值） */
const objectiveMax = computed(() => {
  const record = current.value;
  if (!record) return 0;
  const subjective = shortQuestions(record).reduce((sum, sq) => sum + sq.score, 0);
  return Math.max(record.paperSnapshot.totalScore - subjective, 0);
});

const subjectiveCount = computed(() => (current.value ? shortQuestions(current.value).length : 0));

/** 已确认评分的题数 */
const ratedCount = computed(() => {
  const record = current.value;
  if (!record) return 0;
  return shortQuestions(record).filter((sq) => rated.value[sq.questionId]).length;
});

const unratedCount = computed(() => subjectiveCount.value - ratedCount.value);

/** 主观题已确认得分合计（未确认的题不计入，避免半成品数字误导） */
const subjectiveTotal = computed(() => {
  const record = current.value;
  if (!record) return 0;
  return shortQuestions(record).reduce(
    (sum, sq) => (rated.value[sq.questionId] ? sum + (scores.value[sq.questionId] ?? 0) : sum),
    0,
  );
});

/** 客观题得分（pending 记录的 score 即客观题自动判分部分） */
const objectiveScore = computed(() => current.value?.score ?? 0);

/** 合计（= 客观题 + 已确认主观题） */
const grandTotal = computed(() => objectiveScore.value + subjectiveTotal.value);

/** 切屏次数 / 离开秒数（记录自带 cheatEvents，真实数据） */
const cheatCount = computed(() => current.value?.cheatEvents.length ?? 0);
const cheatAwaySeconds = computed(() =>
  (current.value?.cheatEvents ?? []).reduce((sum, event) => sum + event.awaySeconds, 0),
);

/* ------------------------------ 评分与提交 ------------------------------ */

/** 分档快选：选中档位 → 填入该档分值（改动后需重新确认本题） */
function applyBand(questionId: string, score: number): void {
  scores.value[questionId] = score;
  rated.value[questionId] = false;
}

/** 满分 / 零分快填 */
function setFull(sq: PaperSnapshotQuestion): void {
  scores.value[sq.questionId] = sq.score;
  rated.value[sq.questionId] = false;
}

function setZero(sq: PaperSnapshotQuestion): void {
  scores.value[sq.questionId] = 0;
  rated.value[sq.questionId] = false;
}

/** 本题评分：校验区间并标记为已确认（本地态，最终由「提交阅卷」统一落库） */
function rateQuestion(sq: PaperSnapshotQuestion): void {
  const given = scores.value[sq.questionId];
  if (!Number.isFinite(given) || given < 0 || given > sq.score) {
    ElMessage.warning(`本题得分需在 0 ~ ${formatScore(sq.score)} 之间`);
    return;
  }
  rated.value[sq.questionId] = true;
}

const submittingReview = ref(false);

/**
 * 提交阅卷：契约未改动 —— 汇总各题得分后交给 recordsApi.review(id, subjectiveScores)。
 */
async function handleSubmitReview(): Promise<void> {
  const record = current.value;
  if (!record) return;
  for (const sq of shortQuestions(record)) {
    const given = scores.value[sq.questionId];
    if (!Number.isFinite(given) || given < 0 || given > sq.score) {
      ElMessage.warning(`请为所有简答题填写 0 ~ ${formatScore(sq.score)} 之间的得分`);
      return;
    }
  }
  submittingReview.value = true;
  try {
    await recordsApi.review(record.id, scores.value);
    ElMessage.success('阅卷完成，最终成绩已生成');
    await refresh();
  } catch {
    // 错误已由拦截器提示
  } finally {
    submittingReview.value = false;
  }
}
</script>

<template>
  <div class="review-page">
    <PageHeader title="人工阅卷" :description="headerText">
      <template #actions>
        <ExamScopeSelect v-model="examId" />
      </template>
    </PageHeader>

    <div class="review-page__grid">
      <!-- ① 待阅队列 -->
      <el-card class="review-page__queue" shadow="never">
        <template #header>
          <div class="review-page__card-head">
            <span class="review-page__card-title">待阅队列</span>
            <span class="review-page__count num">{{ total }}</span>
          </div>
        </template>

        <div v-loading="loading" class="review-page__queue-body">
          <button
            v-for="row in list"
            :key="row.id"
            type="button"
            class="review-page__queue-item"
            :class="{ 'is-active': row.id === currentId }"
            @click="selectRecord(row)"
          >
            <span class="review-page__avatar" aria-hidden="true">{{ initial(row.userName) }}</span>
            <span class="review-page__queue-main">
              <span class="review-page__queue-name">{{ displayName(row) }}</span>
              <span class="review-page__queue-sub">
                {{ row.departmentName || '未分配科室' }} · {{ submittedText(row) }}
              </span>
            </span>
            <span
              class="review-page__badge"
              :class="row.id === currentId ? 'review-page__badge--primary' : 'review-page__badge--neutral'"
            >
              {{ row.id === currentId ? '阅卷中' : `待阅 ${pendingQuestionCount(row)}` }}
            </span>
          </button>

          <EmptyState v-if="!loading && list.length === 0" :text="emptyText" />
        </div>

        <el-pagination
          v-if="total > pageSize"
          class="review-page__pager"
          layout="total, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="onPageChange"
        />
      </el-card>

      <!-- ② 逐题评分 -->
      <div class="review-page__main">
        <template v-if="current">
          <el-card class="review-page__record" shadow="never">
            <div class="review-page__record-head">
              <span class="review-page__avatar review-page__avatar--lg" aria-hidden="true">
                {{ initial(current.userName) }}
              </span>
              <div class="review-page__record-info">
                <div class="review-page__record-name">{{ displayName(current) }}</div>
                <div class="review-page__record-sub">
                  {{ current.departmentName || '未分配科室' }} · 第 {{ current.attemptNo }} 次作答
                </div>
              </div>
              <span
                v-if="cheatCount > 0"
                class="review-page__badge review-page__badge--warning"
              >
                切屏 {{ cheatCount }} 次 · 离开 {{ cheatAwaySeconds }} 秒
              </span>
            </div>

            <div class="review-page__stats">
              <div class="review-page__stat">
                <span class="review-page__stat-k">客观题得分</span>
                <span class="review-page__stat-v num">
                  {{ formatScore(objectiveScore) }} / {{ formatScore(objectiveMax) }}
                </span>
              </div>
              <div class="review-page__stat">
                <span class="review-page__stat-k">主观题已评</span>
                <span class="review-page__stat-v num">{{ ratedCount }} / {{ subjectiveCount }}</span>
              </div>
              <div class="review-page__stat">
                <span class="review-page__stat-k">交卷时间</span>
                <span class="review-page__stat-v">{{ submittedText(current) }}</span>
              </div>
              <div class="review-page__stat">
                <span class="review-page__stat-k">作答次数</span>
                <span class="review-page__stat-v num">第 {{ current.attemptNo }} 次</span>
              </div>
            </div>
          </el-card>

          <el-card
            v-for="(sq, i) in shortQuestions(current)"
            :key="sq.questionId"
            class="review-page__question"
            shadow="never"
          >
            <div class="review-page__qhead">
              <span class="review-page__qtag">简答</span>
              <span class="review-page__qindex">第 {{ i + 1 }} 题</span>
              <span class="review-page__qmax num">满分 {{ formatScore(sq.score) }} 分</span>
              <span
                v-if="rated[sq.questionId]"
                class="review-page__badge review-page__badge--primary review-page__qhead-badge"
              >
                已评分
              </span>
            </div>

            <p class="review-page__stem">{{ sq.question.stem }}</p>

            <div class="review-page__answer">
              <div class="review-page__answer-row review-page__answer-row--user">
                <span class="review-page__answer-label">考生作答</span>
                <!-- 富文本作答：内容已由服务端白名单净化（utils/richText.sanitizeRichText），此处渲染安全 -->
                <div
                  v-if="shortUserHtml(current, sq.questionId)"
                  class="review-page__answer-text rich-text"
                  v-html="shortUserHtml(current, sq.questionId)"
                />
                <span v-else class="review-page__answer-text review-page__answer-text--empty">
                  未作答
                </span>
              </div>
              <div class="review-page__answer-row review-page__answer-row--ref">
                <span class="review-page__answer-label">参考答案</span>
                <span class="review-page__answer-text">{{ shortReference(sq) }}</span>
              </div>
              <div
                v-if="rubricBands(sq).length > 0"
                class="review-page__answer-row review-page__answer-row--rubric"
              >
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
                    <span v-if="band.description" class="review-page__rubric-desc">
                      {{ band.description }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="review-page__score-row">
              <span class="review-page__score-label">本题得分</span>
              <el-input-number
                v-model="scores[sq.questionId]"
                :min="0"
                :max="sq.score"
                :step="0.5"
                :precision="1"
                size="small"
              />
              <span class="review-page__score-max">/ {{ formatScore(sq.score) }} 分</span>
              <el-button size="small" @click="setFull(sq)">满分</el-button>
              <el-button size="small" @click="setZero(sq)">零分</el-button>
              <span class="review-page__score-spacer" />
              <el-button size="small" type="primary" @click="rateQuestion(sq)">本题评分</el-button>
            </div>
          </el-card>

          <EmptyState v-if="shortQuestions(current).length === 0" text="该答卷无简答题" />
        </template>

        <el-card v-else class="review-page__placeholder" shadow="never">
          <EmptyState :text="emptyText" />
        </el-card>
      </div>

      <!-- ③ 总分汇总 -->
      <div class="review-page__side">
        <el-card class="review-page__summary" shadow="never">
          <template #header>
            <div class="review-page__card-head">
              <span class="review-page__card-title">总分汇总</span>
            </div>
          </template>

          <template v-if="current">
            <div class="review-page__kv">
              <span class="review-page__kv-k">客观题</span>
              <span class="review-page__kv-v num">{{ formatScore(objectiveScore) }} 分</span>
            </div>
            <div class="review-page__kv">
              <span class="review-page__kv-k">主观题</span>
              <span class="review-page__kv-v num">
                <template v-if="ratedCount > 0">{{ formatScore(subjectiveTotal) }} 分</template>
                <template v-else>—</template>
              </span>
            </div>
            <div class="review-page__kv review-page__kv--total">
              <span class="review-page__kv-k">合计</span>
              <span class="review-page__kv-v review-page__kv-v--total num">
                {{ formatScore(grandTotal) }} / {{ formatScore(current.paperSnapshot.totalScore) }} 分
              </span>
            </div>

            <p v-if="unratedCount > 0" class="review-page__hint">还有 {{ unratedCount }} 题未评分</p>
            <p v-else class="review-page__hint review-page__hint--done">全部主观题已评分</p>

            <div class="review-page__passline">
              <!-- 数据缺口：待阅列表接口不返回 passScore，无法判定是否达线 -->
              <template v-if="current.passScore != null">
                及格线 {{ formatScore(current.passScore) }} 分
              </template>
              <template v-else>及格线 —</template>
            </div>

            <el-button
              class="review-page__submit"
              type="primary"
              :loading="submittingReview"
              @click="handleSubmitReview"
            >
              提交阅卷
            </el-button>
          </template>

          <EmptyState v-else text="请选择待阅答卷" />
        </el-card>

        <div class="review-page__tip">
          <!-- 数据缺口：设计稿的「评语 / 标记存疑 / 快捷键」后端无对应字段与接口，暂不提供 -->
          评语、标记存疑、快捷键：当前版本暂未开放。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.review-page {
  &__grid {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr) 286px;
    gap: 12px;
    align-items: start;
  }

  &__main,
  &__side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  /* 右栏跟随滚动，评分时指标始终可见 */
  &__side {
    position: sticky;
    top: 66px;
  }

  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__count {
    font-size: 12px;
    color: $text-secondary;
  }

  /* ---------------- ① 待阅队列 ---------------- */
  &__queue :deep(.el-card__body) {
    padding: 0;
  }

  &__queue-body {
    max-height: 560px;
    overflow-y: auto;
  }

  &__queue-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 10px 14px;
    border: 0;
    border-bottom: 1px solid $border-color;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:hover {
      background: $color-table-hover;
    }

    &.is-active {
      background: $color-primary-soft;
    }
  }

  &__queue-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__queue-name {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__queue-sub {
    font-size: 11px;
    color: $text-secondary;
  }

  &__avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: $color-primary-soft;
    color: $color-primary;
    font-size: 11.5px;
    font-weight: 600;

    &--lg {
      width: 34px;
      height: 34px;
      font-size: 14px;
    }
  }

  &__badge {
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: $radius-xs;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;

    &--neutral {
      background: $color-neutral-bg;
      color: $text-secondary;
    }

    &--primary {
      background: $color-primary-soft;
      color: $color-primary;
    }

    /* 语义色仅作底，文字走深字档（对白底达 AA） */
    &--warning {
      background: $color-warning-bg;
      color: $color-warning-text;
    }
  }

  &__pager {
    justify-content: center;
    padding: 10px 14px;
  }

  /* ---------------- ② 逐题评分 ---------------- */
  &__record-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  &__record-info {
    flex: 1;
    min-width: 0;
  }

  &__record-name {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  &__record-sub {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    padding-top: 14px;
    border-top: 1px solid $border-color;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__stat-k {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__stat-v {
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
  }

  &__question {
    border-radius: $radius-base;
  }

  &__qhead {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  /* 分类色仅用于题型编码（简答徽标） */
  &__qtag {
    padding: 2px 7px;
    border-radius: $radius-xs;
    background: $color-secondary-soft;
    color: $color-secondary;
    font-size: 11px;
    font-weight: 600;
  }

  &__qindex {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__qmax {
    font-size: 12px;
    color: $text-secondary;
  }

  &__qhead-badge {
    margin-left: auto;
  }

  &__stem {
    margin: 0 0 12px;
    font-size: 13.5px;
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

    /* 考生作答：浅底 + 左缘 2px 主色条（方向 C 的行焦点语言） */
    &--user {
      padding: 10px 12px;
      border: 1px solid $border-color;
      border-left: 2px solid $color-primary;
      border-radius: $radius-sm;
      background: $bg-page;
    }

    &--ref {
      padding: 8px 10px;
      border: 1px solid $color-primary-border;
      border-radius: $radius-sm;
      background: $color-primary-soft;
    }

    &--rubric {
      flex-direction: column;
      gap: 6px;
    }
  }

  &__answer-label {
    flex: 0 0 60px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__answer-text {
    flex: 1;
    min-width: 0;
    color: $text-body;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;

    &--empty {
      color: $text-disabled;
    }
  }

  &__rubric-bands {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
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
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover {
      border-color: $color-primary-border;
      background: $color-primary-soft;
    }

    &.is-active {
      border-color: $color-primary;
      background: $color-primary-soft;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px dashed $border-color;
  }

  &__score-label {
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__score-max {
    font-size: 13px;
    color: $text-secondary;
  }

  &__score-spacer {
    flex: 1;
  }

  /* ---------------- ③ 总分汇总 ---------------- */
  &__kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    font-size: 13px;

    &--total {
      margin-top: 4px;
      padding-top: 10px;
      border-top: 1px solid $line-strong;
    }
  }

  &__kv-k {
    color: $text-secondary;
  }

  &__kv-v {
    font-weight: 600;
    color: $text-primary;

    &--total {
      font-size: 15px;
    }
  }

  &__hint {
    margin: 12px 0 0;
    font-size: 12px;
    color: $text-secondary;

    &--done {
      color: $color-success-text;
    }
  }

  &__passline {
    margin-top: 10px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__submit {
    width: 100%;
    margin-top: 14px;
  }

  &__tip {
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-page;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }

  &__placeholder :deep(.el-card__body) {
    padding: 24px 16px;
  }
}

/* 窄屏降级为单列（对齐设计稿 grid 断点） */
@media (max-width: 1200px) {
  .review-page__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .review-page__side {
    position: static;
  }
}
</style>
