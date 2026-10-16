<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
function signOut(): void {
  auth.logout();
  void router.replace('/login');
}
</script>

<template>
  <main class="no-access">
    <h1>暂无可访问的菜单</h1>
    <p>当前账号尚未分配页面权限，请联系管理员配置菜单权限。</p>
    <el-button type="primary" @click="signOut">退出并切换账号</el-button>
  </main>
</template>

<style scoped>
.no-access {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  padding: 24px;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
