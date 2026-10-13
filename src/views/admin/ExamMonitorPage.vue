<script setup lang="ts">
/**
 * 实时考试监控（v1.7④ T3，管理员）。
 *
 * - 采用**轮询**（默认 15s，可开关）获取准实时数据，不做 WebSocket；
 * - 剩余时长在客户端每秒递减展示，轮询回来以后端值为准；
 * - 支持对「进行中」考生一键强制交卷、加时（分钟，可累加）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Refresh, Timer, VideoPause } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import { EXAM_STATUS_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { ExamMonitor, ExamMonitorRow, MonitorStatus } from '@/types';

const route = useRoute();
const router = useRouter();
const examId = String(route.params.id ?? '');

const monitor = ref<ExamMonitor | null>(null);
const loading = ref(false);
const refreshing = ref(false);
/** 自动刷新开关（默认开） */
const autoRefresh = ref(true);
/** 自动刷新间隔（秒） */
const intervalSeconds = 15;
/** 客户端剩余秒数本地时钟（每秒递减，轮询后重置） */
const tickOffset = ref(0);
let pollTimer: number | undefined;
let tickTimer: number | undefined;

const STATUS_LABELS: Record<MonitorStatus, string> = {
  not_started: '未开始',
  in_progress: '作答中',
  pending_review: '待阅卷',
  submitted: '已交卷',
};

const summary = computed(() => monitor.value?.summary ?? null);
const rows = computed<ExamMonitorRow[]>(() => monitor.value?.rows ?? []);
const examStatusLabel = computed(() =>
  monitor.value ? EXAM_STATUS_LABELS[getExamStatus(monitor.value.exam)] : '',
);

/** 服务端剩余秒数 - 本地已流逝秒数（仅进行中有意义）。 */
function remainingOf(row: ExamMonitorRow): number {
  if (row.status !== 'in_progress') return 0;
  return Math.max(0, row.remainingSeconds - tickOffset.value);
}

function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 剩余不足 5 分钟标红，不足 10 分钟标橙（与作答页提醒口径近似）。 */
function remainingClass(row: ExamMonitorRow): string {
  const left = remainingOf(row);
  if (left <= 300) return 'monitor__remaining--danger';
  if (left <= 600) return 'monitor__remaining--warn';
  return '';
}

/** 切屏异常行标记（次数 ≥ 3 或累计 ≥ 120 秒，与后端判定口径接近）。 */
function isCheatWarned(row: ExamMonitorRow): boolean {
  return row.cheatCount >= 3 || row.cheatSeconds >= 120;
}

