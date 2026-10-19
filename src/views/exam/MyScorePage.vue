<script setup lang="ts">
/**
 * 我的成绩（W3-T1，考生）。records.my 分页，考试名/及格线取本科室可见考试。
 * 关键字按考试名称**服务端**过滤：输入防抖后回到第 1 页重新加载，分页/翻页均带上关键字。
 *
 * v3.1 方向 C（设计稿 p-exam-scores 重排）：页头下补四张统计卡
 * （已参加 / 平均分 / 最高分 / 未及格），列表卡改为「卡头搜索 + 表格」结构；
 * 统计口径取自单独拉取的全量记录（pageSize 上限 100 条），与列表的服务端分页互不影响。
 *
 * 结构对齐补遗（保真度审计 C 类）：
 *   - 页头补统计摘要 + 「导出我的成绩」（客户端 CSV，与统计同源数据）；
 *   - 表格补「复核状态」列（数据来自 appeals.my，与列表分页无关）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { CircleClose, Document, Download, Refresh, Search, Star, TrendCharts } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import * as appealsApi from '@/api/appeals';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import { useSettingsStore } from '@/stores/settings';
import { buildAppealTimeline } from '@/services/appealTimeline';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import StatCard from '@/components/common/StatCard.vue';
import RequestError from '@/components/common/RequestError.vue';
import type { AppealStatus, ExamMy, ExamRecord } from '@/types';

const router = useRouter();
const settingsStore = useSettingsStore();
const { data: myExams, error: examsError } = useRequest(() => examsApi.my());
/** 全量记录（仅用于统计卡口径；失败静默，统计区退化为 0） */
const { data: allRecords, error: statsError, refresh: refreshStats } = useRequest(() => recordsApi.my({ page: 1, pageSize: 100 }), [], { keepPreviousData: false });
/** 本人复核申请（用于「复核状态」列；失败静默为空） */
const { data: myAppeals, error: appealsError, refresh: refreshAppeals } = useRequest(async () => {
  const first = await appealsApi.my({ page: 1, pageSize: 100 });
  const list = [...first.list];
  for (let page = 2; page <= Math.ceil(first.total / 100); page += 1) {
    const next = await appealsApi.my({ page, pageSize: 100 });
    list.push(...next.list);
  }
  return { ...first, list };
}, [], { keepPreviousData: false });

const examMap = computed<Record<string, ExamMy>>(() =>
  Object.fromEntries((myExams.value ?? []).map((e) => [e.id, e])),
);

/** 关键字输入（服务端过滤，防抖后生效）。loadFn 闭包实时读取，翻页/改每页条数均携带该值 */
const filterKeyword = ref('');

const {
  list: records,
  page,
  pageSize,
  total,
  loading,
  error: listError,
  load,
  onPageChange,
  onSizeChange,
  reset,
} = usePagination<ExamRecord>(
  (p, ps) =>
    recordsApi.my({ page: p, pageSize: ps, keyword: filterKeyword.value.trim() || undefined }),
  settingsStore.settings.defaultPageSize,
);

/* 输入防抖（350ms）：回到第 1 页并重新加载，避免每敲一个字都发请求 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function onKeywordInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    reset();
  }, 350);
}

function onReset(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  filterKeyword.value = '';
  reset();
}

onMounted(() => {
  void settingsStore.load();
  void load();
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

const emptyText = computed(() =>
  filterKeyword.value.trim() ? '没有匹配的成绩记录' : '还没有成绩记录',
);

function examName(examId: string): string {
  return examMap.value[examId]?.name ?? examId;
}

function passScoreOf(examId: string, record?: ExamRecord): number | null {
  return record?.passScore ?? examMap.value[examId]?.passScore ?? null;
}

function isFail(record: ExamRecord): boolean {
  const line = passScoreOf(record.examId, record);
  return line !== null && record.score < line;
}

/* ------------------------------ 统计卡（基于全量记录） ------------------------------ */
const stats = computed(() => {
  if (!allRecords.value) return { taken: '—', avg: '—', max: '—', failed: '—' };
  const list = allRecords.value?.list ?? [];
  if (list.length === 0) {
    return { taken: 0, avg: '—', max: '—', failed: 0 };
  }
  const scores = list.map((r) => r.score);
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    taken: list.length,
    avg: Math.round((sum / list.length) * 10) / 10,
    max: Math.max(...scores),
    failed: list.every(record => passScoreOf(record.examId, record) !== null) ? list.filter((r) => isFail(r)).length : '—',
  };
});

