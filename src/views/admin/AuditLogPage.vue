<script setup lang="ts">
/**
 * 审计日志（v1.6④，管理员；v1.7② 支持导出 xlsx/csv 与按保留策略清理）。
 * 关键操作留痕可查：动作 / 目标类型 / 关键字 / 时间范围过滤 + 分页。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, Delete, Refresh, Search, Setting } from '@element-plus/icons-vue';
import * as auditApi from '@/api/audit';
import { usePagination } from '@/composables/usePagination';
import { useConfirm } from '@/composables/useConfirm';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_EXPORT_COLUMNS,
  AUDIT_TARGET_TYPE_LABELS,
  AUDIT_TARGET_TYPE_OPTIONS,
  DEFAULT_AUDIT_EXPORT_KEYS,
} from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import type { AuditAction, AuditLog, AuditTargetType } from '@/types';

const { confirm } = useConfirm();

const filters = reactive<{
  action: AuditAction | '';
  targetType: AuditTargetType | '';
  keyword: string;
  dateRange: [Date, Date] | null;
}>({
  action: '',
  targetType: '',
  keyword: '',
  dateRange: null,
});

/** 当前过滤条件 → 接口参数（列表与导出共用，保证「所见即所得」） */
function currentParams(page?: number, pageSize?: number): auditApi.AuditListParams {
  return {
    action: filters.action || undefined,
    targetType: filters.targetType || undefined,
    keyword: filters.keyword.trim() || undefined,
    from: filters.dateRange?.[0]?.toISOString(),
    to: filters.dateRange?.[1]?.toISOString(),
    page,
    pageSize,
  };
}

const {
  list: logs,
  page,
  pageSize,
  total,
  loading,
  error,
  load,
  reset,
  onPageChange,
  onSizeChange,
} = usePagination<AuditLog>((p, ps) => auditApi.listAuditLogs(currentParams(p, ps)));

function handleSearch(): void {
  reset();
}

function handleReset(): void {
  filters.action = '';
  filters.targetType = '';
  filters.keyword = '';
  filters.dateRange = null;
  reset();
}

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() =>
  Boolean(filters.action || filters.targetType || filters.keyword.trim() || filters.dateRange),
);

function detailText(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail);
  if (keys.length === 0) return '—';
  return keys.map((k) => `${k}: ${String(detail[k])}`).join('；');
}

/* ------------------------------ 日志详情（对齐设计稿 audit.html 右侧卡） ------------------------------ */
/**
 * 选中行 → 右侧「日志详情」卡（只读）。
 * 数据全部来自表格已有行字段（id / actorName / actorId / action / targetType /
 * targetName / targetId / detail / createdAt），不新增接口。
 * 说明：设计稿卡内的「IP / 客户端」在本工程的 AuditLog 模型中没有对应字段，
 * 故渲染为说明性文案（见模板），待接口补充后再落值。
 */
const selectedLog = ref<AuditLog | null>(null);
/** 详情弹窗（点击行打开，替代旧版右侧常驻详情卡） */
const detailVisible = ref(false);

function handleRowClick(row: AuditLog): void {
  selectedLog.value = row;
  detailVisible.value = true;
}

/* ------------------------------ 导出（v1.7②） ------------------------------ */
/** 导出字段勾选（默认列集） */
const exportColumns = ref<string[]>([...DEFAULT_AUDIT_EXPORT_KEYS]);
const allColumnsSelected = computed(() => exportColumns.value.length === AUDIT_EXPORT_COLUMNS.length);
const someColumnsSelected = computed(() => exportColumns.value.length > 0 && !allColumnsSelected.value);
function toggleAllColumns(value: boolean | string | number): void {
  exportColumns.value = value ? AUDIT_EXPORT_COLUMNS.map(col => col.key) : [];
}
const columnDialogVisible = ref(false);
const exporting = ref(false);

/** 文件名清洗 */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '审计日志';
}

