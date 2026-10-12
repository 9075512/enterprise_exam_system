<script setup lang="ts">
/**
 * 根组件：承载路由出口，并为 Element Plus 注入简体中文语言包。
 * 练题端仅有公网练题路由，全部经由此处渲染。
 */
import zhCn from 'element-plus/es/locale/lang/zh-cn';
</script>

<template>
  <el-config-provider :locale="zhCn">
    <RouterView />
  </el-config-provider>
</template>
