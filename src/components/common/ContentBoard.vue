<script setup lang="ts">
/**
 * 考生端内容看板（v1.9⑥）—— 轮播图 + 公告。
 *
 * 数据来自 `GET /api/content/feed?scope=exam`，仅返回**当前生效**的内容
 * （服务端已按 enabled / 发布范围 / 生效时间窗过滤）；无内容时整体不渲染。
 *
 * v1.9⑦ 的考试端首页会复用本组件。
 */
import { computed, onMounted, ref } from 'vue';
import { fetchFeed, markAnnouncementRead, markBannerClick } from '@/api/content';
import { formatDateTime } from '@/utils/datetime';
import type { Announcement, Banner } from '@/types';

/** 展示端：考试端首页 / 我的考试页传 'exam'；如需在练题相关页复用可传 'practice' */
const props = withDefaults(defineProps<{ scope?: 'exam' | 'practice' }>(), { scope: 'exam' });

const banners = ref<Banner[]>([]);
const announcements = ref<Announcement[]>([]);
const detailVisible = ref(false);
const detail = ref<Announcement | null>(null);

/* 重要公告「首次进入强提醒」（v2.0①）：本地记录已提醒过的公告 id */
const IMPORTANT_SEEN_KEY = 'content-important-seen';
const forceVisible = ref(false);
const forceItem = ref<Announcement | null>(null);
const forceQueue = ref<Announcement[]>([]);

const visible = computed<boolean>(() => banners.value.length > 0 || announcements.value.length > 0);

