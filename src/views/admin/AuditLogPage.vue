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
  load,
  onPageChange,
  onSizeChange,
} = usePagination<AuditLog>((p, ps) => auditApi.listAuditLogs(currentParams(p, ps)));

function handleSearch(): void {
  load();
}

function handleReset(): void {
  filters.action = '';
  filters.targetType = '';
  filters.keyword = '';
  filters.dateRange = null;
  load();
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

/* ------------------------------ 导出（v1.7②） ------------------------------ */
/** 导出字段勾选（默认列集） */
const exportColumns = ref<string[]>([...DEFAULT_AUDIT_EXPORT_KEYS]);
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
const cleaning = ref(false);

async function loadRetention(): Promise<void> {
  try {
    const res = await auditApi.getRetention();
    retentionDays.value = res.retentionDays;
  } catch {
    retentionDays.value = null;
  }
}

/** 保留天数文案 */
function retentionText(): string {
  if (retentionDays.value === null) return '';
  return retentionDays.value === 0 ? '永久保留' : `保留 ${retentionDays.value} 天`;
}

/** 按保留策略清理过期日志 */
async function handleCleanup(): Promise<void> {
  const days = retentionDays.value;
  const message =
    days === null || days === 0
      ? '当前设置为「永久保留」，不会删除任何日志。如需清理请先在系统设置中调整「审计日志保留天数」。'
      : `将删除 ${days} 天前的历史日志，且不可恢复。是否继续？`;
  if (days === null || days === 0) {
    ElMessage.info(message);
    return;
  }
  const ok = await confirm(message, {
    title: '清理过期审计日志',
    confirmButtonText: '确认清理',
    type: 'warning',
  });
  if (!ok) return;

  cleaning.value = true;
  try {
    const res = await auditApi.cleanupAuditLogs();
    ElMessage.success(`清理完成，共删除 ${res.deletedCount} 条日志`);
    load();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    cleaning.value = false;
  }
}

onMounted(loadRetention);
</script>

<template>
  <div class="audit-page">
    <PageHeader title="审计日志" description="记录用户、考试、题库与菜单权限的关键操作，便于追溯">
      <template #actions>
        <span v-if="retentionDays !== null" class="audit-page__retention">
          保留策略：{{ retentionText() }}
        </span>
        <el-button :icon="Setting" @click="columnDialogVisible = true">导出字段</el-button>
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
        <el-button :icon="Delete" :loading="cleaning" @click="handleCleanup">清理过期日志</el-button>
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
      <el-table v-loading="loading" :data="logs" row-key="id" stripe>
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
      <DataTablePagination
        :page="page"
        :page-size="pageSize"
        :total="total"
        @update:page="onPageChange"
        @update:page-size="onSizeChange"
      />
    </el-card>

    <!-- 导出字段勾选 -->
    <el-dialog v-model="columnDialogVisible" title="选择导出字段" width="480px" append-to-body>
      <el-checkbox-group v-model="exportColumns" class="audit-page__columns">
        <el-checkbox v-for="col in AUDIT_EXPORT_COLUMNS" :key="col.key" :value="col.key">
          {{ col.label }}
        </el-checkbox>
      </el-checkbox-group>
      <p class="audit-page__columns-tip">导出将应用当前筛选条件，最多 20000 条。</p>
      <template #footer>
        <el-button @click="exportColumns = [...DEFAULT_AUDIT_EXPORT_KEYS]">恢复默认</el-button>
        <el-button type="primary" @click="columnDialogVisible = false">确定</el-button>
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
    display: flex;
    flex-wrap: wrap;
    gap: 4px 0;

    :deep(.el-checkbox) {
      width: 140px;
      margin-right: 0;
    }
  }

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
}
</style>
