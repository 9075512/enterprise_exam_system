import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import QuestionBankFormDialog from './QuestionBankFormDialog.vue';
import { SETTINGS_DEFAULTS } from '@/constants/settings';
import type { QuestionBank } from '@/types';

vi.mock('@/api/settings', () => ({ getSettings: vi.fn(async () => ({ ...SETTINGS_DEFAULTS, bankCategories: ['临床技能', '规章制度'] })) }));
vi.mock('@/api/users', () => ({ list: vi.fn(async () => []) }));
let wrapper: ReturnType<typeof mount>;
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('题库分类下拉选项', () => {
  it.each([null, { id: 'old', name: '历史题库', category: '旧分类' } as QuestionBank])
    ('从配置加载选项，保留已有历史分类 %#', async (bank) => {
      wrapper = mount(QuestionBankFormDialog, {
        props: { visible: false, bank }, attachTo: document.body,
        global: { plugins: [createPinia(), ElementPlus] },
      });
      await wrapper.setProps({ visible: true });
      await flushPromises();
      const select = wrapper.findAllComponents({ name: 'ElSelect' })[0];
      expect(select.props('allowCreate')).toBe(false);
      const options = select.findAllComponents({ name: 'ElOption' });
      expect(options.map((o) => o.props('value'))).toEqual(bank ? ['旧分类', '临床技能', '规章制度'] : ['临床技能', '规章制度']);
      if (bank) {
        expect(select.props('modelValue')).toBe('旧分类');
        expect(options[0].props('disabled')).toBe(true);
      }
    });
});
