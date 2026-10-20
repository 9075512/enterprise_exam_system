import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ElementPlus from 'element-plus';
import MyRetake from './MyRetakePage.vue';
import MyScore from './MyScorePage.vue';
import Favorites from '../practice/PracticeFavoritesPage.vue';

const api = vi.hoisted(() => ({ exams: vi.fn(), retakes: vi.fn(), applyRetake: vi.fn(), records: vi.fn(), appeals: vi.fn(), applyAppeal: vi.fn(), banks: vi.fn(), favorites: vi.fn(), remove: vi.fn(), loadRules: vi.fn(), push: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@/api/exams', () => ({ my: api.exams }));
vi.mock('@/api/retakes', () => ({ listMyRetakes: api.retakes, applyRetake: api.applyRetake }));
vi.mock('@/api/records', () => ({ my: api.records }));
vi.mock('@/api/appeals', () => ({ my: api.appeals, apply: api.applyAppeal }));
vi.mock('@/api/practice', () => ({ listBanks: api.banks, favorites: api.favorites, removeFavorite: api.remove }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }));
vi.mock('@/stores/practiceAuth', () => ({ usePracticeAuthStore: () => ({ currentUser: { name: '考生甲' } }) }));
const settings = reactive({ ready: true, settings: { defaultPageSize: 20, appealEnabled: true, appealWindowDays: 7, retakeScorePolicy: 'highest' }, load: api.loadRules });
const stamp = new Date().toISOString();
const record = { id: 'r', examId: 'e', score: 40, passScore: 60, status: 'submitted', attemptNo: 2, submittedAt: stamp };
const exam = { id: 'e', name: '完整考试名称' + 'LONG'.repeat(30), canApplyRetake: true, passScore: 60, allowAppeal: true };
const retake = { id: 't', examId: 'e', examName: exam.name, status: 'pending', reason: '完整申请说明', appliedAt: stamp, reviewedAt: null };
const appeal = { id: 'a', recordId: 'other', examId: 'e', examName: exam.name, status: 'rejected', originalScore: 40, newScore: null, reason: '第一段申请\n第二段完整说明' + 'LONG'.repeat(30), reviewComment: '第一段意见\n第二段意见', appliedAt: stamp, reviewedAt: stamp };
const page = (list: unknown[] = [], total = list.length) => ({ list, total, page: 1, pageSize: 20 });
let wrapper: VueWrapper;
async function render(component: Parameters<typeof mount>[0]) { wrapper = mount(component, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { PracticeLayout: { template: '<main class="practice-layout"><slot /></main>' } } } }); await flushPromises(); }
const button = (name: string) => wrapper.findAll('button').find(b => b.text().trim() === name)!;
async function chooseRetake() { const select = wrapper.findAllComponents({ name: 'ElSelect' }).find(c => c.props('placeholder') === '请选择需要补考的考试')!; select.vm.$emit('update:modelValue', 'e'); await flushPromises(); return select; }
async function openAppeal() { await button('申请复核').trigger('click'); await flushPromises(); }
beforeEach(() => {
  vi.resetAllMocks(); settings.ready = true; api.loadRules.mockResolvedValue(undefined); api.exams.mockResolvedValue([exam]); api.retakes.mockResolvedValue(page()); api.records.mockResolvedValue(page([record])); api.appeals.mockResolvedValue(page([appeal]));
  api.banks.mockResolvedValue([{ id: 'b', name: '完整题库名称' }, { id: 'b2', name: '其他题库名称' }]); api.favorites.mockResolvedValue(page([{ id: 'q', bankId: 'b', stem: '原收藏题', type: 'judge', favoritedAt: stamp }]));
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('补考申请与同步', () => {
  it('必填错误在表单内显示，提交失败保留说明，处理中锁定重置与重复提交', async () => {
    let reject!: (e: Error) => void; api.applyRetake.mockReturnValue(new Promise((_, r) => { reject = r; }));
    await render(MyRetake); await button('提交补考申请').trigger('click'); await flushPromises(); await vi.waitFor(() => expect(wrapper.text()).toContain('请选择当前可申请补考的考试')); expect(wrapper.text()).toContain('请填写申请说明');
    const select = await chooseRetake(); await wrapper.find('textarea').setValue('  保留申请原因  '); await button('提交补考申请').trigger('click'); await button('提交补考申请').trigger('click');
    expect(api.applyRetake).toHaveBeenCalledTimes(1); expect(api.applyRetake).toHaveBeenCalledWith('e','保留申请原因'); expect(select.props('disabled')).toBe(true); expect(button('重置').attributes()).toHaveProperty('disabled');
    reject(new Error('offline')); await flushPromises(); expect(wrapper.text()).toContain('所选考试和说明已保留'); expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('  保留申请原因  ');
  });
  it('成功后同步失败不允许重复申请，刷新成功后恢复后端最新资格', async () => {
    api.applyRetake.mockResolvedValue(retake); api.retakes.mockRejectedValueOnce(new Error('initial')).mockRejectedValueOnce(new Error('refresh')).mockResolvedValueOnce(page([{ ...retake, status: 'rejected' }]));
    await render(MyRetake); await chooseRetake(); await wrapper.find('textarea').setValue('原因'); await button('提交补考申请').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('申请已提交'); expect(button('提交补考申请').attributes()).toHaveProperty('disabled');
    await button('刷新状态').trigger('click'); await flushPromises(); expect(button('提交补考申请').attributes('disabled')).toBeUndefined(); expect(api.applyRetake).toHaveBeenCalledTimes(1);
  });
  it('加载期间统计未知，已通过入口返回我的考试；说明保留换行', async () => {
    let resolve!: (v: unknown) => void; api.retakes.mockReturnValueOnce(new Promise(r => { resolve = r; })); await render(MyRetake);
    expect(wrapper.text()).toContain('申请记录加载中，数量暂未知'); expect(wrapper.text()).not.toContain('暂无补考申请');
    resolve(page([{ ...retake, status: 'approved', reason: '第一行\n第二行' }],150)); await flushPromises(); expect(api.retakes).toHaveBeenCalledWith(1,100); expect(wrapper.text()).toContain('1 / 150');
    await button('查看我的考试').trigger('click'); expect(api.push).toHaveBeenCalledWith('/exam/my');
  });
});

describe('成绩复核与阅读', () => {
  it('复核说明保持选填，重复提交锁定且失败保留内容和弹窗', async () => {
    let reject!: (e: Error) => void; api.applyAppeal.mockReturnValue(new Promise((_, r) => { reject = r; })); await render(MyScore); await openAppeal();
    const input = document.querySelector<HTMLTextAreaElement>('.el-dialog textarea')!; input.value='完整复核说明'; input.dispatchEvent(new Event('input',{bubbles:true})); await flushPromises();
    const dialog = wrapper.findComponent({ name: 'ElDialog' }); const submit = [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b=>b.textContent?.trim()==='提交申请')!;
    submit.click(); submit.click(); await flushPromises(); expect(api.applyAppeal).toHaveBeenCalledTimes(1); expect(api.applyAppeal).toHaveBeenCalledWith('r','完整复核说明'); dialog.vm.$emit('update:modelValue',false); await flushPromises(); expect(dialog.props('modelValue')).toBe(true);
    reject(new Error('offline')); await flushPromises(); expect(document.querySelector('.el-dialog')?.textContent).toContain('申请说明已保留'); expect(input.value).toBe('完整复核说明');
  });
  it('空复核说明可以提交，成功后不能再次申请同一成绩', async () => {
    api.applyAppeal.mockResolvedValue({ ...appeal, recordId:'r',status:'pending' }); await render(MyScore); await openAppeal(); api.appeals.mockResolvedValue(page([{...appeal, recordId:'r',status:'pending'}]));
    [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b=>b.textContent?.trim()==='提交申请')!.click(); await flushPromises(); expect(api.applyAppeal).toHaveBeenCalledWith('r',''); expect(wrapper.findAll('button').some(b=>b.text()==='申请复核')).toBe(false);
  });
  it('规则未知时不展示可申请或超期结论，重试恢复；未及格按答卷计份', async () => {
    settings.ready=false; await render(MyScore); expect(wrapper.text()).toContain('复核规则读取失败'); expect(wrapper.findAll('button').some(b=>b.text()==='申请复核')).toBe(false); expect(wrapper.text()).not.toContain('已超复核时限');
    api.loadRules.mockImplementation(async()=>{settings.ready=true;}); await button('重新加载').trigger('click'); await flushPromises(); expect(button('申请复核').exists()).toBe(true);
    expect(wrapper.findAllComponents({name:'StatCard'}).find(c=>c.props('label')==='未及格')!.props('unit')).toBe('份');
  });
  it('复核时间线打开完整原说明与审核意见，保持时间及成绩事实', async () => {
    await render(MyScore); await wrapper.findAll('button').find(b=>b.text().includes('查看详情'))!.trigger('click'); await flushPromises();
    const detail=document.querySelector('.el-drawer')!; expect(detail.textContent).toContain(appeal.reason); expect(detail.textContent).toContain(appeal.reviewComment); expect(detail.textContent).toContain(exam.name); expect(detail.textContent).toContain('40 分');
  });
});

describe('收藏列表恢复', () => {
  it('题库资料失败保留标识并可重试，首次加载数量不冒充0', async () => {
    let resolve!: (v: unknown) => void; api.favorites.mockReturnValueOnce(new Promise(r=>{resolve=r;})); api.banks.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{id:'b',name:'恢复题库名'}]);
    await render(Favorites); expect(wrapper.text()).toContain('收藏加载中，数量暂未知'); expect(wrapper.text()).toContain('题库名称与筛选暂不可用'); resolve(page([{id:'q',bankId:'b',stem:'原收藏题',type:'judge',favoritedAt:stamp}])); await flushPromises(); expect(wrapper.find('.fav__bank').text()).toBe('b');
    await button('重试题库资料').trigger('click'); await flushPromises(); expect(wrapper.find('.fav__bank').text()).toBe('恢复题库名');
  });
  it('筛选失败重试原目标题库，空筛选提供返回全部收藏', async () => {
    api.favorites.mockResolvedValueOnce(page([{id:'q',bankId:'b',stem:'题干',type:'judge'}])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page()); await render(Favorites);
    wrapper.findComponent({name:'ElSelect'}).vm.$emit('change','b2'); await flushPromises(); await button('重新加载').trigger('click'); await flushPromises(); expect(api.favorites).toHaveBeenLastCalledWith({bankId:'b2',page:1,pageSize:20}); expect(wrapper.text()).toContain('当前题库暂无收藏'); expect(button('查看全部收藏').exists()).toBe(true);
  });
  it('取消成功但刷新失败明确告知，不把已取消的题目重新显示', async () => {
    api.remove.mockResolvedValue(undefined); api.favorites.mockResolvedValueOnce(page([{id:'q',bankId:'b',stem:'原收藏题',type:'judge'}])).mockRejectedValueOnce(new Error('offline'));
    await render(Favorites); await button('取消收藏').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('已取消收藏，但列表同步失败'); expect(wrapper.text()).not.toContain('原收藏题'); expect(api.remove).toHaveBeenCalledTimes(1);
  });
});
