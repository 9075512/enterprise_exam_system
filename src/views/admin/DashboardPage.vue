<script setup lang="ts">
/**
 * 数据总览（W3-T2，管理员；v1.7② 支持科室下钻 + 时间范围 + 知识点归因）。
 * 各接口 Promise.allSettled 互相隔离失败。
 *
 * 统计卡下采用独立双栏，避免不同数据量的卡片互相撑开：
 *   主栏：考试场次趋势、最近考试、及格率 / 科目归因；侧栏：科室及格率、知识点归因、待办 / 告警。
 *
 * 已实现的「设计稿区块」（只做后端数据能诚实支撑的项）：
 * - 「考试场次趋势」：由 examTrend.total（每场考试已交卷人数）聚合，横轴=考试名、纵轴=参考人数。
 *   ⚠️ 设计稿是「近 12 个月场次数」的月度柱图；后端 DashboardReport 不含「月度/时间分桶的场次」维度，
 *   故以「每场考试参考人数」的等距类别轴近似表达（同一份 examTrend 数据，不臆造月度聚合值）。
 * - 「及格率趋势」「科目错题归因」「知识点错题归因」：分别由 examTrend / subjectWrong / tagWrong 支撑，保留。
 * - 「最近考试」：由 examsApi.list() 支撑（原「近期考试」按设计稿文案更名为「最近考试」）。
 *
 * C 类残项已补齐（v3.1 方向 C；后端无对应聚合接口，按「能算就算、算不出就诚实标注」处理）：
 * - 「科室及格率」：DashboardReport 无「按科室聚合」段；改用最近 ≤5 场（按开始时间倒序）的
 *   reportsApi.examReport().departments 在前端按人次数加权平均。口径见 scopeLabel（最近 N 场），
 *   **非**全司历史口径；某场报表请求失败则跳过该场，全部为空/失败时以「—」占位（不臆造）。
 * - 「待办」：用现成接口汇总真实数字——recordsApi.listPending（待阅卷）、
 *   appealsApi.list(status=pending)（待处理复核申请）、retakesApi.listRetakes(status=pending)
 *   （待审批补考申请），以及「异常告警」页统计的切屏异常数；单项请求失败以「—」占位。
 * - 「异常告警」：recordsApi.listCheatByExam 对最近 ≤5 场统计「含切屏事件的已交卷记录」，
 *   阈值口径与「成绩报表 · 切屏审查」「实时监考」一致（取自系统设置 cheatCountThreshold /
 *   cheatSecondsThreshold）。设计稿的「告警工单」后端无表，故以切屏记录替代，不臆造告警状态。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  Collection,
  Document,
  EditPen,
  Flag,
  OfficeBuilding,
  Refresh,
  Search,
  User,
  Warning,
} from '@element-plus/icons-vue';
import * as appealsApi from '@/api/appeals';
import * as banksApi from '@/api/banks';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import * as papersApi from '@/api/papers';
import * as recordsApi from '@/api/records';
import * as reportsApi from '@/api/reports';
import * as retakesApi from '@/api/retakes';
import * as usersApi from '@/api/users';
import { useSettingsStore } from '@/stores/settings';
import { useRequest } from '@/composables/useRequest';
import { THEME } from '@/constants/theme';
import {
  CHART_AXIS_LABEL,
  CHART_AXIS_LINE,
  CHART_AXIS_NAME,
  CHART_LEGEND,
  CHART_SPLIT_LINE,
  CHART_TOOLTIP,
  peakIndex,
  softBars,
} from '@/utils/chartTheme';
import { formatDateTime, formatRange } from '@/utils/datetime';
import { formatPercent, formatScore } from '@/utils/format';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import PagedOverview from '@/components/common/PagedOverview.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { DashboardReport, Department, DeptItem, Exam, SubjectWrongItem } from '@/types';

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const loading = ref(true);
const hasLoaded = ref(false);
const stats = reactive({
  departments: 0,
  users: 0,
  banks: 0,
  questions: 0,
  papers: 0,
});
const exams = ref<Exam[]>([]);
const paperNames = ref<Record<string, string>>({});

/* ------------------------------ 看板筛选（v1.7②） ------------------------------ */
const departments = ref<Department[]>([]);
const filterDepartmentId = ref('');
const filterRange = ref<[string, string] | null>(null);
const { data: dashboardData, loading: chartLoading, run: loadDashboard } = useRequest<DashboardReport>(
  () => reportsApi.dashboard({
    departmentId: filterDepartmentId.value || undefined,
    from: filterRange.value?.[0] || undefined,
    to: filterRange.value?.[1] || undefined,
  }),
  [],
  { immediate: false },
);

