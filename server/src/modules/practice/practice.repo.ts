/**
 * 练题模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 *
 * ⚠️ 数据隔离硬约束（架构 §3.7）：
 * - **只读**：`users`（登录校验 / 登录态回显，仅列级最小集，见 auth.verifyCredentials）、
 *   `questions` / `question_banks`（且仅 `allow_practice = 1` 的题库及其题目）、
 *   `departments`（**仅**用于回显「当前登录用户本人所属科室名」，列级只读 id/name，
 *   见 findPracticeUserById；不参与任何业务逻辑）；
 * - **读写**：`practice_progress` / `practice_answers` / `practice_wrong_book`；
 * - **绝不**读写 `exams / papers / paper_questions / paper_bank_refs / exam_records /
 *   import_batches`；对 `departments` **绝不写入**。
 *
 * 本文件**不得**出现上述考试域表名，**不得**出现 `departments` 的任何写操作。
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';
import { toJsonColumn } from '../../utils/json.js';
import type { QuestionType, Role } from '../../types/domain.js';

/** 练题登录态回显用的最小用户行（只读 users，另取本人科室名）。 */
export interface PracticeUserRow extends RowDataPacket {
  id: string;
  username: string;
  name: string;
  role: Role;
  department_id: string | null;
  department_name: string | null;
}

/** 对外开放练题题库行（含派生题数）。 */
export interface OpenBankRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  category: string;
  question_count: number | string;
}

/** 题目行（作答下发用：**不含** answer/analysis）。 */
export interface PracticeQuestionRow extends RowDataPacket {
  id: string;
  bank_id: string;
  type: QuestionType;
  stem: string;
  options: unknown;
  subject: string;
}

/** 判分取题行（**含** answer/analysis，仅服务端使用）。 */
export interface PracticeCheckQuestionRow extends RowDataPacket {
  id: string;
  bank_id: string;
  type: QuestionType;
  answer: unknown;
  analysis: string | null;
}

/** 练题进度行。 */
export interface PracticeProgressRow extends RowDataPacket {
  id: string;
  user_id: string;
  bank_id: string;
  last_question_id: string | null;
  done_count: number | string;
  correct_count: number | string;
  updated_at: string;
}

/** 错题本行（题目内容 + 累计答错次数）。 */
export interface PracticeWrongRow extends RowDataPacket {
  question_id: string;
  bank_id: string;
  type: QuestionType;
  stem: string;
  options: unknown;
  subject: string;
  wrong_count: number | string;
  last_wrong_at: string;
}

/* ------------------------------ 用户（只读，登录态回显） ------------------------------ */

/**
 * 按 id 取练题用户最小信息（只读 users；`LEFT JOIN departments` 仅取本人科室名）。
 * `departments` 仅列级只读 `id / name`，用于「我的」页回显科室，不参与任何业务判断。
 */
