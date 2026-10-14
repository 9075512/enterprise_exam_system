<script setup lang="ts">
/**
 * 系统维护（v1.7④ T5 + v1.8③ U3，管理员）。
 *
 * - 核心表行数统计（含归档量），用于评估数据体量；
 * - 历史成绩归档：把早于保留期的已出成绩记录搬入归档表，减轻业务表体积；
 *   存档记录仍参与成绩报表 / 导出 / 看板与考生历史成绩查询（读路径已 union 归档表）；
 * - 自动归档定时任务（v1.8③）：默认关闭；开启后服务端每日到达指定时点自动执行一次。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Files, Timer } from '@element-plus/icons-vue';
import * as maintenanceApi from '@/api/maintenance';
import { useRequest } from '@/composables/useRequest';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { ArchiveAutoRun, ArchiveResult, MaintenanceStats } from '@/types';

const settingsStore = useSettingsStore();

const { data: stats, loading, refresh } = useRequest<MaintenanceStats>(() => maintenanceApi.stats());

/** 归档表单：保留天数（默认取设置/365）、单次上限 */
const archiveDays = ref<number>(0);
const archiveLimit = ref<number>(2000);
const archiving = ref(false);
const lastResult = ref<ArchiveResult | null>(null);

/* ---------------- 自动归档（v1.8③ U3） ---------------- */
const autoEnabled = ref(false);
const autoHour = ref(3);
const savingAuto = ref(false);
const autoRunning = ref(false);