/** 科室下拉选项：子科室加缩进前缀，便于辨识层级。 */
const departmentOptions = computed<Array<{ value: string; label: string }>>(() => {
  const byId = new Map(departments.value.map((d) => [d.id, d]));
  return departments.value.map((d) => {
    const parent = d.parentId ? byId.get(d.parentId) : undefined;
    return { value: d.id, label: parent ? `　└ ${d.name}` : d.name };
  });
});

function onFilterChange(): void {
  void loadDashboard();
}

function resetFilters(): void {
  filterDepartmentId.value = '';
  filterRange.value = null;
  void loadDashboard();
}

// 统计卡：v3.1 方向 C 统一主色（分类色不外溢到统计卡，见 DESIGN-C §2.1），
// 卡片自身无 color 字段，图标色由 .stat-card__icon 的 token 决定。
const cards = [
  { key: 'departments', label: '科室数', icon: OfficeBuilding },
  { key: 'users', label: '用户数', icon: User },
  { key: 'banks', label: '题库 / 题目', icon: Collection },
  { key: 'papers', label: '试卷数', icon: Document },
] as const;

function cardValue(key: (typeof cards)[number]['key']): string {
  if (key === 'banks') return `${stats.banks} / ${stats.questions}`;
  return String(stats[key]);
}

/** 考试名截断（x 轴避免过长）。 */
function shortName(name: string): string {
  return name.length > 10 ? `${name.slice(0, 10)}…` : name;
}

async function load(): Promise<void> {
  loading.value = true;
  // 图表、待办独立加载；慢报表不应阻塞统计卡和考试列表的首屏。
  void loadDashboard();
  void loadTodos();
  const [d, u, b, p, e] = await Promise.allSettled([
    departmentsApi.list(),
    usersApi.list(),
    banksApi.list(),
    papersApi.list(),
    examsApi.list(),
  ]);

  if (d.status === 'fulfilled') {
    departments.value = d.value;
    stats.departments = d.value.length;
  }
  if (u.status === 'fulfilled') stats.users = u.value.length;
  if (b.status === 'fulfilled') {
    stats.banks = b.value.length;
    stats.questions = b.value.reduce((sum, item) => sum + item.questionCount, 0);
  }
  if (p.status === 'fulfilled') {
    stats.papers = p.value.length;
    paperNames.value = Object.fromEntries(p.value.map((item) => [item.id, item.name]));
  }
  if (e.status === 'fulfilled') exams.value = e.value;

  hasLoaded.value = true;
  loading.value = false;

  // C 类补充块在「考试列表就绪」后各自并发拉取（互相隔离失败，不拖垮整页）
  void loadDepartmentPassRates();
  void loadCheatAlerts();
}

onMounted(load);

/* =============================== C 类残项：设计稿三块 =============================== */

/**
 * 科室及格率的「需关注」阈值（图形语义，非业务规则）：
 * 低于该值的科室进度条改走 warning 色，便于一眼定位薄弱科室；不参与任何及格判定。
 * 与「成绩报表 · 科室对比」同口径。
 */
const DEPARTMENT_PASS_RATE_WARN = 0.9;

/** 派生块口径上限：最近 N 场考试（避免逐场报表的 N+1 过重） */
const DERIVED_EXAM_LIMIT = 5;

const settingsStore = useSettingsStore();