export async function findPracticeUserById(id: string): Promise<PracticeUserRow | null> {
  const rows = await query<PracticeUserRow[]>(
    `SELECT u.id, u.username, u.name, u.role, u.department_id, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ?
       LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 按 id 取账号状态（只读 users，供练题鉴权即时校验停用/删除）。不存在返回 null。 */
export async function findUserStatusById(id: string): Promise<string | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT status FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? String(rows[0].status) : null;
}

/* ------------------------------ 题库（只读，仅开放） ------------------------------ */

/** 对外开放练题题库列表（`allow_practice = 1`）。 */
export async function listOpenBanks(): Promise<OpenBankRow[]> {
  return query<OpenBankRow[]>(
    `SELECT b.id, b.name, b.description, b.category, COUNT(q.id) AS question_count
       FROM question_banks b
       LEFT JOIN questions q ON q.bank_id = b.id
       WHERE b.allow_practice = 1
       GROUP BY b.id
       ORDER BY b.created_at ASC`,
  );
}

/** 按 id 查开放题库（未开放 / 不存在返回 null，不暴露存在性）。 */
export async function findOpenBankById(id: string): Promise<OpenBankRow | null> {
  const rows = await query<OpenBankRow[]>(
    `SELECT b.id, b.name, b.description, b.category, COUNT(q.id) AS question_count
       FROM question_banks b
       LEFT JOIN questions q ON q.bank_id = b.id
       WHERE b.id = ? AND b.allow_practice = 1
       GROUP BY b.id
       LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/* ------------------------------ 题目（只读，仅开放题库） ------------------------------ */

/**
 * 取题库内题目 id 列表（用于生成练习序列）。
 * @param params.random 随机模式：ORDER BY RAND()；顺序模式：ORDER BY created_at ASC
 * @param params.limit 题量上限（不传 = 全部）
 */
export async function listQuestionIds(params: {
  bankId: string;
  types?: QuestionType[];
  random?: boolean;
  limit?: number;
}): Promise<string[]> {
  const conditions: string[] = ['bank_id = ?'];
  const args: Array<string | number> = [params.bankId];
  if (params.types && params.types.length > 0) {
    conditions.push(`type IN (${params.types.map(() => '?').join(',')})`);
    args.push(...params.types);
  }
  let sql = `SELECT id FROM questions WHERE ${conditions.join(' AND ')}`;
  sql += params.random ? ' ORDER BY RAND()' : ' ORDER BY created_at ASC';
  if (typeof params.limit === 'number' && params.limit > 0) {
    sql += ' LIMIT ?';
    args.push(params.limit);
  }
  const rows = await query<RowDataPacket[]>(sql, args);
  return rows.map((r) => String(r.id));
}

/** 题库题目分页（作答下发：**不含** answer/analysis）。 */
export async function listBankQuestions(params: {
  bankId: string;
  type?: QuestionType;
  subject?: string;
  page: number;
  pageSize: number;
}): Promise<PracticeQuestionRow[]> {
  const conditions: string[] = ['bank_id = ?'];
  const args: Array<string | number> = [params.bankId];
  if (params.type) {
    conditions.push('type = ?');
    args.push(params.type);
  }
  if (params.subject && params.subject.trim() !== '') {
    conditions.push('subject = ?');
    args.push(params.subject.trim());
  }
  const offset = (params.page - 1) * params.pageSize;
  return query<PracticeQuestionRow[]>(
    `SELECT id, bank_id, type, stem, options, subject
       FROM questions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
    [...args, params.pageSize, offset],
  );
}

/** 题库题目总数（配合分页）。 */
export async function countBankQuestions(params: {
  bankId: string;
  type?: QuestionType;
  subject?: string;
}): Promise<number> {
  const conditions: string[] = ['bank_id = ?'];
  const args: Array<string | number> = [params.bankId];
  if (params.type) {
    conditions.push('type = ?');
    args.push(params.type);
  }
  if (params.subject && params.subject.trim() !== '') {
    conditions.push('subject = ?');
    args.push(params.subject.trim());
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM questions WHERE ${conditions.join(' AND ')}`,
    args,
  );
  return Number(rows[0]?.c ?? 0);
}

/** 按 id 批量取开放题库题目（**不含** answer/analysis），用于本地按 sessionToken 组装。 */
export async function listQuestionsByIds(ids: string[]): Promise<PracticeQuestionRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return query<PracticeQuestionRow[]>(
    `SELECT q.id, q.bank_id, q.type, q.stem, q.options, q.subject
       FROM questions q
       JOIN question_banks b ON b.id = q.bank_id
       WHERE q.id IN (${placeholders}) AND b.allow_practice = 1`,
    ids,
  );
}

/** 判分取题（**含** answer/analysis）；仅限开放题库。 */
export async function findQuestionForCheck(id: string): Promise<PracticeCheckQuestionRow | null> {
  const rows = await query<PracticeCheckQuestionRow[]>(
    `SELECT q.id, q.bank_id, q.type, q.answer, q.analysis
       FROM questions q
       JOIN question_banks b ON b.id = q.bank_id
       WHERE q.id = ? AND b.allow_practice = 1
       LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/* ------------------------------ 进度（读写） ------------------------------ */

/** 查某用户在某题库的练题进度。 */
export async function findProgress(userId: string, bankId: string): Promise<PracticeProgressRow | null> {
  const rows = await query<PracticeProgressRow[]>(
    `SELECT id, user_id, bank_id, last_question_id, done_count, correct_count, updated_at
       FROM practice_progress
       WHERE user_id = ? AND bank_id = ?
       LIMIT 1`,
    [userId, bankId],
  );
  return rows[0] ?? null;
}

/**
 * 累加练题进度（按 `user_id + bank_id` 唯一键）；**仅供服务端内部**（check 首次作答时 done+1/correct+）。
 * 计数为**增量**语义；`last_question_id` 为 null 时保留原值（不清空）。
 */
export async function incrementProgress(
  row: {
    id: string;
    userId: string;
    bankId: string;
    lastQuestionId: string | null;
    doneDelta: number;
    correctDelta: number;
    updatedAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO practice_progress
       (id, user_id, bank_id, last_question_id, done_count, correct_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_question_id = COALESCE(VALUES(last_question_id), last_question_id),
       done_count = done_count + VALUES(done_count),
       correct_count = correct_count + VALUES(correct_count),
       updated_at = VALUES(updated_at)`,
    [row.id, row.userId, row.bankId, row.lastQuestionId, row.doneDelta, row.correctDelta, row.updatedAt],
  );
}

/**
 * 该用户在某题库内的作答聚合（**首答口径**：practice_answers 每题仅一条首答记录）。
 * 用于把进度计数改为「服务端权威重算」，杜绝客户端伪造累加。
 */
export async function countAnswersByBank(
  userId: string,
  bankId: string,
): Promise<{ done: number; correct: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS done, COALESCE(SUM(pa.is_correct), 0) AS correct
       FROM practice_answers pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.user_id = ? AND q.bank_id = ?`,
    [userId, bankId],
  );
  return { done: Number(rows[0]?.done ?? 0), correct: Number(rows[0]?.correct ?? 0) };
}

/**
 * 以**绝对计数**写入练题进度（按 `user_id + bank_id` 覆盖 done/correct）。
 * 仅供服务端重算后写入；忽略任何客户端传入的增量。
 */
export async function setProgressCounts(
  row: {
    id: string;
    userId: string;
    bankId: string;
    lastQuestionId: string | null;
    doneCount: number;
    correctCount: number;
    updatedAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO practice_progress
       (id, user_id, bank_id, last_question_id, done_count, correct_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_question_id = COALESCE(VALUES(last_question_id), last_question_id),
       done_count = VALUES(done_count),
       correct_count = VALUES(correct_count),
       updated_at = VALUES(updated_at)`,
    [row.id, row.userId, row.bankId, row.lastQuestionId, row.doneCount, row.correctCount, row.updatedAt],
  );
}

