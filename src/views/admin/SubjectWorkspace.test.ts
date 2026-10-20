import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import SubjectManagePage from './SubjectManagePage.vue';
import QuestionBankListPage from '../author/QuestionBankListPage.vue';

const api = vi.hoisted(() => ({ tree: vi.fn(), access: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock('@/api/banks', () => api);
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const nodes = ['a', 'b'].map(id => ({ id, name: id + '科目', parentId: null, children: [], questionCount: 0, isLeaf: true, effectiveStatus: 'active', status: 'active', allowPractice: true, sortOrder: 0 }));
const access = (permissionMode = 'override') => ({ permissionMode, effectiveViewAll: true, effectiveDepartmentIds: [], effectiveUserIds: [], effectiveEditorIds: [], effectiveFromBankId: null });
let wrapper: VueWrapper;
function render(component: typeof SubjectManagePage | typeof QuestionBankListPage) {
  const pinia = createPinia(); useAuthStore(pinia).currentUser = { role: 'admin' } as User;
  wrapper = mount(component, { attachTo: document.body, global: { plugins: [pinia, ElementPlus], stubs: { SubjectFormDrawer: true, QuestionBankDetailPage: true } } });
}
function retry() { [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '重新加载')!.click(); }
beforeEach(() => { vi.resetAllMocks(); api.tree.mockResolvedValue(nodes); api.access.mockResolvedValue(access()); api.confirm.mockResolvedValue(true); });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; });

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

function pageButton(text: string) { return wrapper.findAll('button').find(b => b.text().trim() === text)!; }
describe('目录切换与科目删除恢复', () => {
  it('手机目录初始折叠，展开后选择科目自动收起并保留完整当前名称', async () => {
    render(SubjectManagePage); await flushPromises();
    expect(wrapper.find('aside').classes()).toContain('is-collapsed');
    expect(pageButton('展开目录').attributes('aria-expanded')).toBe('false');
    await pageButton('展开目录').trigger('click');
    expect(wrapper.find('aside').classes()).not.toContain('is-collapsed');
    await wrapper.findAll('.el-tree-node__content')[1]!.trigger('click'); await flushPromises();
    expect(wrapper.find('aside').classes()).toContain('is-collapsed');
    expect(wrapper.find('.subject-workspace__current').text()).toContain('b科目');
  });

  it('加载目录时显示未知数量，刷新后沿用搜索过滤', async () => {
    let finish!: (value: unknown) => void;
    api.tree.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(QuestionBankListPage); await flushPromises();
    expect(wrapper.find('.subject-workspace__nav-heading').text()).toContain('加载中');
    expect(wrapper.find('.subject-workspace__nav-heading').text()).not.toContain('共 0 个');
    finish(nodes); await flushPromises();
    await wrapper.find('input[aria-label="搜索科目"]').setValue('b科目');
    await pageButton('刷新').trigger('click'); await flushPromises();
    const a = wrapper.findAll('.el-tree-node').find(n => n.text().includes('a科目'))!;
    expect(a.attributes('style')).toContain('display: none');
  });

  it('删除确认与请求期间防重入，失败保留所选科目并允许核对后重试', async () => {
    let confirm!: (ok: boolean) => void, reject!: (error: Error) => void;
    api.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
    api.remove.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(SubjectManagePage); await flushPromises();
    await pageButton('删除科目').trigger('click'); await pageButton('删除科目').trigger('click');
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.remove).not.toHaveBeenCalled();
    expect(pageButton('刷新').attributes('disabled')).toBeDefined();
    await wrapper.findAll('.el-tree-node__content')[1]!.trigger('click'); await flushPromises();
    expect(wrapper.find('.subject-detail__title-row').text()).toContain('a科目');
    confirm(true); await flushPromises();
    expect(api.remove).toHaveBeenCalledWith('a');
    reject(new Error('offline')); await flushPromises();
    expect(wrapper.text()).toContain('删除未完成，请刷新核对结果后重试');
    expect(wrapper.find('.subject-detail__title-row').text()).toContain('a科目');
    expect(pageButton('刷新').attributes('disabled')).toBeUndefined();
    api.tree.mockResolvedValue([nodes[1]]);
    await pageButton('删除科目').trigger('click'); await flushPromises();
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.subject-detail__title-row').text()).toContain('b科目');
  });

  it('有下级或题目时保持原有删除限制，取消确认不调用删除', async () => {
    api.tree.mockResolvedValueOnce([{ ...nodes[0], questionCount: 4 }]);
    render(SubjectManagePage); await flushPromises();
    await pageButton('删除科目').trigger('click');
    expect(api.confirm).not.toHaveBeenCalled(); expect(api.remove).not.toHaveBeenCalled();
    api.tree.mockResolvedValue(nodes); await pageButton('刷新').trigger('click'); await flushPromises();
    api.confirm.mockResolvedValueOnce(false);
    await pageButton('删除科目').trigger('click'); await flushPromises();
    expect(api.remove).not.toHaveBeenCalled();
  });
});
