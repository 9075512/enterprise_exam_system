<script setup lang="ts">
/**
 * 我的考试（W3-T1，考生）。仅显示本科室考试（后端隔离）。
 * 开考/续考走后端幂等 start；补考申请走 applyRetake。
 *
 * v3.1 方向 C（设计稿 p-exam-my 重排）：
 * 由「工具条 + el-table」改为「分段页签筛选 + 卡片列表 + 分页 + 考试须知」。
 * 卡片态由本人记录推导（进行中 / 已完成 / 未及格 / 未开始 / 已结束），
 * 交卷记录额外拉一次 `records.my` 用于展示得分与及格结论（失败时静默降级为不带分数）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { InfoFilled, Refresh, Search } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { applyRetake } from '@/api/retakes';
import { useRequest } from '@/composables/useRequest';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime, formatRange } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import ContentBoard from '@/components/common/ContentBoard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import type { ExamMy, ExamRecord, RetakeStatus } from '@/types';

const router = useRouter();
const settingsStore = useSettingsStore();
const { data: exams, loading, refresh: refreshExams } = useRequest(() => examsApi.my());
/** 我的成绩（仅用于在卡片上展示得分与及格结论；失败静默） */
const { data: recordsPage } = useRequest(() => recordsApi.my({ page: 1, pageSize: 100 }));

/** examId → 本人最近一次已交卷记录 */
const recordMap = computed<Record<string, ExamRecord>>(() => {
  const map: Record<string, ExamRecord> = {};
  for (const r of recordsPage.value?.list ?? []) {
    if (r.status !== 'submitted') continue;
    const cur = map[r.examId];
    if (!cur || (r.submittedAt ?? '') > (cur.submittedAt ?? '')) map[r.examId] = r;
  }
  return map;
});

/** 补考申请状态文案 */
const RETAKE_STATUS_LABELS: Record<RetakeStatus, string> = {
  pending: '补考待审批',
  approved: '补考已通过',
  rejected: '补考已驳回',
};

/* ------------------------------ 卡片态 ------------------------------ */
type CardState = 'not_started' | 'ongoing' | 'in_progress' | 'done' | 'failed' | 'ended';

const STATE_META: Record<CardState, { label: string; tone: 'gray' | 'pri' | 'ok' | 'info' | 'warn' | 'err' }> = {
  not_started: { label: '未开始', tone: 'warn' },
  ongoing: { label: '可作答', tone: 'pri' },
  in_progress: { label: '进行中', tone: 'ok' },
  done: { label: '已完成', tone: 'info' },
  failed: { label: '未及格', tone: 'err' },
  ended: { label: '已结束', tone: 'gray' },
};

function stateOf(row: ExamMy): CardState {
  if (row.recordStatus === 'in_progress') return 'in_progress';
  const rec = recordMap.value[row.id];
  if (rec) return rec.score >= row.passScore ? 'done' : 'failed';
  if (row.recordStatus === 'submitted') return 'done';
  const st = getExamStatus(row);
  if (st === 'not_started') return 'not_started';
  if (st === 'ended') return 'ended';
  return 'ongoing';
}

function scoreOf(row: ExamMy): number | null {
  const rec = recordMap.value[row.id];
  return rec ? rec.score : null;
}

/** 本人最近一条已交卷记录 id（无则空串）——供模板按钮显隐与跳转 */
function recordIdOf(row: ExamMy): string {
  return recordMap.value[row.id]?.id ?? '';
}

/** 本人最近一条已交卷记录的交卷时间（无则空串） */
function submittedAtOf(row: ExamMy): string {
  return recordMap.value[row.id]?.submittedAt ?? '';
}

/** 可作答总次数（含补考加成与特殊安排加次） */
function maxAllowedOf(row: ExamMy): number {
  return row.maxAttempts + row.extraAttempts + (row.retakeStatus === 'approved' ? 1 : 0);
}

/* ------------------------------ 筛选（客户端） ------------------------------ */
type TabKey = 'all' | 'not_started' | 'ongoing' | 'done' | 'failed';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'not_started', label: '待考' },
  { key: 'ongoing', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '未及格' },
];

const activeTab = ref<TabKey>('all');
const keyword = ref('');

/** 页签命中的考试（未及格 = 有已交卷记录且低于及格线） */
function matchTab(row: ExamMy, tab: TabKey): boolean {
  if (tab === 'all') return true;
  const state = stateOf(row);
  if (tab === 'not_started') return state === 'not_started';
  if (tab === 'ongoing') return state === 'ongoing' || state === 'in_progress';
  if (tab === 'done') return state === 'done' || state === 'failed';
  return state === 'failed';
}