/** 导出审计日志（xlsx / csv） */
async function handleExport(format: 'xlsx' | 'csv'): Promise<void> {
  if (exporting.value) return;
  if (exportColumns.value.length === 0) {
    ElMessage.warning('请至少选择一个导出字段');
    return;
  }
  exporting.value = true;
  try {
    const blob = await auditApi.exportAuditLogs(currentParams(), format, exportColumns.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitize(`审计日志-${formatDateTime(new Date().toISOString())}`)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    exporting.value = false;
  }
}

/* ------------------------------ 保留策略（v1.7②） ------------------------------ */
const retentionDays = ref<number | null>(null);
const retentionLoading = ref(true);
const retentionError = ref(false);
const cleaning = ref(false);

async function loadRetention(): Promise<void> {
  retentionLoading.value = true;
  retentionError.value = false;
  try {
    const res = await auditApi.getRetention();
    retentionDays.value = res.retentionDays;
  } catch {
    retentionDays.value = null;
    retentionError.value = true;
  } finally {
    retentionLoading.value = false;
  }
}

/** 保留天数文案 */
function retentionText(): string {
  if (retentionDays.value === null) return '';
  return retentionDays.value === 0 ? '永久保留' : `保留 ${retentionDays.value} 天`;
}

/** 按保留策略清理过期日志 */
async function handleCleanup(): Promise<void> {
  if (cleaning.value) return;
  const days = retentionDays.value;
  if (days === null) {
    ElMessage.warning('保留策略尚未加载成功，请先重新加载');
    return;
  }
  const message =
    days === 0
      ? '当前设置为「永久保留」，不会删除任何日志。如需清理请先在系统设置中调整「审计日志保留天数」。'
      : `将删除 ${days} 天前的历史日志，且不可恢复。是否继续？`;
  if (days === 0) {
    ElMessage.info(message);
    return;
  }
  cleaning.value = true;
  try {
    const ok = await confirm(message, {
      title: '清理过期审计日志',
      confirmButtonText: '确认清理',
      type: 'warning',
    });
    if (!ok) return;

    const res = await auditApi.cleanupAuditLogs();
    ElMessage.success(`清理完成，共删除 ${res.deletedCount} 条日志`);
    load();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    cleaning.value = false;
  }
}

onMounted(() => {
  void loadRetention();
  void load(); // 默认展示最新一页日志，无需先点查询
});
</script>

<template>
  <div data-ui-layout="list" data-ui-page="AuditLogPage" class="audit-page">
    <PageHeader title="审计日志" description="记录用户、考试、题库与菜单权限的关键操作，便于追溯">
      <template #actions>
        <span v-if="retentionDays !== null" class="audit-page__retention">
          保留策略：{{ retentionText() }}
        </span>
        <span v-else-if="retentionLoading" class="audit-page__retention" role="status">保留策略加载中</span>
        <el-button v-else-if="retentionError" text @click="loadRetention">重新加载保留策略</el-button>
        <el-button :icon="Setting" :disabled="exporting" @click="columnDialogVisible = true">导出字段</el-button>
        <el-dropdown trigger="click" :disabled="exporting" @command="(cmd: string) => handleExport(cmd as 'xlsx' | 'csv')">
          <el-button type="primary" :loading="exporting">
            导出<el-icon class="audit-page__caret"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="xlsx">导出 Excel（.xlsx）</el-dropdown-item>
              <el-dropdown-item command="csv">导出 CSV（.csv）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button :icon="Delete" :loading="cleaning" :disabled="retentionLoading || retentionError" @click="handleCleanup">清理过期日志</el-button>
      </template>
    </PageHeader>

    <el-card class="audit-page__filter" shadow="never">
      <div class="audit-page__filter-row">
        <el-select v-model="filters.action" placeholder="动作" clearable class="audit-page__action">
          <el-option v-for="opt in AUDIT_ACTION_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>

        <el-select v-model="filters.targetType" placeholder="目标类型" clearable class="audit-page__target">
          <el-option v-for="opt in AUDIT_TARGET_TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>

        <el-input
          v-model="filters.keyword"
          placeholder="操作者 / 目标名称"
          clearable
          class="audit-page__keyword"
          @keyup.enter="handleSearch"
        />

        <el-date-picker
          v-model="filters.dateRange"
          popper-class="log-date-range-picker"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          range-separator="至"
          class="audit-page__range"
        />

        <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        <TableDensityToggle />
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
        <div class="admin-toolbar"><span class="admin-scope">当前筛选范围 · {{ loading ? '正在加载' : error ? '数量未知' : total + ' 条日志' }} · 展开或点击行查看详情</span></div>
        <RequestError v-if="error" text="审计日志加载失败" @retry="load" />
        <el-table v-else
          v-loading="loading"
          :data="logs"
          row-key="id"
          stripe
          @row-click="handleRowClick"
        >
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="audit-page__detail">
                <p class="audit-page__detail-title">操作明细</p>
                <pre class="audit-page__detail-json">{{ JSON.stringify(row.detail, null, 2) }}</pre>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column prop="actorName" label="操作者" width="140" show-overflow-tooltip />
          <el-table-column label="动作" width="130">
            <template #default="{ row }">
              <el-tag size="small" type="info" effect="plain">{{ AUDIT_ACTION_LABELS[row.action as AuditAction] || row.action }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="目标类型" width="110">
            <template #default="{ row }">{{ AUDIT_TARGET_TYPE_LABELS[row.targetType as AuditTargetType] || row.targetType }}</template>
          </el-table-column>
          <el-table-column label="目标" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.targetName || row.targetId || '—' }}</template>
          </el-table-column>
          <el-table-column label="摘要" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ detailText(row.detail) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState
              :text="hasFilter ? '没有符合条件的日志' : '暂无审计日志'"
              :filtered="hasFilter"
              @clear="handleReset"
            />
          </template>
        </el-table>
        <DataTablePagination v-if="!error"
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="onPageChange"
          @update:page-size="onSizeChange"
        />
      </el-card>

