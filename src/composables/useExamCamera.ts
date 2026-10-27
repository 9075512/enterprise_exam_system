import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

export function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  return ({ NotAllowedError: '摄像头授权被拒绝，请在浏览器或 App 设置中允许使用摄像头。',
    NotFoundError: '未找到摄像头，请连接设备后重试。', NotReadableError: '摄像头被占用或无法读取，请关闭其他使用摄像头的程序。',
    SecurityError: '当前页面无法使用摄像头，请通过 HTTPS 打开考试。' } as Record<string, string>)[name ?? '']
    ?? (error instanceof Error ? error.message : '无法打开摄像头，请检查设备后重试。');
}

export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) throw new Error('摄像头画面尚未准备好，请稍后重试。');
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前设备不支持拍照。');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('拍照失败，请重试。')), 'image/jpeg', 0.8));
}

export function useExamCamera() {
  const video = ref<HTMLVideoElement | null>(null);
  const state = ref<'idle' | 'opening' | 'ready' | 'error' | 'interrupted'>('idle');
  const error = ref('');
  let stream: MediaStream | undefined;
  let generation = 0;
  function stop() {
    generation++;
    const previous = stream; stream = undefined;
    previous?.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.onunmute = null; track.stop(); });
    if (video.value) video.value.srcObject = null;
    state.value = 'idle';
  }
  async function attach() {
    if (!video.value || !stream) return;
    video.value.srcObject = stream;
    await video.value.play();
  }
  watch(video, () => { if (stream) void attach().catch(() => {}); });
  async function open(): Promise<boolean> {
    stop();
    const request = generation;
    state.value = 'opening'; error.value = '';
    try {
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) throw new DOMException('请通过 HTTPS 打开考试并确认设备支持摄像头。', 'SecurityError');
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (request !== generation) { acquired.getTracks().forEach(track => track.stop()); return false; }
      stream = acquired;
      const track = acquired.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('摄像头未返回可用画面。');
      const interrupted = () => { if (stream !== acquired) return; state.value = 'interrupted'; error.value = '摄像头画面已中断，请恢复摄像头。'; };
      track.onended = interrupted; track.onmute = interrupted;
      track.onunmute = () => { if (stream === acquired && track.readyState === 'live') { state.value = 'ready'; error.value = ''; } };
      await nextTick();
      let playbackTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          attach(),
          new Promise<never>((_resolve, reject) => { playbackTimeout = setTimeout(() => reject(new Error('摄像头画面加载超时，请重新开启。')), 10000); }),
        ]);
      } finally { clearTimeout(playbackTimeout); }
      if (request !== generation) return false;
      if (track.muted) { interrupted(); return false; }
      state.value = 'ready';
      return true;
    } catch (cause) {
      if (request !== generation) return false;
      stop(); error.value = cameraErrorMessage(cause); state.value = 'error';
      return false;
    }
  }
  async function photo() {
    if (state.value !== 'ready' || !video.value) throw new Error('请先开启摄像头。');
    return captureFrame(video.value);
  }
  onBeforeUnmount(stop);
  return { video, state, error, open, stop, photo };
}
