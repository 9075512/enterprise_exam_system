import crypto from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, runQuery, withTransaction, type SqlExecutor } from '../../db/pool.js';
import type { AdmissionTicketDto, AudienceTemplateRulesDto, ExamParticipantDto } from '../../types/domain.js';
import { fromDbDateSafe, nowDb } from '../../utils/datetime.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { parseJsonColumn } from '../../utils/json.js';
import { buildPdfBuffer } from '../../utils/pdfExport.js';
import * as departmentsService from '../departments/departments.service.js';

export interface ExamAudienceInput {
  departmentIds: string[];
  includeUserIds?: string[];
  excludeUserIds?: string[];
  audienceTemplateId?: string | null;
}

interface ParticipantRow extends RowDataPacket {
  exam_id: string; user_id: string; username: string; user_name: string;
  department_id: string | null; department_name: string | null;
  source: ExamParticipantDto['source']; admission_no: string; created_at: string;
}

function dto(row: ParticipantRow): ExamParticipantDto {
  return {
    examId: row.exam_id, userId: row.user_id, username: row.username, userName: row.user_name,
    departmentId: row.department_id, departmentName: row.department_name ?? '', source: row.source,
    admissionNo: row.admission_no, createdAt: fromDbDateSafe(row.created_at),
  };
}

async function loadTemplate(templateId: string | null | undefined, exec?: SqlExecutor): Promise<AudienceTemplateRulesDto | null> {
  if (!templateId) return null;
  const rows = await runQuery<Array<RowDataPacket & { rules: unknown }>>(exec, `SELECT rules FROM audience_templates WHERE id = ? LIMIT 1`, [templateId]);
  if (!rows[0]) throw badRequest('抽考模板不存在');
  return parseJsonColumn<AudienceTemplateRulesDto>(rows[0].rules, {
    departmentIds: [], groupIds: [], positionIds: [], includeUserIds: [], excludeUserIds: [], includeSubDepartments: true, randomCount: null,
  });
}

function stableRank(examId: string, userId: string): string {
  return crypto.createHash('sha256').update(`${examId}:${userId}`).digest('hex');
}

function admissionNo(examId: string, index: number): string {
  const prefix = crypto.createHash('sha1').update(examId).digest('hex').slice(0, 6).toUpperCase();
  return `${prefix}${String(index + 1).padStart(5, '0')}`;
}

async function resolveUsers(examId: string, input: ExamAudienceInput, exec?: SqlExecutor): Promise<Array<{ userId: string; source: ExamParticipantDto['source'] }>> {
  const template = await loadTemplate(input.audienceTemplateId, exec);
  const departmentIds = [...new Set([...(input.departmentIds ?? []), ...(template?.departmentIds ?? [])])];
  const includeUserIds = [...new Set([...(template?.includeUserIds ?? []), ...(input.includeUserIds ?? [])])];
  const exclude = new Set([...(template?.excludeUserIds ?? []), ...(input.excludeUserIds ?? [])]);
  const expanded = template?.includeSubDepartments === false ? departmentIds : await departmentsService.expandDepartmentIds(departmentIds);
  const selected = new Map<string, ExamParticipantDto['source']>();
  if (expanded.length) {
    const placeholders = expanded.map(() => '?').join(',');
    const rows = await runQuery<Array<RowDataPacket & { id: string }>>(exec, `SELECT id FROM users WHERE role = 'examinee' AND status = 'active' AND department_id IN (${placeholders})`, expanded);
    for (const row of rows) selected.set(row.id, input.audienceTemplateId ? 'template' : 'department');
  }
  if (template?.groupIds?.length) {
    const placeholders = template.groupIds.map(() => '?').join(',');
    const rows = await runQuery<Array<RowDataPacket & { id: string }>>(exec,
      `SELECT DISTINCT u.id FROM users u JOIN user_group_members gm ON gm.user_id = u.id
       WHERE u.role = 'examinee' AND u.status = 'active' AND gm.group_id IN (${placeholders})`, template.groupIds);
    for (const row of rows) selected.set(row.id, 'template');
  }
  if (template?.positionIds?.length) {
    const placeholders = template.positionIds.map(() => '?').join(',');
    const rows = await runQuery<Array<RowDataPacket & { id: string }>>(exec,
      `SELECT id FROM users WHERE role = 'examinee' AND status = 'active' AND position_id IN (${placeholders})`, template.positionIds);
    for (const row of rows) selected.set(row.id, 'template');
  }
  if (includeUserIds.length) {
    const placeholders = includeUserIds.map(() => '?').join(',');
    const rows = await runQuery<Array<RowDataPacket & { id: string }>>(exec,
      `SELECT id FROM users WHERE role = 'examinee' AND status = 'active' AND id IN (${placeholders})`, includeUserIds);
    for (const row of rows) selected.set(row.id, 'include');
  }
  for (const id of exclude) selected.delete(id);
  let result = [...selected].map(([userId, source]) => ({ userId, source }));
  const randomCount = template?.randomCount ?? null;
  if (randomCount && result.length > randomCount) {
    result = result.sort((a, b) => stableRank(examId, a.userId).localeCompare(stableRank(examId, b.userId))).slice(0, randomCount);
  }
  return result.sort((a, b) => a.userId.localeCompare(b.userId));
}

