import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as practiceApi from '@/api/practice';
import { PRACTICE_CONFIG_DEFAULTS } from '@/constants/practiceSettings';
import type { PracticeConfig } from '@/types';

export const usePracticeConfigStore = defineStore('practiceConfig', () => {
  const config = ref<PracticeConfig>({ ...PRACTICE_CONFIG_DEFAULTS });
  const loaded = ref(false);
  let inflight: Promise<void> | null = null;
  let revision = 0;

  async function load(force = false): Promise<void> {
    if (inflight) return inflight;
    if (loaded.value && !force) return;
    const currentRevision = revision;
    inflight = (async () => {
      try {
        const next = await practiceApi.getConfig();
        if (currentRevision === revision) {
          config.value = { ...PRACTICE_CONFIG_DEFAULTS, ...next };
          loaded.value = true;
        }
      } catch {
        // 保持默认配置，避免配置接口短暂失败阻断练题。
      } finally {
        if (currentRevision === revision) inflight = null;
      }
    })();
    return inflight;
  }

  function reset(): void {
    revision += 1;
    inflight = null;
    config.value = { ...PRACTICE_CONFIG_DEFAULTS };
    loaded.value = false;
  }

  return { config, loaded, load, reset };
});
