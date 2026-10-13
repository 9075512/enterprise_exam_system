/**
 * 考试记录模块 —— 业务逻辑层。
 * 判分核心 isAnswerCorrect()/grade() 集中于此（禁止在 UI 层判分，§9-12）。
 */
import * as repo from './records.repo.js';
import type { ExamRecordRow } from './records.repo.js';
import { mapRecordRow, mapRecordDetailRow } from './records.mapper.js';
import * as examsRepo from '../exams/exams.repo.js';
import * as exceptionsRepo from '../exams/examExceptions.repo.js';
import * as appealsRepo from '../appeals/appeals.repo.js';
import { mapExamRow } from '../exams/exams.mapper.js';
import * as papersService from '../papers/papers.service.js';
import * as retakesService from '../retakes/retakes.service.js';
import { getExamStatus } from '../../utils/examStatus.js';
import { badRequest, forbidden, notFound, attemptsExhausted, conflict } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { isAnswerCorrect } from '../../utils/grading.js';
import { sanitizeRichText, isRichTextEmpty } from '../../utils/richText.js';
import { getSettings } from '../settings/settings.service.js';
import { shuffleSnapshot } from '../../utils/shuffle.js';
import { notifyEvent } from '../../utils/notify.js';
import * as auditService from '../audit/audit.service.js';
import crypto from 'node:crypto';
import type {
  AppealStatus,
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

  // 特殊安排（v1.7①）：免考拒绝；加时下发；额外次数并入上限
  const exception = await exceptionsRepo.findByExamAndUser(examId, user.id);
  const extraMinutes = exception ? Number(exception.extra_minutes) : 0;
  const extraAttempts = exception ? Number(exception.extra_attempts) : 0;
  if (exception && Boolean(Number(exception.exempt))) {
    throw badRequest('你已被标记为免考，无需参加本次考试');
  }

  const status = getExamStatus(exam);
  if (status === 'not_started') throw badRequest('考试尚未开始，请在规定时间内参加');
  if (status === 'ended') throw badRequest('考试已结束，无法进入');

  // 续考幂等：存在进行中记录直接返回
  const inProgress = await repo.findInProgressByExamAndUser(examId, user.id);
  if (inProgress) return { ...mapRecordRow(inProgress), extraMinutes };

  // 次数上限校验（补考：存在已通过申请时额外授予 1 次；特殊安排：额外次数）
  const used = await repo.countSubmittedByExamAndUser(examId, user.id);
  const retakeGranted = await retakesService.isRetakeGranted(examId, user.id);
  const maxAllowed = exam.maxAttempts + (retakeGranted ? 1 : 0) + extraAttempts;
  if (used >= maxAllowed) {
    throw attemptsExhausted(`答题次数已用完（最多 ${maxAllowed} 次）`);
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
    if (again) return { ...mapRecordRow(again), extraMinutes };
    throw err;
  }
  const created = await repo.findById(id);
  return { ...mapRecordRow(created!), extraMinutes };
}

