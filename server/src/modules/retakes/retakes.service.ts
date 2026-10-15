/**
 * 补考 —— 业务逻辑层（申请-审批流）。
 *
 * 规则：
 * - `allowRetake`（单场覆盖全局默认）的考试、考生未及格、且答题次数已用尽（maxAttempts + 特殊安排额外次数）方可补考；
 * - 仅「已交卷且不及格」的考生可申请；存在进行中作答时不可申请；
 * - 一名考生对一场考试至多一条申请（被拒后可重新申请，重置为待审批）；
 * - 审批通过后，`startExam` 授予额外 1 次答题机会（详见 records.service）。
 */
import * as repo from './retakes.repo.js';
import type { RetakeRow } from './retakes.repo.js';
import * as examsRepo from '../exams/exams.repo.js';
import { mapExamRow } from '../exams/exams.mapper.js';
import * as recordsRepo from '../records/records.repo.js';
import * as exceptionsRepo from '../exams/examExceptions.repo.js';
import { getSettings } from '../settings/settings.service.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { notifyEvent } from '../../utils/notify.js';
import type { Page, RetakeDto, RetakeStatus } from '../../types/domain.js';

function mapRow(row: RetakeRow): RetakeDto {
  return {
    id: row.id,
    examId: row.exam_id,
    examName: row.exam_name,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    departmentName: row.department_name ?? '',
    status: row.status,
    reason: row.reason,
    appliedAt: fromDbDateSafe(row.applied_at),
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? fromDbDateSafe(row.reviewed_at) : null,
  };
}

/** 是否已授予补考机会（存在「已通过」申请）。 */
export async function isRetakeGranted(examId: string, userId: string): Promise<boolean> {
  return repo.hasApprovedByExamAndUser(examId, userId);
}

/** 考生发起补考申请。 */
export async function apply(userId: string, input: { examId: string; reason: string }): Promise<RetakeDto> {
  const examRow = await examsRepo.findById(input.examId);
  if (!examRow) throw notFound('考试不存在或已被删除');
  const exam = mapExamRow(examRow);

  const settings = await getSettings();
  const allowRetake = exam.allowRetake ?? settings.retakeDefaultEnabled;
  if (!allowRetake) throw badRequest('该考试未开放补考申请');

  const latest = await recordsRepo.findLatestByExamAndUser(input.examId, userId);
  if (!latest || latest.status !== 'submitted') throw badRequest('暂无可申请补考的成绩');
  if (Number(latest.score) >= Number(exam.passScore)) throw badRequest('成绩已及格，无需补考');

  // 须答题次数已用尽（口径与 startExam 一致：maxAttempts + 特殊安排额外次数）
  const used = await recordsRepo.countSubmittedByExamAndUser(input.examId, userId);
  const exception = await exceptionsRepo.findByExamAndUser(input.examId, userId);
  const extraAttempts = exception ? Number(exception.extra_attempts) : 0;
  if (used < exam.maxAttempts + extraAttempts) {
    throw badRequest('答题次数尚未用完，请直接继续作答，无需申请补考');
  }

  const inProgress = await recordsRepo.findInProgressByExamAndUser(input.examId, userId);
  if (inProgress) throw badRequest('存在进行中的作答，无法申请补考');

  const existing = await repo.findByExamAndUser(input.examId, userId);
  if (existing) {
    if (existing.status === 'pending') throw conflict('补考申请审核中，请勿重复申请');
    if (existing.status === 'approved') throw conflict('补考已通过，请直接参加补考');
    // rejected → 允许重新申请
    await repo.reapply(existing.id, input.reason.trim(), nowDb());
    const updated = await repo.findById(existing.id);
    return mapRow(updated!);
  }

  const id = genId('retake-');
  const now = nowDb();
  await repo.insert({
    id,
    examId: input.examId,
    userId,
    status: 'pending',
    reason: input.reason.trim(),
    appliedAt: now,
    createdAt: now,
  });
  const created = await repo.findById(id);
  return mapRow(created!);
}

/** 管理员审批通过。 */
export async function approve(id: string, adminId: string): Promise<RetakeDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('补考申请不存在');
  if (row.status !== 'pending') throw conflict('该申请已审批');
  await repo.updateStatus(id, 'approved', adminId, nowDb(), '');
  const updated = await repo.findById(id);

  // 通知考生（补考审批结果；文案走可配置模板 v1.7④ S3）
  await notifyEvent('retakeApproved', [updated!.user_id], { examName: updated!.exam_name });

  return mapRow(updated!);
}

/** 管理员审批驳回。 */
export async function reject(id: string, adminId: string, reason: string): Promise<RetakeDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('补考申请不存在');
  if (row.status !== 'pending') throw conflict('该申请已审批');
  const trimmed = reason.trim();
  if (!trimmed) throw badRequest('请填写驳回原因');
  await repo.updateStatus(id, 'rejected', adminId, nowDb(), trimmed);
  const updated = await repo.findById(id);

  await notifyEvent('retakeRejected', [updated!.user_id], {
    examName: updated!.exam_name,
    reason: trimmed,
  });

  return mapRow(updated!);
}

/** 补考申请列表（管理员，可按状态 / 考试过滤）。 */
export async function list(
  filter: { status?: RetakeStatus; examId?: string },
  page?: number,
  pageSize?: number,
): Promise<Page<RetakeDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.list(filter, paging), repo.count(filter)]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}

/** 我的补考申请列表（考生）。 */
export async function listMy(userId: string, page?: number, pageSize?: number): Promise<Page<RetakeDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.listByUser(userId, paging), repo.countByUser(userId)]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}
