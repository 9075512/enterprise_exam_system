<script setup lang="ts">
/**
 * 数据总览（W3-T2，管理员）。
 * 4 个统计卡片 + 近期考试表 + 及格率趋势 + 科目错题归因；
 * 各接口 Promise.allSettled 互相隔离失败。
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
  OfficeBuilding,
  User,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import * as papersApi from '@/api/papers';
import * as reportsApi from '@/api/reports';
import * as usersApi from '@/api/users';
import { THEME } from '@/constants/theme';
import { formatRange } from '@/utils/datetime';
import { formatPercent } from '@/utils/format';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { DashboardReport, Exam } from '@/types';

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const loading = ref(false);
const stats = reactive({
  departments: 0,
  users: 0,
  banks: 0,
  questions: 0,
  papers: 0,
});
const exams = ref<Exam[]>([]);
const paperNames = ref<Record<string, string>>({});
const dashboardData = ref<DashboardReport | null>(null);

const cards = [
  { key: 'departments', label: '科室数', icon: OfficeBuilding, color: THEME.primary },
  { key: 'users', label: '用户数', icon: User, color: THEME.secondary },
  { key: 'banks', label: '题库 / 题目', icon: Collection, color: THEME.info },
  { key: 'papers', label: '试卷数', icon: Document, color: THEME.success },
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
  const [d, u, b, p, e, dash] = await Promise.allSettled([
    departmentsApi.list(),
    usersApi.list(),
    banksApi.list(),
    papersApi.list(),
    examsApi.list(),
    reportsApi.dashboard(),
  ]);

  if (d.status === 'fulfilled') stats.departments = d.value.length;
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
  if (dash.status === 'fulfilled') dashboardData.value = dash.value;

  loading.value = false;
}

onMounted(load);

/* ------------------------------ 图表 option ------------------------------ */
const trendOption = computed(() => {
  const trend = dashboardData.value?.examTrend ?? [];
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['及格率', '平均分'], top: 0 },
    grid: { left: 40, right: 40, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: trend.map((p) => shortName(p.examName)),
      axisLabel: { interval: 'auto', fontSize: 11 },
    },
    yAxis: [
      { type: 'value', name: '及格率', max: 100, axisLabel: { formatter: '{value}%' } },
      { type: 'value', name: '平均分' },
    ],
    series: [
      {
        name: '及格率',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        itemStyle: { color: THEME.primary },
        data: trend.map((p) => Math.round(p.passRate * 100)),
      },
      {
        name: '平均分',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: THEME.success },
        data: trend.map((p) => p.avgScore),
      },
    ],
  };
});

const subjectOption = computed(() => {
  const items = dashboardData.value?.subjectWrong ?? [];
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = Array.isArray(params) ? params : [params];
        const p = arr[0] as { name: string; dataIndex: number };
        const item = items[p.dataIndex];
        if (!item) return '';
        return `${item.subject}<br/>错题率：${formatPercent(item.wrongRate)}<br/>答错 ${item.wrongCount} / ${item.totalAnswered} 人次`;
      },
    },
    grid: { left: 40, right: 20, top: 30, bottom: 60 },
    xAxis: {
      type: 'category',
      data: items.map((s) => s.subject),
      axisLabel: { interval: 0, fontSize: 11, rotate: 30 },
    },
    yAxis: { type: 'value', name: '错题率', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '错题率',
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { color: THEME.error },
        data: items.map((s) => Math.round(s.wrongRate * 100)),
      },
    ],
  };
});
</script>

<template>
  <div class="dashboard">
    <PageHeader title="数据总览" description="系统运行概况" />

    <LoadingSkeleton v-if="loading && exams.length === 0" :rows="4" />

    <template v-else>
      <el-row :gutter="16" class="dashboard__cards">
        <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card__body">
              <el-icon class="stat-card__icon" :style="{ color: card.color, backgroundColor: `${card.color}1A` }">
                <component :is="card.icon" />
              </el-icon>
              <div class="stat-card__text">
                <div class="stat-card__label">{{ card.label }}</div>
                <div class="stat-card__value num">{{ cardValue(card.key) }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="dashboard__charts">
        <el-col :xs="24" :md="12">
          <el-card class="dashboard__chart-card" shadow="never">
            <template #header><span>及格率趋势</span></template>
            <EmptyState v-if="!dashboardData || dashboardData.examTrend.length === 0" text="暂无趋势数据" />
            <VChart v-else :option="trendOption" autoresize style="height: 300px" />
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card class="dashboard__chart-card" shadow="never">
            <template #header><span>科目错题归因</span></template>
            <EmptyState v-if="!dashboardData || dashboardData.subjectWrong.length === 0" text="暂无归因数据" />
            <VChart v-else :option="subjectOption" autoresize style="height: 300px" />
          </el-card>
        </el-col>
      </el-row>

      <el-card class="dashboard__recent" shadow="never">
        <template #header>
          <span>近期考试</span>
        </template>

        <EmptyState v-if="exams.length === 0" text="暂无考试" />

        <el-table v-else :data="exams" row-key="id" stripe>
          <el-table-column prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="关联试卷" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ paperNames[row.paperId] || row.paperId }}</template>
          </el-table-column>
          <el-table-column label="参与科室" width="100" align="center">
            <template #default="{ row }">{{ row.departmentIds.length }}</template>
          </el-table-column>
          <el-table-column label="时间窗" min-width="320">
            <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <StatusTag :status="getExamStatus(row as Exam)" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.dashboard__cards {
  margin-bottom: 16px;
}

.dashboard__charts {
  margin-bottom: 16px;
}

.dashboard__chart-card {
  border-radius: $radius-lg;
  margin-bottom: 16px;
}

.dashboard__recent {
  border-radius: $radius-lg;
}

.stat-card {
  border-radius: $radius-lg;

  &__body {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: $radius-sm;
    font-size: 24px;
  }

  &__label {
    font-size: 13px;
    color: $text-secondary;
  }

  &__value {
    margin-top: 4px;
    font-size: 26px;
    font-weight: 700;
    color: $text-primary;
    line-height: 1.2;
  }
}
</style>
