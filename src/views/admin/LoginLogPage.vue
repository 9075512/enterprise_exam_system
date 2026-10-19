<script setup lang="ts">
/**
 * 登录日志（v1.7③，管理员）。
 * 登录成功/失败/锁定均可查：账号 / 结果 / 来源 / 时间范围过滤 + 分页。
 */
import { computed, onMounted, reactive } from 'vue';
import { Refresh, Search, Warning } from '@element-plus/icons-vue';
import * as loginLogsApi from '@/api/loginLogs';
import { usePagination } from '@/composables/usePagination';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
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

const { list: logs, page, pageSize, total, loading, error, load, reset, onPageChange, onSizeChange } =
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
  reset();
}

function handleReset(): void {
  filters.username = '';
  filters.success = '';
  filters.source = '';
  filters.dateRange = null;
  reset();
}

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() =>
  Boolean(filters.username.trim() || filters.success || filters.source || filters.dateRange),
);

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

/* ------------------------------ 异常登录提示（对齐设计稿 login-logs.html） ------------------------------ */
/**
 * 说明：本工程没有「异常登录分析」接口，故统计口径为**当前筛选结果的当前页**
 * （数据来源：usePagination 返回的 `logs`），不是全量 7 日聚合。
 * 设计稿里的「异地登录」需要 IP 归属地，接口未返回，渲染为说明性文案（见模板）。
 */
const failedLogs = computed<LoginLog[]>(() => logs.value.filter((row) => !row.success));

/** 当前页失败次数最多的账号（用于提示条文案） */
const topFailedAccount = computed<{ username: string; count: number } | null>(() => {
  const counter = new Map<string, number>();
  for (const row of failedLogs.value) {
    counter.set(row.username, (counter.get(row.username) ?? 0) + 1);
  }
  let top: { username: string; count: number } | null = null;
  for (const [username, count] of counter) {
    if (!top || count > top.count) top = { username, count };
  }
  return top;
});

/** 当前页失败率（当前页失败条数 / 当前页总条数） */
const pageFailRate = computed<string>(() => {
  if (logs.value.length === 0) return '—';
  return `${((failedLogs.value.length / logs.value.length) * 100).toFixed(1)}%`;
});

/** 触发锁定的账号数（按账号去重） */
const lockedAccountCount = computed<number>(
  () => new Set(logs.value.filter((row) => row.reason === 'locked').map((row) => row.username)).size,
);

onMounted(load);
</script>

<template>
  <div data-ui-layout="list" data-ui-page="LoginLogPage" class="login-log">
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
        <TableDensityToggle />
      </div>
    </el-card>

    <el-card class="login-log__card" data-ui-role="table" shadow="never">
      <div class="admin-toolbar"><span class="admin-scope">当前筛选范围 · {{ error ? '数量未知' : total + ' 条登录记录' }}</span></div>
      <RequestError v-if="error" text="登录日志加载失败" @retry="load" />
      <el-table v-else v-loading="loading" :data="logs" row-key="id" stripe>
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
          <EmptyState
            :text="hasFilter ? '没有符合条件的登录记录' : '暂无登录记录'"
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

    <!-- 异常登录提示（对齐设计稿 login-logs.html）：基于当前页日志即时分析，只读展示 -->
    <el-card class="login-log__card login-log__anomaly" shadow="never">
      <template #header>
        <div class="login-log__anomaly-head">
          <span class="login-log__anomaly-title">异常登录提示</span>
          <el-tag size="small" type="warning" effect="plain">需关注</el-tag>
        </div>
      </template>

      <p v-if="error" class="login-log__anomaly-empty">日志加载失败，暂无法分析异常。</p>
      <template v-else-if="logs.length > 0">
        <div class="login-log__tip">
          <el-icon class="login-log__tip-icon"><Warning /></el-icon>
          <span v-if="topFailedAccount">
            账号 <b>{{ topFailedAccount.username }}</b> 在当前页记录中失败
            <b>{{ topFailedAccount.count }}</b> 次，建议核验是否为本人操作或账号被盗用。
          </span>
          <span v-else>当前页没有失败登录记录；其他页面未纳入本次分析。</span>
        </div>

        <div class="login-log__kv">
          <span class="login-log__kv-k">当前页失败次数</span>
          <span class="login-log__kv-v">{{ failedLogs.length }} 次</span>
        </div>
        <div class="login-log__kv">
          <span class="login-log__kv-k">当前页失败率</span>
          <span class="login-log__kv-v">{{ pageFailRate }}</span>
        </div>
        <div class="login-log__kv">
          <span class="login-log__kv-k">当前页触发锁定账号数</span>
          <span class="login-log__kv-v">{{ lockedAccountCount }} 个</span>
        </div>
        <!-- 异地登录需 IP 归属地，登录日志接口未返回，按说明性文案渲染 -->
        <div class="login-log__kv">
          <span class="login-log__kv-k">异地登录</span>
          <span class="login-log__kv-v login-log__kv-v--muted">暂无法判定（接口未返回 IP 归属地）</span>
        </div>
      </template>

      <p v-else class="login-log__anomaly-empty">当前列表暂无登录记录，无可分析的异常提示。</p>
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

  /* ---------------- 异常登录提示卡（对齐设计稿 login-logs.html） ---------------- */
  &__anomaly {
    margin-top: 14px;
  }

  &__anomaly-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__anomaly-title {
    font-weight: 600;
    color: $text-primary;
  }

  &__tip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-warning-bg;
    color: $color-warning-text;
    font-size: 12px;
    line-height: 1.6;

    b {
      font-weight: 600;
    }
  }

  &__tip-icon {
    flex: 0 0 auto;
    margin-top: 2px;
  }

  &__kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed $border-color;
    font-size: 12.5px;

    &:last-child {
      border-bottom: none;
    }
  }

  &__kv-k {
    color: $text-secondary;
  }

  &__kv-v {
    font-weight: 600;
    color: $text-primary;

    &--muted {
      font-weight: 400;
      color: $text-secondary;
    }
  }

  &__anomaly-empty {
    margin: 0;
    padding: 14px 0;
    text-align: center;
    font-size: 12.5px;
    color: $text-secondary;
  }
}
</style>