/** 最近 N 场考试（按开始时间倒序） */
const recentExams = computed<Exam[]>(() =>
  [...exams.value]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, DERIVED_EXAM_LIMIT),
);

/** 口径文案（最近 N 场，N 为实际参与聚合的考试数） */
const scopeLabel = computed<string>(() => `最近 ${recentExams.value.length} 场`);

/* ---------- 1. 科室及格率（前端按人数加权聚合；DashboardReport 无该段） ---------- */
const departmentPassRates = ref<DeptItem[]>([]);
const passRateLoading = ref(false);

async function loadDepartmentPassRates(): Promise<void> {
  passRateLoading.value = true;
  try {
    const results = await Promise.allSettled(
      recentExams.value.map((e) => reportsApi.examReport(e.id)),
    );
    // 按科室加权聚合：count 求和；avgScore / passRate 以 count 为权重
    const acc = new Map<
      string,
      { name: string; count: number; scoreSum: number; passSum: number }
    >();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const d of r.value.departments) {
        const cur =
          acc.get(d.departmentId) ?? { name: d.departmentName, count: 0, scoreSum: 0, passSum: 0 };
        cur.count += d.count;
        cur.scoreSum += d.count * d.avgScore;
        cur.passSum += d.count * d.passRate;
        if (d.departmentName) cur.name = d.departmentName;
        acc.set(d.departmentId, cur);
      }
    }
    departmentPassRates.value = [...acc.entries()]
      .map(([departmentId, v]) => ({
        departmentId,
        departmentName: v.name,
        count: v.count,
        avgScore: v.count > 0 ? v.scoreSum / v.count : 0,
        passRate: v.count > 0 ? v.passSum / v.count : 0,
      }))
      .sort((a, b) => b.passRate - a.passRate);
  } catch {
    departmentPassRates.value = [];
  } finally {
    passRateLoading.value = false;
  }
}

/* ---------- 2. 待办（现成接口汇总真实数字，失败以 — 占位） ---------- */
const pendingReviewCount = ref<number | null>(null);
const pendingReviewOldestAt = ref('');
const pendingAppealCount = ref<number | null>(null);
const pendingAppealOldestAt = ref('');
const pendingRetakeCount = ref<number | null>(null);
const todoLoading = ref(false);

async function loadTodos(): Promise<void> {
  todoLoading.value = true;
  const [pending, appeals, retakes] = await Promise.allSettled([
    recordsApi.listPending({ page: 1, pageSize: 5 }),
    appealsApi.list({ status: 'pending', page: 1, pageSize: 5 }),
    retakesApi.listRetakes({ status: 'pending', page: 1, pageSize: 5 }),
  ]);
  if (pending.status === 'fulfilled') {
    pendingReviewCount.value = pending.value.total;
    const times = pending.value.list
      .map((r) => r.submittedAt)
      .filter((t): t is string => Boolean(t))
      .sort();
    pendingReviewOldestAt.value = times[0] ?? '';
  }
  if (appeals.status === 'fulfilled') {
    pendingAppealCount.value = appeals.value.total;
    const times = appeals.value.list.map((a) => a.appliedAt).filter(Boolean).sort();
    pendingAppealOldestAt.value = times[0] ?? '';
  }
  if (retakes.status === 'fulfilled') pendingRetakeCount.value = retakes.value.total;
  todoLoading.value = false;
}

/* ---------- 3. 异常告警（切屏审查口径，最近 ≤5 场） ---------- */
interface CheatAlert {
  id: string;
  userName: string;
  examName: string;
  cheatCount: number;
  cheatSeconds: number;
  /** 是否达阈值（次数或累计离开时长任一达阈） */
  over: boolean;
  /** 最近一次切屏事件时刻（ISO） */
  at: string;
}

const cheatAlerts = ref<CheatAlert[]>([]);
const cheatAlertCount = ref<number | null>(null);
const alertLoading = ref(false);

/** 时间线展示上限 */
const ALERT_LIMIT = 6;
const visibleCheatAlerts = computed<CheatAlert[]>(() => cheatAlerts.value.slice(0, ALERT_LIMIT));

