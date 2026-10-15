<script setup lang="ts">
/**
 * 消息中心（v1.5，所有登录角色，顶栏铃铛进入）。
 * 站内信列表 + 单条已读 + 全部已读。
 *
 * v3.1 方向 C（设计稿 p-notifications 重排）：
 * 页头下补三张统计卡（未读 / 今日新增 / 累计），主体改 2:1 分栏——
 * 左侧「分类页签 + 消息列表 + 分页」，右侧「消息详情卡 + 隔离说明」。
 *
 * 说明：后端列表接口暂不支持按 type / 未读筛选，故一次拉取最近 100 条
 * （站内信保留 180 天，量级可控）后在前端做分类筛选与分页；
 * 「累计消息」取服务端 total（精确），未读数取 unread-count 接口（精确）。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Bell, Calendar, CircleCheck, Message } from '@element-plus/icons-vue';
import { getUnreadCount, listNotifications, markAllRead, markRead } from '@/api/notifications';
import { formatDateTime } from '@/utils/datetime';
import EmptyState from '@/components/common/EmptyState.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import StatCard from '@/components/common/StatCard.vue';
import type { Notification } from '@/types';

const loading = ref(false);
const list = ref<Notification[]>([]);
/** 服务端 total（精确累计条数） */
const totalCount = ref(0);
/** 服务端未读数（精确） */
const unreadCount = ref(0);
const active = ref<Notification | null>(null);
/** 详情弹窗开关（点击列表项打开） */
const detailVisible = ref(false);

/** 通知分类文案（与后端 notify.ts 的 EVENT_TYPE 一一对应） */
const TYPE_LABELS: Record<string, string> = {
  publish: '考试通知',
  result: '成绩通知',
  retake: '补考审批',
  appeal: '复核结论',
  security: '安全提醒',
};
const TYPE_TONES: Record<string, string> = {
  publish: 'info',
  result: 'ok',
  retake: 'warn',
  appeal: 'info',
  security: 'gray',
};

const PAGE_SIZE = 20;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [page, unread] = await Promise.all([listNotifications(1, 100), getUnreadCount()]);
    list.value = page.list;
    totalCount.value = page.total;
    unreadCount.value = unread.unreadCount;
    if (!active.value && page.list.length > 0) active.value = page.list[0];
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/* ------------------------------ 页签（全部 / 未读 / 分类） ------------------------------ */
const tabs = computed(() => {
  const present = new Set(list.value.map((n) => n.type));
  const items = [
    { key: 'all', label: '全部', count: list.value.length },
    { key: 'unread', label: '未读', count: list.value.filter((n) => !n.isRead).length },
  ];
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    if (present.has(type)) {
      items.push({ key: type, label, count: list.value.filter((n) => n.type === type).length });
    }
  }
  return items;
});

const activeTab = ref('all');

const filtered = computed<Notification[]>(() => {
  if (activeTab.value === 'all') return list.value;
  if (activeTab.value === 'unread') return list.value.filter((n) => !n.isRead);
  return list.value.filter((n) => n.type === activeTab.value);
});

const page = ref(1);
const paged = computed<Notification[]>(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
const totalPages = computed<number>(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));

function switchTab(key: string): void {
  activeTab.value = key;
  page.value = 1;
}

/* ------------------------------ 统计卡 ------------------------------ */
const todayCount = computed<string | number>(() => {
  const today = new Date().toDateString();
  return list.value.filter((n) => new Date(n.createdAt).toDateString() === today).length;
});

/* ------------------------------ 交互 ------------------------------ */
function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? '系统公告';
}

function typeTone(type: string): string {
  return TYPE_TONES[type] ?? 'gray';
}

