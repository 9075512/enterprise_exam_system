import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { latestApp, type AppRelease } from '@/api/apps';
import { installedAppVersion, newerAppVersion, validAppDownloadPath } from '@/utils/appClient';

const DEFER_KEY = 'learner-app-update-deferred-v1';
const DAY = 24 * 60 * 60 * 1000;
export type UpdateResult = 'available' | 'current' | 'empty' | 'failed' | 'unsupported' | 'not-app';
export const useAppUpdatesStore = defineStore('app-updates', () => {
  const installed = computed(() => installedAppVersion());
  const release = ref<AppRelease | null>(null);
  const checking = ref(false);
  const promptVisible = ref(false);
  let lastAttempt = 0;
  let pending: Promise<UpdateResult> | undefined;
  let manualRequested = false;
  function deferred(item: AppRelease): boolean {
    try {
      const value = JSON.parse(localStorage.getItem(DEFER_KEY) || 'null');
      return value?.versionCode === item.versionCode && value?.versionName === item.versionName && value?.until > Date.now();
    } catch { return false; }
  }
  function dismiss() {
    promptVisible.value = false;
    if (release.value) {
      try { localStorage.setItem(DEFER_KEY, JSON.stringify({ versionCode: release.value.versionCode, versionName: release.value.versionName, until: Date.now() + DAY })); }
      catch { /* A blocked browser store must not prevent closing the prompt. */ }
    }
  }
  function check(manual = false): Promise<UpdateResult> {
    if (!installed.value) return Promise.resolve('not-app');
    manualRequested ||= manual;
    if (pending) return pending;
    if (!manual && lastAttempt && Date.now() - lastAttempt < 60 * 60 * 1000) return Promise.resolve('current');
    checking.value = true; lastAttempt = Date.now();
    pending = (async (): Promise<UpdateResult> => {
      try {
        const item = await latestApp();
        if (!item) { release.value = null; promptVisible.value = false; return 'empty'; }
        if (item.status !== 'published' || !Number.isSafeInteger(item.versionCode) || item.versionCode < 1 || !validAppDownloadPath(item.downloadUrl)) throw new Error('Invalid published release');
        release.value = item;
        if (!newerAppVersion(item, installed.value!)) { promptVisible.value = false; return 'current'; }
        const android = navigator.userAgent.match(/Android\s+(\d+(?:\.\d+)?)/i);
        if (android && Number(android[1]) < Number(item.minAndroid)) { promptVisible.value = false; return 'unsupported'; }
        promptVisible.value = manualRequested || !deferred(item);
        return 'available';
      } catch { return 'failed'; }
      finally { checking.value = false; pending = undefined; manualRequested = false; }
    })();
    return pending;
  }
  return { installed, release, checking, promptVisible, check, dismiss };
});
