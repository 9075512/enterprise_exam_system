import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import ExamCameraPreflight from './ExamCameraPreflight.vue';
const camera = vi.hoisted(() => ({ open: vi.fn(), stop: vi.fn(), photo: vi.fn() }));
vi.mock('@/composables/useExamCamera', () => ({ useExamCamera: () => ({ ...camera, video: ref(null), state: ref('idle'), error: ref('') }) }));
const config = { enabled: true, intervalMinutes: 5, cameraPolicy: 'required' as const, retentionDays: 30 };
let wrapper: ReturnType<typeof mount<typeof ExamCameraPreflight>>;
beforeEach(() => { vi.clearAllMocks(); wrapper = mount(ExamCameraPreflight, { global: { stubs: { ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' }, ElButton: { template: '<button><slot /></button>' } } } }); });
afterEach(() => wrapper.unmount());
describe('开考摄像头准备', () => {
  it('先展示用途与保留期，用户点击后才请求授权', async () => {
    const result = wrapper.vm.prepare(config); await flushPromises();
    expect(wrapper.text()).toContain('30 天'); expect(wrapper.text()).toContain('尚未开始新的考试计时');
    expect(camera.open).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === '开启摄像头')!.trigger('click'); expect(camera.open).toHaveBeenCalledTimes(1);
    await wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click'); expect(await result).toBeNull(); expect(camera.stop).toHaveBeenCalled();
  });
  it('可选模式允许无摄像头进入并带上原因，必拍没有跳过按钮', async () => {
    const required = wrapper.vm.prepare(config); await flushPromises(); expect(wrapper.text()).not.toContain('记录异常并进入');
    const optional = wrapper.vm.prepare({ ...config, cameraPolicy: 'optional' }); expect(await required).toBeNull(); await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === '记录异常并进入')!.trigger('click');
    expect(await optional).toMatchObject({ reason: '考生未开启摄像头', captureId: expect.any(String) }); expect(camera.photo).not.toHaveBeenCalled();
  });
});