async function open(item: Notification): Promise<void> {
  active.value = item;
  detailVisible.value = true;
  if (item.isRead) return;
  try {
    await markRead(item.id);
    item.isRead = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch {
    // 忽略
  }
}

async function handleMarkAll(): Promise<void> {
  try {
    await markAllRead();
    list.value = list.value.map((n) => ({ ...n, isRead: true }));
    unreadCount.value = 0;
    ElMessage.success('已全部标记为已读');
  } catch {
    // 忽略
  }
}
</script>

<template>
  <div class="notif">
    <PageHeader title="消息中心" description="考试发布、成绩与补考审批等通知">
      <template #actions>
        <el-button :icon="CircleCheck" :disabled="unreadCount === 0" @click="handleMarkAll">
          全部已读
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡（设计稿 p-notifications） -->
    <div class="notif__stats">
      <StatCard label="未读消息" :value="unreadCount" unit="条" tone="error" :icon="Bell" />
      <StatCard label="今日新增" :value="todayCount" unit="条" :icon="Calendar" />
      <StatCard label="累计消息" :value="totalCount" unit="条" :icon="Message" />
    </div>

    <div class="notif__row">
      <el-card class="notif__panel" shadow="never">
        <!-- 分类页签（设计稿 .tabs） -->
        <div class="notif__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="notif__tab"
            :class="{ 'is-on': activeTab === tab.key }"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }} {{ tab.count }}
          </button>
        </div>

        <div v-loading="loading" class="notif__list">
          <EmptyState
            v-if="filtered.length === 0"
            class="notif__empty"
            :text="activeTab === 'all' ? '暂无消息' : '没有该分类的消息'"
            :filtered="activeTab !== 'all'"
            @clear="switchTab('all')"
          />

          <div v-else class="notif__items">
            <button
              v-for="item in paged"
              :key="item.id"
              type="button"
              class="notif__item"
              :class="{ 'is-unread': !item.isRead, 'is-active': active?.id === item.id }"
              @click="open(item)"
            >
              <span class="notif__dot" :class="{ 'is-none': item.isRead }" aria-hidden="true" />
              <span class="notif__body">
                <span class="notif__title">{{ item.title }}</span>
                <span class="notif__text">{{ item.content }}</span>
                <span class="notif__foot">
                  <span class="notif__kind" :class="`notif__kind--${typeTone(item.type)}`">
                    {{ typeLabel(item.type) }}
                  </span>
                  <span>{{ formatDateTime(item.createdAt) }}</span>
                </span>
              </span>
              <span v-if="!item.isRead" class="notif__badge">未读</span>
            </button>
          </div>
        </div>

        <div v-if="filtered.length > PAGE_SIZE" class="notif__pager">
          <span class="notif__pager-info">共 {{ filtered.length }} 条 · 每页 {{ PAGE_SIZE }} 条</span>
          <button type="button" class="notif__pg" :disabled="page <= 1" aria-label="上一页" @click="page -= 1">
            ‹
          </button>
          <span class="notif__pg is-on">{{ page }}</span>
          <span class="notif__pg-text">/ {{ totalPages }}</span>
          <button
            type="button"
            class="notif__pg"
            :disabled="page >= totalPages"
            aria-label="下一页"
            @click="page += 1"
          >
            ›
          </button>
        </div>
      </el-card>

      <div class="notif__tip">
        <el-icon class="notif__tip-icon"><Message /></el-icon>
        <div>消息按<b>登录账号</b>隔离，仅你能看到本人相关的考试与成绩通知；消息保留 180 天后自动清理。</div>
      </div>
    </div>

    <!-- 消息详情弹窗（点击列表项展开，替代旧版右侧常驻详情卡） -->
    <el-dialog v-model="detailVisible" title="消息详情" width="520px" class="notif__dialog">
      <template #header>
        <div class="notif__dialog-hd">
          <h3>消息详情</h3>
          <span v-if="active" class="notif__kind notif__kind--pri">{{ typeLabel(active.type) }}</span>
        </div>
      </template>
      <template v-if="active">
        <div class="notif__detail-title">{{ active.title }}</div>
        <div class="notif__detail-time">{{ formatDateTime(active.createdAt) }} · 系统通知</div>
        <p class="notif__detail-text">{{ active.content }}</p>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.notif {
  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  &__panel {
    --el-card-padding: 0;
  }

  /* 详情弹窗头 */
  &__dialog-hd {
    display: flex;
    align-items: center;
    gap: 9px;

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 620;
    }
  }

  /* 分类页签（设计稿 .tabs） */
  &__tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 16px;
    border-bottom: 1px solid $border-color;
    overflow-x: auto;
  }

  &__tab {
    flex: 0 0 auto;
    height: 40px;
    padding: 0 10px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 13px;
    font-weight: 500;
    color: $text-secondary;
    cursor: pointer;
    transition: color $transition-fast, border-color $transition-fast;

    &:hover {
      color: $text-primary;
    }

    &.is-on {
      color: $color-primary;
      border-bottom-color: $color-primary;
      font-weight: 620;
    }
  }

  &__list {
    min-height: 200px;
  }

  &__empty {
    padding: 16px;
  }

  &__items {
    display: flex;
    flex-direction: column;
  }

  /* 消息行（设计稿 .msg） */
  &__item {
    position: relative;
    display: flex;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border: none;
    border-bottom: 1px solid $border-color;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: $color-table-hover;
    }

    &.is-unread {
      background: $color-primary-soft;
      box-shadow: inset 2px 0 0 $color-primary;

      &:hover {
        background: $color-primary-soft;
      }
    }

    &.is-active {
      outline: 1px solid $color-primary-border;
      outline-offset: -1px;
    }
  }

  &__dot {
    flex: 0 0 7px;
    width: 7px;
    height: 7px;
    margin-top: 6px;
    border-radius: 50%;
    background: $color-error;

    &.is-none {
      background: transparent;
    }
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  &__title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__item.is-unread &__title {
    font-weight: 650;
  }

  &__text {
    margin-top: 4px;
    font-size: 12.5px;
    line-height: 1.6;
    color: $text-secondary;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__foot {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 7px;
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__kind {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 5px;
    font-size: 10.5px;
    font-weight: 600;
    background: $color-neutral-bg;
    color: $text-secondary;

    &--pri {
      background: $color-primary-soft;
      color: $color-primary;
    }

    &--info {
      background: $color-info-bg;
      color: $color-info-text;
    }

    &--ok {
      background: $color-success-bg;
      color: $color-success-text;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }

    &--gray {
      background: $color-neutral-bg;
      color: $text-secondary;
    }
  }

  &__badge {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border-radius: 5px;
    background: $color-error-bg;
    font-size: 11.5px;
    font-weight: 580;
    color: $color-error-text;

    &::before {
      content: '';
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }
  }

  /* 分页 */
  &__pager {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    border-top: 1px solid $border-color;
  }

  &__pager-info {
    margin-right: auto;
    font-size: 12px;
    color: $text-secondary;
  }

  &__pg {
    min-width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: $radius-xs;
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $color-neutral-bg;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.is-on {
      background: $color-primary;
      border-color: $color-primary;
      color: #fff;
    }
  }

  &__pg-text {
    font-size: 12px;
    color: $text-secondary;
  }

  /* 详情 */
  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__detail {
    :deep(.el-card__header) {
      justify-content: space-between;
    }
  }

  &__detail-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
    line-height: 1.6;
  }

  &__detail-time {
    margin-top: 4px;
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__detail-text {
    margin: 12px 0 0;
    font-size: 12.5px;
    line-height: 1.75;
    color: $text-secondary;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__tip {
    display: flex;
    gap: 9px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-info-bg;
    font-size: 12px;
    line-height: 1.55;
    color: $color-info-text;

    b {
      font-weight: 650;
    }
  }

  &__tip-icon {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  @media (max-width: 1080px) {
    &__row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
