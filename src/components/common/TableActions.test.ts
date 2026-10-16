import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import ElementPlus, { ElButton, ElDropdownItem } from 'element-plus';
import TableActions from './TableActions.vue';

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('TableActions', () => {
  it('常用操作直接可用，没有次要操作时不显示更多入口', async () => {
    const edit = vi.fn();
    const wrapper = mount(TableActions, {
      slots: { default: () => h(ElButton, { link: true, onClick: edit }, () => '编辑') },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await wrapper.get('button').trigger('click');
    expect(edit).toHaveBeenCalledOnce();
    expect(wrapper.find('[aria-label="更多操作"]').exists()).toBe(false);
  });

  it('菜单保留行操作回调并阻止禁用操作', async () => {
    const enabled = vi.fn();
    const disabled = vi.fn();
    const wrapper = mount(TableActions, {
      attachTo: document.body,
      slots: {
        more: () => [
          h(ElDropdownItem, { onClick: enabled }, () => '查看详情'),
          h(ElDropdownItem, { disabled: true, onClick: disabled }, () => '暂不可用'),
        ],
      },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await wrapper.get('[aria-label="更多操作"]').trigger('click');
    await flushPromises();
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map(item => item.textContent)).toEqual(['查看详情', '暂不可用']);
    items[1].click();
    expect(disabled).not.toHaveBeenCalled();
    items[0].click();
    expect(enabled).toHaveBeenCalledOnce();
  });

  it('操作进行中禁用更多按钮，避免重复提交', () => {
    const wrapper = mount(TableActions, {
      props: { loading: true },
      slots: { more: () => h(ElDropdownItem, {}, () => '克隆') },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    expect(wrapper.get('button').classes()).toContain('is-loading');
    expect(wrapper.get('button').attributes('aria-disabled')).toBe('true');
  });
});
