import type { RowDataPacket } from 'mysql2/promise';
import { runQuery, withTransaction, type SqlExecutor } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { parseJsonColumn } from '../../utils/json.js';
import * as audit from '../audit/audit.service.js';
import { courseAudienceSchema, type CourseAudience } from './courses.schema.js';

export interface AudienceUser { id: string; role: string; status: string; department_id: string | null }
export interface AudienceDepartment { id: string; parent_id: string | null }
export function parseAudience(value: unknown): CourseAudience | null {
  if (value === null || value === undefined) return null;
  // Corrupt rules must not accidentally open a course to everyone.
  const parsed = courseAudienceSchema.safeParse(parseJsonColumn(value, {}));
  return parsed.success ? parsed.data : { departmentIds: [], userIds: [] };
}
export function expandDepartments(ids: string[], departments: AudienceDepartment[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const department of departments) if (department.parent_id) children.set(department.parent_id, [...(children.get(department.parent_id) ?? []), department.id]);
  const result = new Set(ids); const queue = [...result];
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]) ?? []) if (!result.has(child)) { result.add(child); queue.push(child); }
  return result;
}
export function inAudience(audience: CourseAudience | null, user: AudienceUser, departments: AudienceDepartment[]): boolean {
  if (user.status !== 'active' || user.role !== 'examinee') return false;
  return audience === null || audience.userIds.includes(user.id) || expandDepartments(audience.departmentIds, departments).has(user.department_id ?? '');
}
export async function accessContext(userId: string, exec?: SqlExecutor) {
  const users = await runQuery<(RowDataPacket & AudienceUser)[]>(exec, 'SELECT id, role, status, department_id FROM users WHERE id = ?', [userId]);
  const departments = await runQuery<(RowDataPacket & AudienceDepartment)[]>(exec, 'SELECT id, parent_id FROM departments');
  return { user: users[0], departments };
}
export function canAccess(value: unknown, context: Awaited<ReturnType<typeof accessContext>>): boolean {
  const audience = parseAudience(value);
  return !!context.user && (audience === null ? context.user.status === 'active' : inAudience(audience, context.user, context.departments));
}
export async function read(id: string, exec?: SqlExecutor) {
  const rows = await runQuery<RowDataPacket[]>(exec, 'SELECT id, title, revision, audience_json FROM courses WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw notFound('课程不存在或已删除');
  const audience = parseAudience(rows[0].audience_json);
  return { revision: Number(rows[0].revision), mode: audience === null ? 'public' as const : 'assigned' as const, departmentIds: audience?.departmentIds ?? [], userIds: audience?.userIds ?? [] };
}
export async function save(id: string, revision: number, input: CourseAudience, actorId: string) {
  const title = await withTransaction(async conn => {
    const rows = await runQuery<RowDataPacket[]>(conn, 'SELECT title, revision FROM courses WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('课程不存在或已删除');
    if (Number(rows[0].revision) !== revision) throw conflict('课程已变化，请重新加载绑定范围后再保存');
    const departments = await runQuery<RowDataPacket[]>(conn, 'SELECT id FROM departments');
    if (input.departmentIds.some(value => !departments.some(department => department.id === value))) throw badRequest('所选科室不存在，请重新加载');
    if (input.userIds.length) {
      const users = await runQuery<RowDataPacket[]>(conn, `SELECT id FROM users WHERE role = 'examinee' AND status = 'active' AND id IN (${input.userIds.map(() => '?').join(',')})`, input.userIds);
      if (users.length !== input.userIds.length) throw badRequest('指定人员中存在已删除、停用或非考生账号，请重新选择');
    }
    await runQuery(conn, 'UPDATE courses SET audience_json = ?, revision = revision + 1, updated_by = ?, updated_at = NOW(3) WHERE id = ?', [JSON.stringify(input), actorId, id]);
    return String(rows[0].title);
  });
  await audit.record({ actorId, action: 'course.audience', targetType: 'course', targetId: id, targetName: title, detail: input });
  return read(id);
}
