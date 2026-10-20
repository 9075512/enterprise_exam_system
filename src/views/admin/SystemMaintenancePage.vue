<script setup lang="ts">
/**
 * 系统维护（v1.7④ T5 + v1.8③ U3，管理员）。
 *
 * - 核心表行数统计（含归档量），用于评估数据体量；
 * - 历史成绩归档：把早于保留期的已出成绩记录搬入归档表，减轻业务表体积；
 *   存档记录仍参与成绩报表 / 导出 / 看板与考生历史成绩查询（读路径已 union 归档表）；
 * - 自动归档定时任务（v1.8③）：默认关闭；开启后服务端每日到达指定时点自动执行一次。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Files, Timer } from '@element-plus/icons-vue';
import * as maintenanceApi from '@/api/maintenance';
import { useRequest } from '@/composables/useRequest';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { ArchiveAutoRun, ArchiveResult, MaintenanceStats } from '@/types';

const settingsStore = useSettingsStore();

const { data: stats, loading, error, refresh } = useRequest<MaintenanceStats>(() => maintenanceApi.stats());
const settingsLoading = ref(true);
const settingsError = ref(false);
async function loadSettings(): Promise<void> {
  settingsLoading.value = true;
  try {
    await settingsStore.load();
    settingsError.value = !settingsStore.ready;
  } catch {
    settingsError.value = true;
  } finally {
    settingsLoading.value = false;
  }
}
onMounted(() => { void loadSettings(); });

/** 归档表单：保留天数（默认取设置/365）、单次上限 */
const archiveDays = ref<number>(365);
const archiveLimit = ref<number>(2000);
const archiving = ref(false);
const lastResult = ref<ArchiveResult | null>(null);

/* ---------------- 自动归档（v1.8③ U3） ---------------- */
const autoEnabled = ref(false);
const autoHour = ref(3);
const savingAuto = ref(false);
const autoRunning = ref(false);
const archiveError = ref('');
const autoSaveError = ref('');
const autoRunError = ref('');
const lastAutoRun = ref<ArchiveAutoRun | null>(null);
const autoResult = computed(() => {
  const saved = stats.value?.lastAutoArchive;
  const local = lastAutoRun.value;
  return !local || (saved && Date.parse(saved.at) >= Date.parse(local.at)) ? saved : local;
});
const taskBusy = computed(() => archiving.value || savingAuto.value || autoRunning.value);
const controlsDisabled = computed(() => taskBusy.value || loading.value || !!error.value || !stats.value);
const autoDirty = computed(() => !!stats.value && (autoEnabled.value !== stats.value.autoEnabled || autoHour.value !== stats.value.autoHour));

function restoreAutoSettings(): void {
  if (!stats.value || controlsDisabled.value) return;
  autoEnabled.value = stats.value.autoEnabled;
  autoHour.value = stats.value.autoHour;
  autoSaveError.value = '';
}

watch(
  stats,
  (v, previous) => {
    if (!v) return;
    // 刷新快照时保留未保存的设置；首次进入再初始化手动参数。
    if (!previous) archiveDays.value = v.retentionDays > 0 ? v.retentionDays : 365;
    if (!previous || (autoEnabled.value === previous.autoEnabled && autoHour.value === previous.autoHour)) {
      autoEnabled.value = v.autoEnabled;
      autoHour.value = v.autoHour;
    }
  },
  { immediate: true },
);

/** 自动归档结果的原因文案。 */
const AUTO_REASON_LABEL: Record<ArchiveAutoRun['reason'], string> = {
  scheduled: '定时触发',
  manual: '手动触发',
  disabled: '开关关闭（未执行）',
  'retention-disabled': '保留天数为 0（未执行）',
  error: '执行失败',
};

async function handleSaveAuto(): Promise<void> {
  if (controlsDisabled.value || settingsLoading.value || settingsError.value) return;
  if (autoEnabled.value && settingsStore.settings.archiveRetentionDays <= 0) {
    ElMessage.warning('请先设置「归档保留天数」（大于 0），否则自动归档不会执行');
    return;
  }
  savingAuto.value = true;
  autoSaveError.value = '';
  try {
    await settingsStore.save({
      ...settingsStore.settings,
      archiveAutoEnabled: autoEnabled.value,
      archiveAutoHour: autoHour.value,
    });
    ElMessage.success('自动归档设置已保存');
    void refresh();
  } catch {
    autoSaveError.value = '保存失败，已保留本次修改，请重试。';
  } finally {
    savingAuto.value = false;
  }
}