/** 在事务中冻结名单。已有作答时只追加、不移除。 */
export async function freezeParticipants(examId: string, input: ExamAudienceInput, exec?: SqlExecutor): Promise<void> {
  const next = await resolveUsers(examId, input, exec);
  if (!next.length) throw badRequest('人员范围未解析到任何启用中的考生');
  const existing = await runQuery<Array<RowDataPacket & { user_id: string; admission_no: string }>>(exec,
    `SELECT user_id, admission_no FROM exam_participants WHERE exam_id = ? ORDER BY created_at`, [examId]);
  const records = await runQuery<Array<RowDataPacket & { c: number }>>(exec, `SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?`, [examId]);
  const hasRecords = Number(records[0]?.c ?? 0) > 0;
  const existingIds = new Set(existing.map((r) => r.user_id));
  const final = hasRecords ? [...next, ...existing.filter((r) => !next.some((n) => n.userId === r.user_id)).map((r) => ({ userId: r.user_id, source: 'legacy' as const }))] : next;
  const existingNumbers = new Map(existing.map((r) => [r.user_id, r.admission_no]));
  let sequence = existing.length;
  if (!hasRecords) await runQuery<ResultSetHeader>(exec, `DELETE FROM exam_participants WHERE exam_id = ?`, [examId]);
  const now = nowDb();
  for (const item of final) {
    if (hasRecords && existingIds.has(item.userId)) continue;
    const number = existingNumbers.get(item.userId) ?? admissionNo(examId, sequence++);
    await runQuery<ResultSetHeader>(exec,
      `INSERT INTO exam_participants (exam_id, user_id, source, admission_no, created_at)
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE source = VALUES(source)`,
      [examId, item.userId, item.source, number, now]);
  }
}

/** 旧考试首次导出准考证时按原科室范围物化。 */
export async function ensureFrozen(examId: string): Promise<void> {
  const rows = await query<Array<RowDataPacket & { audience_mode: string; department_ids: unknown }>>(`SELECT audience_mode, department_ids FROM exams WHERE id = ? LIMIT 1`, [examId]);
  if (!rows[0]) throw notFound('考试不存在');
  if (rows[0].audience_mode === 'frozen') return;
  await withTransaction(async (conn) => {
    await freezeParticipants(examId, { departmentIds: parseJsonColumn<string[]>(rows[0]!.department_ids, []) }, conn);
    await conn.query(`UPDATE exams SET audience_mode = 'frozen', audience_rules = ? WHERE id = ?`, [JSON.stringify({ includeUserIds: [], excludeUserIds: [], audienceTemplateId: null }), examId]);
  });
}

export async function listParticipants(examId: string, materialize = false): Promise<ExamParticipantDto[]> {
  if (materialize) await ensureFrozen(examId);
  const exam = await query<Array<RowDataPacket & { audience_mode: string; department_ids: unknown }>>(
    `SELECT audience_mode, department_ids FROM exams WHERE id = ? LIMIT 1`, [examId],
  );
  if (!exam[0]) throw notFound('考试不存在');
  // 升级前的旧考试在“查看名单”时只做动态预览，不因一次只读操作改变历史行为。
  // 首次保存人员范围或导出准考证仍会走 ensureFrozen，届时才持久化准考证号。
  if (exam[0].audience_mode !== 'frozen') {
    const resolved = await resolveUsers(examId, {
      departmentIds: parseJsonColumn<string[]>(exam[0].department_ids, []),
    });
    if (!resolved.length) return [];
    const bySource = new Map(resolved.map((item) => [item.userId, item.source]));
    const placeholders = resolved.map(() => '?').join(',');
    const users = await query<Array<RowDataPacket & {
      id: string; username: string; user_name: string; department_id: string | null; department_name: string;
    }>>(
      `SELECT u.id, u.username, u.name AS user_name, u.department_id, COALESCE(d.name, '') AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id IN (${placeholders})`,
      resolved.map((item) => item.userId),
    );
    const byId = new Map(users.map((user) => [user.id, user]));
    const previewAt = new Date().toISOString();
    return resolved.flatMap((item, index) => {
      const user = byId.get(item.userId);
      return user ? [{
        examId,
        userId: user.id,
        username: user.username,
        userName: user.user_name,
        departmentId: user.department_id,
        departmentName: user.department_name,
        source: bySource.get(user.id) ?? 'department',
        admissionNo: admissionNo(examId, index),
        createdAt: previewAt,
      }] : [];
    });
  }
  const rows = await query<ParticipantRow[]>(
    `SELECT ep.exam_id, ep.user_id, u.username, u.name AS user_name, u.department_id,
            COALESCE(d.name, '') AS department_name, ep.source, ep.admission_no, ep.created_at
     FROM exam_participants ep JOIN users u ON u.id = ep.user_id
     LEFT JOIN departments d ON d.id = u.department_id WHERE ep.exam_id = ?
     ORDER BY ep.admission_no`, [examId]);
  return rows.map(dto);
}

