/**
 * 考试维度范围（v1.9④）。
 *
 * 背景：补考管理 / 成绩复核 / 人工阅卷三张「考务队列」页原先只能全局浏览，
 * 与「考试管理」是断开的——想处理某场考试的问题，得自己去列表里找。
 *
 * 本组合式函数把「当前收窄到哪场考试」统一存进路由 query（`?examId=`），
 * 于是三处入口共用同一份状态：
 *   1) 考试管理页行操作的直达链接（`/admin/retakes?examId=xxx`）；
 *   2) 页面内的考试选择器（写回 query，刷新/分享链接后仍保持范围）；
 *   3) 浏览器前进后退（外部导航会同步回 `examId`）。
 */
import { ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/** 兼容 query 可能是数组 / undefined 的情况。 */
function normalize(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '');
  return typeof v === 'string' ? v : '';
}

export function useExamScope(): { examId: Ref<string> } {
  const route = useRoute();
  const router = useRouter();
  const examId = ref<string>(normalize(route.query.examId));

  // 页面内改动 → 写回 query（replace，不产生多余历史记录）
  watch(examId, (value) => {
    if (normalize(route.query.examId) === value) return;
    const query = { ...route.query };
    if (value) query.examId = value;
    else delete query.examId;
    void router.replace({ query });
  });

  // 外部导航（考试管理直达 / 前进后退）→ 同步回页面状态
  watch(
    () => route.query.examId,
    (value) => {
      const next = normalize(value);
      if (next !== examId.value) examId.value = next;
    },
  );

  return { examId };
}
