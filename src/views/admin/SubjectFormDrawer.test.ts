import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import SubjectFormDrawer from './SubjectFormDrawer.vue';

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
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('树形科目编辑抽屉', () => {
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
    expect(text).toContain('新增科目默认向管理员、出题人和考生开放预览');
    expect(text).not.toContain('题库分类');

    const previewAll = [...document.body.querySelectorAll('.el-checkbox')]
      .find((item) => item.textContent?.includes('所有人员均可预览'));
    expect(previewAll?.querySelector('input')).toHaveProperty('checked', true);
    expect(banksApi.access).not.toHaveBeenCalled();
  });
});
