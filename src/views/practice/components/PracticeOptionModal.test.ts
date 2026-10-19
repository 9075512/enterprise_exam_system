import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElCheckboxGroup, ElRadioGroup } from 'element-plus';
import PracticeOptionModal from './PracticeOptionModal.vue';
import type { PracticeBank, PracticeConfig } from '@/types';
let wrapper: VueWrapper;
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
const config = { defaultPracticeMode: 'random', sessionMinCount: 1, sessionMaxCount: 50 } as PracticeConfig;
describe('练习参数弹窗', () => {
  it('初次即打开也应用后台模式和上限，保留原有三种练题题型', async () => {
    wrapper = mount(PracticeOptionModal, { props: { visible: true, bank: { id: 'b1', name: '安全题库', questionCount: 600 } as PracticeBank, config }, global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.findAllComponents(ElRadioGroup)[0]!.props('modelValue')).toBe('random');
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['single', 'multiple', 'judge']);
    const start = wrapper.findAllComponents(ElButton).find(b => b.text() === '开始练习')!;
    start.vm.$emit('click', new MouseEvent('click')); start.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(wrapper.emitted('start')).toEqual([[{ bankId: 'b1', mode: 'random', count: 50, types: ['single', 'multiple', 'judge'] }]]);
    expect(document.body.textContent).toContain('最多 50 题');
  });
  it('无题或取消全部题型时不能开始，更换题库恢复默认选择', async () => {
    wrapper = mount(PracticeOptionModal, { props: { visible: true, bank: { id: 'b1', name: '安全题库', questionCount: 6 } as PracticeBank, config }, global: { plugins: [ElementPlus] } });
    await flushPromises(); wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', []); await flushPromises();
    const start = () => wrapper.findAllComponents(ElButton).find(b => b.text() === '开始练习')!;
    expect(start().props('disabled')).toBe(true);
    await wrapper.setProps({ bank: { id: 'b2', name: '空题库', questionCount: 0 } as PracticeBank });
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['single', 'multiple', 'judge']);
    expect(start().props('disabled')).toBe(true);
  });
  it('题库名称保留完整上下文，分组具有独立标签，取消不发起练习', async () => {
    const name = '非常长的煤矿安全题库名称'.repeat(12);
    wrapper = mount(PracticeOptionModal, { props: { visible: true, bank: { id: 'b1', name, questionCount: 600 } as PracticeBank, config }, global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(document.querySelector('.el-dialog__title')?.textContent).toBe('练习设置');
    expect(document.querySelector('.opt__context strong')?.textContent).toBe(name);
    const groups = [...document.querySelectorAll('.opt__choices')];
    expect(groups.map(group => document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['练题方式', '题量', '题型']);
    const cancel = wrapper.findAllComponents(ElButton).find(button => button.text() === '取消')!;
    cancel.vm.$emit('click', new MouseEvent('click'));
    expect(wrapper.emitted('start')).toBeUndefined();
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
  it('选择题量与题型后保持原始请求参数，不受上下文布局调整影响', async () => {
    wrapper = mount(PracticeOptionModal, { props: { visible: true, bank: { id: 'b1', name: '安全题库', questionCount: 600 } as PracticeBank, config }, global: { plugins: [ElementPlus] } });
    await flushPromises();
    wrapper.findAllComponents(ElRadioGroup)[0]!.vm.$emit('update:modelValue', 'sequence');
    wrapper.findAllComponents(ElRadioGroup)[1]!.vm.$emit('update:modelValue', 20);
    wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['multiple']);
    await flushPromises();
    wrapper.findAllComponents(ElButton).find(button => button.text() === '开始练习')!.vm.$emit('click', new MouseEvent('click'));
    expect(wrapper.emitted('start')).toEqual([[{ bankId: 'b1', mode: 'sequence', count: 20, types: ['multiple'] }]]);
  });
});
