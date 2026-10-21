import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import * as api from '@/api/courseProgress';
import { TOKEN_KEY } from '@/api/http';
import type { LessonProgress, PlaybackProgress, SavedProgress, ProgressWrite } from '@/api/courseProgress';
export type { LessonProgress, PlaybackProgress } from '@/api/courseProgress';

interface Pending { courseId: string; lessonId: string; write: ProgressWrite }
const empty = (): SavedProgress => ({ version: 1, courses: Object.create(null) });
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
function snapshot(raw: unknown): SavedProgress {
  const parsed = raw as SavedProgress;
  if (parsed?.version !== 1 || !parsed.courses || typeof parsed.courses !== 'object' || Array.isArray(parsed.courses)) throw Error('invalid');
  const result = empty();
  for (const [id, course] of Object.entries(parsed.courses)) {
    if (!validId(id) || !course?.lessons || typeof course.lessons !== 'object') continue;
    const lessons: Record<string, LessonProgress> = Object.create(null);
    for (const [lessonId, value] of Object.entries(course.lessons)) {
      if (!validId(lessonId) || !value || !Number.isFinite(value.position) || value.position < 0 || !Number.isFinite(value.duration) || value.duration < 0) continue;
      lessons[lessonId] = { position: Math.min(value.position, value.duration || value.position), duration: value.duration, completed: value.completed === true, updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
        revision: Number.isSafeInteger(value.revision) && value.revision! >= 0 ? value.revision : 0, clientId: validId(value.clientId) ? value.clientId : '', sequence: Number.isSafeInteger(value.sequence) ? value.sequence : 0 };
    }
    result.courses[id] = { lastLessonId: validId(course.lastLessonId) ? course.lastLessonId : undefined, lessons };
  }
  return result;
}

