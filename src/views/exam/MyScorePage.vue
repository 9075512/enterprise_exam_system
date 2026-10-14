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
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import StatCard from '@/components/common/StatCard.vue';
import type { AppealStatus, ExamMy, ExamRecord } from '@/types';

const router = useRouter();
const settingsStore = useSettingsStore();
const { data: myExams } = useRequest(() => examsApi.my());
/** 全量记录（仅用于统计卡口径；失败静默，统计区退化为 0） */
const { data: allRecords } = useRequest(() => recordsApi.my({ page: 1, pageSize: 100 }));
/** 本人复核申请（用于「复核状态」列；失败静默为空） */
const { data: myAppeals, refresh: refreshAppeals } = useRequest(() => appealsApi.my({ page: 1, pageSize: 100 }));

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

function passScoreOf(examId: string): number | null {
  return examMap.value[examId]?.passScore ?? null;
}

function isFail(record: ExamRecord): boolean {
  const line = passScoreOf(record.examId);
  return line !== null && record.score < line;
}

/* ------------------------------ 统计卡（基于全量记录） ------------------------------ */
const stats = computed(() => {
  const list = allRecords.value?.list ?? [];
  if (list.length === 0) {
    return { taken: 0, avg: 0, max: 0, failed: 0 };
  }
  const scores = list.map((r) => r.score);
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    taken: list.length,
    avg: Math.round((sum / list.length) * 10) / 10,
    max: Math.max(...scores),
    failed: list.filter((r) => isFail(r)).length,
  };
});

function goRetakes(): void {
  void router.push('/exam/retakes');
}

/* ------------------------------ 页头摘要 / 导出 ------------------------------ */
/** 页头描述：已参加 N 场 · 平均 X 分 · 及格率 Y%（与统计卡同源） */
const headerDesc = computed<string>(() => {
  const { taken, avg, failed } = stats.value;
  if (taken === 0) return '查看已交卷考试的成绩与明细';
  const rate = Math.round(((taken - failed) / taken) * 1000) / 10;
  return `已参加 ${taken} 场考试 · 平均 ${avg} 分 · 及格率 ${rate}%`;
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
    isFail(r) ? '未及格' : '及格',
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

function goDetail(record: ExamRecord): void {
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

/** 可申请复核：考试开放复核 且 尚未申请过 */
function canAppeal(record: ExamRecord): boolean {
  return appealEnabledOf(record.examId) && !appealStatusMap.value[record.id];
}

async function submitAppeal(): Promise<void> {
  if (!appealRecord.value) return;
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
  <div class="my-score">
    <PageHeader title="我的成绩" :description="headerDesc">
      <template #actions>
        <el-button :icon="Download" :disabled="(allRecords?.list.length ?? 0) === 0" @click="exportCsv">
          导出我的成绩
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡（设计稿 p-exam-scores） -->
    <div class="my-score__stats">
      <StatCard label="已参加" :value="stats.taken" unit="场" :icon="Document" />
      <StatCard label="平均分" :value="stats.avg" unit="分" :icon="TrendCharts" />
      <StatCard label="最高分" :value="stats.max" unit="分" :icon="Star" />
      <StatCard label="未及格" :value="stats.failed" unit="场" tone="error" :icon="CircleClose">
        <template #foot>
          <a v-if="stats.failed > 0" href="javascript:void(0)" @click="goRetakes">去申请补考</a>
          <span v-else>暂无未及格记录</span>
        </template>
      </StatCard>
    </div>

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

      <el-table v-loading="loading" :data="records" row-key="id" stripe>
        <el-table-column label="考试名称" min-width="220">
          <template #default="{ row }">
            <div class="my-score__exam">{{ examName(row.examId) }}</div>
            <div v-if="passScoreOf(row.examId) !== null" class="my-score__exam-sub">
              及格线 {{ passScoreOf(row.examId) }} 分
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
            <template v-if="passScoreOf(row.examId) !== null">
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
            <span v-else class="my-score__muted">未申请</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row as ExamRecord)">成绩明细</el-button>
            <el-button v-if="canAppeal(row as ExamRecord)" link @click="openAppeal(row as ExamRecord)">
              申请复核
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" :filtered="Boolean(filterKeyword.trim())" @clear="onReset" />
        </template>
      </el-table>

      <div class="my-score__pagination">
        <DataTablePagination
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="onPageChange"
          @update:page-size="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="appealVisible" title="申请成绩复核" width="460px">
      <el-alert
        v-if="appealRecord"
        class="my-score__appeal-alert"
        type="info"
        :closable="false"
        show-icon
        :title="examName(appealRecord.examId)"
        :description="`当前成绩：${formatScore(appealRecord.score)} 分 · 每条成绩仅可申请一次`"
      />
      <el-form label-width="80px">
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
        <el-button @click="appealVisible = false">取消</el-button>
        <el-button type="primary" :loading="appealing" @click="submitAppeal">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.my-score {
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
    font-size: 11.5px;
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
}
</style>
