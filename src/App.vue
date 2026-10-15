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

const router = useRouter();
/** 首次路由解析完成前显示品牌脉冲（后续导航由顶栏细条承担） */
const booting = ref(true);

onMounted(() => {
  void router.isReady().then(() => {
    // 最少停留 400ms：避免快网下闪一帧
    window.setTimeout(() => (booting.value = false), 400);
  });
});
</script>

<template>
  <el-config-provider :locale="zhCn">
    <PageProgress />
    <BootSplash :show="booting" />
    <RouterView />
  </el-config-provider>
</template>
