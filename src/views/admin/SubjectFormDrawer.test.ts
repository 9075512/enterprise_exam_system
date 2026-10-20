import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus, { ElButton, ElCheckbox, ElFormItem, ElSelect, ElSwitch } from 'element-plus';
import SubjectFormDrawer from './SubjectFormDrawer.vue';
import { useAuthStore } from '@/stores/auth';
import type { QuestionBank, User } from '@/types';

vi.mock('@/api/users', () => ({ list: vi.fn(async () => []) }));
vi.mock('@/api/departments', () => ({ list: vi.fn(async () => []) }));
const banksApi = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  access: vi.fn(),
  updateAccess: vi.fn(),
}));
vi.mock('@/api/banks', () => ({
  ...banksApi,
}));

let wrapper: ReturnType<typeof mount>;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

async function openDrawer(bank: QuestionBank | null = null, defaultParentId: string | null = null) {
  const pinia = createPinia();
  useAuthStore(pinia).currentUser = { id: 'admin', role: 'admin', name: '管理员' } as User;
  wrapper = mount(SubjectFormDrawer, {
    props: { visible: false, bank, tree: [], defaultParentId },
    attachTo: document.body,
    global: { plugins: [pinia, ElementPlus] },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
}

function item(label: string) {
  return wrapper.findAllComponents(ElFormItem).find((field) => field.props('label') === label)!;
}

describe('树形科目编辑抽屉', () => {
  it('创建已成功而权限保存失败时，重试沿用同一科目，不产生重复节点', async () => {
    banksApi.create.mockResolvedValue({ id: 'new-subject' });
    banksApi.update.mockResolvedValue({ id: 'new-subject' });
    banksApi.updateAccess.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    await openDrawer(); await item('科目名称').get('input').setValue('新科目');
    const save = () => wrapper.findAllComponents(ElButton).find((button) => button.text() === '保存')!;
    await save().trigger('click'); await flushPromises();
    expect(document.body.textContent).toContain('科目已创建，访问权限尚未保存');
    await save().trigger('click'); await flushPromises();
    expect(banksApi.create).toHaveBeenCalledTimes(1);
    expect(banksApi.update).toHaveBeenCalledWith('new-subject', expect.objectContaining({ name: '新科目' }));
    expect(banksApi.updateAccess).toHaveBeenLastCalledWith('new-subject', expect.objectContaining({ viewAll: true, departmentIds: [], userIds: [] }));
    expect(wrapper.emitted('saved')?.at(-1)).toEqual([{ id: 'new-subject' }]);
  });
  it('原权限请求失败时阻止默认值覆盖，重试恢复原有范围', async () => {
    banksApi.access.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      permissionMode: 'override', viewAll: false, includeChildDepartments: false,
      departmentIds: ['dept-existing'], userIds: ['user-existing'], editorIds: ['author-existing'],
    });
    await openDrawer({ id: 'existing', name: '原科目' } as QuestionBank);
    expect(document.body.textContent).toContain('科目权限或人员选项加载失败');
    const save = () => wrapper.findAllComponents(ElButton).find((button) => button.text() === '保存')!;
    expect(save().props('disabled')).toBe(true);
    expect(banksApi.update).not.toHaveBeenCalled();
    await wrapper.findAllComponents(ElButton).find((button) => button.text() === '重新加载')!.trigger('click');
    await flushPromises();
    expect(save().props('disabled')).toBe(false);
    expect(item('浏览部门').getComponent(ElSelect).props('modelValue')).toEqual(['dept-existing']);
    expect(item('浏览人员').getComponent(ElSelect).props('modelValue')).toEqual(['user-existing']);
    expect(item('编辑人员').getComponent(ElSelect).props('modelValue')).toEqual(['author-existing']);
  });

  it('快速切换科目时，较早权限响应不能覆盖当前科目', async () => {
    let resolveOld!: (value: unknown) => void;
    banksApi.access.mockImplementation((id: string) => id === 'old'
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve({ permissionMode: 'override', viewAll: false, includeChildDepartments: true, departmentIds: ['new-dept'], userIds: [], editorIds: [] }));
    await openDrawer({ id: 'old', name: '旧科目' } as QuestionBank);
    await wrapper.setProps({ bank: { id: 'new', name: '新科目' } as QuestionBank });
    await flushPromises();
    resolveOld({ permissionMode: 'override', viewAll: true, includeChildDepartments: false, departmentIds: ['old-dept'], userIds: [], editorIds: [] });
    await flushPromises();
    expect(item('科目名称').get('input').element.value).toBe('新科目');
    expect(item('浏览部门').getComponent(ElSelect).props('modelValue')).toEqual(['new-dept']);
    expect(item('浏览范围').getComponent(ElCheckbox).props('modelValue')).toBe(false);
  });
  it('展示层级、状态与访问权限字段，不再展示题库分类', async () => {
    wrapper = mount(SubjectFormDrawer, {
      props: { visible: false, bank: null, tree: [] },
      attachTo: document.body,
      global: { plugins: [createPinia(), ElementPlus] },
    });
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const text = document.body.textContent ?? '';
    expect(text).toContain('上级科目');
    expect(text).toContain('科目名称');
    expect(text).toContain('权限方式');
    expect(text).toContain('浏览部门');
    expect(text).toContain('浏览人员');
    expect(text).toContain('编辑人员');
    expect(text).toContain('新增科目默认开放练题，并向全部部门和全部人员开放浏览');
    expect(text).not.toContain('题库分类');

    const previewAll = [...document.body.querySelectorAll('.el-checkbox')]
      .find((item) => item.textContent?.includes('所有人员均可预览'));
    expect(previewAll?.querySelector('input')).toHaveProperty('checked', true);
    expect(wrapper.getComponent(ElSwitch).props('modelValue')).toBe(true);
    expect(item('浏览部门').getComponent(ElSelect).props()).toMatchObject({ placeholder: '全部部门', disabled: true });
    expect(item('浏览人员').getComponent(ElSelect).props()).toMatchObject({ placeholder: '全部人员', disabled: true });
    expect(banksApi.access).not.toHaveBeenCalled();
  });

  it('新增保存默认开放练题并以全部人员权限保存，不固化部门和人员快照', async () => {
    banksApi.create.mockResolvedValue({ id: 'new-subject' });
    banksApi.updateAccess.mockResolvedValue({});
    await openDrawer();
    await item('科目名称').get('input').setValue('新科目');
    await wrapper.findAllComponents(ElButton).find((button) => button.text() === '保存')!.trigger('click');
    await flushPromises();

    expect(banksApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新科目', allowPractice: true }));
    expect(banksApi.updateAccess).toHaveBeenCalledWith('new-subject', expect.objectContaining({
      permissionMode: 'override', viewAll: true, departmentIds: [], userIds: [],
    }));
  });

  it('新增下级默认对所有人开放，延续上级编辑人员', async () => {
    banksApi.access.mockResolvedValue({ effectiveViewAll: false, effectiveEditorIds: ['author-1'] });
    await openDrawer(null, 'parent');
    expect(banksApi.access).toHaveBeenCalledWith('parent');
    expect(wrapper.getComponent(ElSwitch).props('modelValue')).toBe(true);
    expect(item('浏览范围').getComponent(ElCheckbox).props('modelValue')).toBe(true);
    expect(item('编辑人员').getComponent(ElSelect).props('modelValue')).toEqual(['author-1']);
  });

  it('编辑保留已关闭的练题开关和指定浏览范围', async () => {
    banksApi.access.mockResolvedValue({
      permissionMode: 'override', viewAll: false, includeChildDepartments: false,
      departmentIds: ['dept-1'], userIds: ['user-1'], editorIds: [],
    });
    await openDrawer({ id: 'existing', name: '原科目', allowPractice: false } as QuestionBank);
    expect(wrapper.getComponent(ElSwitch).props('modelValue')).toBe(false);
    expect(item('浏览范围').getComponent(ElCheckbox).props('modelValue')).toBe(false);
    expect(item('浏览部门').getComponent(ElSelect).props()).toMatchObject({ modelValue: ['dept-1'], disabled: false });
    expect(item('浏览人员').getComponent(ElSelect).props()).toMatchObject({ modelValue: ['user-1'], disabled: false });
  });

  it('取消默认全部范围后可指定部门和人员，再次新增恢复默认值', async () => {
    await openDrawer();
    await item('浏览范围').getComponent(ElCheckbox).get('input').setValue(false);
    await wrapper.getComponent(ElSwitch).get('input').setValue(false);
    expect(item('浏览部门').getComponent(ElSelect).props('disabled')).toBe(false);
    expect(item('浏览人员').getComponent(ElSelect).props('disabled')).toBe(false);
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect(wrapper.getComponent(ElSwitch).props('modelValue')).toBe(true);
    expect(item('浏览范围').getComponent(ElCheckbox).props('modelValue')).toBe(true);
  });
});

it('保存时锁定条件权限控件，失败保留草稿且排序禁用语义正确恢复', async () => {
  banksApi.access.mockResolvedValue({ permissionMode: 'override', viewAll: false, includeChildDepartments: false, departmentIds: ['dept-1'], userIds: ['user-1'], editorIds: [] });
  let reject!: (e: Error) => void;
  banksApi.update.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await openDrawer({ id: 'existing', name: '原科目', parentId: null } as QuestionBank);
  const number = item('排序').get('input');
  expect(number.attributes('aria-disabled')).toBe('false');
  await wrapper.findAllComponents(ElButton).find(b => b.text() === '保存')!.trigger('click'); await flushPromises();
  expect(item('浏览部门').getComponent(ElSelect).props('disabled')).toBe(true);
  expect(item('浏览人员').getComponent(ElSelect).props('disabled')).toBe(true);
  expect(item('浏览部门').getComponent(ElCheckbox).props('disabled')).toBe(true);
  expect(number.attributes('aria-disabled')).toBe('true');
  reject(new Error('offline')); await flushPromises();
  expect(document.body.textContent).toContain('保存未完成，已保留填写内容');
  expect(item('浏览部门').getComponent(ElSelect).props('modelValue')).toEqual(['dept-1']);
  expect(item('浏览部门').getComponent(ElSelect).props('disabled')).toBe(false);
  expect(number.attributes('aria-disabled')).toBe('false');
});
