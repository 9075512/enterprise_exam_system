import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AudienceDialog from './CourseAudienceDialog.vue';
import ProgressDialog from './CourseProgressDialog.vue';

const api = vi.hoisted(() => ({ audience: vi.fn(), save: vi.fn(), report: vi.fn(), person: vi.fn(), export: vi.fn(), users: vi.fn(), departments: vi.fn() }));
vi.mock('@/api/courses', () => ({ getCourseAudience: api.audience, saveCourseAudience: api.save, getCourseProgressReport: api.report, getCoursePersonProgress: api.person, exportCourseProgress: api.export }));
vi.mock('@/api/users', () => ({ list: api.users }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
const people = [
  { id: 'u1', name: '张三', username: 'zhangsan', role: 'examinee', status: 'active', departmentId: 'parent', departmentName: '研发科' },
  { id: 'u2', name: '李四', username: 'lisi', role: 'examinee', status: 'active', departmentId: 'child', departmentName: '子科室' },
  { id: 'u3', name: '王五', username: 'wangwu', role: 'examinee', status: 'active', departmentId: 'other', departmentName: '其他科室' },
];
const report = () => ({ courseTitle: '安全培训', list: [{ userId: 'u1', userName: '张三', username: 'zhangsan', departmentId: 'parent', departmentName: '研发科', accountStatus: 'active', scope: 'current', status: 'not_started', completedLessons: 0, totalLessons: 2, percent: 0, lastLearnedAt: '' }], total: 1, page: 1, pageSize: 20, summary: { total: 1, notStarted: 1, learning: 0, completed: 0, completionRate: 0 } });
let wrapper: VueWrapper | undefined;
const button = (label: string) => wrapper!.findAll('button').find(item => item.text() === label)!;
async function render(component: typeof AudienceDialog | typeof ProgressDialog) {
  wrapper = mount(component, { props: { modelValue: true, courseId: 'course-a', courseTitle: '安全培训' }, attachTo: document.body, global: { plugins: [ElementPlus], stubs: {
    ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' },
  } } }); await flushPromises(); return wrapper;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.audience.mockResolvedValue({ mode: 'public', revision: 4, departmentIds: [], userIds: [] });
  api.users.mockResolvedValue(people); api.departments.mockResolvedValue([{ id: 'parent', name: '研发科', parentId: null }, { id: 'child', name: '子科室', parentId: 'parent' }, { id: 'other', name: '其他科室', parentId: null }]);
  api.save.mockImplementation(async (_id, input) => ({ ...input, revision: 5, mode: 'assigned' }));
  api.report.mockResolvedValue(report()); api.export.mockResolvedValue(new Blob(['xlsx']));
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; ElMessage.closeAll(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('课程绑定窗口', () => {
  it('父科室包含子科室，与指定人员合并去重；保存版本与空名单语义明确', async () => {
    await render(AudienceDialog);
    expect(wrapper!.text()).toContain('历史公开课程');
    wrapper!.getComponent({ name: 'ElTreeSelect' }).vm.$emit('update:modelValue', ['parent']);
    wrapper!.findAllComponents({ name: 'ElSelect' }).at(-1)!.vm.$emit('update:modelValue', ['u1', 'u3']); await flushPromises();
    expect(wrapper!.text()).toContain('生效名单预览 · 3 人');
    await button('保存绑定').trigger('click'); await flushPromises();
    expect(api.save).toHaveBeenCalledWith('course-a', { revision: 4, departmentIds: ['parent'], userIds: ['u1', 'u3'] });
    expect(wrapper!.emitted('saved')).toHaveLength(1);
  });
  it('空范围保存为限制访问，关闭未保存修改需要确认', async () => {
    await render(AudienceDialog);
    expect(wrapper!.text()).toContain('空名单保存后无人可看');
    await button('保存绑定').trigger('click'); await flushPromises();
    expect(api.save).toHaveBeenCalledWith('course-a', { revision: 4, departmentIds: [], userIds: [] });
    wrapper!.getComponent({ name: 'ElTreeSelect' }).vm.$emit('update:modelValue', ['parent']); await flushPromises();
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    const previous = wrapper!.emitted('update:modelValue')?.length;
    await button('取消').trigger('click'); await flushPromises();
    expect(wrapper!.emitted('update:modelValue')?.length).toBe(previous);
  });
  it('并发冲突保留选择并阻止重复覆盖，重新加载后恢复保存', async () => {
    await render(AudienceDialog);
    wrapper!.getComponent({ name: 'ElTreeSelect' }).vm.$emit('update:modelValue', ['parent']); await flushPromises();
    api.save.mockRejectedValueOnce(Object.assign(new Error('课程已变化，请重新加载'), { status: 409 }));
    await button('保存绑定').trigger('click'); await flushPromises();
    expect(wrapper!.text()).toContain('课程已变化'); expect(wrapper!.getComponent({ name: 'ElTreeSelect' }).props('modelValue')).toEqual(['parent']);
    expect(button('保存绑定').attributes('disabled')).toBeDefined();
    await button('重新加载').trigger('click'); await flushPromises();
    expect(button('保存绑定').attributes('disabled')).toBeUndefined(); expect(api.audience).toHaveBeenCalledTimes(2);
  });
  it('加载失败可重试，停用的直接指定人员需移除', async () => {
    api.audience.mockRejectedValueOnce(new Error('读取失败'));
    await render(AudienceDialog); expect(wrapper!.text()).toContain('读取失败'); expect(button('保存绑定').attributes('disabled')).toBeDefined();
    api.audience.mockResolvedValue({ mode: 'assigned', revision: 6, departmentIds: [], userIds: ['disabled-user'] });
    await button('重新加载').trigger('click'); await flushPromises();
    await button('保存绑定').trigger('click'); await flushPromises();
    expect(api.save).not.toHaveBeenCalled(); expect(wrapper!.text()).toContain('请移除已停用或不存在');
  });
});

describe('课程学习进度窗口', () => {
  it('展示未看课人员及空时间，搜索和历史页签传递统一筛选条件', async () => {
    await render(ProgressDialog);
    expect(wrapper!.text()).toContain('张三'); expect(wrapper!.text()).toContain('未开始'); expect(wrapper!.text()).toContain('0.0%');
    await wrapper!.get('input[aria-label="搜索学习人员"]').setValue('zhangsan'); await button('查询').trigger('click'); await flushPromises();
    expect(api.report.mock.calls.at(-1)).toEqual(['course-a', expect.objectContaining({ keyword: 'zhangsan', scope: 'current', page: 1 })]);
    const tabs = wrapper!.getComponent({ name: 'ElTabs' }); tabs.vm.$emit('update:modelValue', 'history'); tabs.vm.$emit('tabChange', 'history'); await flushPromises();
    expect(api.report.mock.calls.at(-1)![1].scope).toBe('history'); expect(wrapper!.text()).toContain('不计入当前人员完成率');
  });
  it('按已应用筛选导出全部结果，读取人员小节明细并显示北京时间', async () => {
    api.person.mockResolvedValue({ ...report().list[0], courseTitle: '安全培训', lessons: [{ lessonId: 'a', chapterTitle: '基础章', lessonTitle: '第一小节', position: 10, duration: 60, status: 'learning', completed: false, lastLearnedAt: '2026-10-30T00:15:00Z' }] });
    await render(ProgressDialog);
    await button('小节明细').trigger('click'); await flushPromises();
    expect(api.person).toHaveBeenCalledWith('course-a', 'u1'); expect(wrapper!.text()).toContain('第一小节'); expect(wrapper!.text()).toContain('08:15:00');
    await button('关闭明细').trigger('click'); await flushPromises();
    const createUrl = vi.fn(() => 'blob:course-report'), revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revoke }); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await wrapper!.get('input[aria-label="搜索学习人员"]').setValue('尚未查询的文本');
    await button('导出 Excel').trigger('click'); await flushPromises();
    expect(api.export).toHaveBeenCalledWith('course-a', expect.objectContaining({ keyword: '', scope: 'current' })); expect(createUrl).toHaveBeenCalledOnce();
  });
  it('加载与导出失败均可恢复，不以旧列表冒充新结果', async () => {
    api.report.mockRejectedValueOnce(new Error('统计读取失败'));
    await render(ProgressDialog); expect(wrapper!.text()).toContain('统计读取失败'); expect(wrapper!.text()).not.toContain('张三');
    await button('重试加载').trigger('click'); await flushPromises(); expect(wrapper!.text()).toContain('张三');
    api.export.mockRejectedValueOnce(new Error('导出失败'));
    await button('导出 Excel').trigger('click'); await flushPromises(); expect(wrapper!.text()).toContain('导出失败');
  });
  it('切换课程后丢弃迟到结果，避免显示上一门课程的名单', async () => {
    let finish!: (value: ReturnType<typeof report>) => void;
    api.report.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(ProgressDialog); await wrapper!.setProps({ courseId: 'course-b', courseTitle: '第二门课程' }); await flushPromises();
    const stale = report(); stale.list[0].userName = '旧课程人员'; finish(stale); await flushPromises();
    expect(wrapper!.text()).not.toContain('旧课程人员'); expect(wrapper!.text()).toContain('第二门课程');
  });
});
