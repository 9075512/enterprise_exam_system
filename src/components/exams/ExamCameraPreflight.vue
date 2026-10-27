<script setup lang="ts">
import { createCaptureId } from '@/utils/captureId';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useExamCamera } from '@/composables/useExamCamera';
import type { CaptureConfig } from '@/types';
import type { StartCapture } from '@/api/captures';

const visible = ref(false);
const config = ref<CaptureConfig>();
const taking = ref(false);
const message = ref('');
const camera = useExamCamera();
const { video, state, error } = camera;
let resolvePending: ((value: StartCapture | null) => void) | undefined;
function finish(value: StartCapture | null) {
  resolvePending?.(value); resolvePending = undefined;
  visible.value = false; camera.stop();
}
async function confirm() {
  taking.value = true; message.value = '';
  try { finish({ file: await camera.photo(), captureId: createCaptureId() }); }
  catch (cause) { message.value = cause instanceof Error ? cause.message : '拍照失败，请重试。'; }
  finally { taking.value = false; }
}
function skip() { finish({ captureId: createCaptureId(), reason: error.value || '考生未开启摄像头' }); }
function prepare(value: CaptureConfig): Promise<StartCapture | null> {
  finish(null); config.value = value; message.value = ''; visible.value = true;
  // The user explicitly starts the camera after reading the purpose notice.
  return new Promise(resolve => { resolvePending = resolve; });
}
function background() { if (visible.value) camera.stop(); }
function visibility() { if (document.hidden) background(); }
onMounted(() => { document.addEventListener('visibilitychange', visibility); window.addEventListener('zhuoda:app-background', background); });
onBeforeUnmount(() => { finish(null); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('zhuoda:app-background', background); });
defineExpose({ prepare });
</script>

<template>
  <el-dialog v-model="visible" title="考试拍照准备" width="min(520px, 94vw)" :close-on-click-modal="false" :before-close="() => finish(null)" @closed="camera.stop">
    <p>本场考试将保存开考照片，并每 {{ config?.intervalMinutes }} 分钟抓拍一次，用于管理员考试复核。照片保留 {{ config?.retentionDays }} 天后自动清理。</p>
    <p>请正对摄像头并保持光线充足。准备期间尚未开始新的考试计时；续考仍沿用原计时。</p>
    <video ref="video" autoplay muted playsinline class="camera-preview" aria-label="开考摄像头预览" />
    <p v-if="error || message" role="alert">{{ message || error }}</p>
    <p v-else role="status">{{ state === 'ready' ? '摄像头已开启，可以拍照进入考试。' : state === 'opening' ? '正在打开摄像头…' : '点击开启摄像头后，浏览器或系统会请求授权。' }}</p>
    <template #footer>
      <el-button @click="finish(null)">取消</el-button>
      <el-button v-if="config?.cameraPolicy === 'optional' && state !== 'ready'" @click="skip">记录异常并进入</el-button>
      <el-button v-if="state !== 'ready'" type="primary" :loading="state === 'opening'" @click="camera.open">开启摄像头</el-button>
      <el-button v-else type="primary" :loading="taking" @click="confirm">拍照并进入考试</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.camera-preview { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: var(--el-fill-color-dark); border-radius: 8px; }
p { line-height: 1.65; }
</style>