async function loadCheatAlerts(): Promise<void> {
  alertLoading.value = true;
  try {
    // 阈值口径来自系统设置（失败静默保留默认值，见 settings store）
    await settingsStore.load();
    const targets = recentExams.value;
    const results = await Promise.allSettled(targets.map((e) => recordsApi.listCheatByExam(e.id)));
    const rows: CheatAlert[] = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const fallbackExamName = targets[i]?.name ?? '';
      for (const rec of r.value) {
        const cheatCount = rec.cheatEvents.length;
        const cheatSeconds = Math.round(
          rec.cheatEvents.reduce((sum, ev) => sum + (Number(ev.awaySeconds) || 0), 0),
        );
        rows.push({
          id: rec.id,
          userName: rec.userName || '—',
          examName: rec.examName || fallbackExamName,
          cheatCount,
          cheatSeconds,
          over:
            cheatCount >= settingsStore.settings.cheatCountThreshold ||
            cheatSeconds >= settingsStore.settings.cheatSecondsThreshold,
          at: rec.cheatEvents[rec.cheatEvents.length - 1]?.at || rec.submittedAt || '',
        });
      }
    });
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    cheatAlerts.value = rows;
    cheatAlertCount.value = rows.filter((r) => r.over).length;
  } catch {
    cheatAlerts.value = [];
    cheatAlertCount.value = null;
  } finally {
    alertLoading.value = false;
  }
}

/* ------------------------------ 图表 option ------------------------------ */
/**
 * 成绩趋势（双线，单主色系）：及格率 = 主色实线，平均分 = 主色浅档虚线。
 * 两条线度量不同（比率 % / 分值），用「实线+虚线」而非第二色区分——
 * 语义色是状态语言，不得降格当数据线用（DESIGN-C §2.5 单一主色）。
 */
const trendOption = computed(() => {
  const trend = dashboardData.value?.examTrend ?? [];
  return {
    tooltip: { trigger: 'axis', ...CHART_TOOLTIP },
    legend: { data: ['及格率', '平均分'], top: 0, ...CHART_LEGEND },
    grid: { left: 44, right: 44, top: 44, bottom: 40 },
    xAxis: {
      type: 'category',
      data: trend.map((p) => shortName(p.examName)),
      axisLabel: { interval: 'auto', ...CHART_AXIS_LABEL },
      axisLine: CHART_AXIS_LINE,
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '及格率',
        max: 100,
        nameTextStyle: CHART_AXIS_NAME,
        axisLabel: { formatter: '{value}%', ...CHART_AXIS_LABEL },
        splitLine: CHART_SPLIT_LINE,
      },
      {
        type: 'value',
        name: '平均分',
        nameTextStyle: CHART_AXIS_NAME,
        axisLabel: CHART_AXIS_LABEL,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '及格率',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2 },
        itemStyle: { color: THEME.primary },
        data: trend.map((p) => Math.round(p.passRate * 100)),
      },
      {
        name: '平均分',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2, type: 'dashed' },
        itemStyle: { color: THEME.primaryLight },
        data: trend.map((p) => p.avgScore),
      },
    ],
  };
});

/**
 * 考试场次趋势（单主色系柱图）：横轴=考试名（截断），纵轴=参考（已交卷）人数。
 * 数据口径说明见文件头——设计稿为「月度场次数」，后端只提供「每场考试的人数」，
 * 故此处按考试等距呈现，不臆造月度聚合；峰值用主色、其余浅主色（softBars）。
 */
