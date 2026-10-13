<script setup lang="ts">
/**
 * 登录日志（v1.7③，管理员）。
 * 登录成功/失败/锁定均可查：账号 / 结果 / 来源 / 时间范围过滤 + 分页。
 */
import { onMounted, reactive } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import * as loginLogsApi from '@/api/loginLogs';
import { usePagination } from '@/composables/usePagination';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import type { LoginLog } from '@/types';

const filters = reactive<{
  username: string;
  success: '' | '0' | '1';
  source: string;
  dateRange: [Date, Date] | null;
}>({
  username: '',
  success: '',
  source: '',
  dateRange: null,
});

const { list: logs, page, pageSize, total, loading, load, onPageChange, onSizeChange } =
  usePagination<LoginLog>((p, ps) =>
    loginLogsApi.listLoginLogs({
      username: filters.username.trim() || undefined,
      success: filters.success || undefined,
      source: filters.source || undefined,
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
  filters.username = '';
  filters.success = '';
  filters.source = '';
  filters.dateRange = null;
  load();
}

/** 失败原因文案。 */
const REASON_LABELS: Record<string, string> = {
  credentials: '账号或密码不正确',
  locked: '账号锁定中',
  captcha: '验证码未通过',
  two_factor: '两步验证未通过',
  awaiting_2fa: '等待两步验证',
};

function reasonText(row: LoginLog): string {
  if (row.success) return REASON_LABELS[row.reason] ?? '成功';
  return REASON_LABELS[row.reason] ?? (row.reason || '登录失败');
}

onMounted(load);
</script>

<template>
  <div class="login-log">
    <PageHeader
      title="登录日志"
      description="记录账号登录的成功与失败（含来源 IP、客户端与时间），便于安全追溯"
    />

    <el-card class="login-log__filters" shadow="never">
      <div class="login-log__filter-row">
        <el-input
          v-model="filters.username"
          class="login-log__keyword"
          placeholder="按账号搜索"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
        />
        <el-select v-model="filters.success" class="login-log__select" placeholder="全部结果">
          <el-option label="全部结果" value="" />
          <el-option label="仅成功" value="1" />
          <el-option label="仅失败" value="0" />
        </el-select>
        <el-select v-model="filters.source" class="login-log__select" placeholder="全部来源">
          <el-option label="全部来源" value="" />
          <el-option label="考试端" value="admin" />
          <el-option label="练题端" value="practice" />
        </el-select>
        <el-date-picker
          v-model="filters.dateRange"
          class="login-log__range"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>
    </el-card>

    <el-card class="login-log__card" shadow="never">
      <el-table v-loading="loading" :data="logs" row-key="id" stripe>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="username" label="账号" width="140" show-overflow-tooltip />
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.success ? 'success' : 'danger'" effect="plain">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="说明" width="160">
          <template #default="{ row }">{{ reasonText(row as LoginLog) }}</template>
        </el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">{{ row.source === 'practice' ? '练题端' : '考试端' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="150" />
        <el-table-column label="客户端" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.userAgent || '—' }}</template>
        </el-table-column>
        <template #empty>
          <EmptyState text="暂无登录记录" />
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

.login-log {
  &__filters {
    margin-bottom: 14px;
    border: 1px solid $border-color;
  }

  &__filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__keyword {
    width: 200px;
  }

  &__select {
    width: 140px;
  }

  &__range {
    width: 380px;
  }

  &__card {
    border: 1px solid $border-color;
  }
}
</style>
