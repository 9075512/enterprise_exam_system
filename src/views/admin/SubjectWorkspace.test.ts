import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import SubjectManagePage from './SubjectManagePage.vue';
import QuestionBankListPage from '../author/QuestionBankListPage.vue';

const api = vi.hoisted(() => ({ tree: vi.fn(), access: vi.fn() }));
vi.mock('@/api/banks', () => api);
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const nodes = ['a', 'b'].map(id => ({ id, name: id + '科目', parentId: null, children: [], questionCount: 0, isLeaf: true, effectiveStatus: 'active', status: 'active', allowPractice: true, sortOrder: 0 }));
const access = (permissionMode = 'override') => ({ permissionMode, effectiveViewAll: true, effectiveDepartmentIds: [], effectiveUserIds: [], effectiveEditorIds: [], effectiveFromBankId: null });
let wrapper: VueWrapper;
function render(component: typeof SubjectManagePage | typeof QuestionBankListPage) {
  const pinia = createPinia(); useAuthStore(pinia).currentUser = { role: 'admin' } as User;
  wrapper = mount(component, { attachTo: document.body, global: { plugins: [pinia, ElementPlus], stubs: { SubjectFormDrawer: true, QuestionBankDetailPage: true } } });
}
function retry() { [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '重新加载')!.click(); }
beforeEach(() => { vi.resetAllMocks(); api.tree.mockResolvedValue(nodes); api.access.mockResolvedValue(access()); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('科目与题库目录的真实权限状态', () => {
  it('科目目录加载失败不冒充空目录，重试恢复选中节点', async () => {
    api.tree.mockRejectedValueOnce(new Error('offline'));
    render(SubjectManagePage); await flushPromises();
    expect(wrapper.text()).toContain('科目目录加载失败');
    expect(wrapper.text()).not.toContain('暂无科目');
    expect(api.access).not.toHaveBeenCalled();
    retry(); await flushPromises();
    expect(wrapper.text()).toContain('a科目');
    expect(wrapper.text()).toContain('全部人员');
    expect(api.access).toHaveBeenCalledWith('a');
  });

  it('权限请求失败显示未知状态，重试后才显示原有权限方式', async () => {
    api.access.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(access('inherit'));
    render(SubjectManagePage); await flushPromises();
    expect(wrapper.text()).toContain('有效权限加载失败');
    expect(wrapper.text()).not.toContain('完整覆盖');
    expect(wrapper.text()).not.toContain('未配置可见人员');
    retry(); await flushPromises();
    expect(wrapper.text()).toContain('继承上级');
    expect(wrapper.text()).toContain('全部人员');
  });

  it('快速选择科目时，旧节点权限不能覆盖新节点', async () => {
    let old!: (value: unknown) => void;
    api.access.mockImplementation((id: string) => id === 'a' ? new Promise(resolve => { old = resolve; }) : Promise.resolve(access('inherit')));
    render(SubjectManagePage); await flushPromises();
    await wrapper.findAll('.el-tree-node__content').find(node => node.text().includes('b科目'))!.trigger('click'); await flushPromises();
    old({ ...access(), effectiveViewAll: false }); await flushPromises();
    expect(wrapper.find('.subject-detail__title-row').text()).toContain('b科目');
    expect(wrapper.text()).toContain('继承上级');
    expect(wrapper.text()).toContain('全部人员');
    expect(wrapper.text()).not.toContain('未配置可见人员');
  });

  it('题库目录加载失败可重试，不呈现空题库', async () => {
    api.tree.mockRejectedValueOnce(new Error('offline'));
    render(QuestionBankListPage); await flushPromises();
    expect(wrapper.text()).toContain('题库目录加载失败');
    expect(wrapper.text()).not.toContain('暂无科目');
    retry(); await flushPromises();
    expect(wrapper.text()).toContain('a科目');
    expect(wrapper.findComponent({ name: 'QuestionBankDetailPage' }).props('selectedBankId')).toBe('a');
  });
});
