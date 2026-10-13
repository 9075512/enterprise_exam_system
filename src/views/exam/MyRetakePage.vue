<script setup lang="ts">
/**
 * 我的补考（v1.5，考生）。
 * 查看本人补考申请及其审批状态。
 */
import { ref } from 'vue';
import { listMyRetakes } from '@/api/retakes';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { Retake, RetakeStatus } from '@/types';

const STATUS_LABELS: Record<RetakeStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
};

const STATUS_TAG: Record<RetakeStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const loading = ref(false);
const list = ref<Retake[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listMyRetakes(1, 100);
    list.value = data.list;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

load();
</script>

<template>
  <div class="my-retake-page">
    <PageHeader title="我的补考" description="查看补考申请的审批状态" />

    <el-card class="my-retake-page__panel" shadow="never">
      <EmptyState v-if="!loading && list.length === 0" text="暂无补考申请" />

      <el-table v-else v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column prop="examName" label="考试名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as RetakeStatus]" effect="light">
              {{ STATUS_LABELS[row.status as RetakeStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="说明 / 驳回原因" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.my-retake-page {
  &__panel {
    border-radius: $radius-lg;
    min-height: 240px;
  }
}
</style>
