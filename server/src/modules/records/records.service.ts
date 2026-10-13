/**
 * 考试记录模块 —— 业务逻辑层。
 * 判分核心 isAnswerCorrect()/grade() 集中于此（禁止在 UI 层判分，§9-12）。
 */
import * as repo from './records.repo.js';
import type { ExamRecordRow } from './records.repo.js';
import { mapRecordRow, mapRecordDetailRow } from './records.mapper.js';
import * as examsRepo from '../exams/exams.repo.js';
import { mapExamRow } from '../exams/exams.mapper.js';
import * as papersService from '../papers/papers.service.js';
import { getExamStatus } from '../../utils/examStatus.js';
import { badRequest, forbidden, notFound, attemptsExhausted } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { isAnswerCorrect } from '../../utils/grading.js';
import { getSettings } from '../settings/settings.service.js';
import { shuffleSnapshot } from '../../utils/shuffle.js';
import crypto from 'node:crypto';
import type {
  CheatEvent,
  ExamRecordDto,
  Page,
  Role,
} from '../../types/domain.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * 判分口径唯一来源：自 `utils/grading.js` 抽出（考试与练题共用）。
 * 此处重新导出，保持既有导入路径 `modules/records/records.service` 兼容（现有单测零改动）。
 */
export { isAnswerCorrect };

/** 判分：总分 = 各题得分之和，四舍五入保留 1 位小数。 */
export function grade(record: ExamRecordDto): number {
  let total = 0;
  for (const sq of record.paperSnapshot.questions) {
    if (isAnswerCorrect(sq.question, record.answers[sq.questionId])) {
      total += sq.score;
    }
  }
  return round1(total);
}

/** 校验记录归属（考生仅本人）。 */
function assertOwner(row: ExamRecordRow, userId: string): void {
  if (row.user_id !== userId) throw forbidden('无权操作他人的考试记录');
}

/**
 * 开考（多次作答 + 续考幂等）。
 * not_started/ended 拒绝；存在进行中记录直接返回（刷新续考）；
 * 已交卷次数达到 maxAttempts → 1008 拒绝；否则以 attemptNo = 已交卷次数 + 1 新建记录并冻结快照。
 */
export async function startExam(
  examId: string,
  user: { id: string; departmentId: string },
): Promise<ExamRecordDto> {
  const examRow = await examsRepo.findById(examId);
  if (!examRow) throw notFound('考试不存在或已被删除');
  const exam = mapExamRow(examRow);

  const status = getExamStatus(exam);
  if (status === 'not_started') throw badRequest('考试尚未开始，请在规定时间内参加');
  if (status === 'ended') throw badRequest('考试已结束，无法进入');

  // 续考幂等：存在进行中记录直接返回
  const inProgress = await repo.findInProgressByExamAndUser(examId, user.id);
  if (inProgress) return mapRecordRow(inProgress);

  // 次数上限校验
  const used = await repo.countSubmittedByExamAndUser(examId, user.id);
  if (used >= exam.maxAttempts) {
    throw attemptsExhausted(`答题次数已用完（最多 ${exam.maxAttempts} 次）`);
  }

  const attemptNo = used + 1;
  let snapshot = await papersService.getSnapshot(exam.paperId);

  // 人手一卷：考试级开关优先，NULL 时继承全局默认（shuffleDefaultEnabled / shuffleOptionsDefault）
  const settings = await getSettings();
  const shuffleEnabled = exam.shuffleEnabled ?? settings.shuffleDefaultEnabled;
  if (shuffleEnabled) {
    const shuffleOptions = exam.shuffleOptions ?? settings.shuffleOptionsDefault;
    const seed = crypto.createHash('sha1').update(`${examId}:${user.id}:${attemptNo}`).digest('hex');
    snapshot = shuffleSnapshot(snapshot, seed, shuffleOptions);
  }

  const id = genId('rec-');
  try {
    await repo.insert({
      id,
      examId,
      userId: user.id,
      attemptNo,
      departmentId: user.departmentId || null,
      paperSnapshot: snapshot,
      answers: {},
      startedAt: nowDb(),
      cheatEvents: [],
    });
  } catch (err) {
    // 并发重复插入由唯一键 uk_records_exam_user_attempt 兜住 → 回读同 attempt_no 记录
    const again = await repo.findByExamUserAttempt(examId, user.id, attemptNo);
    if (again) return mapRecordRow(again);
    throw err;
  }
  const created = await repo.findById(id);
  return mapRecordRow(created!);
}

