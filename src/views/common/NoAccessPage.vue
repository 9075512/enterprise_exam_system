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
  <main data-ui-layout="status" data-ui-page="NoAccessPage" class="no-access">
    <section class="no-access__card">
      <h1>暂无可访问的菜单</h1>
      <p>当前账号尚未分配页面权限，请联系管理员配置菜单权限。</p>
      <el-button type="primary" @click="signOut">退出并切换账号</el-button>
    </section>
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
  background: var(--el-bg-color-page);
}
.no-access__card { max-width: 560px; padding: 40px 32px; background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: var(--ui-radius-16); }
.no-access__card h1 { margin: 0 0 16px; font-size: 24px; color: var(--el-text-color-primary); }
.no-access__card p { margin: 0 0 24px; line-height: 1.7; color: var(--el-text-color-secondary); }
@media (max-width: 600px) { .no-access { padding: 16px; } .no-access__card { padding: 32px 20px; } }
</style>