/* ------------------------------ 作答明细（读写） ------------------------------ */

/** 某用户是否已对某题作答过（用于「首次作答为准」判定）。 */
export async function findAnswer(
  userId: string,
  questionId: string,
  exec?: SqlExecutor,
): Promise<RowDataPacket | null> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT id FROM practice_answers WHERE user_id = ? AND question_id = ? LIMIT 1`,
    [userId, questionId],
  );
  return rows[0] ?? null;
}

/** 追加一条作答明细（仅首次作答写入）。 */
export async function insertAnswer(
  row: {
    id: string;
    userId: string;
    questionId: string;
    answer: number[];
    isCorrect: boolean;
    answeredAt: string;
  },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO practice_answers (id, user_id, question_id, answer, is_correct, answered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.userId, row.questionId, toJsonColumn(row.answer), row.isCorrect ? 1 : 0, row.answeredAt],
  );
}

/* ------------------------------ 错题本（读写） ------------------------------ */

/** 记录一次答错（存在则累计次数并刷新时间）。 */
export async function upsertWrongBook(
  row: { id: string; userId: string; questionId: string; wrongAt: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    // 答错入错题本 / 再次答错：连续答对计数清零（v1.9⑤）
    `INSERT INTO practice_wrong_book (id, user_id, question_id, wrong_count, correct_streak, last_wrong_at)
     VALUES (?, ?, ?, 1, 0, ?)
     ON DUPLICATE KEY UPDATE wrong_count = wrong_count + 1,
                             correct_streak = 0,
                             last_wrong_at = VALUES(last_wrong_at)`,
    [row.id, row.userId, row.questionId, row.wrongAt],
  );
}

/** 查询错题本条目（含连续答对计数）；不在错题本返回 null。 */
export async function findWrongBookEntry(
  userId: string,
  questionId: string,
  exec?: SqlExecutor,
): Promise<{ correct_streak: number } | null> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT correct_streak FROM practice_wrong_book WHERE user_id = ? AND question_id = ? LIMIT 1`,
    [userId, questionId],
  );
  const row = rows[0];
  return row ? { correct_streak: Number(row.correct_streak ?? 0) } : null;
}