const sessionOption = computed(() => {
  const trend = dashboardData.value?.examTrend ?? [];
  const totals = trend.map((p) => p.total);
  return {
    tooltip: {
      trigger: 'axis',
      ...CHART_TOOLTIP,
      formatter: (params: unknown) => {
        const arr = Array.isArray(params) ? params : [params];
        const p = arr[0] as { dataIndex: number };
        const item = trend[p.dataIndex];
        if (!item) return '';
        return `${item.examName}<br/>参考人数：${item.total}<br/>平均分：${item.avgScore}<br/>及格率：${formatPercent(item.passRate)}`;
      },
    },
    grid: { left: 44, right: 24, top: 34, bottom: 64 },
    xAxis: {
      type: 'category',
      data: trend.map((p) => shortName(p.examName)),
      axisLabel: { interval: 0, rotate: 30, ...CHART_AXIS_LABEL },
      axisLine: CHART_AXIS_LINE,
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '参考人数',
      nameTextStyle: CHART_AXIS_NAME,
      axisLabel: CHART_AXIS_LABEL,
      splitLine: CHART_SPLIT_LINE,
    },
    series: [
      {
        name: '参考人数',
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: softBars(totals, peakIndex(totals)),
      },
    ],
  };
});

/** 错题率柱状图（科目 / 知识点共用）：浅柱打底 + 峰值主色，一眼定位最该补救的那一项 */
function wrongRateOption(items: SubjectWrongItem[], name: string) {
  const rates = items.map((s) => Math.round(s.wrongRate * 100));
  return {
    tooltip: {
      trigger: 'axis',
      ...CHART_TOOLTIP,
      formatter: (params: unknown) => {
        const arr = Array.isArray(params) ? params : [params];
        const p = arr[0] as { dataIndex: number };
        const item = items[p.dataIndex];
        if (!item) return '';
        return `${item.subject}<br/>错题率：${formatPercent(item.wrongRate)}<br/>答错 ${item.wrongCount} / ${item.totalAnswered} 人次`;
      },
    },
    grid: { left: 44, right: 24, top: 34, bottom: 64 },
    xAxis: {
      type: 'category',
      data: items.map((s) => s.subject),
      axisLabel: { interval: 0, rotate: 30, ...CHART_AXIS_LABEL },
      axisLine: CHART_AXIS_LINE,
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name,
      max: 100,
      nameTextStyle: CHART_AXIS_NAME,
      axisLabel: { formatter: '{value}%', ...CHART_AXIS_LABEL },
      splitLine: CHART_SPLIT_LINE,
    },
    series: [
      {
        name,
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: softBars(rates, peakIndex(rates)),
      },
    ],
  };
}

const subjectOption = computed(() =>
  wrongRateOption(dashboardData.value?.subjectWrong ?? [], '错题率'),
);

const tagOption = computed(() => wrongRateOption(dashboardData.value?.tagWrong ?? [], '错题率'));
</script>

