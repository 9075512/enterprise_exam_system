import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import QuestionBankListPage from './QuestionBankListPage.vue';
import { useAuthStore } from '@/stores/auth';
import type { BankTreeNode, User } from '@/types';

const api = vi.hoisted(() => ({ tree: vi.fn() }));
vi.mock('@/api/banks', () => ({ tree: api.tree }));

function node(partial: Partial<BankTreeNode>): BankTreeNode {
  return {
    id: 'subject-1',
    name: '安全知识',
    description: '',
    allowPractice: false,
    parentId: null,
    sortOrder: 0,
    status: 'active',
    isLeaf: true,
    effectiveStatus: 'active',
    canView: true,
    canEdit: true,
    createdBy: 'admin',
    createdAt: '2026-10-17T00:00:00.000Z',
    questionCount: 4,
    authorIds: [],
    authorNames: [],
    children: [],
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('QuestionBankListPage · 科目只读导航', () => {
  it('恢复 bankId 选中项，管理员只能跳转科目管理，页面不提供科目写操作', async () => {
    const leaf = node({ id: 'leaf', name: '企业文化题库' });
    const root = node({ id: 'root', name: '企业文化', isLeaf: false, questionCount: 0, children: [leaf] });
    leaf.parentId = root.id;
    api.tree.mockResolvedValue([root]);

    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().currentUser = { id: 'admin', role: 'admin', name: '管理员' } as User;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/author/banks', component: QuestionBankListPage },
        { path: '/admin/subjects', component: { template: '<div />' } },
      ],
    });
    await router.push('/author/banks?bankId=leaf');
    await router.isReady();

    const wrapper = mount(QuestionBankListPage, {
      global: {
        plugins: [pinia, router, ElementPlus],
        stubs: {
          QuestionBankDetailPage: {
            props: ['selectedBankId'],
            template: '<div class="detail-stub" :data-id="selectedBankId" />',
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('.detail-stub').attributes('data-id')).toBe('leaf');
    expect(wrapper.text()).toContain('前往科目管理');
    expect(wrapper.text()).not.toContain('编辑科目与权限');
    expect(wrapper.text()).not.toContain('转为目录并新增下级');
    expect(wrapper.text()).not.toContain('新增根科目');
    expect(wrapper.text()).not.toContain('删除科目');
  });
});
