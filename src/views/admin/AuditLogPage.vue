<script setup lang="ts">
/**
 * 审计日志（v1.6④，管理员）。
 * 关键操作留痕可查：动作 / 目标类型 / 关键字 / 时间范围过滤 + 分页。
 */
import { reactive, ref } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import * as auditApi from '@/api/audit';
import { usePagination } from '@/composables/usePagination';
import { AUDIT_ACTION_OPTIONS, AUDIT_ACTION_LABELS, AUDIT_TARGET_TYPE_LABELS, AUDIT_TARGET_TYPE_OPTIONS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import type { AuditAction, AuditLog, AuditTargetType } from '@/types';

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

const {
  list: logs,
  page,
  pageSize,
  total,
  loading,
  load,
  onPageChange,
  onSizeChange,
} = usePagination<AuditLog>((p, ps) =>
  auditApi.listAuditLogs({
    action: filters.action || undefined,
    targetType: filters.targetType || undefined,
    keyword: filters.keyword.trim() || undefined,
    from: filters.dateRange?.[0]?.toISOString(),
    to: filters.dateRange?.[1]?.toISOString(),
    page: p,
    pageSize: ps,
  }),
);

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

function detailText(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail);
  if (keys.length === 0) return '—';
  return keys.map((k) => `${k}: ${String(detail[k])}`).join('；');
}
</script>

<template>
  <div class="audit-page">
    <PageHeader title="审计日志" description="记录用户、考试、题库与菜单权限的关键操作，便于追溯" />

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
          <EmptyState text="暂无审计日志" />
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
