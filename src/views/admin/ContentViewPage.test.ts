import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElButton, ElMessage, ElMessageBox } from 'element-plus';
import ContentViewPage from './ContentViewPage.vue';
const api = vi.hoisted(() => ({ announcements: vi.fn(), banners: vi.fn(), createAnn: vi.fn(), updateAnn: vi.fn(), deleteAnn: vi.fn(), batchAnn: vi.fn(), createBanner: vi.fn(), updateBanner: vi.fn(), deleteBanner: vi.fn(), batchBanner: vi.fn(), touch: vi.fn(), upload: vi.fn() }));
vi.mock('@/api/content', () => ({ listAnnouncements: api.announcements, listBanners: api.banners, createAnnouncement: api.createAnn, updateAnnouncement: api.updateAnn, deleteAnnouncement: api.deleteAnn, batchAnnouncements: api.batchAnn, createBanner: api.createBanner, updateBanner: api.updateBanner, deleteBanner: api.deleteBanner, batchBanners: api.batchBanner, getTouchStats: api.touch }));
vi.mock('@/api/attachments', () => ({ uploadImage: api.upload }));
const announcement = { id: 'ann-1', title: '原公告标题', content: '<p>完整原文</p>', target: 'practice', level: 'important', pinned: true, enabled: true, startAt: null, endAt: null, createdByName: '管理员' };
let wrapper: VueWrapper;
const click = async (name: string) => { wrapper.findAllComponents(ElButton).find(b => b.text() === name && b.isVisible())!.vm.$emit('click', new MouseEvent('click')); await flushPromises(); };
async function render() { wrapper = mount(ContentViewPage, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { TableDensityToggle: true, RichTextEditor: { name: 'RichTextEditor', props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } } } }); await flushPromises(); }
beforeEach(() => { vi.resetAllMocks(); api.announcements.mockResolvedValue({ list: [announcement], total: 1 }); api.banners.mockResolvedValue({ list: [], total: 0 }); });
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('内容发布的保存与批量操作保护', () => {
  it('加载期间不伪报0条，公告重复保存只提交一次，失败保留内容与发布设置', async () => {
    let finish!: (value: unknown) => void;
    api.announcements.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); expect(wrapper.text()).toContain('正在加载'); expect(wrapper.find('.admin-scope').text()).not.toContain('0 条');
    finish({ list: [announcement], total: 1 }); await flushPromises(); await click(announcement.title);
    wrapper.findComponent({ name: 'RichTextEditor' }).vm.$emit('update:modelValue', '<p>修改后的完整正文</p>');
    let fail!: (error: Error) => void; api.updateAnn.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await click('保存'); await click('保存'); expect(api.updateAnn).toHaveBeenCalledOnce();
    expect(api.updateAnn).toHaveBeenCalledWith('ann-1', expect.objectContaining({ content: '<p>修改后的完整正文</p>', target: 'practice', level: 'important', pinned: true }));
    expect(wrapper.findComponent({ name: 'RichTextEditor' }).props('disabled')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElDrawer' })[0]!.props('closeOnPressEscape')).toBe(false);
    fail(new Error('offline')); await flushPromises(); expect(document.body.textContent).toContain('公告内容与发布设置已保留');
    expect(wrapper.findComponent({ name: 'RichTextEditor' }).props('modelValue')).toBe('<p>修改后的完整正文</p>');
    api.updateAnn.mockResolvedValueOnce(announcement); await click('保存'); expect(api.updateAnn).toHaveBeenCalledTimes(2);
  });
  it('轮播上传期间不能保存、关闭或重复上传，上传失败保留旧地址', async () => {
    await render(); await wrapper.findAll('[role="tab"]').find(t => t.text() === '轮播图管理')!.trigger('click'); await flushPromises(); await click('新建轮播图');
    await new DOMWrapper(document.body).find('input[placeholder="请输入轮播图标题"]').setValue('轮播样例');
    await new DOMWrapper(document.body).find('input[placeholder="也可直接粘贴图片地址"]').setValue('/original.png');
    let fail!: (error: Error) => void; api.upload.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const input = new DOMWrapper(document.body).find('input[type="file"]'); Object.defineProperty(input.element, 'files', { value: [new File(['image'], 'sample.png', { type: 'image/png' })] });
    await input.trigger('change'); await input.trigger('change'); await click('保存');
    expect(api.upload).toHaveBeenCalledOnce(); expect(api.createBanner).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents({ name: 'ElDrawer' })[1]!.props('closeOnClickModal')).toBe(false);
    expect(wrapper.findAllComponents(ElButton).find(b => b.text() === '取消' && b.isVisible())!.props('disabled')).toBe(true);
    fail(new Error('offline')); await flushPromises(); expect(document.body.textContent).toContain('图片上传失败');
    expect(new DOMWrapper(document.body).find('input[placeholder="也可直接粘贴图片地址"]').element).toHaveProperty('value', '/original.png');
    api.createBanner.mockRejectedValueOnce(new Error('offline')); await click('保存'); expect(api.createBanner).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: '/original.png', title: '轮播样例' }));
    expect(document.body.textContent).toContain('图片地址与发布设置已保留');
  });
  it('批量确认阶段锁定，取消不请求，失败保留选择与重试入口', async () => {
    await render(); wrapper.findAllComponents({ name: 'ElTable' })[0]!.vm.$emit('selection-change', [announcement]); await flushPromises();
    let cancel!: (reason: string) => void;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValueOnce(new Promise((_resolve, reject) => { cancel = reject; }));
    await click('批量上线'); await click('批量上线'); expect(confirm).toHaveBeenCalledOnce(); expect(api.batchAnn).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents({ name: 'BatchActionBar' })[0]!.props('disabled')).toBe(true);
    cancel('cancel'); await flushPromises(); expect(api.batchAnn).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>); api.batchAnn.mockRejectedValueOnce(new Error('offline'));
    await click('批量上线'); expect(api.batchAnn).toHaveBeenCalledWith(['ann-1'], 'enable');
    expect(wrapper.text()).toContain('当前列表与选择已保留'); expect(wrapper.findAllComponents({ name: 'BatchActionBar' })[0]!.props('count')).toBe(1);
  });
  it('删除末页后回到有效页并保留原筛选', async () => {
    let deleted = false;
    api.announcements.mockImplementation(async (params: { page: number }) => ({ list: params.page === 2 ? (deleted ? [] : [announcement]) : [announcement], total: deleted ? 20 : 21 }));
    await render(); const pager = wrapper.findAllComponents({ name: 'ResponsivePagination' })[0]!;
    pager.vm.$emit('update:current-page', 2); pager.vm.$emit('current-change', 2); await flushPromises();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
    api.deleteAnn.mockImplementation(async () => { deleted = true; }); await click('删除');
    expect(api.announcements).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
  });
});
