import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { usePracticeAuthStore } from './stores/practiceAuth';
import { setPracticeUnauthorizedHandler } from './api/http';

// Element Plus 命令式组件（ElMessage/ElMessageBox/ElNotification）样式兜底：
// 按需引入下这些组件的样式不会被组件 resolver 自动注入，此处显式引入。
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-notification.css';
import './styles/index.scss';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// 注册练题 401 全局回调：清练题会话 + 跳练题登录页（仅本地清理，不触发后端登出，避免递归）
setPracticeUnauthorizedHandler(() => {
  const practiceAuth = usePracticeAuthStore();
  practiceAuth.clearSession();
  void router.replace('/practice');
});

app.mount('#app');
