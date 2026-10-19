import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElDialog, ElForm, ElInputNumber, ElSelect, ElSwitch } from 'element-plus';
import type { Exam } from '@/types';
import ExamExceptionDialog from './ExamExceptionDialog.vue';

const api = vi.hoisted(() => ({ list: vi.fn(), users: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/exams', () => ({ listExceptions: api.list, saveException: api.save, removeException: api.remove }));
vi.mock('@/api/users', () => ({ list: api.users }));
let wrapper: VueWrapper;
const exam = (id: string) => ({ id, name: id + '考试' } as Exam);
async function render() {
  wrapper = mount(ExamExceptionDialog, { props: { modelValue: false, exam: exam('first') }, attachTo: document.body, global: { plugins: [ElementPlus] } });
  await wrapper.setProps({ modelValue: true }); await flushPromises();
}
beforeEach(() => { vi.resetAllMocks(); api.users.mockResolvedValue([{ id: 'u1', name: '考生甲', username: 'user1' }]); api.list.mockResolvedValue([]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('特殊考试安排的数据与提交保护', () => {
  it('加载失败不会当作空安排，并阻止覆盖，重试恢复操作', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(document.body.textContent).toContain('特殊考试安排加载失败');
    expect(document.body.textContent).not.toContain('暂无特殊安排');
    expect(wrapper.getComponent(ElForm).props('disabled')).toBe(true);
    await wrapper.findAllComponents(ElButton).find(b => b.text() === '重新加载')!.trigger('click'); await flushPromises();
    expect(wrapper.getComponent(ElForm).props('disabled')).toBe(false);
    expect(document.body.textContent).toContain('暂无特殊安排');
  });

  it('弹窗切换考试时，只显示当前考试安排', async () => {
    let old!: (value: unknown[]) => void;
    api.list.mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockResolvedValueOnce([{ id: 'new', userId: 'u1', userName: '新考生', extraMinutes: 10 }]);
    await render(); await wrapper.setProps({ exam: exam('second') }); await flushPromises();
    old([{ id: 'old', userName: '旧考生' }]); await flushPromises();
    expect(document.body.textContent).toContain('新考生');
    expect(document.body.textContent).not.toContain('旧考生');
    expect(api.list).toHaveBeenLastCalledWith('second');
  });

  it('保存保留加时、额外次数与免考能力，等待期间不重复请求', async () => {
    let done!: () => void; api.save.mockReturnValue(new Promise<void>(resolve => { done = resolve; }));
    await render();
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 'u1');
    wrapper.findAllComponents(ElInputNumber)[0]!.vm.$emit('update:modelValue', 15);
    wrapper.findAllComponents(ElInputNumber)[1]!.vm.$emit('update:modelValue', 2);
    wrapper.getComponent(ElSwitch).vm.$emit('update:modelValue', true);
    const save = wrapper.findAllComponents(ElButton).find(b => b.text() === '保存')!;
    save.vm.$emit('click', new MouseEvent('click')); save.vm.$emit('click', new MouseEvent('click')); await flushPromises();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('first', 'u1', { extraMinutes: 15, extraAttempts: 2, exempt: true, note: '' });
    expect(wrapper.getComponent(ElDialog).props('showClose')).toBe(false);
    done(); await flushPromises();
    expect(wrapper.getComponent(ElDialog).props('showClose')).toBe(true);
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
