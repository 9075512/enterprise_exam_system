import type { Directive } from 'vue';

// Element Plus 2.14 initializes this attribute only once; keep it aligned with
// the native input when loading, saving or a dependent switch changes disabled.
function syncDisabled(element: HTMLElement): void {
  const input = element.querySelector('input');
  if (input) input.setAttribute('aria-disabled', String(input.disabled));
}
export const vInputNumberAria: Directive<HTMLElement> = {
  mounted: syncDisabled,
  updated: syncDisabled,
};
