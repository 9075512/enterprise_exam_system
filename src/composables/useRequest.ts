/**
 * 通用异步数据组合式函数（架构 §5.5）。
 * 返回 { data, loading, error, run, refresh }。
 */
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';

export interface UseRequestOptions {
  immediate?: boolean;
  /** 切换实体时传 false，避免在新标题下短暂展示旧数据。 */
  keepPreviousData?: boolean;
}

export function useRequest<T>(
  fn: () => Promise<T>,
  deps: Ref<unknown>[] = [],
  options: UseRequestOptions = {},
) {
  const { immediate = true, keepPreviousData = true } = options;
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);
  // 仅最新请求可更新界面；较早请求仍向原调用者返回结果。
  let requestId = 0;
  let disposed = false;

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      requestId += 1;
      loading.value = false;
    });
  }

  async function run(): Promise<T | null> {
    if (disposed) return null;
    const currentId = ++requestId;
    loading.value = true;
    error.value = null;
    if (!keepPreviousData) data.value = null;
    try {
      const result = await fn();
      if (currentId === requestId) data.value = result;
      return result;
    } catch (e) {
      if (currentId === requestId) {
        error.value = e instanceof Error ? e : new Error('请求失败');
      }
      return null;
    } finally {
      if (currentId === requestId) loading.value = false;
    }
  }

  if (immediate) void run();
  if (deps.length) watch(deps, () => void run());

  return { data, loading, error, run, refresh: run };
}
