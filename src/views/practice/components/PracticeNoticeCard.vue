<script setup lang="ts">
/**
 * 练题端内容卡（v1.9⑥）—— 轮播图 + 公告。
 *
 * 数据来自 `GET /api/practice/feed`，仅返回发布范围为 practice / both
 * 且在生效时间窗内的内容；两者都为空时整卡不渲染（首页保持干净）。
 *
 * 视觉：冷静蓝 · 商务风（白卡 + 细边框 + 小圆角，无渐变 / 无 emoji）。
 */
import { computed, onMounted, ref } from 'vue';
import * as practiceApi from '@/api/practice';
import PagedOverview from '@/components/common/PagedOverview.vue';
import type { Announcement, Banner } from '@/types';

const banners = ref<Banner[]>([]);
const announcements = ref<Announcement[]>([]);
const detailVisible = ref(false);
const detail = ref<Announcement | null>(null);

/* 重要公告「首次进入强提醒」（v2.0①）：本地记录已提醒过的公告 id */
const IMPORTANT_SEEN_KEY = 'practice-important-seen';
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

/** 标记重要公告已提醒（一次性）。 */
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
    void practiceApi.markAnnouncementRead(next.id).catch(() => undefined);
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
    const data = await practiceApi.feed();
    banners.value = data.banners;
    announcements.value = data.announcements;
    queueImportantReminders();
  } catch {
    // 首页装饰性内容，失败静默降级（不阻断题库列表）
  }
});

function openBanner(banner: Banner): void {
  // 触达回执（v2.0③）：无论是否可跳转都记录一次点击
  void practiceApi.markBannerClick(banner.id).catch(() => undefined);
  if (banner.linkUrl) window.open(banner.linkUrl, '_blank', 'noopener,noreferrer');
}

/** 简化日期（YYYY-MM-DD） */
function shortDate(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function openDetail(item: Announcement): void {
  // 触达回执（v2.0③）：打开详情即记录已读（幂等）
  void practiceApi.markAnnouncementRead(item.id).catch(() => undefined);
  detail.value = item;
  detailVisible.value = true;
}
</script>

<template>
  <div v-if="visible" class="notice">
    <!-- 轮播图 -->
    <div v-if="banners.length > 0" class="notice__carousel">
      <el-carousel height="130px" :interval="5000" :autoplay="banners.length > 1" indicator-position="none">
        <el-carousel-item v-for="banner in banners" :key="banner.id">
          <div class="notice__slide" :class="{ 'is-link': !!banner.linkUrl }" @click="openBanner(banner)">
            <img class="notice__image" :src="banner.imageUrl" :alt="banner.title" />
          </div>
        </el-carousel-item>
      </el-carousel>
    </div>

    <!-- 公告 -->
    <div v-if="announcements.length > 0" class="notice__card">
      <div class="notice__head">
        <span class="notice__head-title">公告</span>
      </div>
      <PagedOverview :items="announcements" title="公告" :limit="3">
        <template #default="{ items }">
          <ul class="notice__list">
            <li
              v-for="item in items"
              :key="item.id"
              class="notice__item"
              role="button"
              tabindex="0"
              @click="openDetail(item)"
              @keydown.enter="openDetail(item)"
              @keydown.space.prevent="openDetail(item)"
            >
              <span class="notice__mark" :class="{ 'is-important': item.level === 'important' }">
                {{ item.pinned ? '顶' : item.level === 'important' ? '要' : '告' }}
              </span>
              <span class="notice__title" :class="{ 'is-important': item.level === 'important' }">{{ item.title }}</span>
              <span class="notice__date">{{ shortDate(item.createdAt) }}</span>
            </li>
          </ul>
        </template>
      </PagedOverview>
    </div>

    <!-- 公告详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.title ?? '公告'" width="86%" align-center append-to-body>
      <p class="notice__detail-meta">
        <span v-if="detail?.level === 'important'" class="notice__detail-flag">重要</span>
        {{ shortDate(detail?.createdAt ?? '') }}
      </p>
      <div class="notice__detail-body" v-html="detail?.content ?? ''" />
    </el-dialog>

    <!-- 重要公告首次进入强提醒（v2.0①） -->
    <el-dialog v-model="forceVisible" title="重要公告" width="86%" align-center @close="closeForce">
      <p class="notice__detail-meta">
        <span class="notice__detail-flag">重要</span>
        {{ forceItem?.title }}
      </p>
      <div class="notice__detail-body" v-html="forceItem?.content ?? ''" />
      <template #footer>
        <el-button type="primary" @click="closeForce">我知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.notice {
  margin-bottom: 12px;

  &__carousel {
    margin-bottom: 12px;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    overflow: hidden;
    background: $bg-paper;
  }

  &__slide {
    width: 100%;
    height: 100%;

    &.is-link {
      cursor: pointer;
    }
  }

  &__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__card {
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    overflow: hidden;
  }

  &__head {
    padding: 11px 14px 8px;
  }

  &__head-title {
    font-size: 14px;
    font-weight: 700;
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
    padding: 10px 14px;
    border-top: 1px solid $border-color;
    cursor: pointer;

    &:active {
      background: $practice-surface-2;
    }
  }

  &__mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: $radius-xs;
    background: $practice-soft;
    border: 1px solid $border-color;
    font-size: 12px;
    font-weight: 700;
    color: $practice-primary;
    line-height: 1;

    &.is-important {
      background: $color-error-bg;
      border-color: $color-error-border;
      color: $color-error-text;
    }
  }

  &__title {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    color: $text-primary;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    &.is-important {
      font-weight: 700;
    }
  }

  &__date {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-disabled;
    font-variant-numeric: tabular-nums;
  }

  &__detail-meta {
    margin: 0 0 10px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__detail-flag {
    display: inline-block;
    margin-right: 6px;
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

    /* 富文本（服务端已白名单净化后再 v-html） */
    :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    :deep(p) {
      margin: 0 0 6px;
    }

    :deep(ul),
    :deep(ol) {
      margin: 6px 0;
      padding-left: 20px;
    }
  }
}
</style>
