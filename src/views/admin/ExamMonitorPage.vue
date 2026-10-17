<script setup lang="ts">
/**
 * 实时考试监控（v1.7④ T3 + v1.8① U1，管理员）。
 *
 * - **默认走 SSE 推送**（v1.8①）：服务端按考试聚合，每 `monitorPushIntervalSeconds`（默认 5s）
 *   推一次快照（同一场考试的全部监考页共享一次查库），显著降低轮询带来的数据库压力；
 * - **自动降级**：推送不可用（开关关闭 / 连接数超限 / 鉴权失效 / 网络异常）时自动回退
 *   15s 轮询，页面功能不受影响；
 * - 剩余时长在客户端每秒递减展示，收到推送以后端值为准；
 * - 支持对「进行中」考生一键强制交卷、加时（分钟，可累加）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Refresh, Timer, VideoPause } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import { COUNTDOWN_WARNING_MINUTES, EXAM_STATUS_LABELS } from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import { openMonitorStream, type MonitorStreamHandle, type MonitorStreamState } from '@/utils/monitorStream';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { ExamMonitor, ExamMonitorRow, MonitorStatus } from '@/types';

const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();
const examId = String(route.params.id ?? '');

const monitor = ref<ExamMonitor | null>(null);
const loading = ref(false);
const refreshing = ref(false);
/** 自动刷新开关（默认开） */
const autoRefresh = ref(true);
/** 轮询降级间隔（秒） */
const POLL_SECONDS = 15;
/** 客户端剩余秒数本地时钟（每秒递减，收到数据后重置） */
const tickOffset = ref(0);
/** 推送连接状态 */
const pushState = ref<MonitorStreamState>('connecting');
/** 推送状态补充说明（错误原因等） */
const pushDetail = ref('');
/** 服务端推送间隔（秒），来自 `ready` 事件 */
const pushSeconds = ref(5);

let stream: MonitorStreamHandle | null = null;
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

/** 考试是否已结束（时间窗终点已过） */
const examEnded = computed(() => !!monitor.value && getExamStatus(monitor.value.exam) === 'ended');

/**
 * 缺考判定（展示层派生，不改记录状态枚举）：考试时间窗已结束、
 * 该考生却从未开考（not_started）→ 视为缺考。开考后放弃 / 中途退出仍按原状态展示。
 */
function isAbsent(row: ExamMonitorRow): boolean {
  return examEnded.value && row.status === 'not_started';
}

/** 刷新方式徽标（自动刷新关闭时不展示）。 */
const modeBadge = computed<{ label: string; type: 'success' | 'warning' | 'info' | 'danger' } | null>(() => {
  if (!autoRefresh.value) return null;
  if (pushState.value === 'open') {
    return { label: `实时推送 · 每 ${pushSeconds.value} 秒`, type: 'success' };
  }
  if (pushState.value === 'connecting') return { label: '正在建立推送连接…', type: 'warning' };
  if (pushState.value === 'retrying') {
    return { label: `推送重连中 · 已降级轮询 ${POLL_SECONDS} 秒`, type: 'warning' };
  }
  return { label: `轮询 · 每 ${POLL_SECONDS} 秒`, type: 'info' };
});

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

/** 剩余不足 countdownWarningMinutes 分钟标红，不足其 2 倍标橙（与作答页倒计时提醒口径一致） */
function remainingClass(row: ExamMonitorRow): string {
  const left = remainingOf(row);
  const warn = settingsStore.settings.countdownWarningMinutes * 60;
  if (left <= warn) return 'monitor__remaining--danger';
  if (left <= warn * 2) return 'monitor__remaining--warn';
  return '';
}

/** 切屏判定阈值（复用系统设置，与「成绩报表 · 切屏审查」同口径）。 */
const cheatCountThreshold = computed(() => settingsStore.settings.cheatCountThreshold);
const cheatSecondsThreshold = computed(() => settingsStore.settings.cheatSecondsThreshold);

/** 切屏异常行标记（次数或累计离开时长任一达阈值）。 */
function isCheatWarned(row: ExamMonitorRow): boolean {
  return row.cheatCount >= cheatCountThreshold.value || row.cheatSeconds >= cheatSecondsThreshold.value;
}

/** 告警级别：仅决定圆点颜色，文字一律走文本档（语义原色不作文字色）。 */
type AlertLevel = 'error' | 'warning' | 'info';

interface MonitorAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

/**
 * 异常告警派生（全部来自 `examsApi.monitor` 快照，不新增接口/字段）。
 *
 * 规则：
 * 1) 切屏达阈值 → error，未达阈值但有切屏 → warning；
 * 2) 自动交卷（autoSubmitted）→ info；
 * 3) 作答中且剩余不足 `COUNTDOWN_WARNING_MINUTES` 分钟 → warning；
 * 4) 考试进行中仍有考生未开始 → 聚合为一条 info（避免逐人刷屏）。
 * 同一考生命中多条时按优先级只保留最高级别的一条。
 */
