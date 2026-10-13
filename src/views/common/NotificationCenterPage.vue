<script setup lang="ts">
/**
 * 消息中心（v1.5，所有登录角色，顶栏铃铛进入）。
 * 站内信列表 + 单条已读 + 全部已读。
 */
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { listNotifications, markAllRead, markRead } from '@/api/notifications';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { Notification, Page } from '@/types';

const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Notification[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data: Page<Notification> = await listNotifications(page.value, pageSize.value);
    list.value = data.list;
    total.value = data.total;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

load();

/** 点开单条 → 标记已读 */
async function handleRead(item: Notification): Promise<void> {
  if (item.isRead) return;
  try {
    await markRead(item.id);
    item.isRead = true;
  } catch {
    // 忽略
  }
}

async function handleMarkAll(): Promise<void> {
  try {
    await markAllRead();
    list.value = list.value.map((n) => ({ ...n, isRead: true }));
    ElMessage.success('已全部标记为已读');
  } catch {
    // 忽略
  }
}

function handlePageChange(p: number): void {
  page.value = p;
  void load();
}
</script>

<template>
  <div class="notification-page">
    <PageHeader title="消息中心" description="考试发布、成绩与补考审批等通知">
      <template #actions>
        <el-button :disabled="list.length === 0" @click="handleMarkAll">全部已读</el-button>
      </template>
    </PageHeader>

    <el-card v-loading="loading" class="notification-page__panel" shadow="never">
      <EmptyState v-if="!loading && list.length === 0" text="暂无消息" />

      <div v-else class="notification-page__list">
        <div
          v-for="item in list"
          :key="item.id"
          class="notification-page__item"
          :class="{ 'is-unread': !item.isRead }"
          @click="handleRead(item)"
        >
          <span class="notification-page__dot" v-if="!item.isRead" />
          <div class="notification-page__body">
            <div class="notification-page__title">{{ item.title }}</div>
            <div class="notification-page__content">{{ item.content }}</div>
            <div class="notification-page__time">{{ formatDateTime(item.createdAt) }}</div>
          </div>
        </div>
      </div>

      <el-pagination
        v-if="total > pageSize"
        class="notification-page__pager"
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="handlePageChange"
      />
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.notification-page {
  &__panel {
    border-radius: $radius-lg;
    min-height: 300px;
  }

  &__list {
    display: flex;
    flex-direction: column;
  }

  &__item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 12px;
    border-bottom: 1px solid $border-color;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: $color-table-hover;
    }
  }

  &__dot {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: $color-error;
  }

  &__body {
    min-width: 0;
    flex: 1;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  &__content {
    margin-top: 4px;
    font-size: 13px;
    line-height: 1.5;
    color: $text-secondary;
  }

  &__time {
    margin-top: 6px;
    font-size: 12px;
    color: $text-disabled;
  }

  &__pager {
    margin-top: 16px;
    justify-content: flex-end;
  }
}
</style>