watch(
  stats,
  (v) => {
    if (!v) return;
    autoEnabled.value = v.autoEnabled;
    autoHour.value = v.autoHour;
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
  if (autoEnabled.value && settingsStore.settings.archiveRetentionDays <= 0) {
    ElMessage.warning('请先设置「归档保留天数」（大于 0），否则自动归档不会执行');
    return;
  }
  savingAuto.value = true;
  try {
    await settingsStore.save({
      ...settingsStore.settings,
      archiveAutoEnabled: autoEnabled.value,
      archiveAutoHour: autoHour.value,
    });
    ElMessage.success('自动归档设置已保存');
    void refresh();
  } catch {
    /* 已由拦截器提示 */
  } finally {
    savingAuto.value = false;
  }
}

/** 立即执行一次自动归档策略（忽略开关与时点，便于验证）。 */
async function handleAutoRun(): Promise<void> {
  autoRunning.value = true;
  try {
    const res = await maintenanceApi.autoRun();
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
    /* 已由拦截器提示 */
  } finally {
    autoRunning.value = false;
  }
}

const retentionHint = computed(() =>
  settingsStore.settings.archiveRetentionDays > 0
    ? `系统设置：保留 ${settingsStore.settings.archiveRetentionDays} 天`
    : '系统设置未启用自动归档（0 天），此处可手动指定保留期',
);

/** 初始化保留天数输入（优先取系统设置，未配置则 365）。 */
function initDays(): void {
  if (archiveDays.value > 0) return;
  archiveDays.value =
    settingsStore.settings.archiveRetentionDays > 0 ? settingsStore.settings.archiveRetentionDays : 365;
}
void initDays();

async function handleArchive(): Promise<void> {
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

  try {
    await ElMessageBox.confirm(
      `将把「考试结束时间早于 ${days} 天前」的已出成绩记录迁入归档表（单次最多 ${limit} 条）。` +
        '归档后成绩报表、导出与考生历史成绩查询结果不变；已有成绩复核申请的记录会自动跳过。',
      '确认执行归档',
      { type: 'warning', confirmButtonText: '确认归档' },
    );
  } catch {
    return;
  }

  archiving.value = true;
  try {
    lastResult.value = await maintenanceApi.archive({ days, limit });
    ElMessage.success(`已归档 ${lastResult.value.archived} 条记录`);
    void refresh();
  } catch {
    /* 已由拦截器提示 */
  } finally {
    archiving.value = false;
  }
}

const tableRows = computed(() => stats.value?.tables ?? []);
</script>

<template>
  <div class="maintenance">
    <PageHeader title="系统维护" description="数据体量统计与历史成绩归档，控制业务表膨胀">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新统计</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !stats" :rows="4" />

    <template v-else>
      <div class="maintenance__cards">
        <div class="maintenance__card">
          <div class="maintenance__card-label">业务表考试记录</div>
          <div class="maintenance__card-value">
            {{ tableRows.find((t) => t.name === 'exam_records')?.rows ?? 0 }}
          </div>
        </div>
        <div class="maintenance__card">
          <div class="maintenance__card-label">历史成绩归档</div>
          <div class="maintenance__card-value maintenance__card-value--primary">
            {{ stats?.archiveTotal ?? 0 }}
          </div>
        </div>
        <div class="maintenance__card">
          <div class="maintenance__card-label">归档保留天数设置</div>
          <div class="maintenance__card-value">
            {{ stats?.retentionDays === 0 ? '未启用' : `${stats?.retentionDays} 天` }}
          </div>
        </div>
        <div class="maintenance__card">
          <div class="maintenance__card-label">统计时间</div>
          <div class="maintenance__card-value maintenance__card-value--small">
            {{ stats ? formatDateTime(stats.generatedAt) : '—' }}
          </div>
        </div>
      </div>

      <el-card class="table-card maintenance__panel" shadow="never">
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

        <el-form inline class="maintenance__form">
          <el-form-item label="启用自动归档">
            <el-switch v-model="autoEnabled" />
          </el-form-item>
          <el-form-item label="每日执行时点">
            <el-select v-model="autoHour" class="maintenance__hour">
              <el-option v-for="h in 24" :key="h - 1" :label="`${String(h - 1).padStart(2, '0')}:00`" :value="h - 1" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="savingAuto" @click="handleSaveAuto">保存设置</el-button>
            <el-button :loading="autoRunning" @click="handleAutoRun">立即执行一次</el-button>
          </el-form-item>
        </el-form>

        <el-alert type="info" :closable="false" show-icon class="maintenance__alert">
          <p>· 自动归档按「保留天数」策略执行，默认<strong>关闭</strong>；开启后由服务端每日到点自动执行一次。</p>
          <p>· 若「保留天数」为 0，自动任务不会执行（可在此页或系统设置中配置）。</p>
          <p>· 「立即执行一次」忽略开关与时点，用于验证策略；执行记录会写入操作审计日志（操作者为「系统自动」）。</p>
        </el-alert>

        <div v-if="stats?.lastAutoArchive" class="maintenance__result">
          上次自动归档：{{ AUTO_REASON_LABEL[stats.lastAutoArchive.reason] }} ·
          {{ formatDateTime(stats.lastAutoArchive.at) }} · 归档 <b>{{ stats.lastAutoArchive.archived }}</b> 条，
          跳过 <b>{{ stats.lastAutoArchive.skipped }}</b> 条，归档表现有
          <b>{{ stats.lastAutoArchive.archiveTotal }}</b> 条。
          <span v-if="!stats.lastAutoArchive.ok" class="maintenance__error">
            （失败：{{ stats.lastAutoArchive.error }}）
          </span>
        </div>
        <div v-else class="maintenance__result">尚未执行过自动归档（服务端重启后该记录会重置）。</div>
      </el-card>

      <el-card class="table-card maintenance__panel" shadow="never">
        <template #header>
          <div class="maintenance__panel-header">
            <span class="maintenance__panel-title">
              <el-icon><Files /></el-icon>
              历史成绩归档
            </span>
            <span class="maintenance__hint">{{ retentionHint }}</span>
          </div>
        </template>

        <el-form inline class="maintenance__form">
          <el-form-item label="保留天数">
            <el-input-number v-model="archiveDays" :min="1" :max="3650" :step="30" />
          </el-form-item>
          <el-form-item label="单次上限">
            <el-input-number v-model="archiveLimit" :min="1" :max="5000" :step="500" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="archiving" @click="handleArchive">执行归档</el-button>
          </el-form-item>
        </el-form>

        <el-alert type="info" :closable="false" show-icon class="maintenance__alert">
          <p>· 仅归档「已出成绩」且考试结束早于保留期的记录；待阅卷记录不参与归档。</p>
          <p>· 存在成绩复核申请的记录会自动跳过，保证复核链路与外键完整性。</p>
          <p>· 归档采用搬移语义（写入归档表后自业务表删除），读路径已合并两表，查询结果不变。</p>
        </el-alert>

        <div v-if="lastResult" class="maintenance__result">
          上次归档结果：成功 <b>{{ lastResult.archived }}</b> 条，跳过
          <b>{{ lastResult.skipped }}</b> 条（存在复核申请），归档截止
          {{ formatDateTime(lastResult.cutoff) }}，归档表现有
          <b>{{ lastResult.archiveTotal }}</b> 条。
        </div>
      </el-card>

      <el-card class="table-card" shadow="never">
        <template #header>
          <span class="maintenance__panel-title">核心表行数统计</span>
        </template>
        <el-table :data="tableRows" stripe>
          <el-table-column prop="label" label="数据对象" min-width="160" />
          <el-table-column prop="name" label="表名" min-width="200" />
          <el-table-column prop="rows" label="行数" width="140" align="right" />
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.maintenance {
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
    margin-bottom: 6px;
  }

  &__hour {
    width: 130px;
  }

  &__error {
    color: $color-error-text;
  }

  &__alert {
    margin: 4px 0 12px;

    p {
      margin: 2px 0;
      font-size: 12px;
      line-height: 1.6;
    }
  }

  &__result {
    font-size: 13px;
    line-height: 1.7;
    color: $text-secondary;

    b {
      color: $text-primary;
    }
  }
}
</style>