const tabCounts = computed<Record<TabKey, number>>(() => {
  const list = exams.value ?? [];
  const counts = { all: list.length, not_started: 0, ongoing: 0, done: 0, failed: 0 };
  for (const row of list) {
    for (const key of ['not_started', 'ongoing', 'done', 'failed'] as TabKey[]) {
      if (matchTab(row, key)) counts[key] += 1;
    }
  }
  return counts;
});

const filteredExams = computed<ExamMy[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return (exams.value ?? []).filter((row) => {
    if (!matchTab(row, activeTab.value)) return false;
    if (kw && !row.name.toLowerCase().includes(kw)) return false;
    return true;
  });
});

/* ------------------------------ 客户端分页 ------------------------------ */
const PAGE_SIZE = 10;
const page = ref(1);

const pagedExams = computed<ExamMy[]>(() =>
  filteredExams.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
const totalPages = computed<number>(() => Math.max(1, Math.ceil(filteredExams.value.length / PAGE_SIZE)));

watch([activeTab, keyword], () => {
  page.value = 1;
});
watch(totalPages, (n) => {
  if (page.value > n) page.value = n;
});

function resetFilter(): void {
  activeTab.value = 'all';
  keyword.value = '';
}

/* ------------------------------ 操作 ------------------------------ */
const starting = ref('');
const applying = ref('');

async function handleStart(exam: ExamMy): Promise<void> {
  starting.value = exam.id;
  try {
    const record = await examsApi.start(exam.id);
    void router.push(`/exam/taking/${record.id}`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    starting.value = '';
  }
}

function goDetail(recordId: string): void {
  void router.push(`/score-detail/${recordId}`);
}

function goRetakes(): void {
  void router.push('/exam/retakes');
}

function handleApplyRetake(exam: ExamMy): void {
  void (async () => {
    let reason = '';
    try {
      const { value } = await ElMessageBox.prompt(`请填写「${exam.name}」的补考申请说明`, '申请补考', {
        confirmButtonText: '提交申请',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (v) => (v && v.trim() ? true : '请填写申请说明'),
      });
      reason = (value as string).trim();
    } catch {
      return;
    }
    applying.value = exam.id;
    try {
      await applyRetake(exam.id, reason);
      ElMessage.success('补考申请已提交，请等待管理员审批');
      await refreshExams();
    } catch {
      // 错误已由拦截器提示
    } finally {
      applying.value = '';
    }
  })();
}

interface ActionState {
  label: string;
  enabled: boolean;
  tip: string;
}

/**
 * 操作主按钮状态：
 * - 时间窗内：进行中「继续考试」；未超次数「开始考试 / 再考一次」；次数用尽禁用
 * - 未开始 / 已结束：沿用既有时间窗提示
 * - 补考：存在「已通过」申请时，可用次数 = maxAttempts + 1
 */
function actionState(row: ExamMy): ActionState {
  const status = getExamStatus(row);
  if (status !== 'ongoing') {
    return {
      label: '开始考试',
      enabled: false,
      tip: status === 'not_started' ? '考试尚未开始' : '考试已结束',
    };
  }
  if (row.recordStatus === 'in_progress') {
    return { label: '继续作答', enabled: true, tip: '' };
  }
  const maxAllowed = maxAllowedOf(row);
  if (row.attemptsUsed < maxAllowed) {
    return { label: row.attemptsUsed > 0 ? '再考一次' : '开始考试', enabled: true, tip: '' };
  }
  return { label: '开始考试', enabled: false, tip: `答题次数已用完（最多 ${maxAllowed} 次）` };
}

/**
 * 考试须知。
 * 数值口径与系统设置（后端 DEFAULT_SETTINGS）保持一致，避免写死后与管理员配置脱节：
 * - 切屏异常：`cheatCountThreshold` 次或 `cheatSecondsThreshold` 秒，任一达到即记异常；
 * - 复核时限：`appealWindowDays` 天（自交卷起算，0 = 不限时限），复核关闭时不展示该条；
 * - 补考：未及格且答题次数已用尽的考试可申请（后端 canApplyRetake 口径）。
 */
const notices = computed<Array<{ icon: unknown; text: string }>>(() => {
  const s = settingsStore.settings;
  const items: Array<{ icon: unknown; text: string }> = [
    { icon: InfoFilled, text: '考试需在开放时间窗内进入作答，时间窗结束后将无法开考' },
    {
      icon: InfoFilled,
      text: `切屏累计达 ${s.cheatCountThreshold} 次、或累计离开页面 ${s.cheatSecondsThreshold} 秒，将记为异常`,
    },
    { icon: InfoFilled, text: '未及格且答题次数用完后可申请补考，审核通过后可再作答一次' },
  ];
  if (s.appealEnabled) {
    items.push({
      icon: InfoFilled,
      text:
        s.appealWindowDays > 0
          ? `成绩发布后 ${s.appealWindowDays} 日内可申请复核`
          : '成绩发布后可申请复核（不限时限）',
    });
  }
  return items;
});

onMounted(() => {
  void settingsStore.load();
});
</script>

<template>
  <div class="my-exam">
    <PageHeader title="我的考试" description="仅显示你所在科室的考试">
      <template #actions>
        <el-button :icon="Refresh" @click="refreshExams">刷新</el-button>
        <el-button @click="goRetakes">我的补考</el-button>
      </template>
    </PageHeader>

    <!-- 公告与轮播（v1.9⑥；无生效内容时组件自身不渲染） -->
    <ContentBoard scope="exam" />

    <LoadingSkeleton v-if="loading && !exams" :rows="5" />

    <template v-else>
      <el-card class="my-exam__panel" shadow="never">
        <!-- 分段页签（设计稿 .tabs） -->
        <div class="my-exam__tabs">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="my-exam__tab"
            :class="{ 'is-on': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }} {{ tabCounts[tab.key] }}
          </button>
          <div class="my-exam__tabs-sp" />
          <el-input
            v-model="keyword"
            class="my-exam__search"
            placeholder="搜索考试名称"
            clearable
            :prefix-icon="Search"
          />
        </div>

        <div class="my-exam__body">
          <EmptyState
            v-if="filteredExams.length === 0"
            :text="keyword.trim() || activeTab !== 'all' ? '没有匹配的考试' : '暂无分配给本科室的考试'"
            :filtered="Boolean(keyword.trim()) || activeTab !== 'all'"
            @clear="resetFilter"
          />

          <div v-else class="my-exam__list">
            <article
              v-for="row in pagedExams"
              :key="row.id"
              class="my-exam__item"
              :class="{
                'is-warn': stateOf(row) === 'not_started',
                'is-err': stateOf(row) === 'failed',
              }"
            >
              <div class="my-exam__item-head">
                <div class="my-exam__item-main">
                  <div class="my-exam__item-title">
                    <span class="my-exam__name" :title="row.name">{{ row.name }}</span>
                    <span class="my-exam__bdg" :class="`my-exam__bdg--${STATE_META[stateOf(row)].tone}`">
                      {{ STATE_META[stateOf(row)].label }}
                    </span>
                    <span v-if="row.extraMinutes" class="my-exam__bdg my-exam__bdg--warn">
                      加时 {{ row.extraMinutes }} 分钟
                    </span>
                  </div>
                  <div class="my-exam__item-meta">
                    {{ row.durationMinutes }} 分钟 · 及格线 {{ row.passScore }} 分 · 可作答
                    {{ maxAllowedOf(row) }} 次
                  </div>
                </div>

                <div class="my-exam__item-act">
                  <div v-if="scoreOf(row) !== null" class="my-exam__score">
                    <span class="my-exam__score-num" :class="{ 'is-fail': stateOf(row) === 'failed' }">
                      {{ scoreOf(row) }}
                    </span>
                    <span class="my-exam__score-label">{{ stateOf(row) === 'failed' ? '未及格' : '已及格' }}</span>
                  </div>

                  <el-tooltip v-if="!actionState(row).enabled" :content="actionState(row).tip">
                    <span><el-button disabled>{{ actionState(row).label }}</el-button></span>
                  </el-tooltip>
                  <el-button
                    v-else
                    type="primary"
                    :loading="starting === row.id"
                    @click="handleStart(row)"
                  >
                    {{ actionState(row).label }}
                  </el-button>

                  <el-button
                    v-if="recordIdOf(row)"
                    @click="goDetail(recordIdOf(row))"
                  >
                    成绩明细
                  </el-button>

                  <el-button
                    v-if="row.canApplyRetake"
                    type="primary"
                    :loading="applying === row.id"
                    @click="handleApplyRetake(row)"
                  >
                    申请补考
                  </el-button>
                </div>
              </div>

              <div class="my-exam__item-foot">
                <span class="my-exam__foot-item">时间窗 {{ formatRange(row.startTime, row.endTime) }}</span>
                <span class="my-exam__foot-item">已考 {{ row.attemptsUsed }} / {{ maxAllowedOf(row) }} 次</span>
                <span v-if="submittedAtOf(row)" class="my-exam__foot-item">
                  交卷时间 {{ formatDateTime(submittedAtOf(row)) }}
                </span>
                <span v-if="row.retakeStatus" class="my-exam__foot-item my-exam__foot-item--strong">
                  {{ RETAKE_STATUS_LABELS[row.retakeStatus] }}
                </span>
              </div>
            </article>
          </div>

          <!-- 分页 -->
          <div v-if="filteredExams.length > PAGE_SIZE" class="my-exam__pager">
            <span class="my-exam__pager-info">共 {{ filteredExams.length }} 场考试 · 每页 {{ PAGE_SIZE }} 条</span>
            <button
              type="button"
              class="my-exam__pg"
              :disabled="page <= 1"
              aria-label="上一页"
              @click="page -= 1"
            >
              ‹
            </button>
            <span class="my-exam__pg is-on">{{ page }}</span>
            <span class="my-exam__pg-text">/ {{ totalPages }}</span>
            <button
              type="button"
              class="my-exam__pg"
              :disabled="page >= totalPages"
              aria-label="下一页"
              @click="page += 1"
            >
              ›
            </button>
          </div>
        </div>
      </el-card>

      <!-- 考试须知 -->
      <el-card class="my-exam__notice" shadow="never">
        <template #header>
          <h3 class="my-exam__card-title">考试须知</h3>
        </template>
        <div class="my-exam__notice-list">
          <div v-for="(notice, i) in notices" :key="i" class="my-exam__notice-item">
            <el-icon class="my-exam__notice-icon"><component :is="notice.icon" /></el-icon>
            <span>{{ notice.text }}</span>
          </div>
        </div>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.my-exam {
  &__panel {
    margin-bottom: 16px;
  }

  /* 分段页签（设计稿 .tabs） */
  &__tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 16px;
    border-bottom: 1px solid $border-color;
  }

  &__tab {
    height: 40px;
    padding: 0 10px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 13px;
    font-weight: 500;
    color: $text-secondary;
    cursor: pointer;
    transition: color $transition-fast, border-color $transition-fast;

    &:hover {
      color: $text-primary;
    }

    &.is-on {
      color: $color-primary;
      border-bottom-color: $color-primary;
      font-weight: 620;
    }
  }

  &__tabs-sp {
    flex: 1;
  }

  &__search {
    width: 220px;
    margin-left: 8px;
  }

  &__body {
    padding: 16px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 考试卡（设计稿的 warn / err 描边强调态） */
  &__item {
    padding: 15px;
    border: 1px solid $border-color;
    border-radius: $radius-base;
    background: $bg-paper;

    &.is-warn {
      border-color: $color-warning-border;
      background: $color-warning-bg;
    }

    &.is-err {
      border-color: $color-error-border;
      background: $color-error-bg;
    }
  }

  &__item-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  &__item-main {
    min-width: 0;
    flex: 1;
  }

  &__item-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 420px;
  }

  &__item-meta {
    margin-top: 4px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__item-act {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }

  &__score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-right: 4px;
  }

  &__score-num {
    font-size: 19px;
    font-weight: 640;
    line-height: 1.1;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &.is-fail {
      color: $color-error-text;
    }
  }

  &__score-label {
    font-size: 11px;
    color: $text-secondary;
  }

  &__item-foot {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 12px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__foot-item--strong {
    font-weight: 600;
    color: $text-primary;
  }

  /* 状态徽标（设计稿 .bdg：5px 圆点 + 浅底深字） */
  &__bdg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border-radius: 5px;
    font-size: 11.5px;
    font-weight: 580;
    white-space: nowrap;

    &::before {
      content: '';
      flex: 0 0 5px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    &--gray {
      background: $color-neutral-bg;
      color: $text-secondary;
    }

    &--pri {
      background: $color-primary-soft;
      color: $color-primary;
    }

    &--ok {
      background: $color-success-bg;
      color: $color-success-text;
    }

    &--info {
      background: $color-info-bg;
      color: $color-info-text;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &--err {
      background: $color-error-bg;
      color: $color-error-text;
    }
  }

  /* 分页（设计稿 .pager / .pg） */
  &__pager {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding-top: 11px;
    border-top: 1px solid $border-color;
  }

  &__pager-info {
    margin-right: auto;
    font-size: 12px;
    color: $text-secondary;
  }

  &__pg {
    min-width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: $radius-xs;
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $color-neutral-bg;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.is-on {
      background: $color-primary;
      border-color: $color-primary;
      color: #fff;
    }
  }

  &__pg-text {
    font-size: 12px;
    color: $text-secondary;
  }

  &__notice {
    &-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    &-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12.5px;
      color: $text-secondary;
    }

    &-icon {
      margin-top: 2px;
      flex: 0 0 auto;
      font-size: 14px;
      color: $color-primary;
    }
  }

  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }
}
</style>