/** 更新错题本条目的「连续答对」计数（答对但未达自动移除阈值时调用）。 */
export async function setWrongStreak(
  userId: string,
  questionId: string,
  streak: number,
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `UPDATE practice_wrong_book SET correct_streak = ? WHERE user_id = ? AND question_id = ?`,
    [streak, userId, questionId],
  );
}

/** 移出错题本（连续答对达阈值；自动移除与手动移除共用）。 */
export async function deleteWrongBookEntry(
  userId: string,
  questionId: string,
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(exec, `DELETE FROM practice_wrong_book WHERE user_id = ? AND question_id = ?`, [
    userId,
    questionId,
  ]);
}

/** 错题本条数（仅统计仍开放题库的题）。 */
export async function countWrongBook(userId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM practice_wrong_book wb
       JOIN questions q ON q.id = wb.question_id
       JOIN question_banks b ON b.id = q.bank_id
       WHERE wb.user_id = ? AND b.allow_practice = 1`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 错题本分页（题目内容 **不含** answer/analysis）。 */
export async function listWrongBook(
  userId: string,
  page: number,
  pageSize: number,
): Promise<PracticeWrongRow[]> {
  const offset = (page - 1) * pageSize;
  return query<PracticeWrongRow[]>(
    `SELECT wb.question_id, q.bank_id, q.type, q.stem, q.options, q.subject,
            wb.wrong_count, wb.last_wrong_at
       FROM practice_wrong_book wb
       JOIN questions q ON q.id = wb.question_id
       JOIN question_banks b ON b.id = q.bank_id
       WHERE wb.user_id = ? AND b.allow_practice = 1
       ORDER BY wb.last_wrong_at DESC
       LIMIT ? OFFSET ?`,
    [userId, pageSize, offset],
  );
}

/** 错题本题目 id 列表（可按题库过滤），用于「从错题本再次练题」。 */
export async function listWrongQuestionIds(userId: string, bankId?: string): Promise<string[]> {
  const conditions: string[] = ['wb.user_id = ?', 'b.allow_practice = 1'];
  const args: string[] = [userId];
  if (bankId && bankId.trim() !== '') {
    conditions.push('q.bank_id = ?');
    args.push(bankId.trim());
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT wb.question_id
       FROM practice_wrong_book wb
       JOIN questions q ON q.id = wb.question_id
       JOIN question_banks b ON b.id = q.bank_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY wb.last_wrong_at DESC`,
    args,
  );
  return rows.map((r) => String(r.question_id));
}

/* ============================================================
 * 二期增量 · 收藏夹（practice_favorites 读写）
 * ============================================================ */

/** 收藏夹条目行（题目内容 **不含** answer/analysis + 收藏时间）。 */
export interface PracticeFavoriteRow extends RowDataPacket {
  question_id: string;
  bank_id: string;
  type: QuestionType;
  stem: string;
  options: unknown;
  subject: string;
  created_at: string;
}

