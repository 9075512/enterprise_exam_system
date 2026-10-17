import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, withTransaction } from '../../db/pool.js';
import type { DuplicateQuestionGroupDto } from '../../types/domain.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { parseJsonColumn } from '../../utils/json.js';
import { questionFingerprint } from '../../utils/questionFingerprint.js';
import * as bankAuth from '../banks/bankAuth.js';
import * as banksRepo from '../banks/banks.repo.js';
import type { Operator } from '../banks/bankAuth.js';
import * as questionsRepo from './questions.repo.js';

export type BatchAction = 'enable' | 'disable' | 'migrate' | 'delete' | 'validate';

async function loadAndAuthorize(ids: string[], operator: Operator) {
  const unique = [...new Set(ids)].slice(0, 500);
  if (!unique.length) throw badRequest('请至少选择一道试题');
  const rows = await questionsRepo.findByIds(unique);
  if (rows.length !== unique.length) throw notFound('部分试题不存在或已被删除');
  for (const row of rows) {
    await bankAuth.assertBankAccess(row.bank_id, operator);
  }
  return rows;
}

export async function batch(
  input: { ids: string[]; action: BatchAction; targetBankId?: string },
  operator: Operator,
): Promise<{ affected: number; issues?: Array<{ questionId: string; issues: string[] }> }> {
  const rows = await loadAndAuthorize(input.ids, operator);
  if (input.action === 'validate') {
    const issues = rows.map((row) => {
      const item: string[] = [];
      if (!row.stem.trim()) item.push('题干为空');
      if (!row.analysis?.trim()) item.push('缺少解析');
      if (parseJsonColumn<string[]>(row.tags, []).length === 0) item.push('缺少知识点');
      if (row.subject_id !== row.bank_id) item.push('题库/科目标识不一致');
      if ((row.type === 'single' || row.type === 'multiple') && parseJsonColumn<string[]>(row.options, []).length < 2) item.push('选项不足');
      if (parseJsonColumn<Array<string | number>>(row.answer, []).length === 0) item.push('缺少答案');
      return { questionId: row.id, issues: item };
    }).filter((item) => item.issues.length > 0);
    return { affected: rows.length, issues };
  }
  if (input.action === 'migrate') {
    const target = input.targetBankId?.trim();
    if (!target) throw badRequest('请选择目标题库');
    const targetBank = await banksRepo.findById(target);
    if (!targetBank) throw notFound('目标题库不存在');
    await bankAuth.assertBankAccess(target, operator);
    await withTransaction(async (conn) => {
      for (const row of rows) await conn.query(
        `UPDATE questions SET bank_id = ?, subject_id = ?, subject = ? WHERE id = ?`,
        [target, target, targetBank.name, row.id],
      );
    });
    return { affected: rows.length };
  }
  if (input.action === 'delete') {
    const placeholders = rows.map(() => '?').join(',');
    const refs = await query<Array<RowDataPacket & { c: number }>>(
      `SELECT COUNT(*) AS c FROM paper_questions WHERE question_id IN (${placeholders})`, rows.map((r) => r.id));
    if (Number(refs[0]?.c ?? 0) > 0) throw conflict('所选试题中存在被试卷引用的题目，请改为停用');
    const history = await query<Array<RowDataPacket & { c: number }>>(
      `SELECT (SELECT COUNT(*) FROM practice_answers WHERE question_id IN (${placeholders}))
            + (SELECT COUNT(*) FROM practice_wrong_book WHERE question_id IN (${placeholders})) AS c`,
      [...rows.map((r) => r.id), ...rows.map((r) => r.id)]);
    if (Number(history[0]?.c ?? 0) > 0) throw conflict('所选试题已有练题历史，为保留历史数据不能物理删除，请改为停用');
    await withTransaction(async (conn) => {
      for (const row of rows) await conn.query(`DELETE FROM questions WHERE id = ?`, [row.id]);
    });
    return { affected: rows.length };
  }
  const status = input.action === 'enable' ? 'active' : 'disabled';
  const placeholders = rows.map(() => '?').join(',');
  const result = await query<ResultSetHeader>(`UPDATE questions SET status = ? WHERE id IN (${placeholders})`, [status, ...rows.map((r) => r.id)]);
  return { affected: result.affectedRows };
}

export async function duplicates(filter: { bankIds?: string[]; includeDisabled?: boolean }): Promise<DuplicateQuestionGroupDto[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.bankIds?.length) {
    conditions.push(`q.bank_id IN (${filter.bankIds.map(() => '?').join(',')})`);
    params.push(...filter.bankIds);
  }
  if (!filter.includeDisabled) conditions.push(`q.status = 'active'`);
  const rows = await query<Array<RowDataPacket & {
    id: string; bank_id: string; bank_name: string; type: DuplicateQuestionGroupDto['questions'][number]['type'];
    stem: string; options: unknown; answer: unknown; subject: string; status: 'active' | 'disabled'; created_at: string;
  }>>(`SELECT q.id, q.bank_id, b.name AS bank_name, q.type, q.stem, q.options, q.answer,
              q.subject, q.status, q.created_at FROM questions q JOIN question_banks b ON b.id = q.bank_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY q.created_at`, params);
  const grouped = new Map<string, DuplicateQuestionGroupDto['questions']>();
  for (const row of rows) {
    const fingerprint = questionFingerprint({ type: row.type, stem: row.stem, options: parseJsonColumn<string[]>(row.options, []), answer: parseJsonColumn<Array<string | number>>(row.answer, []) });
    const items = grouped.get(fingerprint) ?? [];
    items.push({ id: row.id, bankId: row.bank_id, bankName: row.bank_name, type: row.type, stem: row.stem, subject: row.subject, status: row.status, createdAt: new Date(`${row.created_at}Z`).toISOString() });
    grouped.set(fingerprint, items);
  }
  return [...grouped].filter(([, items]) => items.length > 1).map(([fingerprint, questions]) => ({ fingerprint, count: questions.length, questions })).sort((a, b) => b.count - a.count);
}
