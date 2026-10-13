/**
 * 练题端公开配置 store（v1.9⑤，Pinia setup 语法）。
 *
 * 数据源：`GET /api/practice/config`（练题实例只读 `practice_settings` 单行表）。
 * 失败时**保持默认值**（与后端默认一致），保证接口不可用时练题端表现与「引入配置项之前」完全相同。
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as practiceApi from '@/api/practice';
import { PRACTICE_CONFIG_DEFAULTS } from '@/constants/practiceSettings';
import type { PracticeConfig } from '@/types';

export const usePracticeConfigStore = defineStore('practiceConfig', () => {
  const config = ref<PracticeConfig>({ ...PRACTICE_CONFIG_DEFAULTS });
  /** 是否已完成一次加载（含失败） */
  const loaded = ref(false);
  /** 进行中的请求（避免并发重复拉取） */
  let inflight: Promise<void> | null = null;

  /** 拉取配置（幂等；`force = true` 时强制刷新） */
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        config.value = await practiceApi.getConfig();
      } catch {
        // 接口不可用：保持默认值
      } finally {
        loaded.value = true;
        inflight = null;
      }
    })();
    return inflight;
  }

  /** 重置为默认值（登出时调用，避免下个账号沿用上个账号的配置） */
  function reset(): void {
    config.value = { ...PRACTICE_CONFIG_DEFAULTS };
    loaded.value = false;
  }

  return { config, loaded, load, reset };
});
