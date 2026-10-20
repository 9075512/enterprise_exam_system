<script setup lang="ts">
/**
 * 成绩报表（W3-T2，管理员）。
 * 顶部选考试 → reports.examReport；单页纵向：五统计卡 → 成绩列表 → 三联分析卡（分数段 / 科室对比 / 错题排行）→ 切屏审查。
 */
import { computed, onMounted, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import { CircleCheck, Download, Star, TrendCharts, User, Warning } from '@element-plus/icons-vue';
import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import * as reportsApi from '@/api/reports';
import * as usersApi from '@/api/users';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import { useSettingsStore } from '@/stores/settings';
import { THEME } from '@/constants/theme';
import {
  CHART_AXIS_LABEL,
  CHART_AXIS_LINE,
  CHART_SPLIT_LINE,
  CHART_TOOLTIP,
  peakIndex,
  softBars,
} from '@/utils/chartTheme';
import { formatDateTime } from '@/utils/datetime';
import { formatPercent, formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import StatCard from '@/components/common/StatCard.vue';
import ScoreExportDialog from './ScoreExportDialog.vue';
import CheatEventList from '@/components/exams/CheatEventList.vue';
import type { Exam, ExamRecord, Report, WrongItem } from '@/types';

use([BarChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent, CanvasRenderer]);

/**
 * 科室及格率的「需关注」阈值（图形语义，非业务规则）：
 * 低于该值的科室在科室对比表里用 warning 色进度条标出，便于一眼定位薄弱科室。
 * 只影响进度条配色，不参与任何及格判定（及格判定一律走考试自身的 passScore）。
 */
const DEPARTMENT_PASS_RATE_WARN = 0.9;

const settingsStore = useSettingsStore();

const settingsError = ref(false);
async function loadRules(): Promise<void> { try { await settingsStore.load(); settingsError.value = !settingsStore.ready; } catch { settingsError.value = true; } }
onMounted(() => { void loadRules(); });

/* ------------------------------ 基础数据 ------------------------------ */
const { data: exams, loading: examsLoading, error: examsError, refresh: refreshExams } = useRequest(() => examsApi.list());
const { data: users, error: usersError, refresh: refreshUsers } = useRequest(() => usersApi.list());
const { data: departments, error: departmentsError, refresh: refreshDepartments } = useRequest(() => departmentsApi.list());

const userNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((users.value ?? []).map((u) => [u.id, u.name])),
);
const departmentNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((departments.value ?? []).map((d) => [d.id, d.name])),
);

const selectedExamId = ref('');
const { data: report, loading: reportLoading, error: reportError, refresh: refreshReport } = useRequest<Report | null>(
  () => selectedExamId.value ? reportsApi.examReport(selectedExamId.value) : Promise.resolve(null),
  [selectedExamId],
  { immediate: false, keepPreviousData: false },
);

/**
 * 首屏默认选中「最近一场考试」（按开始时间倒序），对齐设计稿 scores.html
 * 「进入报表页即有数据」的形态，避免首屏停在「请选择一场考试」空态。
 * 仅在没有选中值时兜底一次；用户手动选择后不再干预（含手动清空）。
 */
watch(
  exams,
  (list) => {
    if (selectedExamId.value || !list || list.length === 0) return;
    const latest = [...list].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    )[0];
    selectedExamId.value = latest.id;
  },
  { immediate: true },
);

const selectedExam = computed<Exam | null>(
  () => (exams.value ?? []).find((e) => e.id === selectedExamId.value) ?? null,
);
const detailVisible = ref(false);
const detailWrong = ref<WrongItem | null>(null);
const detailRecord = ref<ExamRecord | null>(null);
function openWrong(row: WrongItem): void { detailWrong.value = row; detailRecord.value = null; detailVisible.value = true; }
function openCheat(row: ExamRecord): void { detailRecord.value = row; detailWrong.value = null; detailVisible.value = true; }
const passScore = computed<number>(() => selectedExam.value?.passScore ?? 60);