<template>
  <div class="dashboard">
    <PageHeader title="数据总览" description="系统运行概况" />

    <LoadingSkeleton v-if="loading && !hasLoaded" :rows="4" />

    <template v-else>
      <!-- 看板筛选：科室下钻 + 时间范围（v1.7②） -->
      <el-card class="dashboard__filters" shadow="never">
        <div class="dashboard__filter-row">
          <span class="dashboard__filter-label">科室</span>
          <el-select
            v-model="filterDepartmentId"
            class="dashboard__filter-select"
            placeholder="全部科室"
            clearable
            filterable
            @change="onFilterChange"
          >
            <el-option label="全部科室" value="" />
            <el-option
              v-for="opt in departmentOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span class="dashboard__filter-label">考试开始时间</span>
          <el-date-picker
            v-model="filterRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="onFilterChange"
          />
          <el-button :icon="Search" @click="onFilterChange">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </el-card>

      <el-row :gutter="16" class="dashboard__cards">
        <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="12" :md="6">
          <el-card class="stat-card" shadow="never">
            <span class="stat-card__rule" aria-hidden="true" />
            <div class="stat-card__top">
              <el-icon class="stat-card__icon"><component :is="card.icon" /></el-icon>
              <span class="stat-card__label">{{ card.label }}</span>
            </div>
            <div class="stat-card__value num">{{ cardValue(card.key) }}</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 主栏和侧栏分别连续排列，卡片按实际内容决定高度。 -->
      <div class="dashboard__columns">
        <div class="dashboard__stack">
          <el-card v-loading="chartLoading" class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>考试场次趋势</span>
              <span class="dashboard__chart-hint">按考试统计参考人数</span>
            </template>
            <EmptyState v-if="!dashboardData || dashboardData.examTrend.length === 0" text="暂无趋势数据" />
            <VChart v-else :option="sessionOption" autoresize style="height: 300px" />
          </el-card>
          <el-card class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>最近考试</span>
              <router-link class="dashboard__all-exams" to="/admin/exams">查看全部考试</router-link>
            </template>

            <EmptyState v-if="exams.length === 0" text="暂无考试" />

            <el-table v-else :data="recentExams" row-key="id" stripe>
              <el-table-column prop="name" label="考试名称" min-width="160" show-overflow-tooltip />
              <el-table-column label="关联试卷" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">{{ paperNames[row.paperId] || row.paperId }}</template>
              </el-table-column>
              <el-table-column label="参与科室" width="90" align="center">
                <template #default="{ row }">{{ row.departmentIds.length }}</template>
              </el-table-column>
              <el-table-column label="时间窗" min-width="260" show-overflow-tooltip>
                <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <StatusTag :status="getExamStatus(row as Exam)" />
                </template>
              </el-table-column>
            </el-table>
          </el-card>
          <div class="dashboard__analysis">
            <el-card v-loading="chartLoading" class="dashboard__chart-card" shadow="never">
              <template #header><span>及格率趋势</span></template>
              <EmptyState v-if="!dashboardData || dashboardData.examTrend.length === 0" text="暂无趋势数据" />
              <VChart v-else :option="trendOption" autoresize style="height: 300px" />
            </el-card>
            <el-card v-loading="chartLoading" class="dashboard__chart-card" shadow="never">
              <template #header><span>科目错题归因</span></template>
              <EmptyState v-if="!dashboardData || dashboardData.subjectWrong.length === 0" text="暂无归因数据" />
              <VChart v-else :option="subjectOption" autoresize style="height: 300px" />
            </el-card>
          </div>
        </div>
        <div class="dashboard__stack">
          <el-card v-loading="passRateLoading" class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>科室及格率</span>
              <span class="dashboard__chart-hint">按人数加权 · {{ scopeLabel }}</span>
            </template>
            <!-- 数据缺口：DashboardReport 无「按科室聚合」段，此处由最近 ≤5 场 examReport().departments 前端加权聚合 -->
            <PagedOverview v-if="departmentPassRates.length > 0" :items="departmentPassRates" title="科室及格率">
              <template #default="{ items }">
                <table class="dashboard__dept">
                  <thead>
                    <tr>
                      <th>科室</th>
                      <th class="dashboard__dept-num">人数</th>
                      <th class="dashboard__dept-num">平均分</th>
                      <th>及格率</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in items" :key="row.departmentId">
                      <td class="dashboard__dept-name" :title="row.departmentName">
                        {{ row.departmentName }}
                      </td>
                      <td class="dashboard__dept-num num">{{ row.count }}</td>
                      <td class="dashboard__dept-num num">{{ formatScore(row.avgScore) }}</td>
                      <td>
                        <div class="dashboard__rate">
                          <span class="dashboard__rate-num num">{{ formatPercent(row.passRate) }}</span>
                          <el-progress
                            class="dashboard__rate-bar"
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
              </template>
            </PagedOverview>
            <EmptyState v-else text="—（暂无科室成绩数据：最近 5 场报表为空或请求失败）" />
          </el-card>
          <el-card v-loading="chartLoading" class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>知识点错题归因</span>
              <span class="dashboard__chart-hint">按题目标签统计，未打标签的题目不计入</span>
            </template>
            <EmptyState
              v-if="!dashboardData || dashboardData.tagWrong.length === 0"
              text="暂无知识点归因数据（请先为题目维护知识点标签）"
            />
            <VChart v-else :option="tagOption" autoresize style="height: 300px" />
          </el-card>
          <el-card v-loading="todoLoading" class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>待办</span>
              <span class="dashboard__chart-hint">全局实时</span>
            </template>
            <ul class="dashboard__todo">
              <li class="dashboard__todo-item">
                <el-icon class="dashboard__todo-ic dashboard__todo-ic--warn"><EditPen /></el-icon>
                <div class="dashboard__todo-body">
                  <div class="dashboard__todo-title">
                    <template v-if="pendingReviewCount !== null">
                      {{ pendingReviewCount }} 份主观题待阅卷
                    </template>
                    <template v-else>—</template>
                  </div>
                  <div class="dashboard__todo-sub">
                    <template v-if="pendingReviewCount === null">待阅卷数据获取失败</template>
                    <template v-else-if="pendingReviewCount === 0">暂无积压</template>
                    <template v-else-if="pendingReviewOldestAt">
                      最早提交 {{ formatDateTime(pendingReviewOldestAt) }}
                    </template>
                    <template v-else>—</template>
                  </div>
                </div>
              </li>
              <li class="dashboard__todo-item">
                <el-icon class="dashboard__todo-ic dashboard__todo-ic--err"><Warning /></el-icon>
                <div class="dashboard__todo-body">
                  <div class="dashboard__todo-title">
                    <template v-if="cheatAlertCount !== null">{{ cheatAlertCount }} 条切屏异常</template>
                    <template v-else>—</template>
                  </div>
                  <div class="dashboard__todo-sub">
                    <template v-if="alertLoading">正在加载切屏审查数据…</template>
                    <template v-else-if="cheatAlertCount === null">切屏审查数据获取失败</template>
                    <template v-else>{{ scopeLabel }} · 达阈值口径</template>
                  </div>
                </div>
              </li>
              <li class="dashboard__todo-item">
                <el-icon class="dashboard__todo-ic"><Flag /></el-icon>
                <div class="dashboard__todo-body">
                  <div class="dashboard__todo-title">
                    <template v-if="pendingAppealCount !== null">
                      {{ pendingAppealCount }} 份成绩复核申请
                    </template>
                    <template v-else>—</template>
                  </div>
                  <div class="dashboard__todo-sub">
                    <template v-if="pendingAppealCount === null">复核申请数据获取失败</template>
                    <template v-else-if="pendingAppealCount === 0">暂无待处理</template>
                    <template v-else-if="pendingAppealOldestAt">
                      最早申请于 {{ formatDateTime(pendingAppealOldestAt) }}
                    </template>
                    <template v-else>—</template>
                  </div>
                </div>
              </li>
              <li class="dashboard__todo-item">
                <el-icon class="dashboard__todo-ic"><Refresh /></el-icon>
                <div class="dashboard__todo-body">
                  <div class="dashboard__todo-title">
                    <template v-if="pendingRetakeCount !== null">{{ pendingRetakeCount }} 条补考申请</template>
                    <template v-else>—</template>
                  </div>
                  <div class="dashboard__todo-sub">
                    <template v-if="pendingRetakeCount === null">补考申请数据获取失败</template>
                    <template v-else>待审批</template>
                  </div>
                </div>
              </li>
            </ul>
          </el-card>
          <el-card v-loading="alertLoading" class="dashboard__chart-card" shadow="never">
            <template #header>
              <span>异常告警</span>
              <span class="dashboard__chart-hint">{{ scopeLabel }} · 切屏审查口径</span>
            </template>
            <ul v-if="visibleCheatAlerts.length > 0" class="dashboard__alerts">
              <li
                v-for="a in visibleCheatAlerts"
                :key="a.id"
                class="dashboard__alert"
                :class="{ 'dashboard__alert--over': a.over }"
              >
                <div class="dashboard__alert-title">
                  <template v-if="a.over">
                    {{ a.userName }} 切屏 {{ a.cheatCount }} 次 / 累计离开 {{ a.cheatSeconds }} 秒
                  </template>
                  <template v-else>{{ a.userName }} 切屏 {{ a.cheatCount }} 次</template>
                </div>
                <div class="dashboard__alert-sub">
                  {{ a.examName }} · {{ a.at ? formatDateTime(a.at).slice(11) : '—' }}
                </div>
              </li>
            </ul>
            <EmptyState v-else text="—（最近 5 场暂无切屏异常记录）" />
          </el-card>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.dashboard__all-exams {
  margin-left: auto;
  color: $color-primary;
  font-size: 12px;
  text-decoration: none;
}

