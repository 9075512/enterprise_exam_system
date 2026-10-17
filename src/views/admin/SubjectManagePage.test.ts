import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import SubjectManagePage from './SubjectManagePage.vue';
import type { BankTreeNode } from '@/types';

const api = vi.hoisted(() => ({ tree: vi.fn(), access: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/banks', () => ({
  tree: api.tree,
  access: api.access,
  remove: api.remove,
}));

function node(partial: Partial<BankTreeNode>): BankTreeNode {
  return {
    id: 'subject-1',
    name: '安全知识',
    description: '安全生产基础知识',
    allowPractice: true,
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
    authorIds: ['author-1'],
    authorNames: ['出题人'],
    children: [],
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.access.mockResolvedValue({
    bankId: 'leaf',
    permissionMode: 'inherit',
    viewAll: false,
    includeChildDepartments: true,
    departmentIds: [],
    userIds: [],
    editorIds: [],
    effectiveFromBankId: 'root',
    effectiveViewAll: false,
    effectiveIncludeChildDepartments: true,
    effectiveDepartmentIds: ['dept-1'],
    effectiveUserIds: [],
    effectiveEditorIds: ['author-1'],
  });
});

describe('SubjectManagePage', () => {
  it('按 subjectId 恢复选中科目并展示结构、权限和题库跳转', async () => {
    const leaf = node({ id: 'leaf', name: '企业文化题库' });
    const root = node({ id: 'root', name: '企业文化', isLeaf: false, questionCount: 0, children: [leaf] });
    leaf.parentId = root.id;
    api.tree.mockResolvedValue([root]);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/subjects', component: SubjectManagePage },
        { path: '/author/banks', component: { template: '<div />' } },
      ],
    });
    await router.push('/admin/subjects?subjectId=leaf');
    await router.isReady();

    const wrapper = mount(SubjectManagePage, {
      global: {
        plugins: [createPinia(), router, ElementPlus],
        stubs: {
          SubjectFormDrawer: {
            props: ['visible'],
            template: '<div class="drawer-stub" :data-visible="visible" />',
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('企业文化题库');
    expect(wrapper.text()).toContain('企业文化 / 企业文化题库');
    expect(wrapper.text()).toContain('继承上级');
    expect(wrapper.text()).toContain('1 个部门');
    expect(wrapper.text()).toContain('1 名编辑人员');
    expect(api.access).toHaveBeenCalledWith('leaf');

    const addChild = wrapper.findAll('button').find((button) => button.text().includes('新增下级'));
    expect(addChild?.attributes('disabled')).toBeDefined();
    const viewQuestions = wrapper.findAll('button').find((button) => button.text().includes('查看题目'))!;
    await viewQuestions.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/author/banks?bankId=leaf');
  });
});
