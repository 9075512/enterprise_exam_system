<script setup lang="ts">
/**
 * 根组件：承载路由出口，并为 Element Plus 注入简体中文语言包。
 * 全屏答题页（/exam/taking/:recordId）与带布局的页面均由此渲染。
 *
 * 说明：Element Plus 默认语言为英文，导致 el-pagination 显示
 * 「Total / items/page / Go to」等英文文案；此处全局切换为 zh-cn 后，
 * 所有分页（共 N 条 / 条/页 / 前往 X 页）及日期等组件文案统一为中文。
 */
import zhCn from 'element-plus/es/locale/lang/zh-cn';
</script>

<template>
  <el-config-provider :locale="zhCn">
    <RouterView />
  </el-config-provider>
</template>
