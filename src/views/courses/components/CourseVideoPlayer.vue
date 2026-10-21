<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FullScreen, Refresh, VideoPause, VideoPlay, Warning } from '@element-plus/icons-vue';
import { formatVideoTime } from '@/data/courses';
import type { PlaybackProgress } from '@/composables/useCourseProgress';

const props = defineProps<{ courseId: string; lessonId: string; src: string; title: string; initialPosition: number; poster: string; demo?: boolean }>();
const emit = defineEmits<{ progress: [courseId: string, lessonId: string, progress: PlaybackProgress]; ended: [] }>();
const video = ref<HTMLVideoElement>();
const container = ref<HTMLElement>();
const position = ref(0);
const duration = ref(0);
const playing = ref(false);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const restored = ref(false);
let expectedSeek: number | null = null;
let resumePosition = props.initialPosition;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = 0;
const percentage = computed(() => duration.value ? Math.min(100, position.value / duration.value * 100) : 0);

function clearTimer(): void { clearTimeout(loadTimer); }
function waitForVideo(): void {
  loading.value = true; clearTimer();
  loadTimer = setTimeout(() => fail('视频加载超时，请检查网络后重试。'), 20000);
}
function flush(completed = false): void {
  if (duration.value > 0) emit('progress', props.courseId, props.lessonId, { position: position.value, duration: duration.value, completed });
}
function metadata(): void {
  const media = video.value;
  if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return;
  duration.value = media.duration;
  const target = Math.min(Math.max(0, resumePosition), Math.max(0, media.duration - 0.1));
  position.value = target;
  restored.value = target > 0;
  if (target > 0) { expectedSeek = target; media.currentTime = target; }
  media.playbackRate = 1;
}
function ready(): void { loading.value = false; clearTimer(); }
function timeUpdate(): void {
  const media = video.value;
  if (!media || media.seeking || expectedSeek !== null || error.value || !duration.value) return;
  position.value = media.currentTime;
  if (Date.now() - lastSaved >= 1000) { flush(); lastSaved = Date.now(); }
}
function seekGuard(): void {
  const media = video.value;
  if (!media) return;
  if (expectedSeek !== null && Math.abs(media.currentTime - expectedSeek) < 0.15) return;
  expectedSeek = position.value;
  media.currentTime = position.value;
  notice.value = '本课程不支持跳播，请按顺序观看。';
}
function seeked(): void {
  if (expectedSeek !== null && video.value && Math.abs(video.value.currentTime - expectedSeek) < 0.15) expectedSeek = null;
}
function rateGuard(): void { if (video.value && video.value.playbackRate !== 1) video.value.playbackRate = 1; }
function fail(message = '视频加载失败，可能是网络异常或视频资源暂不可用。'): void {
  error.value = message; loading.value = false; clearTimer(); playing.value = false;
  video.value?.pause(); flush();
}
async function toggle(): Promise<void> {
  const media = video.value;
  if (!media || error.value) return;
  notice.value = '';
  if (!media.paused) { media.pause(); return; }
  if (media.ended || duration.value > 0 && position.value >= duration.value - 0.1) {
    position.value = 0; expectedSeek = 0; media.currentTime = 0; restored.value = false;
  }
  try { await media.play(); }
  catch (reason) {
    if ((reason as DOMException)?.name === 'AbortError') return;
    if ((reason as DOMException)?.name === 'NotAllowedError') { ready(); notice.value = '浏览器暂未允许播放，请再次点击播放按钮。'; }
    else fail();
  }
}
function paused(): void { playing.value = false; flush(); }
function ended(): void { position.value = duration.value; playing.value = false; flush(true); emit('ended'); }
function retry(): void {
  resumePosition = position.value || props.initialPosition;
  error.value = ''; notice.value = ''; expectedSeek = null;
  waitForVideo(); video.value?.load();
}
async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (container.value?.requestFullscreen) await container.value.requestFullscreen();
    else notice.value = '当前浏览器不支持页面全屏，可横屏观看。';
  } catch { notice.value = '暂时无法进入全屏，可横屏观看。'; }
}
function visibility(): void { if (document.visibilityState === 'hidden') flush(); }
onMounted(() => { waitForVideo(); window.addEventListener('pagehide', flushOnExit); document.addEventListener('visibilitychange', visibility); });
function flushOnExit(): void { flush(); }
onBeforeUnmount(() => { flush(); video.value?.pause(); clearTimer(); window.removeEventListener('pagehide', flushOnExit); document.removeEventListener('visibilitychange', visibility); });
</script>