/** 读取本地已提醒的重要公告 id 集合。 */
function loadSeenImportant(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTANT_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

/** 标记重要公告已提醒（一次性，最多保留最近 200 条）。 */
function markImportantSeen(id: string): void {
  const seen = loadSeenImportant();
  seen.add(id);
  try {
    localStorage.setItem(IMPORTANT_SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* 忽略存储异常 */
  }
}

/** 依次弹出重要公告强提醒。 */
function popForce(): void {
  const next = forceQueue.value.shift();
  if (next) {
    // 强提醒弹出即视为触达（v2.0③）
    void markAnnouncementRead(next.id).catch(() => undefined);
    forceItem.value = next;
    forceVisible.value = true;
  } else {
    forceVisible.value = false;
    forceItem.value = null;
  }
}

function closeForce(): void {
  forceVisible.value = false;
  popForce();
}

/** 把「未提醒过的重要公告」入队并立即弹出（首次进入才触发）。 */
function queueImportantReminders(): void {
  const seen = loadSeenImportant();
  const pending = announcements.value.filter((a) => a.level === 'important' && !seen.has(a.id));
  if (pending.length === 0) return;
  pending.forEach((a) => markImportantSeen(a.id));
  forceQueue.value = pending;
  popForce();
}

onMounted(async () => {
  try {
    const feed = await fetchFeed(props.scope);
    banners.value = feed.banners;
    announcements.value = feed.announcements;
    queueImportantReminders();
  } catch {
    // 首页装饰性内容，失败静默（不阻断主体页面）
  }
});

function openBanner(banner: Banner): void {
  // 触达回执（v2.0③）：无论是否可跳转都记录一次点击
  void markBannerClick(banner.id).catch(() => undefined);
  if (!banner.linkUrl) return;
  window.open(banner.linkUrl, '_blank', 'noopener,noreferrer');
}

function openDetail(item: Announcement): void {
  // 触达回执（v2.0③）：打开详情即记录已读（幂等）
  void markAnnouncementRead(item.id).catch(() => undefined);
  detail.value = item;
  detailVisible.value = true;
}
</script>

<template>
  <div v-if="visible" class="content-board">
    <!-- 轮播图 -->
    <el-carousel
      v-if="banners.length > 0"
      class="content-board__carousel"
      height="190px"
      :interval="6000"
      indicator-position="outside"
      arrow="hover"
    >
      <el-carousel-item v-for="banner in banners" :key="banner.id">
        <div
          class="content-board__slide"
          :class="{ 'is-link': !!banner.linkUrl }"
          :title="banner.title"
          @click="openBanner(banner)"
        >
          <img class="content-board__image" :src="banner.imageUrl" :alt="banner.title" />
          <span v-if="banner.title" class="content-board__caption">{{ banner.title }}</span>
        </div>
      </el-carousel-item>
    </el-carousel>

    <!-- 公告 -->
    <el-card v-if="announcements.length > 0" class="content-board__notice" shadow="never">
      <template #header>
        <span class="content-board__head-title">公告通知</span>
      </template>
      <ul class="content-board__list">
        <li
          v-for="item in announcements"
          :key="item.id"
          class="content-board__item"
          :class="{ 'is-important': item.level === 'important' }"
          @click="openDetail(item)"
        >
          <el-tag v-if="item.pinned" size="small" type="danger" effect="plain" class="content-board__pin">置顶</el-tag>
          <span class="content-board__item-title">{{ item.title }}</span>
          <span class="content-board__item-time">{{ formatDateTime(item.createdAt) }}</span>
        </li>
      </ul>
    </el-card>

    <!-- 公告详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.title ?? '公告'" width="560px">
      <p class="content-board__detail-meta">
        <span v-if="detail?.level === 'important'" class="content-board__detail-flag">重要</span>
        发布时间：{{ detail ? formatDateTime(detail.createdAt) : '' }}
      </p>
      <div class="content-board__detail-body rich-text" v-html="detail?.content ?? ''" />
    </el-dialog>

    <!-- 重要公告首次进入强提醒（v2.0①） -->
    <el-dialog
      v-model="forceVisible"
      title="重要公告"
      width="560px"
      class="content-board__force"
      @close="closeForce"
    >
      <p class="content-board__detail-meta">
        <span class="content-board__detail-flag">重要</span>
        {{ forceItem?.title }}
      </p>
      <div class="content-board__detail-body rich-text" v-html="forceItem?.content ?? ''" />
      <template #footer>
        <el-button type="primary" @click="closeForce">我知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.content-board {
  margin-bottom: 16px;

  &__carousel {
    margin-bottom: 12px;
    background: #fff;
    border: 1px solid $border-color;
    border-radius: 6px;
    overflow: hidden;
  }

  &__slide {
    position: relative;
    width: 100%;
    height: 100%;
    background: $bg-page;

    &.is-link {
      cursor: pointer;
    }
  }

  &__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 6px 14px;
    font-size: 13px;
    color: #fff;
    background: rgba(15, 23, 42, 0.55);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__notice {
    :deep(.el-card__body) {
      padding: 0;
    }
  }

  /* 卡头走全局 `.el-card__header` 刻度（12px 16px / 46px / 13.5px），
     此处只补件内布局；不再使用 v2.x 的 3px 左缘强调条（方向 C 已废弃）。 */
  &__head-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 16px;
    border-bottom: 1px solid $border-color;
    cursor: pointer;
    transition: background-color 0.15s;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: $color-table-hover;
    }

    /* 重要公告用「左缘 2px 警示条」表达（语义色只作图形，作文字已用 error-text） */
    &.is-important {
      box-shadow: inset 2px 0 0 $color-error;
    }
  }

  &__pin {
    flex: 0 0 auto;
  }

  &__item-title {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    color: $text-primary;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    .content-board__item.is-important & {
      font-weight: 700;
      color: $color-error-text;
    }
  }

  &__item-time {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-disabled;
  }

  &__detail-meta {
    margin: 0 0 10px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__detail-flag {
    display: inline-block;
    margin-right: 8px;
    padding: 1px 6px;
    border-radius: 3px;
    background: $color-error-bg;
    border: 1px solid $color-error-border;
    color: $color-error-text;
    font-size: 12px;
  }

  &__detail-body {
    font-size: 14px;
    line-height: 1.8;
    color: $text-primary;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
