import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import ElementPlus from 'element-plus';
import { vInputNumberAria } from './inputNumberAria';
describe('数字控件禁用语义', () => {
  it('加载、依赖项和保存切换后，aria与实际disabled一致且保留数值', async () => {
    const wrapper = mount(defineComponent({ props: { locked: Boolean }, directives: { inputNumberAria: vInputNumberAria }, template: '<el-input-number v-input-number-aria :disabled="locked" :model-value="20" />' }), { props: { locked: true }, global: { plugins: [ElementPlus] } });
    const input = wrapper.find('input'); expect(input.attributes('aria-disabled')).toBe('true');
    await wrapper.setProps({ locked: false }); expect(input.attributes('aria-disabled')).toBe('false'); expect((input.element as HTMLInputElement).value).toBe('20');
    await wrapper.setProps({ locked: true }); expect(input.attributes('aria-disabled')).toBe('true');
    wrapper.unmount();
  });
});
