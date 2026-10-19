<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import StatCard from '@/components/common/StatCard.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import { useRequest } from '@/composables/useRequest';
import { practiceMonitorApi } from '@/api/coreFeatures';
import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';
import * as banksApi from '@/api/banks';
import { TOKEN_KEY } from '@/api/http';
import { formatDateTime } from '@/utils/datetime';
import type { PracticeMonitorSummary, PracticeSessionStatus } from '@/types';

const userId = ref(''), departmentId = ref(''), bankId = ref('');
const status = ref<PracticeSessionStatus | ''>('');
const range = ref<[Date, Date] | null>(null);
const tab = ref('sessions');
const transport = ref<'connecting' | 'sse' | 'polling'>('connecting');
let poll: ReturnType<typeof setInterval> | null = null;
let controller: AbortController | null = null;
let disposed = false;
function dbTime(value: Date): string { return value.toISOString().slice(0, 19).replace('T', ' '); }
function params() {
  return { userId: userId.value || undefined, departmentId: departmentId.value || undefined,
    bankId: bankId.value || undefined, status: status.value || undefined,
    startAt: range.value ? dbTime(range.value[0]) : undefined, endAt: range.value ? dbTime(range.value[1]) : undefined };
}
const deps = [userId, departmentId, bankId, status, range];
const { data: summary, error: summaryError, refresh: loadSummary } = useRequest(practiceMonitorApi.overview);
const { data: sessions, loading: sessionsLoading, error: sessionsError, refresh: loadSessions } = useRequest(() => practiceMonitorApi.sessions(params()), deps, { keepPreviousData: false });
const { data: logs, loading: logsLoading, error: logsError, refresh: loadLogs } = useRequest(() => practiceMonitorApi.logs(params()), deps, { keepPreviousData: false });
const { data: options, error: optionsError, refresh: loadOptions } = useRequest(async () => {
  const [users, departments, banks] = await Promise.all([usersApi.list(), departmentsApi.list(), banksApi.list()]);
  return { users, departments, banks: banks.filter(b => b.isLeaf) };
});
const labels: Record<PracticeSessionStatus, string> = { active: '在线', offline: '离线', completed: '已完成', exited: '已退出' };
const modes: Record<string, string> = { sequence: '顺序练习', random: '随机练习', wrong: '错题练习', daily: '每日一练', favorite: '收藏练习' };
const metrics = computed(() => [
  { label: '当前在线', value: summary.value?.activeUsers ?? '—', foot: '90 秒内有心跳的去重用户' },
  { label: '今日活跃', value: summary.value?.dailyActiveUsers ?? '—', foot: 'UTC 当日启动会话的去重用户' },
  { label: '累计会话', value: summary.value?.sessionTotal ?? '—', foot: '全系统全部会话' },
  { label: '累计作答', value: summary.value?.answerTotal ?? '—', foot: '全部会话已答题数之和' },
  { label: '平均正确率', value: summary.value ? summary.value.averageCorrectRate + '%' : '—', foot: '全部会话正确题数 / 已答题数' },
  { label: '错题巩固率', value: summary.value ? summary.value.wrongConsolidationRate + '%' : '—', foot: '有连续答对记录的错题占比' },
]);
async function load(): Promise<void> { await Promise.all([loadSummary(), loadSessions(), loadLogs()]); }
function reset(): void { userId.value = ''; departmentId.value = ''; bankId.value = ''; status.value = ''; range.value = null; }
function startPolling(): void {
  if (disposed) return;
  transport.value = 'polling';
  if (!poll) poll = setInterval(() => void load(), 15000);
}
async function connect(): Promise<void> {
  const ownController = new AbortController();
  controller = ownController;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch('/api/practice-monitor/stream', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: ownController.signal,
    });
    if (!response.ok || !response.body) throw new Error('Stream unavailable');
    transport.value = 'sse';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done || disposed) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.includes('event: overview')) continue;
        const line = part.split(/\r?\n/).find(item => item.startsWith('data:'));
        if (line) {
          summary.value = JSON.parse(line.slice(5).trim()) as PracticeMonitorSummary;
          summaryError.value = null;
          void loadSessions();
          void loadLogs();
        }
      }
    }
    if (!ownController.signal.aborted) startPolling();
  } catch { if (!ownController.signal.aborted) startPolling(); }
}
onMounted(() => void connect());
onBeforeUnmount(() => { disposed = true; controller?.abort(); if (poll) clearInterval(poll); });
</script>

