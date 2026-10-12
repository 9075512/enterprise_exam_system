<script setup lang="ts">
/**
 * 练题端底部导航栏（**四个** Tab：练题 / 错题本 / 报告 / 我的）。
 *
 * - 固定底部；`env(safe-area-inset-bottom)` 适配全面屏；
 * - 由页面向 `PracticeLayout` 传 `tabbar` 开启（登录页 / 作答页不显示）；
 * - 视觉：冷静蓝 · 商务风（白底 + 上边框 + 实色主色高亮），与练题端其余页面一致。
 */
import type { Component } from 'vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Collection, Notebook, TrendCharts, User } from '@element-plus/icons-vue';

interface TabItem {
  key: string;
  text: string;
  path: string;
  icon: Component;
  /** 路径前缀命中即为激活 */
  match: string;
}

const TABS: TabItem[] = [
  { key: 'home', text: '练题', path: '/practice/home', icon: Collection, match: '/practice/home' },
  { key: 'wrong', text: '错题本', path: '/practice/wrong-book', icon: Notebook, match: '/practice/wrong-book' },
  { key: 'report', text: '报告', path: '/practice/report', icon: TrendCharts, match: '/practice/report' },
  { key: 'profile', text: '我的', path: '/practice/profile', icon: User, match: '/practice/profile' },
];

const route = useRoute();
const router = useRouter();

const activeKey = computed<string>(() => TABS.find((t) => route.path.startsWith(t.match))?.key ?? '');

function go(tab: TabItem): void {
  if (activeKey.value === tab.key) return;
  void router.push(tab.path);
}
</script>

<template>
  <nav class="tabbar" aria-label="练题导航">
    <button
      v-for="tab in TABS"
      :key="tab.key"
      type="button"
      class="tabbar__item"
      :class="{ 'is-active': activeKey === tab.key }"
      :aria-current="activeKey === tab.key ? 'page' : undefined"
      @click="go(tab)"
    >
      <el-icon class="tabbar__icon"><component :is="tab.icon" /></el-icon>
      <span class="tabbar__text">{{ tab.text }}</span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  background: #fff;
  border-top: 1px solid $practice-border;
  padding-bottom: env(safe-area-inset-bottom);

  &__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 52px;
    padding: 0;
    border: none;
    background: transparent;
    color: $text-secondary;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color $transition-fast;

    &.is-active {
      color: $practice-primary;
      font-weight: 600;
    }
  }

  &__icon {
    font-size: 20px;
  }
}
</style>