/** 页头描述（设计稿 .ph 副标题写法：考试名 · 参考人数） */
const headerDesc = computed<string>(() => {
  if (!selectedExam.value) return '选择一场考试，查看成绩、分数段、科室对比与错题排行';
  return `${selectedExam.value.name} · ${report.value?.summary.total ?? '—'} 人参考`;
});

/* ------------------------------ 导出成绩弹窗 ------------------------------ */
const exportVisible = ref(false);
const exportExamName = computed<string>(() => selectedExam.value?.name ?? '');
const exportCount = computed<number>(() => report.value?.summary.total ?? 0);

/* ------------------------------ 成绩列表 ------------------------------ */
const {
  list: records,
  page,
  pageSize,
  total,
  loading: recordsLoading,
  error: recordsError,
  load: loadRecords,
  onPageChange,
  onSizeChange,
  reset: resetRecords,
  clear: clearRecords,
} = usePagination<ExamRecord>(
  (p, ps) => recordsApi.listByExam({ examId: selectedExamId.value, page: p, pageSize: ps }),
  settingsStore.settings.defaultPageSize,
);

/* ------------------------------ 切屏审查 ------------------------------ */
const { data: cheatRecords, loading: cheatLoading, error: cheatError, refresh: refreshCheats } = useRequest(
  () => selectedExamId.value ? recordsApi.listCheatByExam(selectedExamId.value) : Promise.resolve([]),
  [selectedExamId],
  { immediate: false, keepPreviousData: false },
);
const cheatList = computed<ExamRecord[]>(() => cheatRecords.value ?? []);

watch(selectedExamId, (examId) => {
  detailVisible.value = false;
  clearRecords();
  if (examId) resetRecords();
});

/* ------------------------------ 图表 option ------------------------------ */
// 分数段分布：浅柱打底 + 人数最多的那一段用主色高亮（设计稿 .ch-bar / .ch-bar--on）。
// 图表直接挂载在页面内联三联网格，容器宽度稳定，无需 lazy / tab 切换 resize 兜底。
const bandOption = computed(() => {
  const counts = (report.value?.bands ?? []).map((b) => b.count);
  return {
    tooltip: { trigger: 'axis', ...CHART_TOOLTIP },
    grid: { left: 44, right: 24, top: 34, bottom: 44 },
    xAxis: {
      type: 'category',
      data: (report.value?.bands ?? []).map((b) => b.label.replace('不及格（<60）', '60 分以下')),
      axisLabel: { interval: 0, ...CHART_AXIS_LABEL },
      axisLine: CHART_AXIS_LINE,
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: CHART_AXIS_LABEL,
      splitLine: CHART_SPLIT_LINE,
    },
    series: [
      {
        type: 'bar',
        name: '人数',
        barMaxWidth: 48,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: softBars(counts, peakIndex(counts)),
      },
    ],
  };
});

/* ------------------------------ 三联分析卡派生数据 ------------------------------ */
/** 人数最多的分数段（用于分数段卡底部 tip；无数据时为 null） */
const bandPeak = computed(() => {
  const bands = report.value?.bands ?? [];
  const index = peakIndex(bands.map((b) => b.count));
  return index >= 0 ? bands[index] : null;
});

/**
 * 科室对比卡：按人数降序只列前 5 个科室，不附加最少人数门槛。
 */
const topDepartments = computed(() =>
  [...(report.value?.departments ?? [])].sort((a, b) => b.count - a.count).slice(0, 5),
);

/**
 * 错题排行卡：按错误率降序取前 5。
 * 数据缺口：WrongItem 无 questionType 字段（后端不返回题型），
 * 故第二行仅以「答错 N 人 / 共 M 人作答」表达，不展示题型。
 */
const topWrong = computed(() =>
  [...(report.value?.wrongRate ?? [])].sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 5),
);

/** 错误率图形档：高错误率用 error（警示图形），其余用主色 */
function wrongTone(rate: number): string {
  return rate >= 0.5 ? THEME.error : THEME.primary;
}