/** 收藏夹条数（仅统计仍开放题库的题；可按题库过滤）。 */
export async function countFavorites(userId: string, bankId = ''): Promise<number> {
  const scoped = bankId.trim();
  const extra = scoped === '' ? '' : ' AND q.bank_id = ?';
  const args: string[] = scoped === '' ? [userId] : [userId, scoped];
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM practice_favorites f
       JOIN questions q ON q.id = f.question_id
       JOIN question_banks b ON b.id = q.bank_id
      WHERE f.user_id = ? AND b.allow_practice = 1${extra}`,
    args,
  );
  return Number(rows[0]?.c ?? 0);
}

/** 某用户是否已收藏某题（用于幂等收藏判定）。 */
export async function findFavorite(
  userId: string,
  questionId: string,
  exec?: SqlExecutor,
): Promise<RowDataPacket | null> {
  const rows = await runQuery<RowDataPacket[]>(
    exec,
    `SELECT id FROM practice_favorites WHERE user_id = ? AND question_id = ? LIMIT 1`,
    [userId, questionId],
  );
  return rows[0] ?? null;
}

/** 新增一条收藏（幂等：唯一键冲突时忽略）。 */
export async function insertFavorite(
  row: { id: string; userId: string; questionId: string; createdAt: string },
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(
    exec,
    `INSERT IGNORE INTO practice_favorites (id, user_id, question_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [row.id, row.userId, row.questionId, row.createdAt],
  );
}

/** 取消收藏（幂等：不存在时无影响）。 */
export async function deleteFavorite(
  userId: string,
  questionId: string,
  exec?: SqlExecutor,
): Promise<void> {
  await runQuery(exec, `DELETE FROM practice_favorites WHERE user_id = ? AND question_id = ?`, [
    userId,
    questionId,
  ]);
}

