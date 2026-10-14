<script setup lang="ts">
/**
 * 成绩报表（W3-T2，管理员）。
 * 顶部选考试 → reports.examReport；四页签：成绩列表 / 分数段 / 科室对比 / 错题排行。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import { Download } from '@element-plus/icons-vue';
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
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import ScoreExportDialog from './ScoreExportDialog.vue';
import type { Exam, ExamRecord, Report } from '@/types';

use([BarChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent, CanvasRenderer]);

/**
 * 科室及格率的「需关注」阈值（图形语义，非业务规则）：
 * 低于该值的科室在科室对比表里用 warning 色进度条标出，便于一眼定位薄弱科室。
 * 只影响进度条配色，不参与任何及格判定（及格判定一律走考试自身的 passScore）。
 */
const DEPARTMENT_PASS_RATE_WARN = 0.9;

const settingsStore = useSettingsStore();

onMounted(() => {
  void settingsStore.load();
});

/* ------------------------------ 基础数据 ------------------------------ */
const { data: exams } = useRequest(() => examsApi.list());
const { data: users } = useRequest(() => usersApi.list());
const { data: departments } = useRequest(() => departmentsApi.list());

const userNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((users.value ?? []).map((u) => [u.id, u.name])),
);
const departmentNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((departments.value ?? []).map((d) => [d.id, d.name])),
);

const selectedExamId = ref('');
const activeTab = ref('records');
const report = ref<Report | null>(null);
const reportLoading = ref(false);

const selectedExam = computed<Exam | null>(
  () => (exams.value ?? []).find((e) => e.id === selectedExamId.value) ?? null,
);
const passScore = computed<number>(() => selectedExam.value?.passScore ?? 60);

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
  load: loadRecords,
  onPageChange,
  onSizeChange,
  reset: resetRecords,
} = usePagination<ExamRecord>(
  (p, ps) => recordsApi.listByExam({ examId: selectedExamId.value, page: p, pageSize: ps }),
  settingsStore.settings.defaultPageSize,
);

/* ------------------------------ 报表加载 ------------------------------ */
async function loadReport(): Promise<void> {
  if (!selectedExamId.value) {
    report.value = null;
    return;
  }
  reportLoading.value = true;
  try {
    report.value = await reportsApi.examReport(selectedExamId.value);
  } catch {
    report.value = null;
  } finally {
    reportLoading.value = false;
  }
}

/* ------------------------------ 切屏审查 ------------------------------ */
const cheatList = ref<ExamRecord[]>([]);
const cheatLoading = ref(false);

async function loadCheat(): Promise<void> {
  if (!selectedExamId.value) {
    cheatList.value = [];
    return;
  }
  cheatLoading.value = true;
  try {
    cheatList.value = await recordsApi.listCheatByExam(selectedExamId.value);
  } catch {
    cheatList.value = [];
  } finally {
    cheatLoading.value = false;
  }
}

watch(selectedExamId, (examId) => {
  if (!examId) {
    report.value = null;
    records.value = [];
    total.value = 0;
    cheatList.value = [];
    return;
  }
  void loadReport();
  resetRecords();
  void loadCheat();
});

/* ------------------------------ 图表实例与自适应 ------------------------------ */
// 图表挂载在 el-tab-pane 内，初始 tab 隐藏时容器宽度为 0；
// 通过 lazy（首次显示才挂载）+ autoresize（ResizeObserver 跟随容器尺寸）修复。
// 再对 tab 切换做一次显式 resize() 兜底，规避部分场景下 ResizeObserver 不触发。
// 注：科室对比自 v3.1 起改为「表格 + 内联进度条」（DESIGN-C §2.3），不再是图表。
const bandChartRef = ref<InstanceType<typeof VChart> | null>(null);

function onTabChange(name: string | number): void {
  void nextTick(() => {
    if (name === 'bands') {
      bandChartRef.value?.resize();
    }
  });
}

