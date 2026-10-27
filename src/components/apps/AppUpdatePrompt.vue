<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { formatAppSize } from '@/api/apps';
import { useAppUpdatesStore } from '@/stores/appUpdates';
const route = useRoute();
const updates = useAppUpdatesStore();
const hidden = ref(document.hidden);
const downloadPage = `${location.origin}/download`;
const safePage = computed(() => ['/login', '/exam/home', '/profile'].includes(route.path));
const visible = computed(() => safePage.value && !hidden.value && updates.promptVisible);
const notes = computed(() => updates.release?.releaseNotes.split(/\r?\n/).filter(line => line.trim()) ?? []);
function checkWhenSafe() { hidden.value = document.hidden; if (safePage.value && !hidden.value) void updates.check(); }
async function copyLink(close = false) {
  try { await navigator.clipboard.writeText(downloadPage); ElMessage.success('下载链接已复制，请在手机浏览器中打开'); if (close) updates.dismiss(); }
  catch { ElMessage.info(`请在手机浏览器访问 ${location.origin}/download`); }
}
watch(safePage, value => { if (value) checkWhenSafe(); });
onMounted(() => {
  checkWhenSafe();
  document.addEventListener('visibilitychange', checkWhenSafe);
  window.addEventListener('zhuoda:app-foreground', checkWhenSafe);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', checkWhenSafe);
  window.removeEventListener('zhuoda:app-foreground', checkWhenSafe);
});
</script>

<template>
  <el-dialog :model-value="visible" title="发现新版本" width="min(480px, 92vw)" class="app-update" :close-on-click-modal="false" append-to-body @update:model-value="value => { if (!value) updates.dismiss(); }">
    <template v-if="updates.release">
      <p class="app-update__version"><strong>{{ updates.release.appName }} {{ updates.release.versionName }}</strong><span>当前 {{ updates.installed?.name }} · {{ formatAppSize(updates.release.fileSize) }}</span></p>
      <div class="app-update__notes" tabindex="0" aria-label="更新说明"><p v-for="(line, index) in notes" :key="index">{{ line }}</p></div>
      <p class="app-update__hint">更新后保留原账号和学习记录。请在完成考试后下载安装。</p>
      <p v-if="updates.installed?.code === undefined" class="app-update__hint">请复制链接到手机浏览器打开，下载后覆盖安装：{{ downloadPage }}</p>
      <el-button v-else link type="primary" @click="copyLink()">复制下载链接</el-button>
    </template>
    <template #footer><el-button @click="updates.dismiss">稍后再说</el-button><el-button v-if="updates.installed?.code === undefined" type="primary" @click="copyLink(true)">复制链接更新</el-button><a v-else-if="updates.release" class="app-update__download" :href="updates.release.downloadUrl" @click="updates.dismiss">下载更新</a></template>
  </el-dialog>
</template>

<style scoped>
.app-update__version { display: flex; flex-direction: column; gap: 6px; margin: 0 0 16px; }
.app-update__version strong { font-size: 18px; color: var(--el-text-color-primary); }
.app-update__version span, .app-update__hint { font-size: 13px; color: var(--el-text-color-secondary); line-height: 1.7; overflow-wrap: anywhere; }
.app-update__notes { max-height: 30dvh; overflow-y: auto; line-height: 1.7; white-space: pre-wrap; }
.app-update__notes p { margin: 6px 0; }
.app-update__download { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; margin-left: 12px; border-radius: var(--el-border-radius-base); color: var(--el-color-white); background: var(--el-color-primary); text-decoration: none; }
.app-update :deep(.el-button) { min-height: 44px; }
</style>