/** 收藏夹题目 id 列表（可按题库过滤），用于「练收藏题」。 */
export async function listFavoriteQuestionIds(userId: string, bankId?: string): Promise<string[]> {
  const conditions: string[] = ['f.user_id = ?', 'b.allow_practice = 1'];
  const args: string[] = [userId];
  if (bankId && bankId.trim() !== '') {
    conditions.push('q.bank_id = ?');
    args.push(bankId.trim());
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT f.question_id
       FROM practice_favorites f
       JOIN questions q ON q.id = f.question_id
       JOIN question_banks b ON b.id = q.bank_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY f.created_at DESC`,
    args,
  );
  return rows.map((r) => String(r.question_id));
}

/** 收藏夹分页（题目内容 **不含** answer/analysis）。 */
export async function listFavorites(
  userId: string,
  bankId: string,
  page: number,
  pageSize: number,
): Promise<PracticeFavoriteRow[]> {
  const scoped = bankId.trim();
  const extra = scoped === '' ? '' : ' AND q.bank_id = ?';
  const args: Array<string | number> = scoped === '' ? [userId] : [userId, scoped];
  const offset = (page - 1) * pageSize;
  return query<PracticeFavoriteRow[]>(
    `SELECT f.question_id, q.bank_id, q.type, q.stem, q.options, q.subject, f.created_at
       FROM practice_favorites f
       JOIN questions q ON q.id = f.question_id
       JOIN question_banks b ON b.id = q.bank_id
      WHERE f.user_id = ? AND b.allow_practice = 1${extra}
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?`,
    [...args, pageSize, offset],
  );
}

/* ============================================================
 * 二期增量 · 每日一练（practice_daily_tasks 读写 + 抽题）
 * ============================================================ */

/** 每日一练任务行。 */
export interface PracticeDailyTaskRow extends RowDataPacket {
  id: string;
  user_id: string;
  practice_date: string;
  question_ids: unknown;
  total: number | string;
  done_count: number | string;
  correct_count: number | string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 查某用户某自然日的任务。 */
export async function findDailyTask(
  userId: string,
  practiceDate: string,
): Promise<PracticeDailyTaskRow | null> {
  const rows = await query<PracticeDailyTaskRow[]>(
    `SELECT id, user_id, practice_date, question_ids, total, done_count, correct_count,
            completed_at, created_at, updated_at
       FROM practice_daily_tasks
      WHERE user_id = ? AND practice_date = ?
      LIMIT 1`,
    [userId, practiceDate],
  );
  return rows[0] ?? null;
}

/** 创建当日任务（唯一键冲突时忽略，保证并发下只留一条）。 */
export async function insertDailyTask(row: {
  id: string;
  userId: string;
  practiceDate: string;
  questionIdsJson: string;
  total: number;
  createdAt: string;
}): Promise<void> {
  await query<ResultSetHeader>(
    `INSERT IGNORE INTO practice_daily_tasks
       (id, user_id, practice_date, question_ids, total, done_count, correct_count, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
    [row.id, row.userId, row.practiceDate, row.questionIdsJson, row.total, row.createdAt, row.createdAt],
  );
}

/** 覆盖当日任务完成度（服务端权威值）。 */
export async function setDailyTaskProgress(row: {
  userId: string;
  practiceDate: string;
  doneCount: number;
  correctCount: number;
  completedAt: string | null;
  updatedAt: string;
}): Promise<void> {
  await query<ResultSetHeader>(
    `UPDATE practice_daily_tasks
        SET done_count = ?, correct_count = ?, completed_at = ?, updated_at = ?
      WHERE user_id = ? AND practice_date = ?`,
    [row.doneCount, row.correctCount, row.completedAt, row.updatedAt, row.userId, row.practiceDate],
  );
}

/** 用户已练过的开放题库 id（用于 dailyBankScope='practiced'）。 */
export async function listPracticedBankIds(userId: string): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT DISTINCT q.bank_id AS bank_id
       FROM practice_answers pa
       JOIN questions q ON q.id = pa.question_id
       JOIN question_banks b ON b.id = q.bank_id
      WHERE pa.user_id = ? AND b.allow_practice = 1`,
    [userId],
  );
  return rows.map((r) => String(r.bank_id));
}

/**
 * 在指定（或全部）开放题库内随机抽取题目 id。
 * @param bankIds 限定题库；空数组 = 全部开放题库
 * @param types   题型范围；空数组 = 全部题型
 * @param limit   抽取上限
 */
export async function listRandomQuestionIdsInBanks(params: {
  bankIds: string[];
  types: QuestionType[];
  limit: number;
}): Promise<string[]> {
  const conditions: string[] = ['b.allow_practice = 1'];
  const args: Array<string | number> = [];
  if (params.bankIds.length > 0) {
    conditions.push(`q.bank_id IN (${params.bankIds.map(() => '?').join(',')})`);
    args.push(...params.bankIds);
  }
  if (params.types.length > 0) {
    conditions.push(`q.type IN (${params.types.map(() => '?').join(',')})`);
    args.push(...params.types);
  }
  args.push(params.limit);
  const rows = await query<RowDataPacket[]>(
    `SELECT q.id
       FROM questions q
       JOIN question_banks b ON b.id = q.bank_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY RAND()
      LIMIT ?`,
    args,
  );
  return rows.map((r) => String(r.id));
}

/* ============================================================
 * 二期增量 · 学习报告聚合（practice_answers 只读）
 * ============================================================ */

/** 全局累计作答（首答去重口径：每题仅一条）。 */
export async function countAnswersTotal(
  userId: string,
): Promise<{ done: number; correct: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS done, COALESCE(SUM(is_correct), 0) AS correct
       FROM practice_answers WHERE user_id = ?`,
    [userId],
  );
  return { done: Number(rows[0]?.done ?? 0), correct: Number(rows[0]?.correct ?? 0) };
}

/** 指定 UTC 半开区间内的作答聚合。 */
export async function countAnswersBetween(
  userId: string,
  startUtc: string,
  endUtc: string,
): Promise<{ done: number; correct: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS done, COALESCE(SUM(is_correct), 0) AS correct
       FROM practice_answers
      WHERE user_id = ? AND answered_at >= ? AND answered_at < ?`,
    [userId, startUtc, endUtc],
  );
  return { done: Number(rows[0]?.done ?? 0), correct: Number(rows[0]?.correct ?? 0) };
}

/** 指定题目集合在 UTC 半开区间内的作答聚合（每日任务完成度）。 */
export async function countAnswersOfQuestionsBetween(
  userId: string,
  questionIds: string[],
  startUtc: string,
  endUtc: string,
): Promise<{ done: number; correct: number }> {
  if (questionIds.length === 0) return { done: 0, correct: 0 };
  const placeholders = questionIds.map(() => '?').join(',');
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS done, COALESCE(SUM(is_correct), 0) AS correct
       FROM practice_answers
      WHERE user_id = ? AND answered_at >= ? AND answered_at < ?
        AND question_id IN (${placeholders})`,
    [userId, startUtc, endUtc, ...questionIds],
  );
  return { done: Number(rows[0]?.done ?? 0), correct: Number(rows[0]?.correct ?? 0) };
}

