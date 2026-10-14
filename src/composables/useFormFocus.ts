/**
 * 表单「错误聚焦」组合式函数（设计规范 §9.3 / §10）。
 *
 * 规则：校验失败时错误就地显示，并**滚动到、聚焦第一个错误项**。
 * 长表单（尤其多标签页的设置页）里，用户点「保存」时视线停在底部，
 * 若只弹一句 toast，很难定位到底哪一项没填对。
 *
 * 用法：
 *   // 一行版（大多数对话框）
 *   const ok = await validateAndFocus(formRef.value);
 *   if (!ok) return;
 *
 *   // 需要拿 invalidFields 做额外定位（如切换到出错标签页）时用回调版，
 *   //   处理完自定义逻辑后再调 focusFirstFormError()
 */
import { nextTick } from 'vue';
import type { FormInstance } from 'element-plus';

/** 表单项内可获得焦点的控件（按优先级） */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 判断元素在页面上是否可见。
 * 兼容 jsdom：其不实现布局，`offsetParent` 恒为 null，故退化到「内联 display:none / hidden」检查。
 * 浏览器里隐藏标签页（EP 用 v-show 写入内联 display:none）同样能被这一退化分支识别。
 */
function isElementVisible(el: HTMLElement): boolean {
  if (el.offsetParent !== null) return true;
  let node: HTMLElement | null = el;
  while (node) {
    if (node.hidden) return false;
    if (node.style && node.style.display === 'none') return false;
    node = node.parentElement;
  }
  return true;
}

/**
 * 找到 scope 内第一个「可见」的表单错误项。
 * 隐藏标签页 / 折叠区里的表单项会被跳过——只聚焦用户当前看得见的那一项。
 */
function firstVisibleErrorItem(scope: ParentNode): HTMLElement | null {
  const items = Array.from(scope.querySelectorAll<HTMLElement>('.el-form-item.is-error'));
  return items.find(isElementVisible) ?? null;
}

/**
 * 滚动到并聚焦表单中第一个可见的错误项。
 * 需在 `validate()` 失败之后调用（此时 `.is-error` 已渲染到 DOM）。
 *
 * @param scope 限定查找范围（默认 document；对话框/抽屉可传其根元素）
 * @returns 是否找到并聚焦了错误项
 */
export async function focusFirstFormError(scope: ParentNode = document): Promise<boolean> {
  await nextTick();
  const item = firstVisibleErrorItem(scope);
  if (!item) return false;
  // jsdom 未实现 scrollIntoView，测试环境下跳过滚动、只做聚焦
  if (typeof item.scrollIntoView === 'function') {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const control = item.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  control?.focus({ preventScroll: true });
  return true;
}

/**
 * 校验表单；失败时聚焦第一个错误项。
 * @returns 是否通过校验
 */
export async function validateAndFocus(
  form: FormInstance | undefined,
  scope?: ParentNode,
): Promise<boolean> {
  if (!form) return false;
  try {
    await form.validate();
    return true;
  } catch {
    await focusFirstFormError(scope);
    return false;
  }
}

export function useFormFocus() {
  return { focusFirstFormError, validateAndFocus };
}
