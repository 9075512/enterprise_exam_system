import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import WrongBook from './PracticeWrongBookPage.vue';

const api = vi.hoisted(() => ({ banks: vi.fn(), wrong: vi.fn(), push: vi.fn() }));
vi.mock('@/api/practice', () => ({ listBanks: api.banks, wrongBook: api.wrong }));
vi.mock('@/stores/practiceAuth', () => ({ usePracticeAuthStore: () => ({ currentUser: { name: '考生' } }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: api.push }) }));
let wrapper: VueWrapper;
const question = { id: 'q1', bankId: 'b1', type: 'judge', stem: '完整原题干\n第二段', wrongCount: 2 };
function render() { wrapper = mount(WrongBook, { global: { plugins: [ElementPlus], stubs: { PracticeLayout: { template: '<main><slot /></main>' } } } }); }
function button(text: string) { return wrapper.findAll('button').find(b => b.text() === text)!; }
beforeEach(() => {
  vi.resetAllMocks(); api.banks.mockResolvedValue([{ id: 'b1', name: '完整题库名称' }]);
  api.wrong.mockResolvedValue({ list: [question], total: 21 });
});
afterEach(() => wrapper?.unmount());

describe('错题本名称恢复与刷新', () => {
  it('名称失败不冒充其他题库，重试只恢复名称并保留原题库复习参数', async () => {
    api.banks.mockRejectedValueOnce(new Error('offline'));
    render(); await flushPromises();
    expect(wrapper.text()).toContain('题库名称暂不可用'); expect(wrapper.text()).toContain(question.stem);
    await button('复习').trigger('click'); expect(api.push).toHaveBeenLastCalledWith({ name: 'practice-reans', query: { bankId: 'b1' } });
    await button('重试题库名称').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('完整题库名称'); expect(wrapper.text()).not.toContain('题库名称加载失败');
    expect(api.wrong).toHaveBeenCalledTimes(1);
  });
  it('下一页等待期间禁止刷新，失败保留当前页，重试仍请求第二页', async () => {
    let reject!: (e: Error) => void;
    api.wrong.mockResolvedValueOnce({ list: [question], total: 21 }).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(); await flushPromises(); await button('加载更多').trigger('click');
    expect(button('刷新错题').attributes('disabled')).toBeDefined();
    await button('刷新错题').trigger('click'); expect(api.wrong).toHaveBeenCalledTimes(2);
    reject(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain(question.stem);
    api.wrong.mockResolvedValueOnce({ list: [{ ...question, id: 'q2' }], total: 21 });
    await button('重试加载更多').trigger('click'); await flushPromises();
    expect(api.wrong).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }); expect(wrapper.findAll('.wb__item')).toHaveLength(2);
  });
  it('刷新首屏失败显示未知并禁止复习，重试恢复全量范围', async () => {
    render(); await flushPromises(); api.wrong.mockRejectedValueOnce(new Error('offline'));
    await button('刷新错题').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('错题数量未知'); expect(button('全部复习').attributes('disabled')).toBeDefined();
    await button('重新加载').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('共 21 道错题 · 已加载 1 道');
    await button('全部复习').trigger('click'); expect(api.push).toHaveBeenLastCalledWith({ name: 'practice-reans', query: {} });
  });
});
