import { computed, onMounted, onUnmounted, ref } from 'vue';
import QRCode from 'qrcode';
import { latestApp, type AppRelease } from '@/api/apps';
import { useSettingsStore } from '@/stores/settings';

/** 正式下载页与选稿共用真实发布数据及平台处理。 */
export function useAppDownload() {
  const brand = useSettingsStore();
  const release = ref<AppRelease | null>(null);
  const loading = ref(true);
  const error = ref('');
  const qr = ref('');
  const qrFailed = ref(false);
  const showBrowserHint = ref(false);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  const pageUrl = `${location.origin}/download`;
  let disposed = false;
  const appName = computed(() => release.value?.appName || '卓达学习');
  const canDownload = computed(() => !!release.value && !loading.value && !error.value && !ios);
  const downloadUrl = computed(() => canDownload.value ? release.value?.downloadUrl : undefined);
  const buttonText = computed(() => loading.value ? '正在获取版本…' : error.value ? '版本加载失败' : !release.value ? '安装包待发布' : ios ? '此版本适用于安卓' : '下载 Android 版');
  const releaseLines = computed(() => release.value?.releaseNotes.split(/\r?\n/).map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean) ?? []);

  async function load() {
    loading.value = true;
    error.value = '';
    release.value = null;
    try {
      const result = await latestApp();
      if (!disposed) release.value = result;
    } catch {
      if (!disposed) error.value = '版本信息暂时无法加载，请稍后重试。';
    } finally {
      if (!disposed) loading.value = false;
    }
  }
  async function makeQr() {
    qrFailed.value = false;
    try {
      const result = await QRCode.toDataURL(pageUrl, { width: 256, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#172338', light: '#ffffff' } });
      if (!disposed) qr.value = result;
    } catch {
      if (!disposed) qrFailed.value = true;
    }
  }
  function download(event: MouseEvent) {
    if (!canDownload.value || wechat) {
      event.preventDefault();
      if (canDownload.value && wechat) showBrowserHint.value = true;
    }
  }
  onMounted(() => {
    void brand.loadPublic().catch(() => { /* 使用品牌默认值。 */ });
    void load();
    void makeQr();
  });
  onUnmounted(() => { disposed = true; });
  return { brand, appName, release, releaseLines, loading, error, qr, qrFailed, ios, wechat, pageUrl, canDownload, downloadUrl, buttonText, showBrowserHint, load, makeQr, download };
}

export type AppDownloadState = ReturnType<typeof useAppDownload>;
