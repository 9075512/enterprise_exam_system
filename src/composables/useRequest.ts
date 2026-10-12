/**
 * 通用异步数据组合式函数（架构 §5.5）。
 * 返回 { data, loading, error, run, refresh }。
 */
import { ref, watch, type Ref } from 'vue';

export interface UseRequestOptions {
  immediate?: boolean;
}

export function useRequest<T>(
  fn: () => Promise<T>,
  deps: Ref<unknown>[] = [],
  options: UseRequestOptions = {},
) {
  const { immediate = true } = options;
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function run(): Promise<T | null> {
    loading.value = true;
    error.value = null;
    try {
      const result = await fn();
      data.value = result;
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error('请求失败');
      return null;
    } finally {
      loading.value = false;
    }
  }

  if (immediate) void run();
  if (deps.length) watch(deps, () => void run());

  return { data, loading, error, run, refresh: run };
}
