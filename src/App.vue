<script setup lang="ts">
/**
 * 根组件：承载路由出口，并为 Element Plus 注入简体中文语言包。
 * 全屏答题页（/exam/taking/:recordId）与带布局的页面均由此渲染。
 *
 * Loading 体系（2026-10-15）：顶栏进度细条挂全局（路由级过渡）；
 * 首次路由解析期间显示品牌脉冲全屏（冷启动 > 800ms 场景）。
 *
 * 说明：Element Plus 默认语言为英文，导致 el-pagination 显示
 * 「Total / items/page / Go to」等英文文案；此处全局切换为 zh-cn 后，
 * 所有分页（共 N 条 / 条/页 / 前往 X 页）及日期等组件文案统一为中文。
 */
import { onMounted, ref } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useRouter } from 'vue-router';
import BootSplash from '@/components/common/BootSplash.vue';
import PageProgress from '@/components/common/PageProgress.vue';
import { useDelayedLoading } from '@/composables/useDelayedLoading';

const router = useRouter();
/** 只在首次导航超过 800ms 时显示全屏等待，不人为延长已完成的加载。 */
const booting = ref(true);
const bootVisible = useDelayedLoading(booting, { delay: 800, minDuration: 0 });
const bootFailed = ref(false);

onMounted(() => {
  void router.isReady()
    .catch(() => { bootFailed.value = true; })
    .finally(() => { booting.value = false; });
});

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <el-config-provider :locale="zhCn">
    <PageProgress />
    <BootSplash :show="bootVisible" caption="正在加载系统…" />
    <div v-if="bootFailed" class="boot-error" role="alert">
      <p>页面加载失败，请检查网络后重试。</p>
      <el-button type="primary" @click="reload">重新加载</el-button>
    </div>
    <RouterView v-else />
  </el-config-provider>
</template>

<style scoped>
.boot-error {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 16px;
}
</style>
