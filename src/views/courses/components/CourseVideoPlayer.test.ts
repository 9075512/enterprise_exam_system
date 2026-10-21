import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Player from './CourseVideoPlayer.vue';

let wrapper: VueWrapper;
let paused = true;
beforeEach(() => {
  vi.useFakeTimers(); paused = true;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => { paused = false; });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { paused = true; });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function render(initialPosition = 0) {
  wrapper = mount(Player, { props: { courseId: 'course-a', lessonId: 'lesson-a', src: '/demo.mp4', title: '测试小节', poster: '/cover.svg', initialPosition } });
  const media = wrapper.get('video').element as HTMLVideoElement;
  Object.defineProperties(media, { duration: { configurable: true, value: 100 }, paused: { configurable: true, get: () => paused } });
  await wrapper.get('video').trigger('loadedmetadata');
  if (initialPosition) await wrapper.get('video').trigger('seeked');
  await wrapper.get('video').trigger('canplay');
  return media;
}
function progress() { return wrapper.emitted('progress')?.at(-1); }
describe('受控课程播放器', () => {
  it('元数据加载后续播，可播放暂停，固定倍速并拦截外部拖动', async () => {
    const media = await render(23);
    expect(media.currentTime).toBe(23);
    expect(wrapper.text()).toContain('已续播至 00:23');
    expect(media.controls).toBe(false);
    await wrapper.get('.course-player__big-play').trigger('click');
    expect(media.play).toHaveBeenCalledOnce();
    await wrapper.get('video').trigger('playing');
    await wrapper.get('[aria-label="暂停视频"]').trigger('click');
    expect(media.pause).toHaveBeenCalled();
    media.currentTime = 70;
    await wrapper.get('video').trigger('seeking');
    expect(media.currentTime).toBe(23);
    await wrapper.get('video').trigger('seeked');
    media.playbackRate = 2;
    await wrapper.get('video').trigger('ratechange');
    expect(media.playbackRate).toBe(1);
    expect(wrapper.text()).toContain('不支持跳播');
  });
  it('pagehide、隐藏、暂停和卸载均补存最后位置，且保留原课程小节身份', async () => {
    const media = await render();
    media.currentTime = 36.2;
    await wrapper.get('video').trigger('timeupdate');
    window.dispatchEvent(new Event('pagehide'));
    expect(progress()).toEqual(['course-a', 'lesson-a', { position: 36.2, duration: 100, completed: false }]);
    const before = wrapper.emitted('progress')!.length;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wrapper.emitted('progress')!.length).toBe(before + 1);
    await wrapper.get('video').trigger('pause');
    wrapper.unmount();
    expect(progress()?.[2]).toMatchObject({ position: 36.2 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  it('只有自然播放结束才标记完成，并允许从头重看', async () => {
    const media = await render();
    media.currentTime = 99;
    await wrapper.get('video').trigger('timeupdate');
    expect(progress()?.[2]).toMatchObject({ completed: false });
    await wrapper.get('video').trigger('ended');
    expect(progress()?.[2]).toEqual({ position: 100, duration: 100, completed: true });
    expect(wrapper.emitted('ended')).toHaveLength(1);
    await wrapper.get('.course-player__big-play').trigger('click');
    expect(media.currentTime).toBe(0);
  });
  it('加载异常可重试并恢复重试前位置，长时间等待有超时提示', async () => {
    const media = await render(18);
    await wrapper.get('video').trigger('error');
    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法播放');
    await wrapper.get('.player-retry').trigger('click');
    expect(media.load).toHaveBeenCalledOnce();
    await wrapper.get('video').trigger('loadedmetadata');
    expect(media.currentTime).toBe(18);
    await vi.advanceTimersByTimeAsync(20000);
    expect(wrapper.text()).toContain('视频加载超时');
  });
  it('浏览器拒绝播放时提示再次点击', async () => {
    await render();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    await wrapper.get('.course-player__big-play').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('再次点击播放');
  });
});