/* ------------------------------ 图表 option ------------------------------ */
// 分数段分布：浅柱打底 + 人数最多的那一段用主色高亮（设计稿 .ch-bar / .ch-bar--on）
const bandOption = computed(() => {
  const counts = (report.value?.bands ?? []).map((b) => b.count);
  return {
    tooltip: { trigger: 'axis', ...CHART_TOOLTIP },
    grid: { left: 44, right: 24, top: 34, bottom: 44 },
    xAxis: {
      type: 'category',
      data: (report.value?.bands ?? []).map((b) => b.label),
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

/* ------------------------------ 工具 ------------------------------ */
function isCheat(record: ExamRecord): boolean {
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
</script>

<template>
  <div class="report-page">
    <PageHeader title="成绩报表" description="查看单场考试成绩、分数段、科室对比与错题排行" />

    <div class="report-page__select">
      <span class="report-page__select-label">选择考试</span>
      <el-select v-model="selectedExamId" class="report-page__select-input" placeholder="请选择一场考试" clearable>
        <el-option
          v-for="exam in exams || []"
          :key="exam.id"
          :label="`${exam.name}（${formatDateTime(exam.startTime)}）`"
          :value="exam.id"
        />
      </el-select>
      <div class="report-page__select-actions">
        <el-button
          type="primary"
          :icon="Download"
          :disabled="!selectedExamId || exportCount === 0"
          @click="exportVisible = true"
        >导出成绩</el-button>
      </div>
    </div>

    <EmptyState v-if="!selectedExamId" text="请选择一场考试查看报表" />

    <LoadingSkeleton v-else-if="reportLoading && !report" :rows="6" />

    <el-tabs v-else v-model="activeTab" class="report-page__tabs" @tab-change="onTabChange">
      <!-- 1. 成绩列表 -->
      <el-tab-pane label="成绩列表" name="records">
        <el-card class="table-card" shadow="never">
          <el-table v-loading="recordsLoading" :data="records" row-key="id" stripe>
            <el-table-column label="考生姓名" width="120">
              <template #default="{ row }">{{ userNameMap[row.userId] || row.userId }}</template>
            </el-table-column>
            <el-table-column label="科室" width="140">
              <template #default="{ row }">{{ departmentNameMap[row.departmentId] || '—' }}</template>
            </el-table-column>
            <el-table-column label="作答次数" width="100" align="center">
              <template #default="{ row }">第 {{ (row as ExamRecord).attemptNo }} 次</template>
            </el-table-column>
            <el-table-column label="交卷时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
            </el-table-column>
            <el-table-column label="得分" width="90" align="center">
              <template #default="{ row }">{{ formatScore(row.score) }}</template>
            </el-table-column>
            <el-table-column label="是否及格" width="110" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.score >= passScore ? 'success' : 'danger'" effect="plain">
                  {{ row.score >= passScore ? '及格' : '不及格' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="切屏异常" min-width="140">
              <template #default="{ row }">
                <el-tag v-if="isCheat(row as ExamRecord)" type="danger" size="small">
                  {{ cheatSummary(row as ExamRecord) }}
                </el-tag>
                <span v-else class="report-page__muted">正常</span>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState text="暂无成绩记录" />
            </template>
          </el-table>
          <DataTablePagination
            :page="page"
            :page-size="pageSize"
            :total="total"
            @update:page="onPageChange"
            @update:page-size="onSizeChange"
          />
        </el-card>
      </el-tab-pane>

      <!-- 2. 分数段 -->
      <el-tab-pane label="分数段" name="bands" lazy>
        <div class="report-page__stack">
          <div v-if="report" class="report-page__summary">
            <span>参考人数：{{ report.summary.total }}</span>
            <span>平均分：{{ formatScore(report.summary.avgScore) }}</span>
            <span>最高：{{ formatScore(report.summary.maxScore) }}</span>
            <span>最低：{{ formatScore(report.summary.minScore) }}</span>
            <span>及格率：{{ formatPercent(report.summary.passRate) }}</span>
          </div>
          <el-card v-if="report && report.summary.total > 0" class="report-page__chart-card" shadow="never">
            <VChart ref="bandChartRef" :option="bandOption" autoresize style="height: 320px" />
          </el-card>
          <EmptyState v-else text="暂无成绩数据" />
        </div>
      </el-tab-pane>

      <!-- 3. 科室对比（v3.1：表格 + 内联进度条，取代双轴柱状图——同屏即可横向比较，无需读图） -->
      <el-tab-pane label="科室对比" name="departments" lazy>
        <div class="report-page__stack">
          <EmptyState v-if="!report || report.departments.length === 0" text="暂无科室数据" />
          <el-card v-else class="table-card" shadow="never">
            <el-table :data="report.departments" stripe>
              <el-table-column prop="departmentName" label="科室" min-width="160" />
              <el-table-column prop="count" label="人数" width="100" align="center" />
              <el-table-column label="平均分" width="120" align="center">
                <template #default="{ row }">
                  <span class="num">{{ formatScore(row.avgScore) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="及格率" min-width="200">
                <template #default="{ row }">
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
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- 4. 错题排行 -->
      <el-tab-pane label="错题排行" name="wrong">
        <EmptyState v-if="report && report.wrongRate.length === 0" text="暂无错题数据" />
        <el-card v-else-if="report" class="table-card" shadow="never">
          <el-table :data="report.wrongRate" row-key="questionId" stripe>
            <el-table-column label="题干" min-width="300">
              <template #default="{ row }">
                <el-tooltip :content="row.stem" placement="top" :show-after="300">
                  <span class="report-page__stem">{{ row.stem }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="wrongCount" label="答错人数" width="110" align="center" />
            <el-table-column prop="totalAnswered" label="总作答人数" width="120" align="center" />
            <el-table-column label="错误率" width="200">
              <template #default="{ row }">
                <el-progress
                  :percentage="Math.round(row.wrongRate * 100)"
                  :stroke-width="12"
                  :color="row.wrongRate >= 0.5 ? THEME.error : THEME.primary"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 5. 切屏审查 -->
      <el-tab-pane label="切屏审查" name="cheat" lazy>
        <el-card class="table-card" shadow="never">
          <el-table v-loading="cheatLoading" :data="cheatList" row-key="id" stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="report-page__cheat-timeline">
                  <p class="report-page__cheat-timeline-title">
                    切屏时间线（共 {{ (row as ExamRecord).cheatEvents.length }} 次）
                  </p>
                  <el-table :data="(row as ExamRecord).cheatEvents" size="small" border>
                    <el-table-column type="index" label="#" width="60" align="center" />
                    <el-table-column label="发生时间" min-width="220">
                      <template #default="{ row: e }">{{ formatDateTime(e.at) }}</template>
                    </el-table-column>
                    <el-table-column label="离开时长（秒）" width="160" align="center">
                      <template #default="{ row: e }">{{ e.awaySeconds }}</template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="考生姓名" width="120">
              <template #default="{ row }">{{ row.userName || userNameMap[row.userId] || row.userId }}</template>
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
                <el-tag :type="isCheat(row as ExamRecord) ? 'danger' : 'warning'" size="small">
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
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <ScoreExportDialog v-model="exportVisible" :exam-id="selectedExamId" :exam-name="exportExamName" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.report-page {
  &__select {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__select-label {
    color: $text-secondary;
    font-size: 13px;
  }

  &__select-input {
    width: 360px;
  }

  &__select-actions {
    margin-left: auto;
  }

  &__stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__chart-card {
    border-radius: $radius-lg;
  }

  &__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    padding: 12px 16px;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: 13px;
    color: $text-primary;
  }

  &__muted {
    color: $text-secondary;
    font-size: 13px;
  }

  /** 科室对比：及格率 = 数值 + 内联进度条（DESIGN-C §2.3），一屏内即可横向比较 */
  &__rate {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__rate-num {
    flex: 0 0 auto;
    font-size: 12.5px;
    color: $text-primary;
  }

  &__rate-bar {
    flex: 1;
    min-width: 0;
    max-width: 120px;
  }

  &__stem {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  &__cheat-timeline {
    padding: 4px 48px 8px;
  }

  &__cheat-timeline-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }
}
</style>
