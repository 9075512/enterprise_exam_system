import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElSelect } from 'element-plus';
import ExamScopeSelect from './ExamScopeSelect.vue';
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api/exams', () => ({ list: api.list }));
let wrapper: VueWrapper;
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue([{ id: 'e1', name: '范围一' }, { id: 'e2', name: '范围二' }]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
describe('考试范围操作锁定', () => {
  it('提交期间保留当前范围且不发出切换事件，解锁后恢复选择', async () => {
    wrapper = mount(ExamScopeSelect, { props: { modelValue: 'e1', disabled: true }, global: { plugins: [ElementPlus] } }); await flushPromises();
    const select = wrapper.getComponent(ElSelect);
    expect(select.props('disabled')).toBe(true);
    select.vm.$emit('update:modelValue', 'e2'); await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(select.props('modelValue')).toBe('e1');
    await wrapper.setProps({ disabled: false });
    select.vm.$emit('update:modelValue', 'e2');
    expect(wrapper.emitted('update:modelValue')).toEqual([['e2']]);
  });
  it('无考试列表权限时仍保持置灰，保留传入的考试范围', async () => {
    api.list.mockRejectedValue(new Error('forbidden'));
    wrapper = mount(ExamScopeSelect, { props: { modelValue: 'e1', disabled: false }, global: { plugins: [ElementPlus] } }); await flushPromises();
    const select = wrapper.getComponent(ElSelect);
    expect(select.props('disabled')).toBe(true);
    expect(select.props('placeholder')).toBe('需管理员权限');
    select.vm.$emit('update:modelValue', ''); await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(select.props('modelValue')).toBe('e1');
  });
});