/** 暂存答案：仅 in_progress 可写；按题型归一化（客观题排序去重，填空 trim 文本，简答富文本净化）。 */
export async function saveAnswers(
  recordId: string,
  userId: string,
  answers: Record<string, number[] | string[]>,
): Promise<void> {
  const row = await repo.findById(recordId);
  if (!row) throw notFound('考试记录不存在');
  assertOwner(row, userId);
  if (row.status !== 'in_progress') return; // 幂等忽略

  const record = mapRecordRow(row);
  const typeMap = new Map(record.paperSnapshot.questions.map((sq) => [sq.questionId, sq.question.type]));
  const normalized: Record<string, number[] | string[]> = {};
  for (const [qid, arr] of Object.entries(answers)) {
    if (!Array.isArray(arr)) {
      normalized[qid] = [];
      continue;
    }
    const type = typeMap.get(qid);
    if (type === 'fill') {
      normalized[qid] = arr.map((s) => String(s ?? '').trim());
    } else if (type === 'short') {
      // v1.7③ S1：简答支持富文本/图片作答，服务端白名单净化（前端渲染不得作为安全边界）
      const raw = String(arr[0] ?? '');
      normalized[qid] = [isRichTextEmpty(raw) ? '' : sanitizeRichText(raw)];
    } else {
      normalized[qid] = [...arr].map((n) => Number(n)).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
    }
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

/** 交卷判分（幂等）：已交卷（submitted / pending_review）直接返回原结果。 */
export async function submit(recordId: string, userId: string, auto: boolean): Promise<ExamRecordDto> {
  const row = await repo.findById(recordId);
  if (!row) throw notFound('考试记录不存在');
  assertOwner(row, userId);
  if (row.status === 'submitted' || row.status === 'pending_review') return mapRecordRow(row);

  const record = mapRecordRow(row);
  const score = grade(record); // 客观题 + 填空自动判分；简答记 0（阅卷后补）
  const hasSubjective = record.paperSnapshot.questions.some((sq) => sq.question.type === 'short');
  await repo.submit(recordId, {
    submittedAt: nowDb(),
    autoSubmitted: auto,
    score,
    status: hasSubjective ? 'pending_review' : 'submitted',
  });
  const updated = await repo.findById(recordId);
  const dto = mapRecordRow(updated!);

  // 成绩通知（交卷出成绩；fail-open，不影响交卷）。含主观题者仅通知「待阅卷」。
  const exam = await examsRepo.findById(record.examId);
  if (exam) {
    if (hasSubjective) {
      await notifyEvent('resultPending', [record.userId], { examName: exam.name });
    } else {
      const passed = score >= Number(exam.pass_score);
      await notifyEvent('resultPublished', [record.userId], {
        examName: exam.name,
        score,
        passedText: passed ? '已及格' : '未及格',
      });
    }
  }

  return dto;
}

/** 记录详情（考生仅本人，管理员任意）。 */
export async function getById(recordId: string, user: { id: string; role: Role }): Promise<ExamRecordDto> {
  const row = await repo.findDetailById(recordId);
  if (!row) throw notFound('考试记录不存在');
  if (user.role === 'examinee' && row.user_id !== user.id) throw forbidden('无权查看他人的考试记录');
  const dto = mapRecordDetailRow(row);
  // 特殊安排：加时（供答题页倒计时使用）
  const exception = await exceptionsRepo.findByExamAndUser(row.exam_id, row.user_id);
  const extraMinutes = exception ? Number(exception.extra_minutes) : 0;
  // 成绩复核申请状态（考生查看本人复核进度）
  const appeal = await appealsRepo.findByRecordId(recordId);
  return { ...dto, extraMinutes, appealStatus: appeal ? (appeal.status as AppealStatus) : null };
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

/** 某场考试含切屏事件的已交卷记录（切屏审查，admin）。 */
export async function listCheatByExam(examId: string): Promise<ExamRecordDto[]> {
  const exam = await examsRepo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const rows = await repo.listCheatByExam(examId);
  return rows.map(mapRecordDetailRow);
}

/** 待阅卷列表（admin/author，分页，按交卷时间升序）。 */
export async function listPending(page?: number, pageSize?: number): Promise<Page<ExamRecordDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.listPending(paging), repo.countPending()]);
  return buildPage(rows.map(mapRecordDetailRow), total, paging.page, paging.pageSize);
}

/** 人工阅卷：提交逐题主观分，重算总分（客观分 + 主观分），状态转 submitted。 */
export async function review(
  recordId: string,
  subjectiveScores: Record<string, number>,
): Promise<ExamRecordDto> {
  const row = await repo.findDetailById(recordId);
  if (!row) throw notFound('考试记录不存在');
  if (row.status !== 'pending_review') throw conflict('该记录不在待阅卷状态');

  const record = mapRecordDetailRow(row);

  // 校验：仅简答题可给分，且 0 ≤ 分 ≤ 该题分值
  let subjectiveTotal = 0;
  for (const sq of record.paperSnapshot.questions) {
    if (sq.question.type !== 'short') continue;
    const given = subjectiveScores[sq.questionId];
    if (given === undefined) throw badRequest('请为所有简答题打分');
    if (!Number.isFinite(given) || given < 0 || given > sq.score) {
      throw badRequest(`主观题得分必须在 0~${sq.score} 之间`);
    }
    subjectiveTotal += given;
  }

  // 客观分（单选/多选/判断/填空自动判）
  let objectiveTotal = 0;
  for (const sq of record.paperSnapshot.questions) {
    if (sq.question.type === 'short') continue;
    if (isAnswerCorrect(sq.question, record.answers[sq.questionId])) objectiveTotal += sq.score;
  }
  const finalScore = round1(objectiveTotal + subjectiveTotal);

  await repo.updateReview(recordId, { subjectiveScores, score: finalScore });
  const updated = await repo.findById(recordId);
  const dto = mapRecordRow(updated!);

  // 阅卷完成通知（fail-open）
  const exam = await examsRepo.findById(record.examId);
  if (exam) {
    const passed = finalScore >= Number(exam.pass_score);
    await notifyEvent('reviewDone', [record.userId], {
      examName: exam.name,
      score: finalScore,
      passedText: passed ? '已及格' : '未及格',
    });
  }

  return dto;
}

/**
 * 监考强制交卷（admin，v1.7④ T3）：把某考生「进行中」的答卷按自动交卷结算。
 * 复用 `submit()`（含判分与成绩通知）；无进行中记录 → 1004。
 */
export async function forceSubmit(examId: string, userId: string, operatorId: string): Promise<ExamRecordDto> {
  const row = await repo.findInProgressByExamAndUser(examId, userId);
  if (!row) throw notFound('该考生当前没有进行中的答卷');
  const dto = await submit(row.id, row.user_id, true);
  const exam = await examsRepo.findById(examId);
  await auditService.record({
    actorId: operatorId,
    action: 'record.force_submit',
    targetType: 'record',
    targetId: row.id,
    targetName: exam?.name ?? '',
    detail: {
      examId,
      examName: exam?.name ?? '',
      userId,
      attemptNo: Number(row.attempt_no),
      score: dto.score,
    },
  });
  return dto;
}
