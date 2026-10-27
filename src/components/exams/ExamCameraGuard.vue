<script setup lang="ts">
import { createCaptureId } from '@/utils/captureId';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useExamCamera } from '@/composables/useExamCamera';
import * as captures from '@/api/captures';
import type { CaptureConfig } from '@/types';

const props = defineProps<{ recordId: string; config: CaptureConfig; active: boolean; compact?: boolean; initialCaptureSaved?: boolean }>();
const emit = defineEmits<{ lockedChange: [locked: boolean] }>();
const camera = useExamCamera();
const { video, state, error } = camera;
const framesReady = ref(false);
const uploadError = ref('');
const lastUploaded = ref('');
const locked = computed(() => props.active && props.config.enabled && props.config.cameraPolicy === 'required' && (state.value !== 'ready' || !framesReady.value));
watch(locked, value => emit('lockedChange', value), { immediate: true });
let timer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let frameTimer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0;
let uploadingEpoch: number | undefined;
let disposed = false;
let skipInitialCapture = Boolean(props.initialCaptureSaved);
let appInBackground = false;
let suspended = false;
let lastReportedEvent = '';
let pendingEvent: { status: Parameters<typeof captures.event>[1]; reason: string; id: string } | undefined;
let eventSending = false;
let eventRetry: ReturnType<typeof setTimeout> | undefined;
let eventAttempts = 0;

// Keep only the latest camera state when disconnected, with a bounded retry budget.
function report(status: Parameters<typeof captures.event>[1], reason = '') {
  if (!props.active || disposed) return;
  const signature = JSON.stringify([status, reason]);
  if (pendingEvent ? JSON.stringify([pendingEvent.status, pendingEvent.reason]) === signature : lastReportedEvent === signature) return;
  clearTimeout(eventRetry);
  pendingEvent = { status, reason, id: createCaptureId() }; eventAttempts = 0;
  void flushEvent();
}
async function flushEvent() {
  if (eventSending || !pendingEvent || !props.active || disposed) return;
  eventSending = true;
  const current = pendingEvent;
  try {
    await captures.event(props.recordId, current.status, current.reason, current.id);
    lastReportedEvent = JSON.stringify([current.status, current.reason]);
    if (pendingEvent === current) pendingEvent = undefined;
  } catch {
    if (pendingEvent === current && ++eventAttempts < 3) eventRetry = setTimeout(() => void flushEvent(), 5000);
    else if (pendingEvent === current) pendingEvent = undefined;
  } finally {
    eventSending = false;
    if (pendingEvent && pendingEvent !== current) void flushEvent();
  }
}
function cancelWork() {
  epoch++; framesReady.value = false;
  clearInterval(timer); clearTimeout(retryTimer); clearTimeout(frameTimer); clearTimeout(eventRetry);
  timer = undefined; retryTimer = undefined; frameTimer = undefined;
  camera.stop();
}
async function take(kind: 'periodic' | 'resume', run = epoch) {
  if (!props.active || document.hidden || appInBackground || state.value !== 'ready' || uploadingEpoch === run || run !== epoch) return;
  uploadingEpoch = run;
  try {
    const file = await camera.photo();
    if (run !== epoch || !props.active) return;
    const id = createCaptureId();
    await send(file, id, kind, run, 0);
  } catch (cause) {
    if (run !== epoch || !props.active) return;
    uploadError.value = cause instanceof Error ? cause.message : '拍照失败，稍后将重试。';
    report('unavailable', uploadError.value);
    stop();
  } finally { if (uploadingEpoch === run) uploadingEpoch = undefined; }
}
async function send(file: Blob, id: string, kind: 'periodic' | 'resume', run: number, attempt: number): Promise<void> {
  if (run !== epoch || !props.active || disposed) return;
  try {
    await captures.upload(props.recordId, file, id, kind);
    if (run !== epoch || !props.active) return;
    uploadError.value = ''; lastUploaded.value = new Date().toLocaleTimeString();
    if (state.value === 'ready') report('ready');
  } catch {
    if (run !== epoch || !props.active || disposed) return;
    uploadError.value = '抓拍上传失败，答案和交卷不受影响。';
    report('upload_failed', uploadError.value);
    // One compressed image at most in the retry queue; the capture ID stays unchanged.
    if (attempt < 2) {
      await new Promise<void>(resolve => {
        retryResolve = resolve;
        retryTimer = setTimeout(() => { retryResolve = undefined; resolve(); }, attempt === 0 ? 2000 : 8000);
      });
      await send(file, id, kind, run, attempt + 1);
    }
  }
}
let retryResolve: (() => void) | undefined;
function stop() { cancelWork(); retryResolve?.(); retryResolve = undefined; }
async function restart() {
  if (!props.active || !props.config.enabled || disposed) { stop(); return; }
  if (document.hidden || appInBackground || state.value === 'opening' || state.value === 'ready') return;
  suspended = false;
  stop();
  const run = epoch;
  await camera.open();
  if (run !== epoch) return;
}
watch(state, (value, previous) => {
  if (!props.active || !props.config.enabled || disposed) return;
  if (value === 'ready' && previous !== 'ready') {
    clearInterval(timer); clearTimeout(frameTimer);
    // Wait for actual video frames; play() can resolve before dimensions are populated.
    let tries = 0;
    const run = epoch;
    const first = () => {
      if (run !== epoch || !props.active || document.hidden || appInBackground || state.value !== 'ready') return;
      if (video.value && video.value.readyState >= 2 && video.value.videoWidth) {
        framesReady.value = true;
        if (!skipInitialCapture) { report('ready'); void take('resume', run); }
        else lastReportedEvent = JSON.stringify(['ready', '']);
        skipInitialCapture = false;
        timer = setInterval(() => void take('periodic'), props.config.intervalMinutes * 60000);
        return;
      }
      if (++tries < 40) frameTimer = setTimeout(first, 250);
      else { skipInitialCapture = false; uploadError.value = '摄像头没有返回可用画面，请重新开启。'; report('unavailable', uploadError.value); camera.stop(); }
    };
    first();
  } else if (value === 'interrupted' || value === 'error') {
    skipInitialCapture = false; framesReady.value = false;
    clearInterval(timer); clearTimeout(frameTimer);
    report(value === 'error' ? 'unavailable' : 'interrupted', error.value);
  }
});
function suspend(reason: string) {
  if (!props.active || !props.config.enabled || suspended) return;
  suspended = true; skipInitialCapture = false;
  report('interrupted', reason); stop();
}
function visibility() {
  if (!props.active || !props.config.enabled) return;
  if (document.hidden) suspend('考试页面进入后台，摄像头采集暂停');
  else void restart();
}
function appBackground() { appInBackground = true; suspend('安卓 App 进入后台，摄像头采集暂停'); }
function appForeground() { appInBackground = false; void restart(); }
function online() { if (pendingEvent) void flushEvent(); if (state.value === 'ready' && uploadError.value) void take('periodic'); }
onMounted(() => {
  watch(() => [props.active, props.config.enabled, props.recordId] as const, (current, previous) => {
    if (previous && current[2] !== previous[2]) { stop(); skipInitialCapture = false; pendingEvent = undefined; lastReportedEvent = ''; }
    void restart();
  }, { immediate: true });
  document.addEventListener('visibilitychange', visibility); window.addEventListener('online', online);
  window.addEventListener('zhuoda:app-background', appBackground); window.addEventListener('zhuoda:app-foreground', appForeground);
});
onBeforeUnmount(() => {
  disposed = true; stop(); pendingEvent = undefined;
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online);
  window.removeEventListener('zhuoda:app-background', appBackground); window.removeEventListener('zhuoda:app-foreground', appForeground);
  emit('lockedChange', false);
});
</script>

