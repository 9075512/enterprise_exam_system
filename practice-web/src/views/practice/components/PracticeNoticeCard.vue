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
import type { Announcement, Banner } from '@/types';

const banners = ref<Banner[]>([]);
const announcements = ref<Announcement[]>([]);
const detailVisible = ref(false);
const detail = ref<Announcement | null>(null);

const visible = computed<boolean>(() => banners.value.length > 0 || announcements.value.length > 0);

/** 公告列表默认只展示前 3 条，其余折叠 */
const expanded = ref(false);
const shownAnnouncements = computed<Announcement[]>(() =>
  expanded.value ? announcements.value : announcements.value.slice(0, 3),
);
const hasMore = computed<boolean>(() => announcements.value.length > 3);

onMounted(async () => {
  try {
    const data = await practiceApi.feed();
    banners.value = data.banners;
    announcements.value = data.announcements;
  } catch {
    // 首页装饰性内容，失败静默降级（不阻断题库列表）
  }
});

function openBanner(): void {
  const link = banners.value.find((b) => b.linkUrl)?.linkUrl;
  if (link) window.open(link, '_blank', 'noopener,noreferrer');
}

/** 简化日期（YYYY-MM-DD） */
function shortDate(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function openDetail(item: Announcement): void {
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
          <div class="notice__slide" :class="{ 'is-link': !!banner.linkUrl }" @click="openBanner">
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
      <ul class="notice__list">
        <li
          v-for="item in shownAnnouncements"
          :key="item.id"
          class="notice__item"
          @click="openDetail(item)"
        >
          <span class="notice__mark" :class="{ 'is-important': item.level === 'important' }">
            {{ item.pinned ? '顶' : item.level === 'important' ? '要' : '告' }}
          </span>
          <span class="notice__title" :class="{ 'is-important': item.level === 'important' }">{{ item.title }}</span>
          <span class="notice__date">{{ shortDate(item.createdAt) }}</span>
        </li>
      </ul>
      <div v-if="hasMore" class="notice__more" @click="expanded = !expanded">
        {{ expanded ? '收起' : `查看全部 ${announcements.length} 条` }}
      </div>
    </div>

    <!-- 公告详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.title ?? '公告'" width="86%" align-center>
      <p class="notice__detail-meta">
        <span v-if="detail?.level === 'important'" class="notice__detail-flag">重要</span>
        {{ shortDate(detail?.createdAt ?? '') }}
      </p>
      <div class="notice__detail-body">{{ detail?.content }}</div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.notice {
  margin-bottom: 12px;

  &__carousel {
    margin-bottom: 12px;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
    overflow: hidden;
    background: #fff;
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
    background: #fff;
    border: 1px solid $practice-border;
    border-left: 3px solid $practice-primary;
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
    border-top: 1px solid $practice-border;
    cursor: pointer;

    &:active {
      background: #fafbfd;
    }
  }

  &__mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: $practice-soft;
    border: 1px solid $practice-border;
    font-size: 11px;
    font-weight: 700;
    color: $practice-primary;
    line-height: 1;

    &.is-important {
      background: #fef2f2;
      border-color: #fecaca;
      color: $color-error;
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
    font-size: 11.5px;
    color: $text-disabled;
    font-variant-numeric: tabular-nums;
  }

  &__more {
    padding: 9px 14px;
    border-top: 1px solid $practice-border;
    text-align: center;
    font-size: 12.5px;
    color: $practice-primary;
    cursor: pointer;
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
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: $color-error;
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
