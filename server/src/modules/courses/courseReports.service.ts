import type { RowDataPacket } from 'mysql2/promise';
import { runQuery, withTransaction } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { buildExportBuffer, type ExportColumn } from '../../utils/excelExport.js';
import { expandDepartments, parseAudience, type AudienceDepartment, type AudienceUser } from './courseAudience.service.js';
import type { CourseInput, CourseReportQuery } from './courses.schema.js';

type ProgressStatus = 'not_started' | 'learning' | 'completed';
const labels: Record<ProgressStatus, string> = { not_started: '未开始', learning: '学习中', completed: '已完成' };
interface ProgressRow extends RowDataPacket { user_id: string; lesson_id: string; position_seconds: number; duration_seconds: number; completed: number; updated_at: string }
interface ReportUser extends AudienceUser { name: string; username: string; department_name: string }

/** One repeatable-read snapshot supplies both export sheets and all aggregate counts. */
async function snapshot(courseId: string) {
  return withTransaction(async conn => {
    const courses = await runQuery<RowDataPacket[]>(conn, 'SELECT title, content_json, audience_json FROM courses WHERE id = ? AND deleted_at IS NULL', [courseId]);
    if (!courses[0]) throw notFound('课程不存在或已删除');
    const content = parseJsonColumn<CourseInput>(courses[0].content_json, {} as CourseInput);
    const lessons = (content.chapters ?? []).flatMap(chapter => chapter.lessons.map(lesson => ({ ...lesson, chapterTitle: chapter.title })));
    const audience = parseAudience(courses[0].audience_json);
    const departments = await runQuery<(RowDataPacket & AudienceDepartment)[]>(conn, 'SELECT id, parent_id FROM departments');
    const expanded = expandDepartments(audience?.departmentIds ?? [], departments);
    const users = await runQuery<(RowDataPacket & ReportUser)[]>(conn, `SELECT u.id, u.name, u.username, u.role, u.status, u.department_id, COALESCE(d.name, '') AS department_name
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE (u.role = 'examinee' AND u.status = 'active') OR EXISTS (SELECT 1 FROM course_progress p WHERE p.course_id = ? AND p.user_id = u.id)
      ORDER BY u.name, u.username, u.id`, [courseId]);
    const progress = await runQuery<ProgressRow[]>(conn, 'SELECT user_id, lesson_id, position_seconds, duration_seconds, completed, updated_at FROM course_progress WHERE course_id = ?', [courseId]);
    const byUser = new Map<string, Map<string, ProgressRow>>();
    for (const row of progress) { if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map()); byUser.get(row.user_id)!.set(row.lesson_id, row); }
    const people = users.flatMap(user => {
      const current = user.role === 'examinee' && user.status === 'active' && (audience === null || audience.userIds.includes(user.id) || expanded.has(user.department_id ?? ''));
      if (!current && !byUser.has(user.id)) return [];
      const details = lessons.map(lesson => {
        const saved = byUser.get(user.id)?.get(lesson.id);
        const position = Number(saved?.position_seconds ?? 0), duration = Number(saved?.duration_seconds ?? 0);
        const completed = !!saved?.completed;
        return { lessonId: lesson.id, chapterTitle: lesson.chapterTitle, lessonTitle: lesson.title, position, duration, completed,
          status: (completed ? 'completed' : position > 0 ? 'learning' : 'not_started') as ProgressStatus,
          lastLearnedAt: saved && (duration > 0 || completed) ? fromDbDateSafe(saved.updated_at) : '' };
      });
      const completedLessons = details.filter(lesson => lesson.completed).length;
      const status: ProgressStatus = lessons.length > 0 && completedLessons === lessons.length ? 'completed' : details.some(lesson => lesson.position > 0 || lesson.completed) ? 'learning' : 'not_started';
      const lastLearnedAt = details.reduce((latest, lesson) => lesson.lastLearnedAt > latest ? lesson.lastLearnedAt : latest, '');
      return [{ userId: user.id, userName: user.name, username: user.username, departmentId: user.department_id ?? '', departmentName: user.department_name,
        accountStatus: user.status, scope: current ? 'current' as const : 'history' as const, status, completedLessons, totalLessons: lessons.length,
        percent: lessons.length ? Math.round(completedLessons / lessons.length * 1000) / 10 : 0, lastLearnedAt, lessons: details }];
    });
    return { courseId, courseTitle: String(courses[0].title), departments, people };
  });
}
type ReportSnapshot = Awaited<ReturnType<typeof snapshot>>;
function filterPeople(data: ReportSnapshot, input: CourseReportQuery) {
  const departmentIds = expandDepartments(input.departmentId ? [input.departmentId] : [], data.departments);
  const keyword = input.keyword.toLocaleLowerCase();
  return data.people.filter(person => person.scope === input.scope && (!keyword || person.userName.toLocaleLowerCase().includes(keyword) || person.username.toLocaleLowerCase().includes(keyword))
    && (!input.departmentId || departmentIds.has(person.departmentId)) && (!input.status || person.status === input.status));
}
export async function list(courseId: string, input: CourseReportQuery) {
  const data = await snapshot(courseId); const people = filterPeople(data, input);
  const summary = { total: people.length, notStarted: 0, learning: 0, completed: 0, completionRate: 0 };
  for (const person of people) { if (person.status === 'not_started') summary.notStarted++; else if (person.status === 'learning') summary.learning++; else summary.completed++; }
  summary.completionRate = summary.total ? Math.round(summary.completed / summary.total * 1000) / 10 : 0;
  const page = Math.min(input.page, Math.max(1, Math.ceil(people.length / input.pageSize)));
  return { courseTitle: data.courseTitle, list: people.slice((page - 1) * input.pageSize, page * input.pageSize).map(({ lessons: _lessons, ...person }) => person),
    total: people.length, page, pageSize: input.pageSize, summary };
}
export async function person(courseId: string, userId: string) {
  const data = await snapshot(courseId); const found = data.people.find(item => item.userId === userId);
  if (!found) throw notFound('该人员不在课程范围内且没有历史记录');
  return { courseTitle: data.courseTitle, ...found };
}
function beijing(value: string): string { return value ? new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') : ''; }
export async function exportProgress(courseId: string, input: CourseReportQuery) {
  const data = await snapshot(courseId); const people = filterPeople(data, input);
  type ExportRow = Record<string, string | number>;
  const rows: ExportRow[] = people.map(person => ({ course: data.courseTitle, name: person.userName, username: person.username, department: person.departmentName,
    scope: person.scope === 'current' ? '当前范围' : '历史记录', status: labels[person.status], completed: person.completedLessons, total: person.totalLessons, percent: person.percent, lastLearnedAt: beijing(person.lastLearnedAt) }));
  const detailRows: ExportRow[] = people.flatMap((person, index) => person.lessons.map(lesson => ({ ...rows[index], chapter: lesson.chapterTitle, lesson: lesson.lessonTitle,
    lessonStatus: labels[lesson.status], position: lesson.position, duration: lesson.duration, lessonUpdatedAt: beijing(lesson.lastLearnedAt) })));
  const column = (key: string, header: string, width = 18): ExportColumn<ExportRow> => ({ key, header, width, value: row => row[key] ?? '' });
  const columns = [column('course', '课程', 30), column('name', '姓名'), column('username', '账号'), column('department', '当前科室'), column('scope', '人员范围'), column('status', '学习状态'),
    column('completed', '已完成小节数'), column('total', '总小节数'), column('percent', '进度（%）'), column('lastLearnedAt', '最近学习时间（北京时间）', 28)];
  const buffer = await buildExportBuffer<ExportRow>([{ name: '人员汇总', columns, rows }, { name: '小节明细', columns: [...columns, column('chapter', '章节', 26), column('lesson', '小节', 26), column('lessonStatus', '小节状态'),
    column('position', '播放位置（秒）'), column('duration', '视频时长（秒）'), column('lessonUpdatedAt', '小节最近记录（北京时间）', 28)], rows: detailRows }]);
  const title = data.courseTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80);
  return { buffer, filename: `${title}-${input.scope === 'current' ? '学习进度' : '历史记录'}.xlsx` };
}