const alerts = computed<MonitorAlert[]>(() => {
  const countThreshold = cheatCountThreshold.value;
  const secondsThreshold = cheatSecondsThreshold.value;
  const warnSeconds = COUNTDOWN_WARNING_MINUTES * 60;
  const list: MonitorAlert[] = [];

  for (const row of rows.value) {
    if (row.cheatCount > 0 || row.cheatSeconds > 0) {
      const overSeconds = row.cheatSeconds - secondsThreshold;
      const over = row.cheatCount >= countThreshold || row.cheatSeconds >= secondsThreshold;
      list.push({
        id: `cheat-${row.userId}`,
        level: over ? 'error' : 'warning',
        title: over
          ? `${row.userName} 累计离开 ${row.cheatSeconds} 秒`
          : `${row.userName} 切屏 ${row.cheatCount} 次`,
        detail: over
          ? `切屏 ${row.cheatCount} 次 · ${
              overSeconds > 0 ? `超阈值 ${overSeconds} 秒` : `次数达阈值 ${countThreshold} 次`
            }`
          : `累计离开 ${row.cheatSeconds} 秒，未超阈值`,
      });
      continue;
    }
    if (row.autoSubmitted) {
      list.push({
        id: `auto-${row.userId}`,
        level: 'info',
        title: `${row.userName} 已自动交卷`,
        detail: row.submittedAt ? `交卷时间 ${formatDateTime(row.submittedAt)}` : '到达时限未手动提交',
      });
      continue;
    }
    if (row.status === 'in_progress' && remainingOf(row) <= warnSeconds) {
      list.push({
        id: `time-${row.userId}`,
        level: 'warning',
        title: `${row.userName} 剩余不足 ${COUNTDOWN_WARNING_MINUTES} 分钟`,
        detail: `剩余 ${formatRemaining(remainingOf(row))}，仍在作答`,
      });
    }
  }

  const ongoing = !!monitor.value && getExamStatus(monitor.value.exam) === 'ongoing';
  const notStarted = ongoing ? rows.value.filter((r) => r.status === 'not_started') : [];
  if (notStarted.length > 0) {
    const names = notStarted.slice(0, 3).map((r) => r.userName);
    list.push({
      id: 'not-started',
      level: 'info',
      title: `${notStarted.length} 人开考后仍未进入`,
      detail:
        notStarted.length > names.length ? `${names.join('、')} 等，可线下提醒` : names.join('、'),
    });
  }

  const rank: Record<AlertLevel, number> = { error: 0, warning: 1, info: 2 };
  return list.sort((a, b) => rank[a.level] - rank[b.level]);
});

/** 单屏最多展示的告警条数（超出以「其余 N 条」收尾，避免大屏纵向撑开）。 */
const ALERT_LIMIT = 8;
const visibleAlerts = computed(() => alerts.value.slice(0, ALERT_LIMIT));
const hiddenAlertCount = computed(() => Math.max(0, alerts.value.length - ALERT_LIMIT));

/** 应用一份监考数据（推送/轮询共用）。 */
function apply(data: ExamMonitor): void {
  monitor.value = data;
  tickOffset.value = 0;
}

