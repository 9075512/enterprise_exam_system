/**
 * 分页状态组合式函数（架构 §5.5）。
 * 与后端分页响应 `{ list, total, page, pageSize }` 对齐。
 *
 * 用法：
 *   const { list, page, pageSize, total, loading, load, onPageChange, onSizeChange } =
 *     usePagination((p, ps) => listQuestions({ page: p, pageSize: ps }));
 *   onMounted(load);
 *
 * 未显式传入 defaultPageSize 时，取系统设置 defaultPageSize。
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import type { Page } from '@/types';

export function usePagination<T>(
  loadFn: (page: number, pageSize: number) => Promise<Page<T>>,
  defaultPageSize?: number,
) {
  const settingsStore = useSettingsStore();
  const list = ref<T[]>([]) as Ref<T[]>;
  const page = ref(1);
  const pageSize = ref(defaultPageSize ?? settingsStore.settings.defaultPageSize);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  let requestId = 0;
  let disposed = false;

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      requestId += 1;
      loading.value = false;
    });
  }

  /** 按当前 page/pageSize 拉取数据；仅最新响应回填，失败记录在 error 中。 */
  async function load(): Promise<void> {
    if (disposed) return;
    const currentId = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const res = await loadFn(page.value, pageSize.value);
      if (currentId !== requestId) return;
      list.value = res.list;
      total.value = res.total;
      page.value = res.page;
      pageSize.value = res.pageSize;
    } catch (e) {
      // 接口提示由 HTTP 层处理；事件回调中的 void load() 不再产生未处理拒绝。
      if (currentId === requestId) {
        error.value = e instanceof Error ? e : new Error('请求失败');
      }
    } finally {
      if (currentId === requestId) loading.value = false;
    }
  }

  /** 清空列表并作废在途响应（例如取消选中的考试）。 */
  function clear(): void {
    requestId += 1;
    list.value = [];
    total.value = 0;
    page.value = 1;
    error.value = null;
    loading.value = false;
  }

  /** 翻页（组件 el-pagination @current-change） */
  function onPageChange(p: number): void {
    page.value = p;
    void load();
  }

  /** 改变每页条数（组件 el-pagination @size-change，回到第 1 页） */
  function onSizeChange(size: number): void {
    pageSize.value = size;
    page.value = 1;
    void load();
  }

  /** 重置到第 1 页并重新加载 */
  function reset(): void {
    page.value = 1;
    void load();
  }

  return { list, page, pageSize, total, loading, error, load, clear, onPageChange, onSizeChange, reset };
}