/* ------------------------------ 工具 ------------------------------ */
function isCheat(record: ExamRecord): boolean {
  if (!settingsStore.ready) return false;
  const count = record.cheatEvents.length;
  const seconds = record.cheatEvents.reduce((sum, e) => sum + e.awaySeconds, 0);
  return (
    count >= settingsStore.settings.cheatCountThreshold ||
    seconds >= settingsStore.settings.cheatSecondsThreshold
  );
}

function cheatSummary(record: ExamRecord): string {
  const count = record.cheatEvents.length;
  const seconds = Math.round(record.cheatEvents.reduce((sum, e) => sum + e.awaySeconds, 0));
  return `${count} 次 / ${seconds} 秒`;
}

/** 切屏异常人数（与「切屏审查」卡同口径） */
const cheatCount = computed<number>(() => new Set(cheatList.value.filter(isCheat).map(record => record.userId)).size);

/** 顶部统计卡（设计稿 scores.html 的 .grid.g5 五卡）——仅「切屏异常」上状态色 */
const statItems = computed(() => {
  const s = report.value?.summary;
  const hasSample = Boolean(s && s.total > 0);
  return [
    { key: 'total', label: '总作答人数', value: s?.total ?? '—', unit: '人', icon: User, tone: 'primary' as const },
    {
      key: 'avg',
      label: '平均分',
      value: hasSample ? formatScore(s!.avgScore) : '—',
      unit: '分',
      icon: TrendCharts,
      tone: 'primary' as const,
    },
    {
      key: 'pass',
      label: '及格率',
      value: hasSample ? formatPercent(s!.passRate) : '—',
      icon: CircleCheck,
      tone: 'primary' as const,
    },
    {
      key: 'range',
      label: '最高 / 最低分',
      value: hasSample ? `${formatScore(s!.maxScore)} / ${formatScore(s!.minScore)}` : '—',
      icon: Star,
      tone: 'primary' as const,
    },
    { key: 'cheat', label: '切屏异常考生（审查范围）', value: !settingsStore.ready || cheatError.value || cheatLoading.value ? '—' : cheatCount.value, unit: '人', icon: Warning, tone: 'warning' as const },
  ];
});
</script>

