import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import DepartmentPage from './DepartmentPage.vue';
import type { Department } from '@/types';

const api = vi.hoisted(() => ({ list: vi.fn(), users: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock('@/api/departments', () => ({ list: api.list, create: api.create, update: api.update, remove: api.remove }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ settings: { companyName: '样例组织' }, ready: true, load: vi.fn() }) }));
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }));
const departments: Department[] = [
  { id: 'parent', name: '直属科室', parentId: null, description: '上级说明', createdAt: '2026-10-19T00:00:00Z' },
  { id: 'child', name: '下级科室', parentId: 'parent', description: '', createdAt: '2026-10-19T00:00:00Z' },
];
let wrapper: VueWrapper;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue(departments);
  api.users.mockResolvedValue([{ id: 'one', departmentId: 'parent' }, { id: 'two', departmentId: 'child' }, { id: 'unassigned', departmentId: null }]);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
async function render() { wrapper = mount(DepartmentPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true } } }); await flushPromises(); }

describe('科室树与编辑工作流', () => {
  it('人员统计失败显示未知且不阻断科室，重试后只统计有科室的人员', async () => {
    api.users.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(wrapper.text()).toContain('人员统计加载失败');
    expect(wrapper.text()).toContain('直属科室');
    expect(wrapper.find('.page-header').text()).toContain('— 名已分配科室人员');
    expect(wrapper.findAll('.department-page__count').map(e => e.text())).toEqual(['—', '—']);
    button('重新加载').click(); await flushPromises();
    expect(wrapper.find('.page-header').text()).toContain('2 名已分配科室人员');
    expect(wrapper.findAll('.department-page__count').map(e => e.text())).toEqual(['1', '1']);
  });

  it('折叠树仍保留当前范围；编辑上级选项排除自身与下级', async () => {
    await render();
    await wrapper.findAll('.el-tree-node__content').find(e => e.text().includes('直属科室'))!.trigger('click');
    await wrapper.find('button[aria-label="收起科室树"]').trigger('click');
    expect(wrapper.find('.department-page__tree-title').text()).toBe('科室范围：直属科室');
    await wrapper.findAll('.el-table__body tr')[0]!.findAll('button').find(b => b.text() === '编辑')!.trigger('click');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'ElTreeSelect' }).props('data')).toEqual([]);
  });

  it('异步校验前就阻止重复保存，请求失败保留输入并恢复关闭', async () => {
    await render(); button('新建科室').click(); await flushPromises();
    const input = document.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
    input.value = '新科室'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
    let finish!: (error: Error) => void;
    api.create.mockImplementation(() => new Promise((_resolve, reject) => { finish = reject; }));
    const save = button('创建'); save.click(); save.click(); await flushPromises();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create).toHaveBeenCalledWith({ name: '新科室', description: '', parentId: null });
    expect(button('取消').disabled).toBe(true);
    expect(wrapper.findComponent({ name: 'ElDrawer' }).props('closeOnPressEscape')).toBe(false);
    finish(new Error('offline')); await flushPromises();
    expect(input.value).toBe('新科室'); expect(button('取消').disabled).toBe(false);
  });
});