<template>
  <div data-ui-layout="list" data-ui-page="PracticeMonitorPage" class="admin-page practice-monitor">
    <PageHeader title="练题监控" description="在线状态依据 30 秒心跳判定；超过 90 秒无心跳显示离线">
      <template #actions><el-tag :type="transport === 'sse' ? 'success' : 'warning'">{{ transport === 'sse' ? '实时推送' : transport === 'connecting' ? '连接中' : '15 秒轮询' }}</el-tag><el-button :icon="Refresh" @click="load">刷新</el-button></template>
    </PageHeader>
    <div class="admin-toolbar"><span class="admin-scope">全系统概览 · 不受下方筛选影响 · 更新于 {{ summary ? formatDateTime(summary.generatedAt) : '—' }}</span><el-button v-if="summaryError" link type="primary" @click="loadSummary">概览加载失败，重试</el-button></div>
    <div class="practice-monitor__metrics"><StatCard v-for="item in metrics" :key="item.label" :label="item.label" :value="summaryError ? '—' : item.value"><template #foot>{{ item.foot }}</template></StatCard></div>
    <el-card class="table-card" shadow="never">
      <div class="practice-monitor__filters">
        <el-select v-model="userId" clearable filterable placeholder="全部人员" aria-label="人员范围"><el-option v-for="u in options?.users ?? []" :key="u.id" :label="u.name" :value="u.id" /></el-select>
        <el-select v-model="departmentId" clearable filterable placeholder="全部科室" aria-label="科室范围"><el-option v-for="d in options?.departments ?? []" :key="d.id" :label="d.name" :value="d.id" /></el-select>
        <el-select v-model="bankId" clearable filterable placeholder="全部题库" aria-label="题库范围"><el-option v-for="b in options?.banks ?? []" :key="b.id" :label="b.name" :value="b.id" /></el-select>
        <el-select v-model="status" clearable placeholder="全部会话状态" :disabled="tab === 'logs'" aria-label="会话状态"><el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" /></el-select>
        <el-date-picker v-model="range" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至" />
        <el-button @click="reset">重置</el-button><TableDensityToggle />
      </div>
      <el-alert v-if="optionsError" type="warning" :closable="false" title="筛选选项加载失败"><el-button link type="primary" @click="loadOptions">重新加载选项</el-button></el-alert>
      <el-tabs v-model="tab"><el-tab-pane label="会话记录" name="sessions">
        <p class="admin-scope">当前筛选范围 · 按开始时间倒序，最多 1,000 条 · 时间筛选按会话开始时间 · 已返回 {{ sessionsError ? '—' : sessions?.length ?? 0 }} 条</p>
        <RequestError v-if="sessionsError" text="练题会话加载失败" @retry="loadSessions" />
        <el-table v-else v-loading="sessionsLoading" :data="sessions ?? []" row-key="id">
          <el-table-column prop="userName" label="用户" width="120" show-overflow-tooltip /><el-table-column prop="departmentName" label="科室" min-width="140" show-overflow-tooltip />
          <el-table-column prop="bankName" label="题库" min-width="160" show-overflow-tooltip /><el-table-column label="方式" width="110"><template #default="{ row }">{{ modes[row.mode] || row.mode }}</template></el-table-column>
          <el-table-column label="进度" width="120"><template #default="{ row }">{{ row.answeredCount }} / {{ row.questionCount }}</template></el-table-column>
          <el-table-column label="正确率" width="100"><template #default="{ row }">{{ row.answeredCount ? Math.round(row.correctCount / row.answeredCount * 100) + '%' : '—' }}</template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ labels[row.status as PracticeSessionStatus] }}</el-tag></template></el-table-column>
          <el-table-column label="开始时间" width="180"><template #default="{ row }">{{ formatDateTime(row.startedAt) }}</template></el-table-column>
          <el-table-column label="最后心跳" width="180"><template #default="{ row }">{{ formatDateTime(row.lastSeenAt) }}</template></el-table-column>
          <template #empty><EmptyState text="当前筛选范围暂无练题会话" :filtered="Boolean(userId || departmentId || bankId || status || range)" @clear="reset" /></template>
        </el-table>
      </el-tab-pane><el-tab-pane label="逐题作答日志" name="logs">
        <p class="admin-scope">当前人员、科室、题库与作答时间范围 · 最多返回最近 5,000 条 · 会话状态不参与日志筛选</p>
        <RequestError v-if="logsError" text="作答日志加载失败" @retry="loadLogs" />
        <el-table v-else v-loading="logsLoading" :data="logs ?? []">
          <el-table-column prop="userName" label="用户" width="120" /><el-table-column prop="bankName" label="题库" min-width="150" show-overflow-tooltip />
          <el-table-column prop="stem" label="题干" min-width="280" show-overflow-tooltip />
          <el-table-column label="结果" width="90"><template #default="{ row }"><el-tag :type="row.correct ? 'success' : 'danger'">{{ row.correct ? '正确' : '错误' }}</el-tag></template></el-table-column>
          <el-table-column label="作答" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ Array.isArray(row.answer) ? row.answer.join('、') : row.answer }}</template></el-table-column>
          <el-table-column label="作答时间" width="180"><template #default="{ row }">{{ formatDateTime(row.answeredAt) }}</template></el-table-column>
          <template #empty><EmptyState text="当前筛选范围暂无作答日志" :filtered="Boolean(userId || departmentId || bankId || range)" @clear="reset" /></template>
        </el-table>
      </el-tab-pane></el-tabs>
    </el-card>
  </div>
</template>
<style scoped lang="scss">
.practice-monitor { container: practice-monitor / inline-size; }
.practice-monitor__metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.practice-monitor__filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: center; gap: 12px; margin-bottom: 20px; > .el-select { width: 100%; min-width: 0; } :deep(.el-date-editor) { width: 100%; max-width: 100%; min-width: 0; grid-column: span 2; } > .el-button { justify-self: start; margin-left: 0; } > :deep(.density-toggle) { justify-self: end; } }
@container practice-monitor (max-width: 700px) { .practice-monitor__metrics, .practice-monitor__filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container practice-monitor (max-width: 420px) { .practice-monitor__filters { grid-template-columns: minmax(0, 1fr); :deep(.el-date-editor) { grid-column: auto; } > :deep(.density-toggle) { justify-self: start; } } }
</style>
