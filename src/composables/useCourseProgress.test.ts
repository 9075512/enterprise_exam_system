import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useCourseProgress } from './useCourseProgress';
import type { SavedProgress, ProgressWrite } from '@/api/courseProgress';

const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), select: vi.fn(), migrate: vi.fn() }));
vi.mock('@/api/courseProgress', () => ({ getCourseProgress: api.get, saveCourseProgress: api.save, selectCourseLesson: api.select, importCourseProgress: api.migrate }));
const empty = (): SavedProgress => ({ version: 1, courses: {} });
let accounts: Map<string, SavedProgress>;
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); accounts = new Map();
  const account = (token: string) => { if (!accounts.has(token)) accounts.set(token, empty()); return accounts.get(token)!; };
  api.get.mockImplementation(async (token: string) => structuredClone(account(token)));
  api.select.mockImplementation(async (courseId: string, lessonId: string, token: string) => { (account(token).courses[courseId] ??= { lessons: {} }).lastLessonId = lessonId; });
  api.save.mockImplementation(async (courseId: string, lessonId: string, body: ProgressWrite, token: string) => {
    const course = account(token).courses[courseId] ??= { lessons: {} };
    const value = { ...body, revision: (course.lessons[lessonId]?.revision ?? 0) + 1, updatedAt: Date.now() }; course.lessons[lessonId] = value; return value;
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('账号观看记录同步', () => {
  it('记录上传数据库后，新设备无本地缓存也能恢复位置、最后小节及完成状态；账号隔离', async () => {
    const first = useCourseProgress('u1', 'token-one');
    first.select('course-a', 'lesson-1'); first.save('course-a', 'lesson-1', { position: 32.5, duration: 100, completed: false });
    first.select('course-a', 'lesson-2'); first.save('course-a', 'lesson-2', { position: 20, duration: 20, completed: true });
    await first.flush(); await flushPromises(); localStorage.clear();
    const device = useCourseProgress('u1', 'token-one'); await device.load();
    expect(device.lastLesson('course-a')).toBe('lesson-2'); expect(device.lesson('course-a', 'lesson-1')?.position).toBe(32.5);
    expect(device.lesson('course-a', 'lesson-2')?.completed).toBe(true);
    const other = useCourseProgress('u2', 'token-two'); await other.load(); expect(other.lesson('course-a', 'lesson-1')).toBeUndefined();
  });
  it('播放时合并为5秒同步，暂停时立即补存，完成后重看不撤销完成状态', async () => {
    const progress = useCourseProgress('u', 'token');
    progress.save('course', 'lesson', { position: 1, duration: 30, completed: false });
    progress.save('course', 'lesson', { position: 4, duration: 30, completed: false }); expect(api.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000); expect(api.save).toHaveBeenCalledOnce(); expect(api.save.mock.calls[0][2].position).toBe(4);
    progress.save('course', 'lesson', { position: 30, duration: 30, completed: true, immediate: true }); await flushPromises();
    progress.save('course', 'lesson', { position: 2, duration: 30, completed: false, immediate: true }); await flushPromises();
    expect(api.save).toHaveBeenCalledTimes(3); expect(progress.lesson('course', 'lesson')).toMatchObject({ position: 2, completed: true });
  });
  it('较早请求迟到不清除新进度或回退版本', async () => {
    const finish: ((value: unknown) => void)[] = []; api.save.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
    const progress = useCourseProgress('u', 'token'); progress.save('course', 'lesson', { position: 2, duration: 30, completed: false, immediate: true });
    progress.save('course', 'lesson', { position: 8, duration: 30, completed: false, immediate: true });
    const body1 = api.save.mock.calls[0][2], body2 = api.save.mock.calls[1][2];
    finish[1]({ ...body2, revision: 2, updatedAt: 2 }); await flushPromises(); finish[0]({ ...body1, revision: 1, updatedAt: 1 }); await flushPromises();
    expect(progress.lesson('course', 'lesson')).toMatchObject({ position: 8, revision: 2 });
    expect(JSON.parse(localStorage.getItem('course-progress:v2:u')!).pending).toHaveLength(0);
  });
  it('断网保留待同步队列，刷新后恢复并重试上传', async () => {
    api.save.mockRejectedValueOnce(new Error('offline')); const progress = useCourseProgress('u', 'token');
    progress.save('course', 'lesson', { position: 14, duration: 30, completed: false, immediate: true }); await flushPromises();
    expect(progress.storageError.value).toContain('同步失败'); expect(JSON.parse(localStorage.getItem('course-progress:v2:u')!).pending).toHaveLength(1);
    const restored = useCourseProgress('u', 'token'); await restored.load();
    expect(restored.lesson('course', 'lesson')?.position).toBe(14); expect(restored.storageError.value).toBe('');
    expect(JSON.parse(localStorage.getItem('course-progress:v2:u')!).pending).toHaveLength(0);
  });
  it('数据库已有其他设备的新进度时，旧缓存不会覆盖它', async () => {
    api.save.mockRejectedValueOnce(new Error('offline')); const progress = useCourseProgress('u', 'token');
    progress.save('course', 'lesson', { position: 14, duration: 100, completed: false, immediate: true }); await flushPromises();
    accounts.set('token', { version: 1, courses: { course: { lastLessonId: 'lesson', lessons: { lesson: { position: 70, duration: 100, completed: false, updatedAt: 10, revision: 8, clientId: 'other-device', sequence: 4 } } } } });
    api.save.mockClear(); const restored = useCourseProgress('u', 'token'); await restored.load();
    expect(restored.lesson('course', 'lesson')?.position).toBe(70); expect(api.save).not.toHaveBeenCalled();
  });
  it('自动迁移旧本地记录并保留备份，以接口返回的数据库记录为准', async () => {
    const legacy = { version: 1, courses: { course: { lastLessonId: 'lesson', lessons: { lesson: { position: 12, duration: 30, completed: false, updatedAt: 1 } } } } };
    localStorage.setItem('course-progress:v1:u', JSON.stringify(legacy));
    api.migrate.mockResolvedValue({ version: 1, courses: { course: { lastLessonId: 'lesson', lessons: { lesson: { position: 25, duration: 30, completed: false, revision: 3, updatedAt: 3 } } } } });
    const progress = useCourseProgress('u', 'token'); await progress.load();
    expect(api.migrate).toHaveBeenCalledWith([{ courseId: 'course', lessonId: 'lesson', position: 12, duration: 30, completed: false, selected: true }], 'token');
    expect(progress.lesson('course', 'lesson')?.position).toBe(25); expect(localStorage.getItem('course-progress:v1:u')).not.toBeNull();
  });
  it('本地缓存损坏可从账号恢复，存储不可用也不阻止上传', async () => {
    localStorage.setItem('course-progress:v2:u', '{bad'); const progress = useCourseProgress('u', 'token'); expect(progress.storageError.value).toContain('无法读取');
    await progress.load(); expect(progress.storageError.value).toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('no storage'); });
    progress.save('course', 'lesson', { position: 9, duration: 30, completed: false, immediate: true }); await flushPromises();
    expect(api.save).toHaveBeenCalledOnce(); expect(progress.storageError.value).toContain('暂存不可用');
    progress.save('course', 'bad', { position: NaN, duration: 30, completed: false }); expect(progress.lesson('course', 'bad')).toBeUndefined();
  });
  it('页面卸载发出最后补存，账号切换后仍使用原账号令牌', async () => {
    const scope = effectScope(); const progress = scope.run(() => useCourseProgress('u', 'original-token'))!;
    progress.save('course', 'lesson', { position: 9, duration: 30, completed: false }); localStorage.setItem('exam_sys.token', 'other-token'); scope.stop(); await flushPromises();
    expect(api.save.mock.calls[0][3]).toBe('original-token');
    progress.save('course', 'lesson', { position: 10, duration: 30, completed: false, immediate: true }); await flushPromises();
    expect(JSON.parse(localStorage.getItem('course-progress:v2:u')!).data.courses.course.lessons.lesson.position).toBe(10);
  });
});