/** 暂存答案：仅 in_progress 可写；答案数组升序归一化。 */
export async function saveAnswers(
  recordId: string,
  userId: string,
  answers: Record<string, number[]>,
): Promise<void> {
  const row = await repo.findById(recordId);
  if (!row) throw notFound('考试记录不存在');
  assertOwner(row, userId);
  if (row.status !== 'in_progress') return; // 幂等忽略

  const normalized: Record<string, number[]> = {};
  for (const [qid, arr] of Object.entries(answers)) {
    normalized[qid] = Array.isArray(arr) ? [...arr].map((n) => Number(n)).sort((a, b) => a - b) : [];
  }
  await repo.updateAnswers(recordId, normalized);
}

/** 上报切屏事件（只增不改）；仅 in_progress 可写。 */
export async function addCheatEvent(recordId: string, userId: string, awaySeconds: number): Promise<void> {
  const row = await repo.findById(recordId);
  if (!row) throw notFound('考试记录不存在');
  assertOwner(row, userId);
  if (row.status !== 'in_progress') return;

  const events = parseJsonColumn<CheatEvent[]>(row.cheat_events, []);
  events.push({ at: new Date().toISOString(), awaySeconds: Math.max(1, Math.round(awaySeconds)) });
  await repo.updateCheatEvents(recordId, events);
}

/** 交卷判分（幂等）：已交卷直接返回原结果。 */
export async function submit(recordId: string, userId: string, auto: boolean): Promise<ExamRecordDto> {
  const row = await repo.findById(recordId);
  if (!row) throw notFound('考试记录不存在');
  assertOwner(row, userId);
  if (row.status === 'submitted') return mapRecordRow(row);

  const record = mapRecordRow(row);
  const score = grade(record);
  await repo.submit(recordId, { submittedAt: nowDb(), autoSubmitted: auto, score });
  const updated = await repo.findById(recordId);
  return mapRecordRow(updated!);
}

/** 记录详情（考生仅本人，管理员任意）。 */
export async function getById(recordId: string, user: { id: string; role: Role }): Promise<ExamRecordDto> {
  const row = await repo.findDetailById(recordId);
  if (!row) throw notFound('考试记录不存在');
  if (user.role === 'examinee' && row.user_id !== user.id) throw forbidden('无权查看他人的考试记录');
  return mapRecordDetailRow(row);
}

/** 我的成绩（仅已交卷，分页；可选按考试名称关键字筛选）。 */
export async function listMy(
  userId: string,
  page?: number,
  pageSize?: number,
  keyword?: string,
): Promise<Page<ExamRecordDto>> {
  const paging = normalizePaging(page, pageSize);
  const kw = keyword?.trim() || undefined; // 空串/纯空白 → 不过滤
  const [rows, total] = await Promise.all([
    repo.listMySubmitted(userId, paging, kw),
    repo.countMySubmitted(userId, kw),
  ]);
  return buildPage(rows.map(mapRecordRow), total, paging.page, paging.pageSize);
}

/** 某场考试全部记录（admin，分页）。 */
export async function listByExam(examId: string, page?: number, pageSize?: number): Promise<Page<ExamRecordDto>> {
  const exam = await examsRepo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([
    repo.listByExam(examId, paging),
    repo.countByExam(examId),
  ]);
  return buildPage(rows.map(mapRecordRow), total, paging.page, paging.pageSize);
}