/** 立即执行一次自动归档策略（忽略开关与时点，便于验证）。 */
async function handleAutoRun(): Promise<void> {
  if (controlsDisabled.value) return;
  autoRunning.value = true;
  autoRunError.value = '';
  try {
    const res = await maintenanceApi.autoRun();
    lastAutoRun.value = res;
    if (!res.triggered) {
      ElMessage.warning(
        res.reason === 'retention-disabled'
          ? '归档保留天数为 0，未执行（请先设置保留天数）'
          : '当前未启用自动归档，未执行',
      );
    } else if (res.ok) {
      ElMessage.success(`自动归档完成：归档 ${res.archived} 条，跳过 ${res.skipped} 条`);
    } else {
      ElMessage.error(res.error || '自动归档失败');
    }
    void refresh();
  } catch {
    autoRunError.value = '本次执行失败，请重新执行；未保存的设置不会应用到任务。';
  } finally {
    autoRunning.value = false;
  }
}

const retentionHint = computed(() =>
  stats.value && stats.value.retentionDays > 0
    ? `已保存策略：保留 ${stats.value.retentionDays} 天`
    : '已保存保留天数为 0，本次可单独指定保留期',
);

async function handleArchive(): Promise<void> {
  if (controlsDisabled.value) return;
  const days = Number(archiveDays.value);
  const limit = Number(archiveLimit.value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    ElMessage.warning('归档保留天数必须在 1~3650 天之间');
    return;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    ElMessage.warning('单次归档上限必须在 1~5000 之间');
    return;
  }

  archiving.value = true;
  archiveError.value = '';
  try {
    await ElMessageBox.confirm(
      `将归档「考试结束时间早于 ${days} 天前」的已出成绩记录（本次最多 ${limit} 条）。` +
        '归档后成绩报表、导出与考生历史成绩查询结果不变；已有成绩复核申请的记录会自动跳过。',
      '确认执行归档',
      { type: 'warning', confirmButtonText: '确认归档' },
    );
  } catch {
    archiving.value = false;
    return;
  }

  try {
    lastResult.value = await maintenanceApi.archive({ days, limit });
    ElMessage.success(`已归档 ${lastResult.value.archived} 条记录`);
    void refresh();
  } catch {
    archiveError.value = '本次归档失败，参数已保留，请重试。';
  } finally {
    archiving.value = false;
  }
}

const tableRows = computed(() => stats.value?.tables ?? []);

/* ==================================================================
 * 新增卡片（对齐设计稿 maintenance.html：数据归档策略 / 执行记录 / 危险操作）
 * 只读展示，复用页面既有状态，不新增接口。
 * ================================================================== */

/**
 * 当前生效策略只读展示服务端快照；不把本次参数或未保存设置当作已生效值。
 * 接口没有逐对象策略字段，逐对象行数见下方「核心表行数统计」。
 */
const policyItems = computed<Array<{ key: string; value: string }>>(() => [
  { key: '归档保留天数', value: stats.value ? (stats.value.retentionDays > 0 ? `${stats.value.retentionDays} 天` : '未启用（0 天）') : '—' },
  { key: '每日执行时点', value: stats.value ? `${String(stats.value.autoHour).padStart(2, '0')}:00` : '—' },
  { key: '自动归档', value: stats.value ? (stats.value.autoEnabled ? '已启用' : '未启用') : '—' },
]);

/** 执行记录条目（数据全部来自真实归档结果） */
interface ArchiveRunRecord {
  key: string;
  title: string;
  desc: string;
  tone: 'done' | 'err' | 'idle';
}

/**
 * 「执行记录」卡：本次会话的手动归档结果（lastResult）+ 服务端最近一次自动归档
 * （stats.lastAutoArchive）。均为已有状态，服务端未保留历史列表。
 */