async function load(silent = false): Promise<void> {
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    apply(await examsApi.monitor(examId));
  } catch {
    /* 错误已由拦截器统一提示 */
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = window.setInterval(() => {
    if (autoRefresh.value) void load(true);
  }, POLL_SECONDS * 1000);
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

/** 建立推送连接（连接成功即停止轮询；不可用时保留轮询）。 */
function startStream(): void {
  stopStream();
  pushState.value = 'connecting';
  pushDetail.value = '';
  // 建立连接期间先按轮询兜底，收到 ready 后自动停止
  startPolling();
  stream = openMonitorStream(examId, {
    onState: (state, detail) => {
      pushState.value = state;
      pushDetail.value = detail ?? '';
    },
    onInfo: (info) => {
      pushSeconds.value = info.intervalSeconds;
      stopPolling();
    },
    onMonitor: (data) => apply(data),
    onServerError: (message) => {
      pushDetail.value = message;
    },
    onUnavailable: (message) => {
      pushDetail.value = message;
      // 推送永久不可用 → 保持轮询降级（已在 startStream 时启动）
      startPolling();
    },
  });
}

function stopStream(): void {
  if (stream) {
    stream.close();
    stream = null;
  }
}

async function onToggleAuto(value: boolean): Promise<void> {
  autoRefresh.value = value;
  if (value) {
    await load(true);
    startStream();
  } else {
    stopStream();
    stopPolling();
    pushState.value = 'stopped';
    pushDetail.value = '';
  }
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

async function handleAllowResume(row: ExamMonitorRow): Promise<void> {
  if (!row.recordId) return;
  try {
    await recordsApi.allowResume(row.recordId);
    ElMessage.success('已放行一次续考');
    void load(true);
  } catch {
    /* 已提示 */
  }
}

onMounted(async () => {
  void settingsStore.load();
  await load();
  startStream();
  tickTimer = window.setInterval(() => {
    tickOffset.value += 1;
  }, 1000);
});

onBeforeUnmount(() => {
  stopStream();
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
        <span class="monitor__meta-item">形式：{{ monitor.exam.examMode === 'open' ? '开卷' : '闭卷' }}</span>
        <span class="monitor__meta-item monitor__meta-item--muted">
          数据时间：{{ formatDateTime(monitor.generatedAt) }}
        </span>
        <span v-if="modeBadge" class="monitor__meta-item">
          <el-tag size="small" effect="plain" :type="modeBadge.type">{{ modeBadge.label }}</el-tag>
          <span v-if="pushDetail" class="monitor__meta-detail">{{ pushDetail }}</span>
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
          <div class="monitor__card-label">{{ examEnded ? '缺考' : '未开始' }}</div>
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

      <el-card class="monitor__alert-card" shadow="never">
        <template #header>
          <div class="monitor__alert-hd">
            <span>异常告警</span>
            <el-tag v-if="alerts.length > 0" size="small" type="danger" effect="light">
              {{ alerts.length }}
            </el-tag>
          </div>
        </template>

        <p v-if="alerts.length === 0" class="monitor__alert-empty">当前无异常，考生作答正常。</p>

        <ul v-else class="monitor__alert-list">
          <li
            v-for="item in visibleAlerts"
            :key="item.id"
            class="monitor__alert-item"
            :class="`monitor__alert-item--${item.level}`"
          >
            <span class="monitor__alert-dot" aria-hidden="true"></span>
            <div class="monitor__alert-body">
              <div class="monitor__alert-title">{{ item.title }}</div>
              <div class="monitor__alert-detail">{{ item.detail }}</div>
            </div>
          </li>
        </ul>

        <div v-if="hiddenAlertCount > 0" class="monitor__alert-more">
          另有 {{ hiddenAlertCount }} 条告警未显示，可在考生表中逐条查看
        </div>
      </el-card>

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
                  isAbsent(row as ExamMonitorRow)
                    ? 'danger'
                    : (row as ExamMonitorRow).status === 'in_progress'
                      ? 'primary'
                      : (row as ExamMonitorRow).status === 'submitted'
                        ? 'success'
                        : 'info'
                "
              >
                {{ isAbsent(row as ExamMonitorRow) ? '缺考' : STATUS_LABELS[(row as ExamMonitorRow).status] }}
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
          <el-table-column class-name="table-actions-cell" label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="(row as ExamMonitorRow).status === 'in_progress'">
                <el-button type="primary" link :icon="Timer" @click="handleExtend(row as ExamMonitorRow)">
                  加时
                </el-button>
                <el-button
                  v-if="settingsStore.settings.abnormalExitResumePolicy === 'admin_required' && !(row as ExamMonitorRow).resumeAllowed"
                  type="primary"
                  link
                  @click="handleAllowResume(row as ExamMonitorRow)"
                >
                  恢复续考
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

    &-detail {
      margin-left: 6px;
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
      color: $color-success-text;
    }

    &--danger {
      color: $color-error-text;
    }
  }

  &__remaining {
    font-variant-numeric: tabular-nums;
    font-weight: 600;

    &--warn {
      color: $color-warning-text;
    }

    &--danger {
      color: $color-error-text;
    }
  }

  &__extra {
    color: $color-primary;
  }

  &__warn-text {
    font-weight: 600;
    color: $color-error-text;
  }

  &__muted {
    color: $text-disabled;
  }

  // ── 异常告警卡 ──────────────────────────────────────────────
  &__alert-card {
    margin-bottom: 14px;
  }

  &__alert-hd {
    display: flex;
    align-items: center;
    gap: 8px;

    .el-tag {
      margin-left: auto;
    }
  }

  &__alert-empty {
    margin: 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__alert-list {
    position: relative;
    margin: 0;
    padding: 0;
    list-style: none;

    // 时间轴发丝线（1px，非强调条）
    &::before {
      content: '';
      position: absolute;
      left: 3.5px;
      top: 6px;
      bottom: 6px;
      width: 1px;
      background: $border-color;
    }

    > li + li {
      margin-top: 12px;
    }
  }

  &__alert-item {
    position: relative;
    padding-left: 18px;

    &--error .monitor__alert-dot {
      background: $color-error;
    }

    &--warning .monitor__alert-dot {
      background: $color-warning;
    }

    &--info .monitor__alert-dot {
      background: $color-info;
    }
  }

  &__alert-dot {
    position: absolute;
    left: 0;
    top: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $text-disabled;
  }

  &__alert-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }

  &__alert-detail {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }

  &__alert-more {
    margin-top: 12px;
    padding-top: 10px;
    font-size: 12px;
    color: $text-secondary;
    border-top: 1px solid $border-color;
  }
}
</style>