/** 逐日作答聚合（按业务时区折算自然日；`offsetMinutes` 为位移算术，不依赖 MySQL 时区表）。 */
export async function listAnswersByDay(
  userId: string,
  offsetMinutes: number,
  startUtc: string,
  endUtc: string,
): Promise<Array<{ date: string; done: number; correct: number }>> {
  const rows = await query<RowDataPacket[]>(
    `SELECT DATE(DATE_ADD(answered_at, INTERVAL ? MINUTE)) AS d,
            COUNT(*) AS done,
            COALESCE(SUM(is_correct), 0) AS correct
       FROM practice_answers
      WHERE user_id = ? AND answered_at >= ? AND answered_at < ?
      GROUP BY d`,
    [offsetMinutes, userId, startUtc, endUtc],
  );
  return rows.map((r) => ({
    date: String(r.d).slice(0, 10),
    done: Number(r.done ?? 0),
    correct: Number(r.correct ?? 0),
  }));
}

/** 有作答记录的业务自然日（倒序），用于连续打卡天数计算。 */
export async function listAnsweredBizDates(
  userId: string,
  offsetMinutes: number,
  fromUtc: string,
): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT DISTINCT DATE(DATE_ADD(answered_at, INTERVAL ? MINUTE)) AS d
       FROM practice_answers
      WHERE user_id = ? AND answered_at >= ?
      ORDER BY d DESC`,
    [offsetMinutes, userId, fromUtc],
  );
  return rows.map((r) => String(r.d).slice(0, 10));
}

/** 按科目聚合（仅开放题库），正确率升序。 */
export async function listSubjectStats(
  userId: string,
): Promise<Array<{ subject: string; done: number; correct: number }>> {
  const rows = await query<RowDataPacket[]>(
    `SELECT q.subject AS subject, COUNT(*) AS done, COALESCE(SUM(pa.is_correct), 0) AS correct
       FROM practice_answers pa
       JOIN questions q ON q.id = pa.question_id
       JOIN question_banks b ON b.id = q.bank_id
      WHERE pa.user_id = ? AND b.allow_practice = 1
      GROUP BY q.subject
      ORDER BY (COALESCE(SUM(pa.is_correct), 0) / COUNT(*)) ASC, done DESC`,
    [userId],
  );
  return rows.map((r) => ({
    subject: String(r.subject),
    done: Number(r.done ?? 0),
    correct: Number(r.correct ?? 0),
  }));
}

/** 按开放题库聚合概览（含该用户已练题数与题库总题数）。 */
export async function listBankStats(userId: string): Promise<
  Array<{ bankId: string; bankName: string; done: number; correct: number; totalCount: number }>
> {
  const rows = await query<RowDataPacket[]>(
    `SELECT b.id AS bank_id,
            b.name AS bank_name,
            COUNT(pa.id) AS done,
            COALESCE(SUM(pa.is_correct), 0) AS correct,
            (SELECT COUNT(*) FROM questions q2 WHERE q2.bank_id = b.id) AS total_count
       FROM question_banks b
       LEFT JOIN questions q ON q.bank_id = b.id
       LEFT JOIN practice_answers pa ON pa.question_id = q.id AND pa.user_id = ?
      WHERE b.allow_practice = 1
      GROUP BY b.id, b.name, b.created_at
      ORDER BY b.created_at ASC`,
    [userId],
  );
  return rows.map((r) => ({
    bankId: String(r.bank_id),
    bankName: String(r.bank_name),
    done: Number(r.done ?? 0),
    correct: Number(r.correct ?? 0),
    totalCount: Number(r.total_count ?? 0),
  }));
}
