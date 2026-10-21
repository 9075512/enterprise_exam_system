import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseProgress } from './useCourseProgress';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('课程观看记录', () => {
  it('按账号、课程、小节隔离，重建后恢复位置、最后小节及完成状态', () => {
    const first = useCourseProgress('user-1');
    first.select('course-a', 'lesson-1');
    first.save('course-a', 'lesson-1', { position: 32.5, duration: 100, completed: false });
    first.select('course-a', 'lesson-2');
    first.save('course-a', 'lesson-2', { position: 20, duration: 20, completed: true });
    first.save('course-b', 'lesson-1', { position: 7, duration: 100, completed: false });
    const restored = useCourseProgress('user-1');
    expect(restored.lastLesson('course-a')).toBe('lesson-2');
    expect(restored.lesson('course-a', 'lesson-1')?.position).toBe(32.5);
    expect(restored.lesson('course-a', 'lesson-2')?.completed).toBe(true);
    expect(restored.lesson('course-b', 'lesson-1')?.position).toBe(7);
    expect(useCourseProgress('user-2').lesson('course-a', 'lesson-1')).toBeUndefined();
  });
  it('旧播放器退出时的补存不会覆盖当前选择，重看也不撤销完成状态', () => {
    const progress = useCourseProgress('u');
    progress.select('a', 'new');
    progress.save('a', 'old', { position: 100, duration: 100, completed: true });
    progress.save('a', 'old', { position: 10, duration: 100, completed: false });
    expect(progress.lastLesson('a')).toBe('new');
    expect(progress.lesson('a', 'old')).toMatchObject({ position: 10, completed: true });
  });
  it('损坏记录可以恢复，不接受无效时间和超出时长的位置', () => {
    localStorage.setItem('course-progress:v1:u', '{bad');
    const progress = useCourseProgress('u');
    expect(progress.storageError.value).toContain('无法读取');
    progress.save('a', 'x', { position: NaN, duration: 30, completed: false });
    expect(progress.lesson('a', 'x')).toBeUndefined();
    progress.save('a', 'x', { position: 45, duration: 30, completed: false });
    expect(progress.lesson('a', 'x')?.position).toBe(30);
    expect(progress.storageError.value).toBe('');
  });
  it('存储失败时保留内存进度并显示明确提示', () => {
    const progress = useCourseProgress('u');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError'); });
    progress.save('a', 'x', { position: 12, duration: 30, completed: false });
    expect(progress.lesson('a', 'x')?.position).toBe(12);
    expect(progress.storageError.value).toContain('保存失败');
    vi.restoreAllMocks();
    progress.save('a', 'x', { position: 14, duration: 30, completed: false });
    expect(progress.storageError.value).toBe('');
    expect(useCourseProgress('u').lesson('a', 'x')?.position).toBe(14);
  });
  it('读取时丢弃不合法的持久化小节', () => {
    localStorage.setItem('course-progress:v1:u', JSON.stringify({ version: 1, courses: { a: { lastLessonId: 'ok', lessons: { ok: { position: 12, duration: 20, completed: false }, bad: { position: -5, duration: 10 } } } } }));
    const progress = useCourseProgress('u');
    expect(progress.lesson('a', 'ok')?.position).toBe(12);
    expect(progress.lesson('a', 'bad')).toBeUndefined();
  });
});