.dashboard__cards {
  margin-bottom: 16px;
}

.dashboard__filters {
  border-radius: $radius-lg;
  margin-bottom: 16px;
}

.dashboard__filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dashboard__filter-label {
  font-size: 13px;
  color: $text-secondary;
}

.dashboard__filter-select {
  width: 200px;
}

.dashboard__chart-hint {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: $text-secondary;
}

.dashboard__columns {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.dashboard__stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.dashboard__analysis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

@media (max-width: 991px) {
  .dashboard__columns, .dashboard__analysis {
    grid-template-columns: minmax(0, 1fr);
  }
}

.dashboard__chart-card {
  border-radius: $radius-lg;
  min-width: 0;
}

// —— C 类残项 1：科室及格率（「表格 + 内联进度条」，与「成绩报表 · 科室对比」同范式）
.dashboard__dept {
  width: 100%;
  border-collapse: collapse;

  th {
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-align: left;
    white-space: nowrap;
    color: $text-secondary;
    border-bottom: 1px solid $line-strong;
  }

  td {
    padding: 7px 8px;
    font-size: 13px;
    color: $text-body;
    border-bottom: 1px solid $border-color;
    vertical-align: middle;
  }

  tr:last-child td {
    border-bottom: none;
  }

  // 表头数字列与正文数字列同向右对齐
  th.dashboard__dept-num {
    text-align: right;
  }

  &-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: $text-primary;
  }

  &-num {
    text-align: right;
    white-space: nowrap;
  }
}

