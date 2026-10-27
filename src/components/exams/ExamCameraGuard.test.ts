import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import ExamCameraGuard from './ExamCameraGuard.vue';

const api = vi.hoisted(() => ({ upload: vi.fn(), event: vi.fn() }));
vi.mock('@/api/captures', () => ({ upload: api.upload, event: api.event }));
const config = { enabled: true, intervalMinutes: 1, cameraPolicy: 'required' as const, retentionDays: 30 };
let wrapper: ReturnType<typeof mount> | undefined;
let getUserMedia: ReturnType<typeof vi.fn>;
let hidden = false;
const track = { readyState: 'live', muted: false, stop: vi.fn(), onended: null as (() => void) | null, onmute: null as (() => void) | null, onunmute: null as (() => void) | null };
const stream = { getTracks: () => [track], getVideoTracks: () => [track] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.clearAllMocks();
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['JPEG'], { type: 'image/jpeg' })));
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  api.event.mockResolvedValue(null); api.upload.mockResolvedValue({ id: 'photo1' });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render(overrides = {}) {
  wrapper = mount(ExamCameraGuard, { props: { recordId: 'r1', config: { ...config, ...overrides }, active: true }, global: { stubs: { ElButton: { template: '<button><slot /></button>' } } } });
  await flushPromises(); return wrapper;
}
describe('考试摄像头采集', () => {
  it('关闭时完全不请求摄像头、抓拍或事件上报', async () => {
    await render({ enabled: false }); await vi.advanceTimersByTimeAsync(120000);
    expect(getUserMedia).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled(); expect(api.event).not.toHaveBeenCalled();
  });
  it('有实际画面后解除必拍遮挡，恢复拍照后按分钟定时采集', async () => {
    await render();
    expect(wrapper!.emitted('lockedChange')?.map(args => args[0])).toEqual([true, false]);
    expect(api.upload).toHaveBeenCalledTimes(1); expect(api.upload.mock.calls[0]?.[3]).toBe('resume');
    await vi.advanceTimersByTimeAsync(60000); await flushPromises();
    expect(api.upload).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1]?.[3]).toBe('periodic');
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
  });
  it('必拍授权失败保持遮挡，可选模式只提醒并记录', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await render(); expect(wrapper!.text()).toContain('授权被拒绝');
    expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(true);
    wrapper!.unmount(); wrapper = undefined;
    await render({ cameraPolicy: 'optional' });
    expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(false);
    expect(api.upload).not.toHaveBeenCalled(); expect(api.event).toHaveBeenCalledWith('r1', 'unavailable', expect.any(String), expect.any(String));
  });
  it('摄像头断开重新遮挡，重试恢复后继续采集', async () => {
    await render(); track.onended?.(); await flushPromises();
    expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(true);
    expect(wrapper!.text()).toContain('画面已中断');
    await wrapper!.get('button').trigger('click'); await flushPromises();
    expect(getUserMedia).toHaveBeenCalledTimes(2); expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(false);
  });
  it('上传失败只有限重试同一采集标识，保持答题解锁', async () => {
    api.upload.mockRejectedValue(new Error('offline'));
    await render(); await vi.advanceTimersByTimeAsync(10000); await flushPromises();
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(new Set(api.upload.mock.calls.map(args => args[2])).size).toBe(1);
    expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(false);
    expect(wrapper!.text()).toContain('答案和交卷不受影响');
  });
  it('无法生成实际照片属于摄像头异常，必拍模式重新遮挡题目', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null));
    await render();
    expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(true);
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.event).toHaveBeenCalledWith('r1', 'unavailable', expect.any(String), expect.any(String));
    expect(track.stop).toHaveBeenCalled();
  });
  it('网页后台停止采集和释放设备，返回前台补拍并沿用原答卷', async () => {
    await render(); hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flushPromises();
    expect(track.stop).toHaveBeenCalled(); expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(true);
    await vi.advanceTimersByTimeAsync(120000); expect(api.upload).toHaveBeenCalledTimes(1);
    hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flushPromises();
    expect(api.upload).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1]?.[0]).toBe('r1'); expect(api.upload.mock.calls[1]?.[3]).toBe('resume');
  });
  it('安卓 App 前后台事件也释放和恢复摄像头', async () => {
    await render(); window.dispatchEvent(new Event('zhuoda:app-background')); await flushPromises();
    await vi.advanceTimersByTimeAsync(60000); expect(api.upload).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('zhuoda:app-foreground')); await flushPromises(); expect(api.upload).toHaveBeenCalledTimes(2);
  });
  it('交卷后释放设备并取消上传重试与定时器', async () => {
    api.upload.mockRejectedValue(new Error('offline')); await render();
    await wrapper!.setProps({ active: false }); await flushPromises(); await vi.advanceTimersByTimeAsync(180000);
    expect(api.upload).toHaveBeenCalledTimes(1); expect(track.stop).toHaveBeenCalled(); expect(wrapper!.emitted('lockedChange')?.at(-1)?.[0]).toBe(false);
  });
  it('离开页面后才完成的摄像头授权立即释放，不继续上传', async () => {
    let resolve!: (value: typeof stream) => void;
    getUserMedia.mockImplementation(() => new Promise(done => { resolve = done; }));
    await render(); wrapper!.unmount(); wrapper = undefined;
    resolve(stream); await flushPromises(); expect(track.stop).toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
  });
  it('Teleport 切换布局复用设备、视频节点与定时抓拍，异常按钮仍可操作', async () => {
    const compact = ref(false);
    const harness = defineComponent({ components: { ExamCameraGuard }, setup: () => ({ compact, config }), template: '<div><div id="camera-test-target" /><Teleport defer to="#camera-test-target" :disabled="!compact"><ExamCameraGuard record-id="r1" :config="config" :active="true" :compact="compact" /></Teleport></div>' });
    wrapper = mount(harness, { attachTo: document.body, global: { stubs: { ElButton: { template: '<button><slot /></button>' } } } });
    await flushPromises(); const element = wrapper.get('video').element;
    expect(getUserMedia).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
    compact.value = true; await flushPromises();
    expect(wrapper.get('#camera-test-target video').element).toBe(element);
    expect(getUserMedia).toHaveBeenCalledTimes(1); expect(track.stop).not.toHaveBeenCalled(); expect(api.upload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); await flushPromises(); expect(api.upload).toHaveBeenCalledTimes(2);
    compact.value = false; await flushPromises(); expect(wrapper.get('video').element).toBe(element);
    expect(wrapper.find('#camera-test-target video').exists()).toBe(false);
    compact.value = true; await flushPromises(); track.onended?.(); await flushPromises();
    expect(wrapper.get('#camera-test-target button').text()).toContain('重新开启');
    await wrapper.get('#camera-test-target button').trigger('click'); await flushPromises(); expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