function goRetakes(): void {
  void router.push('/exam/retakes');
}

/* ------------------------------ 页头摘要 / 导出 ------------------------------ */
/** 页头描述：已参加 N 场 · 平均 X 分 · 及格率 Y%（与统计卡同源） */
const headerDesc = computed<string>(() => {
  return allRecords.value ? `统计与导出覆盖已加载的 ${allRecords.value.list.length} / ${allRecords.value.total} 份已出成绩答卷，不受列表搜索影响` : '查看已出成绩答卷与明细，统计数据暂不可用';
});

/** 导出我的成绩（客户端 CSV，与统计同源的全量记录） */
function exportCsv(): void {
  const list = allRecords.value?.list ?? [];
  if (list.length === 0) {
    ElMessage.info('暂无可导出的成绩');
    return;
  }
  const header = ['考试名称', '得分', '是否及格', '作答次数', '交卷时间'];
  const rows = list.map((r) => [
    examName(r.examId),
    String(r.score),
    passScoreOf(r.examId, r) === null ? '及格线未知' : isFail(r) ? '未及格' : '及格',
    `第 ${r.attemptNo} 次`,
    formatDateTime(r.submittedAt),
  ]);
  const csv = [header, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM 前缀保证 Excel 正确识别 UTF-8
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `我的成绩-${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function canViewDetail(record: ExamRecord): boolean {
  return record.status !== 'in_progress' && Boolean(record.submittedAt);
}

function goDetail(record: ExamRecord): void {
  if (!canViewDetail(record)) {
    ElMessage.warning('该考试尚未交卷，暂不能查看成绩明细');
    return;
  }
  void router.push(`/score-detail/${record.id}`);
}

/* ------------------------------ 成绩复核申请（v1.7①） ------------------------------ */
const appealVisible = ref(false);
const appealing = ref(false);
const appealRecord = ref<ExamRecord | null>(null);
const appealReason = ref('');

/** 该考试是否开放成绩复核（考试级三态覆盖全局默认） */
function appealEnabledOf(examId: string): boolean {
  const exam = examMap.value[examId];
  return exam ? (exam.allowAppeal ?? settingsStore.settings.appealEnabled) : settingsStore.settings.appealEnabled;
}

function openAppeal(record: ExamRecord): void {
  appealRecord.value = record;
  appealReason.value = '';
  appealVisible.value = true;
}

/* ------------------------------ 复核状态列 ------------------------------ */
/** recordId → 复核状态（同一记录只可能有一条申请） */
const appealStatusMap = computed<Record<string, AppealStatus>>(() => {
  const map: Record<string, AppealStatus> = {};
  for (const item of myAppeals.value?.list ?? []) map[item.recordId] = item.status;
  return map;
});

const APPEAL_META: Record<AppealStatus, { text: string; tone: 'gray' | 'warn' | 'ok' | 'err' }> = {
  pending: { text: '待处理', tone: 'warn' },
  approved: { text: '已通过', tone: 'ok' },
  rejected: { text: '已驳回', tone: 'err' },
};

function appealMeta(record: ExamRecord): { text: string; tone: 'gray' | 'warn' | 'ok' | 'err' } | null {
  const status = appealStatusMap.value[record.id];
  return status ? APPEAL_META[status] : null;
}

/** 复核记录时间线（设计稿 exam-scores.html「复核记录」卡） */
const appealTimeline = computed(() => buildAppealTimeline(myAppeals.value?.list ?? []));

/** 复核申请时限（天；0 = 不限时限）——与服务端 `appealWindowDays` 同口径，自交卷起算 */
function withinAppealWindow(record: ExamRecord): boolean {
  const days = settingsStore.settings.appealWindowDays;
  if (!days || days <= 0) return true;
  const submitted = record.submittedAt ? new Date(record.submittedAt).getTime() : NaN;
  if (!Number.isFinite(submitted)) return true;
  return Date.now() - submitted <= days * 24 * 60 * 60 * 1000;
}

/** 可申请复核：考试开放复核 且 尚未申请过 且 仍在申请时限内 */
function canAppeal(record: ExamRecord): boolean {
  return record.status === 'submitted' && Boolean(myAppeals.value) && Boolean(myExams.value) && !appealsError.value && !examsError.value && appealEnabledOf(record.examId) && !appealStatusMap.value[record.id] && withinAppealWindow(record);
}

/** 已开放复核但超出申请时限（列表给出「已超时限」说明，避免按钮凭空消失） */
function appealExpired(record: ExamRecord): boolean {
  return appealEnabledOf(record.examId) && !appealStatusMap.value[record.id] && !withinAppealWindow(record);
}

async function submitAppeal(): Promise<void> {
  if (!appealRecord.value || appealing.value || !canAppeal(appealRecord.value)) return;
  appealing.value = true;
  try {
    await appealsApi.apply(appealRecord.value.id, appealReason.value.trim());
    ElMessage.success('复核申请已提交，请等待管理员处理');
    appealVisible.value = false;
    await refreshAppeals();
    void load();
  } catch {
    // 错误已由拦截器提示（如重复申请 1005）
  } finally {
    appealing.value = false;
  }
}
</script>

<template>
  <div data-ui-layout="score-cards" data-ui-page="MyScorePage" class="my-score">
    <PageHeader title="我的成绩" :description="headerDesc">
      <template #actions>
        <el-button :icon="Download" :disabled="(allRecords?.list.length ?? 0) === 0" @click="exportCsv">
          导出我的成绩
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡（设计稿 p-exam-scores） -->
    <div class="my-score__stats">
      <StatCard label="已出成绩答卷" :value="stats.taken" unit="份" :icon="Document" />
      <StatCard label="平均分" :value="stats.avg" unit="分" :icon="TrendCharts" />
      <StatCard label="最高分" :value="stats.max" unit="分" :icon="Star" />
      <StatCard label="未及格" :value="stats.failed" unit="场" tone="error" :icon="CircleClose">
        <template #foot>
          <a v-if="typeof stats.failed === 'number' && stats.failed > 0" href="/exam/retakes" @click.prevent="goRetakes">去申请补考</a>
          <span v-else>{{ stats.failed === '—' ? '及格情况未知' : '当前统计范围无未及格记录' }}</span>
        </template>
      </StatCard>
    </div>

    <RequestError v-if="statsError" text="成绩统计加载失败" @retry="refreshStats" />

    <LoadingSkeleton v-if="loading && records.length === 0" :rows="5" />

    <el-card v-else class="my-score__panel" shadow="never">
      <template #header>
        <h3 class="my-score__panel-title">成绩列表</h3>
        <div class="my-score__panel-act">
          <el-input
            v-model="filterKeyword"
            class="my-score__filter-keyword"
            placeholder="搜索考试名称"
            clearable
            :prefix-icon="Search"
            @input="onKeywordInput"
          />
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </div>
      </template>

      <RequestError v-if="listError" text="成绩列表加载失败" @retry="load" />
      <div v-else class="my-score__desktop-table">
      <el-table v-loading="loading" :data="records" row-key="id" stripe>
        <el-table-column label="考试名称" min-width="220">
          <template #default="{ row }">
            <div class="my-score__exam">{{ examName(row.examId) }}</div>
            <div v-if="passScoreOf(row.examId, row as ExamRecord) !== null" class="my-score__exam-sub">
              及格线 {{ passScoreOf(row.examId, row as ExamRecord) }} 分
            </div>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="100" align="right">
          <template #default="{ row }">
            <span class="my-score__score" :class="{ 'is-fail': isFail(row as ExamRecord) }">
              {{ formatScore(row.score) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="是否及格" width="110" align="center">
          <template #default="{ row }">
            <template v-if="passScoreOf(row.examId, row as ExamRecord) !== null">
              <el-tag
                size="small"
                effect="plain"
                :type="isFail(row as ExamRecord) ? 'danger' : 'success'"
              >
                {{ isFail(row as ExamRecord) ? '未及格' : '及格' }}
              </el-tag>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="作答次数" width="100" align="center">
          <template #default="{ row }">第 {{ row.attemptNo }} 次</template>
        </el-table-column>
        <el-table-column label="交卷时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="复核状态" width="110" align="center">
          <template #default="{ row }">
            <span
              v-if="appealMeta(row as ExamRecord)"
              class="my-score__badge"
              :class="`my-score__badge--${appealMeta(row as ExamRecord)!.tone}`"
            >
              {{ appealMeta(row as ExamRecord)!.text }}
            </span>
            <span v-else class="my-score__muted">{{ appealsError || !myAppeals ? '状态未知' : '未申请' }}</span>
          </template>
        </el-table-column>
        <el-table-column class-name="table-actions-cell" label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewDetail(row as ExamRecord)" type="primary" link @click="goDetail(row as ExamRecord)">成绩明细</el-button>
            <span v-else class="my-score__muted">未交卷</span>
            <el-button v-if="canAppeal(row as ExamRecord)" link @click="openAppeal(row as ExamRecord)">
              申请复核
            </el-button>
            <span v-else-if="appealExpired(row as ExamRecord)" class="my-score__muted">已超复核时限</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" :filtered="Boolean(filterKeyword.trim())" @clear="onReset" />
        </template>
      </el-table>
      </div>

      <div v-if="!listError" v-loading="loading" class="my-score__mobile-list">
        <EmptyState
          v-if="records.length === 0"
          :text="emptyText"
          :filtered="Boolean(filterKeyword.trim())"
          @clear="onReset"
        />
        <article v-for="row in records" v-else :key="row.id" class="my-score__mobile-card">
          <div class="my-score__mobile-head">
            <div>
              <div class="my-score__exam">{{ examName(row.examId) }}</div>
              <div class="my-score__exam-sub">第 {{ row.attemptNo }} 次 · {{ formatDateTime(row.submittedAt) }}</div>
            </div>
            <div class="my-score__mobile-result">
              <span class="my-score__score" :class="{ 'is-fail': isFail(row) }">{{ formatScore(row.score) }}</span>
              <span>{{ passScoreOf(row.examId, row) === null ? '及格线未知' : isFail(row) ? '未及格' : '及格' }}</span>
            </div>
          </div>
          <div class="my-score__mobile-meta">
            <span v-if="passScoreOf(row.examId, row) !== null">及格线 {{ passScoreOf(row.examId, row) }} 分</span>
            <span
              v-if="appealMeta(row)"
              class="my-score__badge"
              :class="`my-score__badge--${appealMeta(row)!.tone}`"
            >{{ appealMeta(row)!.text }}</span>
            <span v-else class="my-score__muted">{{ appealsError || !myAppeals ? '复核状态未知' : '未申请复核' }}</span>
          </div>
          <div class="my-score__mobile-actions">
            <el-button v-if="canViewDetail(row)" type="primary" @click="goDetail(row)">成绩明细</el-button>
            <el-button v-else disabled>未交卷</el-button>
            <el-button v-if="canAppeal(row)" @click="openAppeal(row)">申请复核</el-button>
            <span v-else-if="appealExpired(row)" class="my-score__muted">已超复核时限</span>
          </div>
        </article>
      </div>

      <div v-if="!listError" class="my-score__pagination">
        <DataTablePagination
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="onPageChange"
          @update:page-size="onSizeChange"
        />
      </div>
    </el-card>

    <template v-if="!loading">
      <!-- 复核记录（设计稿 exam-scores.html「复核记录」卡）：本人复核申请时间线 -->
      <el-card class="my-score__panel my-score__appeal-log" shadow="never">
        <template #header>
          <h3 class="my-score__panel-title">复核记录</h3>
        </template>
        <RequestError v-if="appealsError" text="复核记录加载失败" @retry="refreshAppeals" />
        <div v-else-if="appealTimeline.length > 0" class="my-score__timeline">
          <div
            v-for="item in appealTimeline"
            :key="item.id"
            class="my-score__tl"
            :class="item.tone"
          >
            <div class="my-score__tl-title">{{ item.title }}</div>
            <div class="my-score__tl-desc">{{ item.detail }}</div>
          </div>
        </div>
        <p v-else class="my-score__timeline-empty">暂无复核记录</p>
      </el-card>

      <el-alert
        class="my-score__appeal-tip"
        type="warning"
        :closable="false"
        show-icon
        title="每条成绩仅可申请一次复核，请核对答卷与申请说明。"
      />
    </template>

    <el-dialog v-model="appealVisible" title="申请成绩复核" width="560px" :close-on-click-modal="!appealing" :close-on-press-escape="!appealing" :show-close="!appealing">
      <el-alert
        v-if="appealRecord"
        class="my-score__appeal-alert"
        type="info"
        :closable="false"
        show-icon
        :title="examName(appealRecord.examId)"
        :description="`当前成绩：${formatScore(appealRecord.score)} 分 · 每条成绩仅可申请一次`"
      />
      <el-form label-position="top" :disabled="appealing">
        <el-form-item label="申请说明">
          <el-input
            v-model="appealReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="请说明你对哪道题或哪项判分有疑问（选填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="appealing" @click="appealVisible = false">取消</el-button>
        <el-button type="primary" :loading="appealing" @click="submitAppeal">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.my-score {
  &__mobile-list { display: none; }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  &__panel-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__panel-act {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  &__filter-keyword {
    width: 240px;
  }

  &__exam {
    font-weight: 560;
    color: $text-primary;
  }

  &__exam-sub {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__score {
    font-size: 13.5px;
    font-weight: 640;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &.is-fail {
      color: $color-error-text;
    }
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }

  &__muted {
    font-size: 12.5px;
    color: $text-secondary;
  }

  /* 复核状态徽标（设计稿 .bdg：20px / 5px / 11.5px + 5px 圆点） */
  &__badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;

    &::before {
      content: '';
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    &--gray {
      background: $color-neutral-bg;
      color: $text-body;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &--ok {
      background: $color-success-bg;
      color: $color-success-text;
    }

    &--err {
      background: $color-error-bg;
      color: $color-error-text;
    }
  }

  &__appeal-alert {
    margin-bottom: 16px;
  }

  /* ---------------- 复核记录时间线（设计稿 .timeline / .tl） ---------------- */
  &__appeal-log {
    margin-top: 16px;
  }

  &__timeline {
    position: relative;
    padding-left: 20px;

    /* 左侧竖线：1.5px 发丝线 */
    &::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 5px;
      bottom: 5px;
      width: 1.5px;
      background: $line-strong;
    }
  }

  &__tl {
    position: relative;
    padding-bottom: 14px;

    &:last-child {
      padding-bottom: 0;
    }

    /* 圆点：默认中性空白圈；通过/驳回用语义原色（仅图形，非文字色） */
    &::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 3px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: $bg-paper;
      border: 2px solid $line-strong;
    }

    &.is-done::before {
      background: $color-success;
      border-color: $color-success;
    }

    &.is-err::before {
      background: $color-error;
      border-color: $color-error;
    }
  }

  &__tl-title {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__tl-desc {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__timeline-empty {
    margin: 0;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__appeal-tip {
    margin-top: 12px;
  }

  @media (max-width: 900px) {
    &__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    &__panel :deep(.el-card__header) { flex-wrap: wrap; gap: 10px; }
    &__panel-title { flex: 1 0 100%; white-space: nowrap; }
    &__panel-act { width: 100%; margin-left: 0; }
    &__filter-keyword { flex: 1; width: auto; min-width: 0; }
    &__desktop-table { display: none; }
    &__mobile-list { display: flex; flex-direction: column; gap: 10px; }
    &__mobile-card {
      padding: 14px;
      border: 1px solid $border-color;
      border-radius: $radius-base;
      background: $bg-paper;
    }
    &__mobile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    &__mobile-result { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12px; color: $text-secondary; }
    &__mobile-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: 12px; color: $text-secondary; }
    &__mobile-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    &__pagination { justify-content: center; }
  }
}
</style>