export async function assertParticipant(examId: string, userId: string): Promise<void> {
  const exam = await query<Array<RowDataPacket & { audience_mode: string; department_ids: unknown; department_id: string | null }>>(
    `SELECT e.audience_mode, e.department_ids, u.department_id FROM exams e JOIN users u ON u.id = ? WHERE e.id = ? LIMIT 1`, [userId, examId]);
  if (!exam[0]) throw notFound('考试不存在');
  if (exam[0].audience_mode === 'frozen') {
    const rows = await query<Array<RowDataPacket & { c: number }>>(`SELECT COUNT(*) AS c FROM exam_participants WHERE exam_id = ? AND user_id = ?`, [examId, userId]);
    if (!Number(rows[0]?.c)) throw forbidden('你不在本次考试的生效名单中');
    return;
  }
  const ancestors = await departmentsService.getAncestorIds(exam[0].department_id ?? '');
  const allowed = parseJsonColumn<string[]>(exam[0].department_ids, []).some((id) => ancestors.includes(id));
  if (!allowed) throw forbidden('你不在本次考试的参与范围中');
}

export async function admissionTickets(examId: string, user?: { id: string; role: string }): Promise<AdmissionTicketDto[]> {
  await ensureFrozen(examId);
  const params: string[] = [examId];
  const userClause = user?.role === 'examinee' ? 'AND ep.user_id = ?' : '';
  if (user?.role === 'examinee') params.push(user.id);
  const rows = await query<Array<RowDataPacket & {
    admission_no: string; exam_id: string; exam_name: string; user_id: string; username: string; user_name: string;
    department_name: string; start_time: string; end_time: string; duration_minutes: number; exam_mode: 'open' | 'closed';
  }>>(`SELECT ep.admission_no, e.id AS exam_id, e.name AS exam_name, u.id AS user_id, u.username,
        u.name AS user_name, COALESCE(d.name, '') AS department_name, e.start_time, e.end_time,
        e.duration_minutes, e.exam_mode FROM exam_participants ep JOIN exams e ON e.id = ep.exam_id
        JOIN users u ON u.id = ep.user_id LEFT JOIN departments d ON d.id = u.department_id
        WHERE ep.exam_id = ? ${userClause} ORDER BY ep.admission_no`, params);
  return rows.map((r) => ({ admissionNo: r.admission_no, examId: r.exam_id, examName: r.exam_name, userId: r.user_id, username: r.username, userName: r.user_name, departmentName: r.department_name, startTime: fromDbDateSafe(r.start_time), endTime: fromDbDateSafe(r.end_time), durationMinutes: Number(r.duration_minutes), examMode: r.exam_mode }));
}

export async function admissionTicketsPdf(examId: string, user?: { id: string; role: string }): Promise<{ buffer: Buffer; filename: string }> {
  const tickets = await admissionTickets(examId, user);
  if (!tickets.length) throw badRequest('该考试没有可导出的准考证');
  const buffer = await buildPdfBuffer({ title: `${tickets[0]!.examName}－准考证`, subtitle: `考试时间：${tickets[0]!.startTime} 至 ${tickets[0]!.endTime}`, rows: tickets,
    columns: [
      { header: '准考证号', key: 'admissionNo', width: 16, value: (r) => r.admissionNo },
      { header: '姓名', key: 'userName', width: 12, value: (r) => r.userName },
      { header: '账号', key: 'username', width: 14, value: (r) => r.username },
      { header: '科室', key: 'departmentName', width: 16, value: (r) => r.departmentName },
      { header: '时长', key: 'durationMinutes', width: 8, value: (r) => `${r.durationMinutes} 分钟` },
      { header: '形式', key: 'examMode', width: 8, value: (r) => r.examMode === 'open' ? '开卷' : '闭卷' },
    ] });
  return { buffer, filename: `${tickets[0]!.examName}-准考证.pdf` };
}