<template>
  <div ref="container" class="course-player" :aria-label="title + '播放器'">
    <div class="course-player__screen" :aria-busy="loading">
      <video ref="video" :src="src" :poster="poster" preload="metadata" playsinline disablepictureinpicture disableremoteplayback
        controlslist="nodownload noplaybackrate noremoteplayback" :aria-label="title" @contextmenu.prevent
        @loadedmetadata="metadata" @loadeddata="ready" @canplay="ready" @playing="playing = true; ready()" @pause="paused"
        @waiting="waitForVideo" @stalled="waitForVideo" @timeupdate="timeUpdate" @seeking="seekGuard" @seeked="seeked"
        @ratechange="rateGuard" @ended="ended" @error="fail()" @click="toggle" />
      <div v-if="error" class="course-player__overlay course-player__error" role="alert">
        <Warning class="player-icon" /><strong>暂时无法播放</strong><p>{{ error }}</p>
        <button type="button" class="player-retry" @click="retry"><Refresh />重新加载</button>
      </div>
      <div v-else-if="loading" class="course-player__overlay" role="status"><span class="player-spinner" /><span>正在加载视频…</span></div>
      <button v-else-if="!playing" type="button" class="course-player__big-play" aria-label="播放视频" @click="toggle"><VideoPlay /></button>
      <span v-if="restored && !playing && !error && !loading" class="course-player__resume">已续播至 {{ formatVideoTime(initialPosition) }}</span>
      <span class="course-player__label">{{ demo ? '课程演示 · 公开样片' : '课程视频' }}</span>
    </div>
    <div class="course-player__controls">
      <button type="button" :aria-label="playing ? '暂停视频' : '播放视频'" :disabled="!!error || loading" @click="toggle"><component :is="playing ? VideoPause : VideoPlay" /></button>
      <time>{{ formatVideoTime(position) }} <span>/ {{ formatVideoTime(duration) }}</span></time>
      <div class="course-player__track" role="progressbar" aria-label="观看进度（不可拖动）" :aria-valuenow="Math.round(percentage)" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: `${percentage}%` }" /></div>
      <span class="course-player__rate" title="本课程固定正常倍速">1.0×</span>
      <button type="button" aria-label="切换全屏" @click="fullscreen"><FullScreen /></button>
    </div>
    <p v-if="notice" class="course-player__notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.course-player { overflow: hidden; border-radius: $radius-lg; background: #101b2d; color: #fff; }
.course-player:fullscreen { display: flex; flex-direction: column; justify-content: center; border-radius: 0; }
.course-player__screen { position: relative; aspect-ratio: 16 / 9; background: #0b1423; overflow: hidden; }
video { display: block; width: 100%; height: 100%; object-fit: contain; cursor: pointer; }
.course-player__overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 24px; background: #0b1423eb; text-align: center; }
.course-player__overlay p { margin: 0; color: #c5cedc; font-size: 13px; }
.player-icon { width: 34px; color: #fbbf6d; }
.player-spinner { width: 30px; height: 30px; border: 3px solid #ffffff30; border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.course-player__big-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70px; height: 70px; border: 1px solid #ffffff70; border-radius: 50%; color: #fff; background: rgba($text-primary, .6); backdrop-filter: blur(8px); cursor: pointer; }
.course-player__big-play svg { width: 40px; vertical-align: middle; }
.course-player__label, .course-player__resume { position: absolute; padding: 5px 10px; border-radius: 5px; font-size: 11px; background: #101b2dc9; color: #e0e8f3; }
.course-player__label { top: 16px; left: 16px; letter-spacing: 1px; }
.course-player__resume { bottom: 16px; left: 50%; transform: translateX(-50%); white-space: nowrap; }
.course-player__controls { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.course-player__controls button { display: grid; place-items: center; flex: 0 0 32px; height: 32px; padding: 5px; background: transparent; border: 0; color: #fff; cursor: pointer; }
.course-player__controls button:disabled { opacity: .35; cursor: default; }
.course-player__controls svg { width: 22px; }
.course-player__controls time { font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.course-player__controls time span { color: #9eafc6; }
.course-player__track { flex: 1; height: 4px; border-radius: 4px; background: #344157; overflow: hidden; }
.course-player__track span { display: block; height: 100%; background: #69a1ff; transition: width .25s linear; }
.course-player__rate { font-size: 12px; color: #bac8dc; }
.course-player__notice { margin: 0; padding: 0 16px 12px; color: #f6d39d; font-size: 12px; }
.player-retry { display: flex; align-items: center; gap: 7px; padding: 9px 16px; border: 0; border-radius: 6px; background: $color-primary; color: #fff; cursor: pointer; }
.player-retry svg { width: 16px; }
button:focus-visible { outline: 2px solid #8fbbff; outline-offset: 3px; }
@media (max-width: 540px) { .course-player__controls { gap: 8px; padding: 8px; } .course-player__big-play { width: 54px; height: 54px; } .course-player__label { top: 9px; left: 9px; font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { .course-player__track span { transition: none; } }
</style>