<template>
  <section v-if="config.enabled && active" class="exam-camera" :class="{ 'exam-camera--compact': compact }" aria-label="考试摄像头">
    <video ref="video" autoplay muted playsinline aria-label="考试摄像头预览" />
    <div class="exam-camera__body">
      <strong>{{ state === 'ready' ? '摄像头已开启' : state === 'opening' ? '正在打开摄像头…' : '摄像头未就绪' }}</strong>
      <p role="status">每 {{ config.intervalMinutes }} 分钟抓拍一次<span v-if="lastUploaded">，最近上传 {{ lastUploaded }}</span>。</p>
      <div v-if="error || uploadError || locked" class="exam-camera__messages" tabindex="0" aria-label="摄像头异常说明">
        <p v-if="error || uploadError" role="alert">{{ error || uploadError }}</p>
        <p v-if="locked">请恢复摄像头后继续答题，已答内容保留，倒计时继续；仍可交卷或暂存退出。</p>
      </div>
    </div>
    <div v-if="state !== 'ready' || uploadError" class="exam-camera__actions">
      <el-button v-if="state !== 'ready'" :loading="state === 'opening'" @click="restart">重新开启摄像头</el-button>
      <el-button v-else-if="uploadError" @click="take('periodic')">重新抓拍</el-button>
    </div>
  </section>
</template>

<style scoped>
.exam-camera { display: flex; gap: 12px; padding: 14px; margin-bottom: 16px; border: 1px solid var(--el-border-color); border-radius: 10px; background: var(--el-bg-color); }
video { width: 128px; aspect-ratio: 4 / 3; object-fit: contain; align-self: flex-start; background: var(--el-fill-color-dark); border-radius: 6px; }
.exam-camera__body { min-width: 0; font-size: 14px; line-height: 1.6; }
p { margin: 4px 0; }
.exam-camera__actions { flex: 0 0 auto; }
.exam-camera--compact { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: start; gap: 8px; padding: 10px; margin: 0; }
.exam-camera--compact video { width: 76px; }
.exam-camera--compact .exam-camera__body { font-size: 12px; overflow-wrap: anywhere; }
.exam-camera--compact .exam-camera__messages { max-height: min(72px, 10dvh); overflow-y: auto; overscroll-behavior: contain; }
.exam-camera--compact .exam-camera__actions { grid-column: 1 / -1; }
.exam-camera--compact .exam-camera__actions :deep(.el-button) { width: 100%; min-height: 32px; }
@media (max-width: 600px) { .exam-camera { flex-wrap: wrap; } video { width: 96px; } .exam-camera__body { flex: 1; min-width: 180px; } }
</style>