const runRecords = computed<ArchiveRunRecord[]>(() => {
  const records: ArchiveRunRecord[] = [];

  const manual = lastResult.value;
  if (manual) {
    records.push({
      key: 'manual',
      title: `手动归档完成 · 归档 ${manual.archived} 条`,
      desc: `${formatDateTime(manual.cutoff)} 截止 · 跳过 ${manual.skipped} 条 · 归档表现有 ${manual.archiveTotal} 条`,
      tone: 'done',
    });
  }

  const auto = autoResult.value;
  if (auto) {
    records.push({
      key: 'auto',
      title: `${AUTO_REASON_LABEL[auto.reason]} · 归档 ${auto.archived} 条`,
      desc:
        `${formatDateTime(auto.at)} · 跳过 ${auto.skipped} 条` +
        (auto.ok ? '' : ` · ${auto.error || '执行失败'}`),
      tone: !auto.triggered ? 'idle' : auto.ok ? 'done' : 'err',
    });
  }

  return records;
});
</script>

<template>
  <div data-ui-layout="operations" data-ui-page="SystemMaintenancePage" class="maintenance">
    <PageHeader title="系统维护" description="全系统业务表体量与历史成绩归档；统计时间以下方服务端快照为准">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" :disabled="taskBusy" @click="refresh">刷新统计</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !stats" :rows="4" />

    <el-card v-else-if="error && !stats" shadow="never"><RequestError text="维护统计加载失败" @retry="refresh" /></el-card>
    <template v-else>
      <RequestError v-if="error" text="统计刷新失败，当前展示上次成功快照；任务参数已保留" @retry="refresh" />
      <p v-else-if="loading" class="maintenance__snapshot-note" role="status">正在刷新，当前展示上次成功快照。</p>
      <div class="maintenance__cards">
        <div class="maintenance__card">
          <div class="maintenance__card-label">业务表考试记录</div>
          <div class="maintenance__card-value">
            {{ tableRows.find((t) => t.name === 'exam_records')?.rows ?? '—' }}
          </div>
        </div>
        <div class="maintenance__card">
          <div class="maintenance__card-label">历史成绩归档</div>
          <div class="maintenance__card-value maintenance__card-value--primary">
            {{ stats?.archiveTotal ?? '—' }}
          </div>
        </div>
        <div class="maintenance__card">
          <div class="maintenance__card-label">归档保留天数设置</div>
          <div class="maintenance__card-value">
            {{ stats ? (stats.retentionDays === 0 ? '未启用' : `${stats.retentionDays} 天`) : '—' }}
          </div>
        </div>
        <div class="maintenance__card maintenance__card--time">
          <div class="maintenance__card-label">统计时间</div>
          <div class="maintenance__card-value maintenance__card-value--small">
            {{ stats ? formatDateTime(stats.generatedAt) : '—' }}
          </div>
        </div>
      </div>

      <!-- 数据归档策略（对齐设计稿 maintenance.html）：只读展示页面既有策略字段 -->
      <el-card class="table-card maintenance__panel" shadow="never">
        <template #header>
          <div class="maintenance__panel-header">
            <span class="maintenance__panel-title">
              <el-icon><Timer /></el-icon>
              当前生效策略
            </span>
            <span class="maintenance__hint">全系统已保存策略 · 以服务端统计快照为准</span>
          </div>
        </template>

        <div class="maintenance__policy">
          <div v-for="item in policyItems" :key="item.key" class="maintenance__policy-item">
            <span class="maintenance__policy-k">{{ item.key }}</span>
            <span class="maintenance__policy-v">{{ item.value }}</span>
          </div>
        </div>

        <!--
          设计稿该卡为「按数据对象逐行配置保留天数 / 单次上限 / 每日时点 + 自动归档开关」。
          本工程接口只提供全局策略字段（无逐对象策略），故此处呈现全局策略；
          各数据对象与行数见下方「核心表行数统计」卡，避免重复列表。
        -->
        <p class="maintenance__policy-tip">
          下方未保存的修改及手动归档参数不会改变此处。全局保留天数在系统设置中配置。
        </p>
      </el-card>

      <div class="maintenance__tasks">
      <el-card class="maintenance__panel maintenance__task" shadow="never">
        <template #header>
          <div class="maintenance__panel-header">
            <span class="maintenance__panel-title">
              <el-icon><Timer /></el-icon>
              自动归档（定时任务）
            </span>
            <el-tag size="small" :type="stats?.autoEnabled ? 'success' : 'info'">
              {{ stats?.autoEnabled ? '已开启' : '未开启' }}
            </el-tag>
          </div>
        </template>

        <RequestError v-if="settingsError" text="归档设置加载失败，暂不能保存；可重新加载" @retry="loadSettings" />
        <p v-else-if="settingsLoading" class="maintenance__snapshot-note" role="status">归档设置加载中，暂不能保存。</p>
        <p v-if="autoDirty" class="maintenance__draft-note" role="status">有未保存修改，立即执行仍使用已保存策略。</p>
        <el-form :disabled="controlsDisabled" label-position="top" class="maintenance__form">
          <el-form-item label="启用自动归档">
            <el-switch v-model="autoEnabled" aria-label="启用自动归档" />
          </el-form-item>
          <el-form-item label="每日执行时点">
            <el-select v-model="autoHour" class="maintenance__hour">
              <el-option v-for="h in 24" :key="h - 1" :label="`${String(h - 1).padStart(2, '0')}:00`" :value="h - 1" />
            </el-select>
          </el-form-item>
          <el-form-item class="maintenance__form-actions">
            <el-button type="primary" :loading="savingAuto" :disabled="controlsDisabled || settingsLoading || settingsError" @click="handleSaveAuto">保存设置</el-button>
            <el-button :disabled="controlsDisabled || !autoDirty" @click="restoreAutoSettings">恢复已保存设置</el-button>
          </el-form-item>
          <el-form-item class="maintenance__form-actions">
            <el-button :loading="autoRunning" @click="handleAutoRun">立即执行一次</el-button>
          </el-form-item>
        </el-form>
        <p v-if="autoSaveError" class="maintenance__error" role="status">{{ autoSaveError }}</p>
        <p v-if="autoRunError" class="maintenance__error" role="status">{{ autoRunError }}</p>

        <el-alert type="info" :closable="false" show-icon class="maintenance__alert">
          <span class="maintenance__note-line">· 自动归档按「保留天数」策略执行，默认<strong>关闭</strong>；开启后由服务端每日到点自动执行一次。</span>
          <span class="maintenance__note-line">· 若全局保留天数为 0，自动任务不会执行；请在系统设置中配置。</span>
          <span class="maintenance__note-line">· 「立即执行一次」忽略开关与时点，用于验证策略；执行记录会写入操作审计日志（操作者为「系统自动」）。</span>
        </el-alert>

        <div v-if="autoResult" class="maintenance__result">
          最近一次策略执行：{{ AUTO_REASON_LABEL[autoResult.reason] }} ·
          {{ formatDateTime(autoResult.at) }} · 归档 <b>{{ autoResult.archived }}</b> 条，
          跳过 <b>{{ autoResult.skipped }}</b> 条，归档表现有
          <b>{{ autoResult.archiveTotal }}</b> 条。
          <span v-if="!autoResult.ok" class="maintenance__error">
            （失败：{{ autoResult.error }}）
          </span>
        </div>
        <div v-else class="maintenance__result">尚未执行过自动归档（服务端重启后该记录会重置）。</div>
      </el-card>

      <el-card class="maintenance__panel maintenance__task" shadow="never">
        <template #header>
          <div class="maintenance__panel-header">
            <span class="maintenance__panel-title">
              <el-icon><Files /></el-icon>
              历史成绩归档
            </span>
            <span class="maintenance__hint">{{ retentionHint }}</span>
          </div>
        </template>

        <p class="maintenance__snapshot-note">以下参数仅用于本次手动归档。</p>
        <el-form :disabled="controlsDisabled" label-position="top" class="maintenance__form">
          <el-form-item label="保留天数">
            <el-input-number v-model="archiveDays" :min="1" :max="3650" :step="30" />
          </el-form-item>
          <el-form-item label="单次上限">
            <el-input-number v-model="archiveLimit" :min="1" :max="5000" :step="500" />
          </el-form-item>
          <el-form-item class="maintenance__form-actions">
            <el-button type="primary" :loading="archiving" @click="handleArchive">执行归档</el-button>
          </el-form-item>
        </el-form>
        <p v-if="archiveError" class="maintenance__error" role="status">{{ archiveError }}</p>

        <el-alert type="info" :closable="false" show-icon class="maintenance__alert">
          <span class="maintenance__note-line">· 仅归档「已出成绩」且考试结束早于保留期的记录；待阅卷记录不参与归档。</span>
          <span class="maintenance__note-line">· 存在成绩复核申请的记录会自动跳过，保留完整复核记录。</span>
          <span class="maintenance__note-line">· 归档后仍可查询历史成绩，成绩报表和导出继续包含这些记录。</span>
        </el-alert>

        <div v-if="lastResult" class="maintenance__result">
          上次归档结果：成功 <b>{{ lastResult.archived }}</b> 条，跳过
          <b>{{ lastResult.skipped }}</b> 条（存在复核申请），归档截止
          {{ formatDateTime(lastResult.cutoff) }}，归档表现有
          <b>{{ lastResult.archiveTotal }}</b> 条。
        </div>
      </el-card>
      </div>

      <el-card class="table-card" shadow="never">
        <template #header>
          <span class="maintenance__panel-title">核心表行数统计</span>
        </template>
        <el-table :data="tableRows" stripe>
          <el-table-column prop="label" label="数据对象" min-width="160" />
          <el-table-column prop="name" label="表名" min-width="200" />
          <el-table-column prop="rows" label="行数" width="140" align="right" />
          <template #empty><EmptyState text="暂无核心表统计" /></template>
        </el-table>
      </el-card>

      <div class="maintenance__grid">
        <!-- 执行记录（对齐设计稿 maintenance.html）：数据来自真实归档结果 -->
        <el-card class="table-card maintenance__panel" shadow="never">
          <template #header>
            <span class="maintenance__panel-title">执行记录</span>
          </template>

          <div v-if="runRecords.length > 0" class="maintenance__timeline">
            <div
              v-for="record in runRecords"
              :key="record.key"
              class="maintenance__tl"
              :class="`maintenance__tl--${record.tone}`"
            >
              <div class="maintenance__tl-title">{{ record.title }}</div>
              <div class="maintenance__tl-desc">{{ record.desc }}</div>
            </div>
          </div>
          <p v-else class="maintenance__empty">尚无归档执行记录（服务端进程重启后该记录会重置）。</p>
        </el-card>

        <!-- 危险操作（对齐设计稿 maintenance.html）：首项用语义色提示 -->
        <el-card class="table-card maintenance__panel" shadow="never">
          <template #header>
            <div class="maintenance__panel-header">
              <span class="maintenance__panel-title">危险操作</span>
              <el-tag size="small" type="danger" effect="plain">需二次确认</el-tag>
            </div>
          </template>

          <div class="maintenance__danger maintenance__danger--severe">
            <div>
              <div class="maintenance__danger-title maintenance__danger-title--severe">清空全部练题作答明细</div>
              <div class="maintenance__danger-desc maintenance__danger-desc--severe">
                不可恢复 · 会影响练题端学习报告与错题本
              </div>
            </div>
            <span class="maintenance__danger-badge maintenance__danger-badge--severe">未开放</span>
          </div>

          <!--
            以下两项亦为设计稿预留能力。src/api/maintenance.ts 仅提供
            stats / archive / auto-run，无对应接口且不允许新增 API 调用，
            故按说明性文案呈现，避免放「点了没反应」的假按钮。
          -->
          <div class="maintenance__danger">
            <div>
              <div class="maintenance__danger-title">重建统计缓存</div>
              <div class="maintenance__danger-desc">重算成绩报表与错题排行，当前暂未开放</div>
            </div>
            <span class="maintenance__danger-badge">未开放</span>
          </div>

          <div class="maintenance__danger">
            <div>
              <div class="maintenance__danger-title">导出全量备份</div>
              <div class="maintenance__danger-desc">生成数据库快照，文件较大，需预留磁盘空间</div>
            </div>
            <span class="maintenance__danger-badge">未开放</span>
          </div>
        </el-card>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.maintenance {
  &__snapshot-note { margin: 0 0 14px; color: $text-secondary; font-size: 12px; }
  &__draft-note { margin: 0 0 14px; padding: 10px 12px; border-radius: $radius-sm; color: $color-warning-text; background: $color-warning-bg; font-size: 12px; }
  &__tasks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; margin-bottom: 16px; }
  &__tasks > &__panel { min-width: 0; margin-bottom: 0; }
  &__cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  &__card {
    padding: 14px 16px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
  }

  &__card-label {
    margin-bottom: 6px;
    font-size: 13px;
    color: $text-secondary;
  }

  &__card-value {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
    color: $text-primary;

    &--primary {
      color: $color-primary;
    }

    &--small {
      font-size: 14px;
      font-weight: 500;
    }
  }

  &__panel {
    margin-bottom: 14px;
  }

  &__panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    overflow-wrap: anywhere;
  }

  &__panel-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: $text-primary;
  }

  &__hint {
    font-size: 12px;
    color: $text-secondary;
  }

  &__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 6px;
    :deep(.el-form-item) { min-width: 0; margin: 0; }
    :deep(.el-form-item__content) { min-width: 0; }
    :deep(.el-input-number), :deep(.el-select) { width: 100%; }
  }
  &__form-actions { grid-column: 1 / -1; :deep(.el-form-item__content) { display: flex; flex-wrap: wrap; gap: 8px; } :deep(.el-button + .el-button) { margin: 0; } }

  &__hour {
    width: 130px;
  }

  &__error {
    color: $color-error-text;
  }

  &__alert {
    margin: 4px 0 12px;

    .maintenance__note-line {
      display: block;
      margin: 2px 0;
      font-size: 12px;
      line-height: 1.6;
    }
  }

  &__result {
    font-size: 13px;
    line-height: 1.7;
    color: $text-secondary;
    overflow-wrap: anywhere;

    b {
      color: $text-primary;
    }
  }

  /* ---------------- 数据归档策略卡（对齐设计稿 .card__hd + 策略字段） ---------------- */
  &__policy {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  &__policy-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: $bg-page;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
  }

  &__policy-k {
    font-size: 12px;
    color: $text-secondary;
  }

  &__policy-v {
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
  }

  &__policy-tip {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }

  /* ---------------- 执行记录 / 危险操作两列卡 ---------------- */
  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 14px;

    .maintenance__panel {
      margin-bottom: 0;
    }
  }

  /* 执行记录时间线：左侧实心圆点，不用阴影 */
  &__timeline {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__tl {
    position: relative;
    padding-left: 18px;

    &::before {
      content: '';
      position: absolute;
      top: 4px;
      left: 0;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: $color-success;
    }

    &--err::before {
      background: $color-error;
    }
    &--idle::before { background: $text-secondary; }
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
    overflow-wrap: anywhere;
  }

  &__empty {
    margin: 0;
    padding: 8px 0;
    font-size: 12.5px;
    color: $text-secondary;
  }

  /* 危险操作项：首项走语义色（底 $color-error-bg + 文字 $color-error-text） */
  &__danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    > div { min-width: 0; overflow-wrap: anywhere; }

    & + & {
      margin-top: 12px;
    }

    &--severe {
      background: $color-error-bg;
      border-color: $color-error-border;
    }
  }

  &__danger-title {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;

    &--severe {
      color: $color-error-text;
    }
  }

  &__danger-desc {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;

    &--severe {
      color: $color-error-text;
    }
  }

  &__danger-badge {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;

    &--severe {
      color: $color-error-text;
    }
  }
}

/* 窄屏：执行记录 / 危险操作回到单列 */
@media (max-width: 1200px) {
  .maintenance__grid, .maintenance__tasks {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 900px) {
  .maintenance__cards, .maintenance__policy { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .maintenance__policy-item:first-child { grid-column: 1 / -1; }
  .maintenance__card { min-width: 0; padding: 16px; }
  .maintenance__card-label { font-size: 12px; }
  .maintenance__card-value { overflow-wrap: anywhere; }
  .maintenance__card-value--small { font-size: 13px; line-height: 1.7; }
  .maintenance__form { grid-template-columns: minmax(0, 1fr); }
  .maintenance__form :deep(.el-switch) { min-height: 44px; }
  .maintenance__form :deep(.el-input-number) { height: 44px; line-height: 44px; }
  .maintenance__form :deep(.el-input-number__decrease), .maintenance__form :deep(.el-input-number__increase) { top: 0; bottom: 0; width: 44px; height: 44px; line-height: 44px; }
  .maintenance__form :deep(.el-input-number .el-input__wrapper) { padding-inline: 44px; min-height: 44px; }
  .maintenance__alert :deep(.el-alert__content) { min-width: 0; }
}
</style>
