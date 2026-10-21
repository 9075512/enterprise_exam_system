import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import Editor from './CourseEditorDrawer.vue';
import ManagePage from './CourseManagePage.vue';
import type { ManagedCourse } from '@/api/courses';

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn(), remove: vi.fn(), upload: vi.fn(), generate: vi.fn() }));
vi.mock('@/api/courses', () => ({ listManagedCourses: api.list, getManagedCourse: api.get, createCourse: api.create, updateCourse: api.update, setCourseStatus: api.status, deleteCourse: api.remove, uploadCourseMedia: api.upload, generateCourseCover: api.generate }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));
const record = (): ManagedCourse => ({ id: 'course-1', title: '护理基础', description: '课程简介', category: '护理', instructor: '教学团队', cover: '/courses/flower.svg', level: '入门', isDemo: false, sortOrder: 0, status: 'draft', revision: 3, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z', chapters: [{ id: 'ch-1', title: '第一章', lessons: [{ id: 'lesson-1', title: '第一小节', src: 'https://example.com/a.mp4', durationLabel: '05:00', description: '' }] }] });
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ list: [record()], total: 1, page: 1, pageSize: 12, stats: { draft: 1, published: 0, archived: 0 } });
  api.get.mockResolvedValue(record());
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; ElMessage.closeAll(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const button = (text: string) => wrapper!.findAll('button').find(item => item.text() === text)!;
async function editor(course: ManagedCourse | null = null) {
  wrapper = mount(Editor, { props: { modelValue: true, course }, attachTo: document.body, global: { plugins: [ElementPlus], stubs: { ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' } } } }); await flushPromises(); return wrapper;
}
async function page() {
  wrapper = mount(ManagePage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { CourseEditorDrawer: true, CourseVideoPlayer: true, ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' } } } }); await flushPromises(); return wrapper;
}
describe('课程编辑工作流', () => {
  it('未填写标题不能生成；生成期间阻止保存和重复请求，完成后回填并随草稿保存', async () => {
    await editor(); await button('生成封面').trigger('click'); expect(api.generate).not.toHaveBeenCalled();
    expect(wrapper!.text()).toContain('请先填写课程标题，再生成封面');
    await wrapper!.get('input[aria-label="课程标题"]').setValue('瓦斯安全');
    await wrapper!.get('input[aria-label="课程分类"]').setValue('瓦斯防治');
    let resolve!: (value: { url: string }) => void;
    api.generate.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await button('生成封面').trigger('click'); await button('生成封面').trigger('click');
    expect(api.generate).toHaveBeenCalledOnce(); expect(api.generate.mock.calls[0][0]).toEqual({ title: '瓦斯安全', category: '瓦斯防治', instructor: '' });
    expect(button('保存草稿').attributes('disabled')).toBeDefined();
    resolve({ url: '/api/courses/media/generated?t=abc' }); await flushPromises();
    expect(wrapper!.get('img[alt="课程封面预览"]').attributes('src')).toBe('/api/courses/media/generated?t=abc');
    api.create.mockResolvedValue(record()); await button('保存草稿').trigger('click'); await flushPromises();
    expect(api.create.mock.calls[0][0].cover).toBe('/api/courses/media/generated?t=abc');
  });
  it('保留已有封面，清空后可生成；失败和取消保留输入并允许重试', async () => {
    await editor(record()); expect(button('生成封面').attributes('disabled')).toBeDefined();
    await button('生成封面').trigger('click'); expect(api.generate).not.toHaveBeenCalled();
    await wrapper!.get('input[aria-label="封面地址"]').setValue('');
    api.generate.mockRejectedValueOnce(new Error('生成服务暂不可用'));
    await button('生成封面').trigger('click'); await flushPromises(); expect(wrapper!.text()).toContain('生成服务暂不可用');
    expect((wrapper!.get('input[aria-label="课程标题"]').element as HTMLInputElement).value).toBe('护理基础');
    let finish!: (value: { url: string }) => void;
    api.generate.mockReturnValueOnce(new Promise(done => { finish = done; }));
    await button('生成封面').trigger('click'); await button('取消生成').trigger('click');
    expect(api.generate.mock.calls[1][1].aborted).toBe(true);
    finish({ url: '/api/courses/media/cancelled' }); await flushPromises();
    expect(wrapper!.find('img[alt="课程封面预览"]').exists()).toBe(false);
    expect(button('生成封面').attributes('disabled')).toBeUndefined();
  });
  it('新增课程校验标题，新增章节和小节，并以草稿保存完整结构', async () => {
    await editor(); await button('保存草稿').trigger('click'); expect(api.create).not.toHaveBeenCalled();
    expect(wrapper!.text()).toContain('请输入课程标题');
    await wrapper!.get('input[aria-label="课程标题"]').setValue('岗位学习');
    await wrapper!.get('#tab-chapters').trigger('click');
    await button('添加章节').trigger('click'); await button('添加小节').trigger('click');
    await wrapper!.get('input[aria-label="小节1.1视频地址"]').setValue('https://example.com/video.mp4');
    api.create.mockResolvedValue(record());
    await button('保存草稿').trigger('click'); await flushPromises();
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.create.mock.calls[0][0]).toMatchObject({ title: '岗位学习', chapters: [{ title: '第1章', lessons: [{ src: 'https://example.com/video.mp4' }] }] });
    expect(wrapper!.emitted('saved')).toHaveLength(1);
  });
  it('编辑时保留章节小节ID，保存失败保留输入和原版本，阻止重复提交', async () => {
    await editor(record()); await wrapper!.get('input[aria-label="课程标题"]').setValue('修改后的标题');
    let reject!: (reason: Error) => void;
    api.update.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await button('保存修改').trigger('click'); await button('保存修改').trigger('click'); expect(api.update).toHaveBeenCalledOnce();
    expect(api.update.mock.calls[0]).toMatchObject(['course-1', 3, { title: '修改后的标题', chapters: [{ id: 'ch-1', lessons: [{ id: 'lesson-1' }] }] }]);
    reject(new Error('课程已被其他管理员修改')); await flushPromises();
    expect(wrapper!.text()).toContain('课程已被其他管理员修改');
    expect((wrapper!.get('input[aria-label="课程标题"]').element as HTMLInputElement).value).toBe('修改后的标题');
    expect(wrapper!.emitted('saved')).toBeUndefined();
  });
  it('章节与小节排序移动保留原ID，移除章节只改变当前草稿', async () => {
    const data = record(); data.chapters.push({ id: 'ch-2', title: '第二章', lessons: [] });
    await editor(data); await wrapper!.get('#tab-chapters').trigger('click');
    await wrapper!.get('[aria-label="上移章节2"]').trigger('click');
    await wrapper!.get('[aria-label="删除章节2"]').trigger('click');
    api.update.mockResolvedValue(record()); await button('保存修改').trigger('click'); await flushPromises();
    expect(api.update.mock.calls[0][2].chapters).toEqual([{ id: 'ch-2', title: '第二章', lessons: [] }]);
    expect(data.chapters).toHaveLength(2);
  });
  it('关闭未保存编辑需确认，取消确认会保留草稿', async () => {
    await editor(); await wrapper!.get('input[aria-label="课程标题"]').setValue('尚未保存');
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    await button('取消').trigger('click'); await flushPromises();
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
    await button('取消').trigger('click'); await flushPromises();
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
  it('封面上传校验类型并回填上传地址，上传失败不清空原封面', async () => {
    await editor(record()); const input = wrapper!.get('input[aria-label="上传课程封面"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] });
    await input.trigger('change'); expect(api.upload).not.toHaveBeenCalled(); expect(wrapper!.text()).toContain('请选择有效的');
    api.upload.mockResolvedValueOnce({ url: '/api/courses/media/asset?t=123' });
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['png'], 'cover.png', { type: 'image/png' })] });
    await input.trigger('change'); await flushPromises();
    expect((wrapper!.get('input[aria-label="封面地址"]').element as HTMLInputElement).value).toBe('/api/courses/media/asset?t=123');
    api.upload.mockRejectedValueOnce(new Error('网络中断'));
    await input.trigger('change'); await flushPromises();
    expect(wrapper!.text()).toContain('网络中断');
    expect((wrapper!.get('input[aria-label="封面地址"]').element as HTMLInputElement).value).toBe('/api/courses/media/asset?t=123');
  });
});
describe('课程管理列表', () => {
  it('列表失败不显示假零值，重试后恢复课程与统计', async () => {
    api.list.mockRejectedValueOnce(new Error('offline')); await page();
    expect(wrapper!.text()).toContain('数量未知'); expect(wrapper!.text()).toContain('课程列表加载失败');
    wrapper!.getComponent({ name: 'RequestError' }).vm.$emit('retry'); await flushPromises();
    expect(wrapper!.text()).toContain('护理基础'); expect(wrapper!.text()).toContain('共 1 门课程');
  });
  it('已上架课程禁止直接编辑删除，下架确认被取消不会调用接口', async () => {
    const data = record(); data.status = 'published';
    api.list.mockResolvedValueOnce({ list: [data], total: 1, page: 1, pageSize: 12, stats: { draft: 0, published: 1, archived: 0 } });
    await page(); expect(button('编辑').attributes('disabled')).toBeDefined(); expect(button('删除').attributes('disabled')).toBeDefined();
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel'); await button('下架').trigger('click'); await flushPromises(); expect(api.status).not.toHaveBeenCalled();
  });
  it('上架校验错误显示具体原因，删除确认期间阻止重复请求', async () => {
    await page(); api.status.mockRejectedValueOnce(new Error('上架前请为所有小节配置视频'));
    await button('上架').trigger('click'); await flushPromises(); expect(wrapper!.text()).toContain('上架前请为所有小节配置视频');
    let confirm!: () => void;
    vi.mocked(ElMessageBox.confirm).mockReturnValueOnce(new Promise(resolve => { confirm = () => resolve('confirm' as never); }));
    await button('删除').trigger('click'); await button('删除').trigger('click'); expect(api.remove).not.toHaveBeenCalled();
    api.remove.mockResolvedValueOnce(undefined); confirm(); await flushPromises(); expect(api.remove).toHaveBeenCalledOnce(); expect(api.remove).toHaveBeenCalledWith('course-1', 3);
  });
});
