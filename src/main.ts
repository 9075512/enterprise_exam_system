import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { usePracticeAuthStore } from './stores/practiceAuth';
import { setPracticeUnauthorizedHandler, setUnauthorizedHandler } from './api/http';

// Element Plus 命令式组件（ElMessage/ElMessageBox/ElNotification）样式兜底：
// 按需引入下这些组件的样式不会被组件 resolver 自动注入，此处显式引入。
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-notification.css';
import './styles/index.scss';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// 注册 401 全局回调：清会话 + 跳登录（避免 api/http.ts 直接依赖 store/router 造成循环依赖）
// 注意：这里**只能做纯本地清理**（clearSession），绝不可调用 auth.logout() ——
// logout() 会向后端发 POST /auth/logout，而会话已失效时该请求必然 401，
// 又回到本回调，形成无限递归弹窗。http.ts 侧另有 401 去重闸门做第二道防护。
setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  auth.clearSession();
  void router.replace('/login');
});

// 注册练题 401 全局回调：清练题会话 + 跳练题登录页。
// 与内网回调相互独立：练题登录态失效**不**触发内网登出，反之亦然。
setPracticeUnauthorizedHandler(() => {
  const practiceAuth = usePracticeAuthStore();
  practiceAuth.clearSession();
  void router.replace('/practice');
});

app.mount('#app');