export function useCourseProgress(userId: string, accessToken?: string | null) {
  const key = `course-progress:v2:${encodeURIComponent(userId)}`;
  const legacyKey = `course-progress:v1:${encodeURIComponent(userId)}`;
  const data = ref<SavedProgress>(empty());
  const cacheError = ref(''); const syncError = ref(''); const loading = ref(false);
  const storageError = computed(() => syncError.value || cacheError.value);
  const pending = new Map<string, Pending>();
  const selections = new Map<string, { lessonId: string; sequence: number }>();
  const inFlight = new Set<string>(); const conflicts = new Set<string>();
  const clientId = crypto.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let token = accessToken ?? ''; let sequence = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false; let legacyImported = false; let loadRequest: Promise<void> | undefined;
  let selectionChain: Promise<unknown> = Promise.resolve();
  try {
    token ||= localStorage.getItem(TOKEN_KEY) ?? '';
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw); if (saved.version !== 2) throw Error('invalid');
      data.value = snapshot(saved.data); legacyImported = saved.legacyImported === true;
      for (const item of Array.isArray(saved.pending) ? saved.pending : []) if (validId(item.courseId) && validId(item.lessonId) && validId(item.write?.clientId)
        && Number.isSafeInteger(item.write.sequence) && item.write.sequence > 0 && Number.isSafeInteger(item.write.revision) && item.write.revision >= 0
        && Number.isFinite(item.write.position) && item.write.position >= 0 && Number.isFinite(item.write.duration) && item.write.duration > 0 && item.write.duration <= 604800 && typeof item.write.completed === 'boolean' && item.write.position <= item.write.duration) pending.set(`${item.courseId}/${item.lessonId}`, item);
      for (const item of Array.isArray(saved.selections) ? saved.selections : []) if (validId(item.courseId) && validId(item.lessonId)) selections.set(item.courseId, { lessonId: item.lessonId, sequence: ++sequence });
    } else {
      const legacy = localStorage.getItem(legacyKey); if (legacy) data.value = snapshot(JSON.parse(legacy));
    }
  } catch { cacheError.value = '本地暂存记录无法读取，将尝试从账号观看记录恢复。'; }
  function persist(finalWrite = false): void {
    if (disposed && !finalWrite) return;
    try { localStorage.setItem(key, JSON.stringify({ version: 2, data: data.value, pending: [...pending.values()], selections: [...selections].map(([courseId, item]) => ({ courseId, ...item })), legacyImported })); cacheError.value = ''; }
    catch { cacheError.value = '本地暂存不可用，观看记录仍会尝试同步到账号，请保持网络连接。'; }
  }
  function ensure(courseId: string) { return data.value.courses[courseId] ??= { lessons: Object.create(null) }; }
  function lesson(courseId: string, lessonId: string) { return data.value.courses[courseId]?.lessons[lessonId]; }
  function lastLesson(courseId: string) { return data.value.courses[courseId]?.lastLessonId; }
  function report(error: unknown): void { syncError.value = (error as { status?: number }).status === 409 ? '观看记录已在其他设备更新，请重新同步，以数据库记录为准。' : '观看记录同步失败，当前进度已暂存；恢复网络后可重新同步。'; }
  async function flush(): Promise<void> {
    clearTimeout(timer); timer = undefined;
    const requests: Promise<unknown>[] = [];
    for (const [courseId, selected] of selections) {
      const flight = `selection/${courseId}/${selected.sequence}`; if (inFlight.has(flight)) continue;
      inFlight.add(flight);
      selectionChain = selectionChain.catch(() => {}).then(() => api.selectCourseLesson(courseId, selected.lessonId, token));
      requests.push(selectionChain.then(() => { if (selections.get(courseId) === selected) selections.delete(courseId); }).catch(error => {
        if (error.status === 404 && selections.get(courseId) === selected) selections.delete(courseId);
        throw error;
      }).finally(() => inFlight.delete(flight)));
    }
    for (const [id, item] of pending) {
      if (conflicts.has(id)) continue;
      const flight = `${id}/${item.write.clientId}/${item.write.sequence}`; if (inFlight.has(flight)) continue;
      inFlight.add(flight); const sent = { ...item.write };
      requests.push(api.saveCourseProgress(item.courseId, item.lessonId, sent, token).then(saved => {
        const current = lesson(item.courseId, item.lessonId);
        if (current && (saved.revision ?? 0) >= (current.revision ?? 0)) Object.assign(current, { revision: saved.revision, clientId: saved.clientId, sequence: saved.sequence, completed: current.completed || saved.completed });
        const queued = pending.get(id);
        if (queued?.write.sequence === sent.sequence && queued.write.clientId === sent.clientId) pending.delete(id);
        else if (queued) queued.write.revision = Math.max(queued.write.revision, saved.revision ?? 0);
      }).catch(error => {
        if (error.status === 409) conflicts.add(id);
        if (error.status === 404) pending.delete(id);
        throw error;
      }).finally(() => inFlight.delete(flight)));
    }
    const results = await Promise.allSettled(requests);
    const failure = results.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failure) report(failure.reason); else if (requests.length && !conflicts.size) syncError.value = '';
    persist();
  }
  function schedule(): void { if (!timer && !disposed) timer = setTimeout(() => void flush(), 5000); }
  function select(courseId: string, lessonId: string): void {
    if (!validId(courseId) || !validId(lessonId)) return;
    ensure(courseId).lastLessonId = lessonId;
    selections.set(courseId, { lessonId, sequence: ++sequence }); persist(); void flush();
  }
  function save(courseId: string, lessonId: string, value: PlaybackProgress): void {
    if (!validId(courseId) || !validId(lessonId) || !Number.isFinite(value.position) || !Number.isFinite(value.duration) || value.position < 0 || value.duration <= 0 || value.duration > 604800) return;
    const old = lesson(courseId, lessonId);
    const updated: LessonProgress = { position: Math.min(value.position, value.duration), duration: value.duration, completed: old?.completed === true || value.completed, updatedAt: Date.now(), revision: old?.revision ?? 0, clientId, sequence: ++sequence };
    ensure(courseId).lessons[lessonId] = updated;
    pending.set(`${courseId}/${lessonId}`, { courseId, lessonId, write: { position: updated.position, duration: updated.duration, completed: updated.completed, revision: updated.revision ?? 0, clientId, sequence } });
    persist(true); if (value.immediate || value.completed) void flush(); else schedule();
  }
  function load(): Promise<void> {
    if (loadRequest) return loadRequest;
    loading.value = true;
    loadRequest = (async () => {
      try {
        let remote = snapshot(await api.getCourseProgress(token));
        if (!legacyImported) {
          let legacy: SavedProgress | undefined;
          try { const raw = localStorage.getItem(legacyKey); if (raw) legacy = snapshot(JSON.parse(raw)); } catch { /* Remote progress can recover a corrupt local cache. */ }
          if (legacy) {
            const lessons = Object.entries(legacy.courses).flatMap(([courseId, course]) => Object.entries(course.lessons).filter(([, value]) => value.duration > 0 && value.duration <= 604800).map(([lessonId, value]) => ({ courseId, lessonId, position: value.position, duration: value.duration, completed: value.completed, selected: course.lastLessonId === lessonId })));
            for (let start = 0; start < lessons.length; start += 500) remote = snapshot(await api.importCourseProgress(lessons.slice(start, start + 500), token));
          }
          legacyImported = true;
        }
        const staleCourses = new Set<string>();
        for (const [id, item] of pending) {
          const saved = remote.courses[item.courseId]?.lessons[item.lessonId];
          const acknowledged = saved?.clientId === item.write.clientId && (saved.sequence ?? 0) >= item.write.sequence;
          if (acknowledged) { pending.delete(id); continue; }
          if (conflicts.has(id) || saved && (saved.revision ?? 0) > item.write.revision && saved.clientId !== item.write.clientId) { pending.delete(id); staleCourses.add(item.courseId); continue; }
          const course = remote.courses[item.courseId] ??= { lessons: Object.create(null) };
          course.lessons[item.lessonId] = { ...item.write, updatedAt: Date.now() };
        }
        for (const id of staleCourses) selections.delete(id);
        for (const [id, selected] of selections) (remote.courses[id] ??= { lessons: Object.create(null) }).lastLessonId = selected.lessonId;
        data.value = remote; conflicts.clear(); syncError.value = ''; persist();
        await flush();
      } catch (error) { report(error); }
      finally { loading.value = false; loadRequest = undefined; }
    })();
    return loadRequest;
  }
  function retry(): void { void load(); }
  function hidden(): void { if (document.visibilityState === 'hidden') void flush(); }
  function pagehide(): void { void flush(); }
  if (getCurrentScope()) {
    window.addEventListener('online', retry); window.addEventListener('focus', retry); window.addEventListener('pagehide', pagehide); document.addEventListener('visibilitychange', hidden);
    onScopeDispose(() => { void flush(); disposed = true; clearTimeout(timer); window.removeEventListener('online', retry); window.removeEventListener('focus', retry); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', hidden); });
  }
  return { data, storageError, loading, lesson, lastLesson, select, save, load, flush, retry };
}