<!-- 日志详情弹窗：点击行打开（替代旧版右侧常驻详情卡） -->
    <el-drawer v-model="detailVisible" size="560px" append-to-body class="audit-page__dialog" data-ui-role="editor">
      <template #header>
        <div class="audit-page__detail-head">
          <span class="audit-page__detail-heading">日志详情</span>
          <el-tag v-if="selectedLog" size="small" type="info" effect="plain">
            {{ AUDIT_ACTION_LABELS[selectedLog.action] || selectedLog.action }}
          </el-tag>
        </div>
      </template>

      <template v-if="selectedLog">
        <div class="audit-page__desc">
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">日志 ID</span>
            <span class="audit-page__desc-v audit-page__mono">{{ selectedLog.id }}</span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">操作者</span>
            <span class="audit-page__desc-v">
              {{ selectedLog.actorName || '—' }}<template v-if="selectedLog.actorId">（{{ selectedLog.actorId }}）</template>
            </span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">动作</span>
            <span class="audit-page__desc-v">
              {{ AUDIT_ACTION_LABELS[selectedLog.action] || selectedLog.action }} / {{ selectedLog.action }}
            </span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">目标类型</span>
            <span class="audit-page__desc-v">
              {{ AUDIT_TARGET_TYPE_LABELS[selectedLog.targetType] || selectedLog.targetType }}
            </span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">目标</span>
            <span class="audit-page__desc-v audit-page__mono">
              {{ selectedLog.targetName || selectedLog.targetId || '—' }}
            </span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">时间</span>
            <span class="audit-page__desc-v">{{ formatDateTime(selectedLog.createdAt) }}</span>
          </div>
          <!-- AuditLog 模型暂无 IP / 客户端字段，按说明性文案渲染 -->
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">IP</span>
            <span class="audit-page__desc-v audit-page__desc-v--muted">此记录未包含来源 IP</span>
          </div>
          <div class="audit-page__desc-row">
            <span class="audit-page__desc-k">客户端</span>
            <span class="audit-page__desc-v audit-page__desc-v--muted">此记录未包含客户端信息</span>
          </div>
        </div>

        <p class="audit-page__micro">变更前 → 变更后</p>
        <pre class="audit-page__detail-json">{{ JSON.stringify(selectedLog.detail, null, 2) }}</pre>
      </template>
    </el-drawer>

    <!-- 导出字段勾选 -->
    <el-dialog v-model="columnDialogVisible" title="选择导出字段" width="480px" append-to-body>
      <div class="audit-page__columns-head">
        <el-checkbox :model-value="allColumnsSelected" :indeterminate="someColumnsSelected" :disabled="exporting" @change="toggleAllColumns">全选字段</el-checkbox>
        <span aria-live="polite">已选 {{ exportColumns.length }} / {{ AUDIT_EXPORT_COLUMNS.length }} 项</span>
      </div>
      <el-checkbox-group v-model="exportColumns" :disabled="exporting" class="audit-page__columns">
        <el-checkbox v-for="col in AUDIT_EXPORT_COLUMNS" :key="col.key" :value="col.key">
          {{ col.label }}
        </el-checkbox>
      </el-checkbox-group>
      <p class="audit-page__columns-tip">导出将应用当前筛选条件，最多 20000 条。</p>
      <template #footer>
        <el-button :disabled="exporting" @click="exportColumns = [...DEFAULT_AUDIT_EXPORT_KEYS]">恢复默认</el-button>
        <el-button type="primary" :disabled="!exportColumns.length" @click="columnDialogVisible = false">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.audit-page {
  &__filter {
    margin-bottom: 16px;
    border-radius: $radius-lg;
  }

  &__filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  &__action {
    width: 160px;
  }

  &__target {
    width: 140px;
  }

  &__keyword {
    width: 220px;
  }

  &__range {
    width: 360px;
  }

  &__retention {
    margin-right: 8px;
    font-size: 13px;
    color: $text-secondary;
  }

  &__caret {
    margin-left: 2px;
    font-size: 12px;
  }

  &__columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    :deep(.el-checkbox) {
      width: auto;
      min-width: 0;
      height: auto;
      min-height: 36px;
      margin-right: 0;
    }
  }
  &__columns-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid $border-color; font-size: 12px; color: $text-secondary; }
  &__columns :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }

  &__columns-tip {
    margin: 12px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__detail {
    padding: 4px 48px 12px;
  }

  &__detail-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__detail-json {
    margin: 0;
    padding: 12px;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: 12px;
    line-height: 1.6;
    color: $text-primary;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* ---------------- 日志详情弹窗 ---------------- */
  &__detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__detail-heading {
    font-weight: 600;
    color: $text-primary;
  }

  &__desc {
    display: flex;
    flex-direction: column;
  }

  &__desc-row {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid $border-color;
    font-size: 12.5px;
    line-height: 1.6;

    &:last-child {
      border-bottom: none;
    }
  }

  &__desc-k {
    color: $text-secondary;
  }

  &__desc-v {
    color: $text-primary;
    word-break: break-all;

    &--muted {
      color: $text-secondary;
    }
  }

  &__mono {
    font-family: 'SF Mono', 'Cascadia Mono', Consolas, monospace;
    font-size: 12px;
  }

  &__micro {
    margin: 14px 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: $text-secondary;
  }

}
@media (max-width: 900px) {
  .audit-page__columns :deep(.el-checkbox), .audit-page__columns-head :deep(.el-checkbox) { min-height: 44px; }
  .audit-page__detail-head { flex-wrap: wrap; }
}
</style>