<template>
  <div data-ui-layout="analytics" data-ui-page="ScoreReportPage" class="report-page">
    <PageHeader title="成绩报表" :description="headerDesc">
      <template #actions>
        <el-select v-model="selectedExamId" :loading="examsLoading" :disabled="examsLoading || Boolean(examsError)" class="report-page__select-input" placeholder="请选择一场考试" clearable filterable popper-class="organization-choice-popper">
          <el-option
            v-for="exam in exams || []"
            :key="exam.id"
            :label="`${exam.name}（${formatDateTime(exam.startTime)}）`"
            :value="exam.id"
          />
        </el-select>
        <el-button
          type="primary"
          :icon="Download"
          :disabled="!selectedExamId || examsLoading || Boolean(examsError) || reportLoading || Boolean(reportError) || exportCount === 0"
          @click="exportVisible = true"
        >导出成绩</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="examsLoading && !exams" :rows="4" />
    <RequestError v-else-if="examsError" text="考试列表加载失败" @retry="refreshExams" />
    <EmptyState v-else-if="!selectedExamId" text="请选择一场考试查看报表" />

    <LoadingSkeleton v-else-if="reportLoading && !report" :rows="6" />

    <RequestError v-else-if="reportError" text="成绩统计加载失败" @retry="refreshReport" />
    <template v-else>
      <p class="admin-scope">统计范围：当前考试 · {{ settingsStore.ready ? '每位考生' + (settingsStore.settings.retakeScorePolicy === 'highest' ? '最高分' : '最近一次') + '已交卷答卷' : '已交卷答卷（成绩选取口径暂未知）' }}；科室对比、错题排行各显示前 5 项。成绩列表包含各次作答、按开始时间倒序；切屏审查仅含已交卷且有切屏事件的记录，按切屏次数倒序，最多 500 条。</p>
      <el-alert v-if="settingsError" type="warning" title="统计与切屏标记规则加载失败，相关口径暂未知" :closable="false"><el-button link type="primary" @click="loadRules">重试读取规则</el-button></el-alert>
      <el-alert v-if="usersError || departmentsError" type="warning" title="姓名或科室对照加载失败，当前保留可用标识" :closable="false"><el-button v-if="usersError" link type="primary" @click="refreshUsers">重试姓名</el-button><el-button v-if="departmentsError" link type="primary" @click="refreshDepartments">重试科室</el-button></el-alert>
      <!-- 顶部统计卡（设计稿 .grid.g5） -->
      <div class="report-page__stats">
        <StatCard
          v-for="item in statItems"
          :key="item.key"
          :label="item.label"
          :value="item.value"
          :unit="item.unit"
          :icon="item.icon"
          :tone="item.tone"
        />
      </div>

      <!-- 成绩列表（全宽卡） -->
      <el-card class="report-page__section" shadow="never">
        <template #header>
          <div class="report-page__hd">
            <h3 class="report-page__hd-title">成绩列表</h3>
            <span class="report-page__hd-sub">{{ recordsLoading ? '正在加载' : recordsError ? '数量未知' : '共 ' + total + ' 条' }}</span>
          </div>
        </template>
        <RequestError v-if="recordsError" text="成绩列表加载失败" @retry="loadRecords" />
        <el-table v-else v-loading="recordsLoading" :data="records" row-key="id" stripe>
          <el-table-column label="序号" width="70" align="center">
            <template #default="{ $index }">
              <span class="report-page__rank num">{{ (page - 1) * pageSize + $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="考生姓名" width="120">
            <template #default="{ row }">{{ row.userName || userNameMap[row.userId] || row.userId }}</template>
          </el-table-column>
          <el-table-column label="科室" width="140">
            <template #default="{ row }">{{ row.departmentName || departmentNameMap[row.departmentId] || '—' }}</template>
          </el-table-column>
          <el-table-column label="得分" width="90" align="center">
            <template #default="{ row }">
              <span class="num report-page__score">{{ row.status === 'submitted' ? formatScore(row.score) : '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="是否及格" width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'submitted'" size="small" :type="row.score >= passScore ? 'success' : 'danger'" effect="plain">
                {{ row.score >= passScore ? '及格' : '不及格' }}
              </el-tag><el-tag v-else type="info">{{ row.status === 'pending_review' ? '待阅卷' : '待交卷' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="作答次数" width="100" align="center">
            <template #default="{ row }">第 {{ (row as ExamRecord).attemptNo }} 次</template>
          </el-table-column>
          <el-table-column label="切屏异常" min-width="140">
            <template #default="{ row }">
              <span v-if="!settingsStore.ready" class="report-page__muted">规则未知</span><el-tag v-else-if="isCheat(row as ExamRecord)" type="danger" size="small">
                {{ cheatSummary(row as ExamRecord) }}
              </el-tag>
              <span v-else class="report-page__muted">正常</span>
            </template>
          </el-table-column>
          <el-table-column label="交卷时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState text="暂无成绩记录" />
          </template>
        </el-table>
        <DataTablePagination v-if="!recordsError && !recordsLoading"
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="onPageChange"
          @update:page-size="onSizeChange"
        />
      </el-card>

      <p class="admin-scope">分数段按固定分值区间展示，本场及格线为 {{ passScore }} 分。</p>
      <!-- 三联分析卡（设计稿 .grid.g3） -->
      <div v-if="report && report.summary.total > 0" class="report-page__grid3">
        <!-- 1. 分数段分布 -->
        <el-card shadow="never">
          <template #header>
            <div class="report-page__hd">
              <h3 class="report-page__hd-title">分数段分布</h3>
              <span class="report-page__hd-sub">{{ report?.summary.total ?? 0 }} 人</span>
            </div>
          </template>
          <template v-if="report && report.summary.total > 0">
            <VChart class="report-page__band-chart" :option="bandOption" autoresize />
            <div v-if="bandPeak" class="report-page__tip report-page__tip--ok">
              <el-icon class="report-page__tip-ic"><CircleCheck /></el-icon>
              <div>
                {{ bandPeak?.label.replace('不及格（<60）', '60 分以下') }} 人数最多（<b>{{ bandPeak?.count }} 人</b>），该分数段共有 {{ bandPeak?.count }} 人。
              </div>
            </div>
          </template>
          <EmptyState v-else text="暂无成绩数据" />
        </el-card>

        <!-- 2. 科室对比 -->
        <el-card shadow="never">
          <template #header>
            <div class="report-page__hd">
              <h3 class="report-page__hd-title">科室对比</h3>
              <div class="report-page__hd-right">
                <span class="report-page__tag">按人数前 5 项</span>
              </div>
            </div>
          </template>
          <table v-if="topDepartments.length > 0" class="report-page__mini">
            <thead>
              <tr>
                <th>科室</th>
                <th>人数</th>
                <th>平均分</th>
                <th>及格率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in topDepartments" :key="row.departmentId">
                <td class="report-page__mini-name">{{ row.departmentName }}</td>
                <td class="report-page__mini-num num">{{ row.count }}</td>
                <td class="report-page__mini-num num">{{ formatScore(row.avgScore) }}</td>
                <td>
                  <div class="report-page__rate">
                    <span class="report-page__rate-num num">{{ formatPercent(row.passRate) }}</span>
                    <el-progress
                      class="report-page__rate-bar"
                      :percentage="Math.round(row.passRate * 100)"
                      :stroke-width="6"
                      :show-text="false"
                      :color="row.passRate >= DEPARTMENT_PASS_RATE_WARN ? THEME.primary : THEME.warning"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else text="暂无科室数据" />
        </el-card>

        <!-- 3. 错题排行 TOP 5 -->
        <el-card shadow="never">
          <template #header>
            <div class="report-page__hd">
              <h3 class="report-page__hd-title">错题排行 TOP 5</h3>
              <div class="report-page__hd-right">
                <span class="report-page__hd-sub">按错误率</span>
              </div>
            </div>
          </template>
          <template v-if="topWrong.length > 0">
            <div class="report-page__wrong-list">
              <!-- 数据缺口：WrongItem 无 questionType 字段（后端不返回题型），第二行仅以「答错 N 人 / 共 M 人作答」表达 -->
              <div v-for="row in topWrong" :key="row.questionId">
                <div class="report-page__wrong-head">
                  <el-tooltip :content="row.stem" placement="top" :show-after="300">
                    <el-button link type="primary" class="report-page__wrong-stem" @click="openWrong(row)">{{ row.stem }}</el-button>
                  </el-tooltip>
                  <span class="report-page__wrong-rate num">{{ formatPercent(row.wrongRate) }}</span>
                </div>
                <div class="report-page__wrong-meta">
                  <span class="report-page__wrong-meta-text">答错 {{ row.wrongCount }} 人 / 共 {{ row.totalAnswered }} 人作答</span>
                  <el-progress
                    class="report-page__wrong-bar"
                    :percentage="Math.round(row.wrongRate * 100)"
                    :stroke-width="6"
                    :show-text="false"
                    :color="wrongTone(row.wrongRate)"
                  />
                </div>
              </div>
            </div>
            <div class="report-page__tip report-page__tip--warn">
              <el-icon class="report-page__tip-ic"><Warning /></el-icon>
              <div>按错误率显示前 5 题；点击题干查看完整内容与实际作答统计。</div>
            </div>
          </template>
          <EmptyState v-else text="暂无错题数据" />
        </el-card>
      </div>

      <el-card v-if="report && report.summary.total === 0" shadow="never"><EmptyState text="当前考试暂无已出分答卷，交卷并完成阅卷后可查看成绩分析" /></el-card>
      <!-- 切屏审查（工程合理新增，改为页面下方全宽卡保留） -->
      <el-card class="report-page__section" shadow="never">
        <template #header>
          <div class="report-page__hd">
            <h3 class="report-page__hd-title">切屏审查</h3>
            <span class="report-page__hd-sub">{{ cheatLoading ? '正在加载' : cheatError || !settingsStore.ready ? '异常人数未知' : cheatCount + ' 人异常' }}</span>
          </div>
        </template>
        <RequestError v-if="cheatError" text="切屏记录加载失败" @retry="refreshCheats" />
        <div v-else class="report-page__cheat-table-wrap"><el-table v-loading="cheatLoading" :data="cheatList" row-key="id" stripe class="report-cheat-table">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="report-page__cheat-timeline">
                <p class="report-page__cheat-timeline-title">
                  切屏时间线（共 {{ (row as ExamRecord).cheatEvents.length }} 次）
                </p>
                <CheatEventList :events="(row as ExamRecord).cheatEvents" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="考生姓名" width="120">
            <template #default="{ row }"><el-button link type="primary" class="report-page__person-entry" @click="openCheat(row as ExamRecord)">{{ row.userName || userNameMap[row.userId] || row.userId }}</el-button></template>
          </el-table-column>
          <el-table-column label="科室" width="140">
            <template #default="{ row }">{{ row.departmentName || departmentNameMap[row.departmentId] || '—' }}</template>
          </el-table-column>
          <el-table-column label="作答次数" width="100" align="center">
            <template #default="{ row }">第 {{ (row as ExamRecord).attemptNo }} 次</template>
          </el-table-column>
          <el-table-column label="得分" width="90" align="center">
            <template #default="{ row }">{{ formatScore(row.score) }}</template>
          </el-table-column>
          <el-table-column label="切屏" width="170" align="center">
            <template #default="{ row }">
              <el-tag :type="!settingsStore.ready ? 'info' : isCheat(row as ExamRecord) ? 'danger' : 'warning'" size="small">
                {{ cheatSummary(row as ExamRecord) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="交卷时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState text="该考试暂无切屏记录" />
          </template>
        </el-table></div>
      </el-card>
    </template>

    <ScoreExportDialog v-model="exportVisible" :exam-id="selectedExamId" :exam-name="exportExamName" />
    <el-drawer v-model="detailVisible" :title="detailWrong ? '错题统计详情' : '切屏记录详情'" size="720px" append-to-body destroy-on-close data-ui-role="detail">
      <p class="report-detail__scope">{{ selectedExam?.name }} · 打开时的记录</p>
      <template v-if="detailWrong"><section class="report-detail__block"><h3>完整题干</h3><p>{{ detailWrong.stem }}</p></section><dl class="report-detail__meta"><div><dt>题目 ID</dt><dd>{{ detailWrong.questionId }}</dd></div><div><dt>错误率</dt><dd>{{ formatPercent(detailWrong.wrongRate) }}</dd></div><div><dt>答错人数</dt><dd>{{ detailWrong.wrongCount }} 人</dd></div><div><dt>本题作答人数</dt><dd>{{ detailWrong.totalAnswered }} 人</dd></div></dl></template>
      <template v-else-if="detailRecord"><dl class="report-detail__meta"><div><dt>考生</dt><dd>{{ detailRecord.userName || userNameMap[detailRecord.userId] || detailRecord.userId }}</dd></div><div><dt>科室</dt><dd>{{ detailRecord.departmentName || departmentNameMap[detailRecord.departmentId] || '—' }}</dd></div><div><dt>作答次数</dt><dd>第 {{ detailRecord.attemptNo }} 次</dd></div><div><dt>交卷时间</dt><dd>{{ formatDateTime(detailRecord.submittedAt) }}</dd></div><div><dt>得分</dt><dd>{{ formatScore(detailRecord.score) }}</dd></div><div><dt>切屏合计</dt><dd>{{ cheatSummary(detailRecord) }}</dd></div></dl><p class="report-detail__scope">{{ settingsStore.ready ? '标记阈值：' + settingsStore.settings.cheatCountThreshold + ' 次或 ' + settingsStore.settings.cheatSecondsThreshold + ' 秒' : '标记规则暂未知' }}</p><CheatEventList :events="detailRecord.cheatEvents" /></template>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button></template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.report-page {
  container: score-report / inline-size;
  &__select-input {
    width: 260px;
  }

  /** 顶部统计卡（设计稿 scores.html 的 .grid.g5：五卡自动换行） */
  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  /** 全宽卡（成绩列表 / 切屏审查） */
  &__section {
    margin-bottom: 16px;
  }

  /** 三联分析卡（设计稿 .grid.g3） */
  &__grid3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  /** 卡头（设计稿 .card__hd / .card__hd .right） */
  &__hd {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  &__hd-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__hd-sub {
    font-size: 12px;
    font-weight: 400;
    color: $text-secondary;
  }

  &__hd-right {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-left: auto;
  }

  /** 卡头标签（设计稿 .tag：中性浅底 + 正文档字色） */
  &__tag {
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: $radius-sm;
    background: $color-neutral-bg;
    color: $text-body;
    font-size: 12px;
    font-weight: 500;
  }

  /** 底部提示条（设计稿 .tip：语义浅底 + 深字档，不做文字色违规） */
  &__tip {
    display: flex;
    gap: 9px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    font-size: 12px;
    line-height: 1.55;

    b {
      font-weight: 600;
    }

    &--ok {
      background: $color-success-bg;
      color: $color-success-text;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }
  }

  &__tip-ic {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  /** 分数段图表容器 */
  &__band-chart {
    height: 180px;
  }

  /** 科室对比：密集表格（设计稿 .tbl--dense） */
  &__mini {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;

    th {
      padding: 0 0 8px;
      border-bottom: 1px solid $border-color;
      color: $text-secondary;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
    }

    td {
      padding: 8px 0;
      border-bottom: 1px solid $border-color;
      color: $text-body;
    }

    tr:last-child td {
      border-bottom: none;
    }
  }

  &__mini-name {
    color: $text-primary;
    font-weight: 500;
  }

  &__mini-num {
    color: $text-primary;
  }

  /** 科室对比：及格率 = 数值 + 内联进度条（DESIGN-C §2.3），一屏内即可横向比较 */
  &__rate {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__rate-num {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-primary;
  }

  &__rate-bar {
    flex: 1;
    min-width: 0;
    max-width: 84px;
  }

  /** 错题排行 TOP 5（设计稿 .stack12 的两行列表） */
  &__wrong-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__wrong-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  &__wrong-stem {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    color: $text-body;
    height: auto;
    text-align: left;
    :deep(span) { overflow: hidden; text-overflow: ellipsis; }
  }

  &__wrong-rate {
    flex: 0 0 auto;
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__wrong-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
  }

  &__wrong-meta-text {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-secondary;
  }

  &__wrong-bar {
    flex: 1;
    min-width: 0;
  }

  /** 排名（设计稿 .num.c3）——弱色等宽数字 */
  &__rank {
    color: $text-secondary;
    font-size: 13px;
  }

  /** 得分（设计稿 .num 14.5px）——主色承载「结果」 */
  &__score {
    font-size: 14.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__muted {
    color: $text-secondary;
    font-size: 13px;
  }

  &__cheat-timeline {
    box-sizing: border-box; position: sticky; left: 0; width: 100cqw; max-width: 100%; padding: 16px; background: $bg-page;
  }

  &__cheat-timeline-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }
}
.report-page__cheat-table-wrap { container-type: inline-size; }
.report-cheat-table :deep(.el-table__expanded-cell) { padding: 0; }
.report-page__person-entry { max-width: 100%; height: auto; white-space: normal; text-align: left; :deep(span) { white-space: normal; overflow-wrap: anywhere; } }
.report-detail__scope { margin: 0 0 20px; overflow-wrap: anywhere; color: $text-secondary; font-size: 13px; }
.report-detail__block { padding: 16px; margin-bottom: 20px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; h3 { margin: 0 0 12px; font-size: 14px; } p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; } }
.report-detail__meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; margin: 0 0 20px; dt { color: $text-secondary; font-size: 12px; } dd { margin: 4px 0 0; overflow-wrap: anywhere; } }
@media(max-width:480px) { .report-detail__meta { grid-template-columns:minmax(0,1fr); } }

@container score-report (max-width: 1000px) {
  // 三联卡窄屏折成单列
  .report-page__grid3 {
    grid-template-columns: minmax(0, 1fr);
  }
}

</style>