async function load(silent = false): Promise<void> {
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    monitor.value = await examsApi.monitor(examId);
    tickOffset.value = 0;
  } catch {
    /* 错误已由拦截器统一提示 */
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function startPolling(): void {
  stopPolling(false);
  pollTimer = window.setInterval(() => {
    if (autoRefresh.value) void load(true);
  }, intervalSeconds * 1000);
}

function stopPolling(clearTimer = true): void {
  if (clearTimer && pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function onToggleAuto(value: boolean): void {
  autoRefresh.value = value;
  if (value) void load(true);
}

async function handleForceSubmit(row: ExamMonitorRow): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定强制「${row.userName}」交卷吗？将按当前作答情况结算成绩，该操作不可撤销。`,
      '强制交卷',
      { type: 'warning', confirmButtonText: '确认交卷' },
    );
  } catch {
    return;
  }
  try {
    await examsApi.forceSubmit(examId, row.userId);
    ElMessage.success('已强制交卷');
    void load(true);
  } catch {
    /* 已提示 */
  }
}

async function handleExtend(row: ExamMonitorRow): Promise<void> {
  let input: string;
  try {
    const result = await ElMessageBox.prompt(
      `为「${row.userName}」加时（分钟，1~600，可累加；当前累计 ${row.extraMinutes} 分钟）`,
      '监考加时',
      {
        inputValue: '10',
        inputPattern: /^\d+$/,
        inputErrorMessage: '请输入 1~600 的整数分钟数',
        confirmButtonText: '确认加时',
      },
    );
    input = String(result.value ?? '');
  } catch {
    return;
  }
  const minutes = Number(input);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    ElMessage.warning('请输入 1~600 的整数分钟数');
    return;
  }
  try {
    await examsApi.extendTime(examId, row.userId, minutes);
    ElMessage.success('已加时');
    void load(true);
  } catch {
    /* 已提示 */
  }
}

onMounted(() => {
  void load();
  startPolling();
  tickTimer = window.setInterval(() => {
    tickOffset.value += 1;
  }, 1000);
});

onBeforeUnmount(() => {
  stopPolling();
  if (tickTimer !== undefined) window.clearInterval(tickTimer);
});

function goBack(): void {
  void router.push('/admin/exams');
}
</script>

<template>
  <div class="monitor">
    <PageHeader :title="monitor ? `监考监控 · ${monitor.exam.name}` : '监考监控'" description="准实时掌握作答进度，异常可一键处置">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回考试列表</el-button>
        <el-button :icon="Refresh" :loading="refreshing" @click="load(true)">立即刷新</el-button>
        <el-switch
          :model-value="autoRefresh"
          class="monitor__auto"
          active-text="自动刷新"
          @update:model-value="onToggleAuto($event as boolean)"
        />
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !monitor" :rows="5" />

    <EmptyState v-else-if="!monitor" text="考试不存在或已被删除" />

    <template v-else>
      <div class="monitor__meta">
        <span class="monitor__meta-item">考试状态：{{ examStatusLabel }}</span>
        <span class="monitor__meta-item">
          时间窗：{{ formatDateTime(monitor.exam.startTime) }} ~ {{ formatDateTime(monitor.exam.endTime) }}
        </span>
        <span class="monitor__meta-item">时长：{{ monitor.exam.durationMinutes }} 分钟</span>
        <span class="monitor__meta-item monitor__meta-item--muted">
          数据时间：{{ formatDateTime(monitor.generatedAt) }}
          <template v-if="autoRefresh">（每 {{ intervalSeconds }} 秒自动刷新）</template>
        </span>
      </div>

      <div class="monitor__cards">
        <div class="monitor__card">
          <div class="monitor__card-label">应考人数</div>
          <div class="monitor__card-value">{{ summary?.total ?? 0 }}</div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">作答中</div>
          <div class="monitor__card-value monitor__card-value--primary">{{ summary?.inProgress ?? 0 }}</div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">未开始</div>
          <div class="monitor__card-value">{{ summary?.notStarted ?? 0 }}</div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">已交卷</div>
          <div class="monitor__card-value monitor__card-value--success">{{ summary?.submitted ?? 0 }}</div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">待阅卷</div>
          <div class="monitor__card-value">{{ summary?.pendingReview ?? 0 }}</div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">切屏异常</div>
          <div class="monitor__card-value" :class="{ 'monitor__card-value--danger': (summary?.cheatWarned ?? 0) > 0 }">
            {{ summary?.cheatWarned ?? 0 }}
          </div>
        </div>
        <div class="monitor__card">
          <div class="monitor__card-label">平均分（已出成绩）</div>
          <div class="monitor__card-value">{{ summary?.averageScore ?? 0 }}</div>
        </div>
      </div>

      <el-card class="table-card" shadow="never">
        <el-table v-loading="loading" :data="rows" row-key="userId" stripe>
          <el-table-column prop="userName" label="考生" min-width="120" show-overflow-tooltip />
          <el-table-column prop="username" label="账号" min-width="120" show-overflow-tooltip />
          <el-table-column prop="departmentName" label="科室" min-width="140" show-overflow-tooltip />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag
                size="small"
                effect="plain"
                :type="
                  (row as ExamMonitorRow).status === 'in_progress'
                    ? 'primary'
                    : (row as ExamMonitorRow).status === 'submitted'
                      ? 'success'
                      : 'info'
                "
              >
                {{ STATUS_LABELS[(row as ExamMonitorRow).status] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="作答次数" width="90" align="center">
            <template #default="{ row }">{{ (row as ExamMonitorRow).attemptNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="剩余时长" width="120" align="center">
            <template #default="{ row }">
              <span
                v-if="(row as ExamMonitorRow).status === 'in_progress'"
                class="monitor__remaining"
                :class="remainingClass(row as ExamMonitorRow)"
              >
                {{ formatRemaining(remainingOf(row as ExamMonitorRow)) }}
              </span>
              <span v-else class="monitor__muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="加时" width="80" align="center">
            <template #default="{ row }">
              <span v-if="(row as ExamMonitorRow).extraMinutes > 0" class="monitor__extra">
                +{{ (row as ExamMonitorRow).extraMinutes }} 分
              </span>
              <span v-else class="monitor__muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="切屏" width="120" align="center">
            <template #default="{ row }">
              <span :class="{ 'monitor__warn-text': isCheatWarned(row as ExamMonitorRow) }">
                {{ (row as ExamMonitorRow).cheatCount }} 次 /
                {{ (row as ExamMonitorRow).cheatSeconds }} 秒
              </span>
            </template>
          </el-table-column>
          <el-table-column label="得分" width="90" align="center">
            <template #default="{ row }">
              <span v-if="(row as ExamMonitorRow).status === 'submitted'">{{ (row as ExamMonitorRow).score }}</span>
              <span v-else class="monitor__muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="交卷时间" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="(row as ExamMonitorRow).submittedAt">
                {{ formatDateTime((row as ExamMonitorRow).submittedAt) }}
                <el-tag v-if="(row as ExamMonitorRow).autoSubmitted" size="small" type="warning" effect="plain">
                  自动
                </el-tag>
              </span>
              <span v-else class="monitor__muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="(row as ExamMonitorRow).status === 'in_progress'">
                <el-button type="primary" link :icon="Timer" @click="handleExtend(row as ExamMonitorRow)">
                  加时
                </el-button>
                <el-button type="danger" link :icon="VideoPause" @click="handleForceSubmit(row as ExamMonitorRow)">
                  强制交卷
                </el-button>
              </template>
              <span v-else class="monitor__muted">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState text="该考试暂无应考考生" />
          </template>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.monitor {
  &__auto {
    margin-left: 4px;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 13px;
    color: $text-secondary;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-sm;

    &-item--muted {
      color: $text-disabled;
    }
  }

  &__cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  &__card {
    padding: 14px 16px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
  }

  &__card-label {
    margin-bottom: 6px;
    font-size: 13px;
    color: $text-secondary;
  }

  &__card-value {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    color: $text-primary;

    &--primary {
      color: $color-primary;
    }

    &--success {
      color: $color-success;
    }

    &--danger {
      color: $color-error;
    }
  }

  &__remaining {
    font-variant-numeric: tabular-nums;
    font-weight: 600;

    &--warn {
      color: $color-warning;
    }

    &--danger {
      color: $color-error;
    }
  }

  &__extra {
    color: $color-primary;
  }

  &__warn-text {
    font-weight: 600;
    color: $color-error;
  }

  &__muted {
    color: $text-disabled;
  }
}
</style>