.dashboard__rate {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
}

.dashboard__rate-num {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
}

.dashboard__rate-bar {
  flex: 1 1 auto;
  min-width: 60px;
}

// —— C 类残项 2：待办（图标件沿用统计卡语言：26px 软底图标 + 主色/语义图形档）
.dashboard__todo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard__todo-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.dashboard__todo-ic {
  display: grid;
  flex: 0 0 26px;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: $radius-xs;
  background: $color-primary-soft;
  color: $color-primary;
  font-size: 15px;

  &--warn {
    background: $color-warning-bg;
    color: $color-warning;
  }

  &--err {
    background: $color-error-bg;
    color: $color-error;
  }
}

.dashboard__todo-body {
  flex: 1 1 auto;
  min-width: 0;
}

.dashboard__todo-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.dashboard__todo-sub {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
}

// —— C 类残项 3：异常告警（时间线：左缘 2px 图形档色条，文字保持文本档）
.dashboard__alerts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard__alert {
  position: relative;
  padding-left: 10px;

  &::before {
    content: '';
    position: absolute;
    inset: 2px auto 2px 0;
    width: 2px;
    border-radius: $radius-xs;
    background: $color-warning;
  }

  &--over::before {
    background: $color-error;
  }
}

.dashboard__alert-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.dashboard__alert-sub {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
}

// 统计卡（DESIGN-C §2.4）：左缘 2px 主色条 + 26px 主色软底图标 + 纵向层级。
// 图标统一主色——分类色不外溢到统计卡，四色图标是 v2.2 的旧语言。
.stat-card {
  position: relative;
  overflow: hidden;
  border-radius: $radius-base;

  &__rule {
    position: absolute;
    inset: 0 auto 0 0;
    width: 2px;
    background: $color-primary;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    display: grid;
    flex: 0 0 26px;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: $radius-xs;
    background: $color-primary-soft;
    color: $color-primary;
    font-size: 15px;
  }

  &__label {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__value {
    margin-top: 8px;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: $text-primary;
  }
}
</style>
