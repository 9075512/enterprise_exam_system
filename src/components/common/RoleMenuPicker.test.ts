import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus, { ElCheckbox } from 'element-plus';
import RoleMenuPicker from './RoleMenuPicker.vue';
import type { MenuPermission } from '@/types';

const catalog: MenuPermission['catalog'] = [
  { key: 'roles', name: '角色管理', defaultRoles: ['admin'], adminRequired: true },
  { key: 'reviews', name: '人工阅卷', defaultRoles: ['admin', 'author'], adminRequired: false },
  { key: 'my-exams', name: '我的考试', defaultRoles: ['examinee'], adminRequired: false },
];

describe('角色菜单选择', () => {
  it('父级锁定与管理员必授项不会发出权限修改', async () => {
    const wrapper = mount(RoleMenuPicker, { props: { modelValue: ['reviews'], baseRole: 'admin', catalog, disabled: true }, global: { plugins: [ElementPlus] } });
    for (const checkbox of wrapper.findAllComponents(ElCheckbox)) checkbox.vm.$emit('change', false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    wrapper.findAllComponents(ElCheckbox).find(c => c.text().includes('角色管理'))!.vm.$emit('change', false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
  it('仅展示基础身份可用的菜单，并提交勾选结果', async () => {
    const wrapper = mount(RoleMenuPicker, { props: { modelValue: [], baseRole: 'author', catalog }, global: { plugins: [ElementPlus] } });
    expect(wrapper.text()).toContain('人工阅卷');
    expect(wrapper.text()).not.toContain('角色管理');
    expect(wrapper.text()).not.toContain('我的考试');
    await wrapper.find('input[type=checkbox]').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['reviews']]);
    wrapper.unmount();
  });
  it('所有管理员身份角色的必授菜单都选中且不可取消', () => {
    const wrapper = mount(RoleMenuPicker, { props: { modelValue: [], baseRole: 'admin', catalog }, global: { plugins: [ElementPlus] } });
    const required = wrapper.findAll('label').find(label => label.text().includes('角色管理'))!;
    const input = required.find('input').element as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(true);
    wrapper.unmount();
  });
});
