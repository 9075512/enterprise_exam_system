import { ref } from 'vue';

export interface LessonProgress { position: number; duration: number; completed: boolean; updatedAt: number }
export interface PlaybackProgress { position: number; duration: number; completed: boolean }
interface SavedCourse { lastLessonId?: string; lessons: Record<string, LessonProgress> }
interface SavedProgress { version: 1; courses: Record<string, SavedCourse> }

export function useCourseProgress(userId: string) {
  const key = `course-progress:v1:${encodeURIComponent(userId)}`;
  const data = ref<SavedProgress>({ version: 1, courses: {} });
  const storageError = ref('');
  function reload(): void {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.courses || typeof parsed.courses !== 'object' || Array.isArray(parsed.courses)) throw new Error('invalid');
      const valid: SavedProgress = { version: 1, courses: {} };
      for (const [id, course] of Object.entries(parsed.courses) as [string, SavedCourse][]) {
        if (!course || typeof course.lessons !== 'object' || !course.lessons) continue;
        const lessons: Record<string, LessonProgress> = {};
        for (const [lessonId, lesson] of Object.entries(course.lessons)) {
          if (!lesson || !Number.isFinite(lesson.position) || lesson.position < 0 || !Number.isFinite(lesson.duration) || lesson.duration < 0) continue;
          lessons[lessonId] = { position: Math.min(lesson.position, lesson.duration || lesson.position), duration: lesson.duration, completed: lesson.completed === true, updatedAt: Number.isFinite(lesson.updatedAt) ? lesson.updatedAt : 0 };
        }
        valid.courses[id] = { lastLessonId: typeof course.lastLessonId === 'string' ? course.lastLessonId : undefined, lessons };
      }
      data.value = valid;
    } catch { storageError.value = '无法读取本地观看记录，将从头开始；继续学习后会尝试重新保存。'; }
  }
  reload();
  function persist(): void {
    try { localStorage.setItem(key, JSON.stringify(data.value)); storageError.value = ''; }
    catch { storageError.value = '观看记录保存失败，请检查浏览器存储权限或可用空间。当前进度暂存于本页，关闭后可能丢失。'; }
  }
  function select(courseId: string, lessonId: string): void {
    const course = data.value.courses[courseId] ??= { lessons: {} };
    course.lastLessonId = lessonId;
    persist();
  }
  function save(courseId: string, lessonId: string, progress: PlaybackProgress): void {
    if (!Number.isFinite(progress.position) || !Number.isFinite(progress.duration) || progress.position < 0 || progress.duration <= 0) return;
    const course = data.value.courses[courseId] ??= { lessons: {} };
    course.lessons[lessonId] = {
      position: Math.min(progress.position, progress.duration), duration: progress.duration,
      completed: course.lessons[lessonId]?.completed === true || progress.completed,
      updatedAt: Date.now(),
    };
    persist();
  }
  function lesson(courseId: string, lessonId: string): LessonProgress | undefined { return data.value.courses[courseId]?.lessons[lessonId]; }
  function lastLesson(courseId: string): string | undefined { return data.value.courses[courseId]?.lastLessonId; }
  return { data, storageError, lesson, lastLesson, select, save };
}
