<script setup lang="ts">
/**
 * 练题端导航栏（练题 / 错题本 / 报告）。
 *
 * - 固定底部；`env(safe-area-inset-bottom)` 适配全面屏；
 * - 由页面向 `PracticeLayout` 传 `tabbar` 开启（登录页 / 作答页不显示）；
 * - 视觉：冷静蓝 · 商务风（白底 + 上边框 + 实色主色高亮），与练题端其余页面一致。
 */
import type { Component } from 'vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Collection, Notebook, TrendCharts } from '@element-plus/icons-vue';
import { usePracticeConfigStore } from '@/stores/practiceConfig';

interface TabItem {
  key: string;
  text: string;
  path: string;
  icon: Component;
  /** 路径前缀命中即为激活 */
  match: string;
}

const route = useRoute();
const router = useRouter();
const configStore = usePracticeConfigStore();
const integrated = computed(() => route.path.startsWith('/exam/practice'));
const basePath = computed(() => integrated.value ? '/exam/practice' : '/practice');
const homePath = computed(() => integrated.value ? basePath.value : `${basePath.value}/home`);

/** 按后台「页面入口开关」过滤 Tab（错题本 / 报告可关闭，v1.9⑤） */
const tabs = computed<TabItem[]>(() => {
  const base = basePath.value;
  const items: TabItem[] = [
    { key: 'home', text: '练题', path: homePath.value, icon: Collection, match: homePath.value },
    { key: 'wrong', text: '错题本', path: `${base}/wrong-book`, icon: Notebook, match: `${base}/wrong-book` },
    { key: 'report', text: '报告', path: `${base}/report`, icon: TrendCharts, match: `${base}/report` },
  ];
  return items.filter((t) => {
    if (t.key === 'wrong') return configStore.config.wrongBookEnabled;
    if (t.key === 'report') return configStore.config.reportEnabled;
    return true;
  });
});

const activeKey = computed<string>(() => {
  const exact = tabs.value.find((t) => t.key !== 'home' && route.path.startsWith(t.match));
  return exact?.key ?? (route.path === homePath.value ? 'home' : '');
});

function go(tab: TabItem): void {
  if (activeKey.value === tab.key) return;
  void router.push(tab.path);
}
</script>

<template>
  <nav class="tabbar" :class="{ 'is-integrated': integrated }" aria-label="练题导航">
    <button
      v-for="tab in tabs"
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
  background: $bg-paper;
  border-top: 1px solid $border-color;
  padding-bottom: env(safe-area-inset-bottom);

  &__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 56px;
    padding: 0;
    border: none;
    background: transparent;
    color: $text-secondary;
    font-size: 10.5px;
    font-weight: 550;
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color $transition-fast;

    &.is-active {
      color: $practice-primary;
      font-weight: 620;
    }
  }

  &__icon {
    font-size: 20px;
  }
}

// 合并版 PC 使用内容区顶部子导航。
@media (min-width: 901px) {
  .tabbar.is-integrated {
    position: static;
    order: 1;
    align-self: flex-start;
    width: auto;
    margin: 0;
    padding: 4px;
    gap: 4px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-paper;

    .tabbar__item {
      flex: none;
      flex-direction: row;
      gap: 6px;
      width: auto;
      height: 34px;
      padding: 0 14px;
      border-radius: $radius-xs;
      font-size: 13px;

      &.is-active { background: $practice-soft; }
    }

    .tabbar__icon { font-size: 16px; }
  }
}

// 合并版移动端的一级导航由 AppLayout 统一提供；这里降级为练题模块内的横向二级导航。
@media (max-width: 900px) {
  .tabbar.is-integrated {
    position: static;
    z-index: 25;
    order: 1;
    width: auto;
    margin: 8px 12px 0;
    padding: 4px;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    box-sizing: border-box;

    .tabbar__item {
      height: 36px;
      flex-direction: row;
      gap: 5px;
      border-radius: $radius-xs;
      font-size: 12px;

      &.is-active { background: $practice-soft; }
    }

    .tabbar__icon { font-size: 16px; }
  }
}
</style>
