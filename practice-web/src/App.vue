<script setup lang="ts">
/**
 * 根组件：承载路由出口，并为 Element Plus 注入简体中文语言包。
 * 练题端仅有公网练题路由，全部经由此处渲染。
 *
 * Loading 体系（2026-10-15，与管理/考试端同源）：顶栏进度细条挂全局；
 * 首次路由解析期间显示品牌脉冲全屏（品牌字「练」/ PRACTICE）。
 */
import { onMounted, ref } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useRouter } from 'vue-router';
import BootSplash from '@/components/common/BootSplash.vue';
import PageProgress from '@/components/common/PageProgress.vue';

const router = useRouter();
/** 首次路由解析完成前显示品牌脉冲 */
const booting = ref(true);

onMounted(() => {
  void router.isReady().then(() => {
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
