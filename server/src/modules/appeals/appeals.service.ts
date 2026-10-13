/**
 * 成绩复核 —— 业务逻辑层（v1.7①，申请-复核流）。
 *
 * 规则：
 * - 考生仅可对**本人已交卷**（status=submitted）的记录申请复核，每条记录至多一次；
 * - 是否开放由考试级三态开关（allowAppeal）覆盖全局默认（appealEnabled）；
 * - 可设申请时限（appealWindowDays 天，自交卷起算；0 = 不限）；
 * - 复核通过可直接改分（0 ≤ 新分 ≤ 试卷总分），改分后重算及格状态、审计留痕并通知考生。
 */
import * as repo from './appeals.repo.js';
import type { AppealRow } from './appeals.repo.js';
import * as examsRepo from '../exams/exams.repo.js';
import { mapExamRow } from '../exams/exams.mapper.js';
import * as recordsRepo from '../records/records.repo.js';
import { mapRecordRow } from '../records/records.mapper.js';
import { getSettings } from '../settings/settings.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { notifyUsers } from '../../utils/notify.js';
import * as auditService from '../audit/audit.service.js';
import type { AppealStatus, Page, ScoreAppealDto } from '../../types/domain.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 行 → DTO。 */
function mapRow(row: AppealRow): ScoreAppealDto {
  return {
    id: row.id,
    recordId: row.record_id,
    examId: row.exam_id,
    examName: row.exam_name,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    departmentName: row.department_name ?? '',
    status: row.status,
    reason: row.reason,
    originalScore: Number(row.original_score),
    newScore: row.new_score === null ? null : Number(row.new_score),
    reviewComment: row.review_comment,
    appliedAt: fromDbDateSafe(row.applied_at),
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? fromDbDateSafe(row.reviewed_at) : null,
  };
}

/** 考生发起成绩复核申请。 */
export async function apply(userId: string, input: { recordId: string; reason: string }): Promise<ScoreAppealDto> {
  const recordRow = await recordsRepo.findById(input.recordId);
  if (!recordRow) throw notFound('考试记录不存在');
  if (recordRow.user_id !== userId) throw forbidden('无权对他人成绩申请复核');
  if (recordRow.status !== 'submitted') throw badRequest('该答卷尚未出成绩，暂不能申请复核');

  const examRow = await examsRepo.findById(recordRow.exam_id);
  if (!examRow) throw notFound('考试不存在或已被删除');
  const exam = mapExamRow(examRow);

  const settings = await getSettings();
  const enabled = exam.allowAppeal ?? settings.appealEnabled;
  if (!enabled) throw badRequest('该考试未开放成绩复核');

  // 时限校验（自交卷起算）
  if (settings.appealWindowDays > 0 && recordRow.submitted_at) {
    const submittedMs = new Date(fromDbDate(recordRow.submitted_at) ?? '').getTime();
    if (Number.isFinite(submittedMs) && Date.now() - submittedMs > settings.appealWindowDays * DAY_MS) {
      throw badRequest(`成绩复核申请已超过 ${settings.appealWindowDays} 天时限`);
    }
  }

  const existing = await repo.findByRecordId(input.recordId);
  if (existing) {
    if (existing.status === 'pending') throw conflict('复核申请审核中，请勿重复申请');
    if (existing.status === 'approved') throw conflict('该成绩已完成复核');
    throw conflict('该成绩已申请过复核，不可重复申请');
  }

  const id = genId('appeal-');
  const now = nowDb();
  await repo.insert({
    id,
    recordId: input.recordId,
    examId: recordRow.exam_id,
    userId,
    status: 'pending',
    reason: (input.reason ?? '').trim(),
    originalScore: Number(recordRow.score),
    appliedAt: now,
    createdAt: now,
  });
  const created = await repo.findById(id);
  return mapRow(created!);
}

/** 管理员复核：通过并改分。 */
export async function approve(
  id: string,
  adminId: string,
  input: { newScore: number; comment?: string },
): Promise<ScoreAppealDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('复核申请不存在');
  if (row.status !== 'pending') throw conflict('该申请已复核');

  const recordRow = await recordsRepo.findById(row.record_id);
  if (!recordRow) throw notFound('考试记录不存在');
  const record = mapRecordRow(recordRow);
  const totalScore = record.paperSnapshot.totalScore;

  const newScore = Number(input.newScore);
  if (!Number.isFinite(newScore) || newScore < 0 || newScore > totalScore) {
    throw badRequest(`复核分数必须在 0~${totalScore} 之间`);
  }
  const comment = (input.comment ?? '').trim();

  await recordsRepo.updateScore(row.record_id, newScore);
  await repo.updateApprove(id, { newScore, reviewComment: comment, reviewedBy: adminId, reviewedAt: nowDb() });
  const updated = await repo.findById(id);

  await auditService.record({
    actorId: adminId,
    action: 'appeal.approve',
    targetType: 'appeal',
    targetId: id,
    targetName: updated!.exam_name,
    detail: { recordId: row.record_id, userName: row.user_name, originalScore: Number(row.original_score), newScore },
  });

  const examRow = await examsRepo.findById(row.exam_id);
  const passScore = examRow ? Number(examRow.pass_score) : 0;
  await notifyUsers([row.user_id], {
    type: 'appeal',
    title: `成绩复核已通过：${updated!.exam_name}`,
    content: `你的成绩复核已通过，成绩由 ${Number(row.original_score)} 分调整为 ${newScore} 分，${
      newScore >= passScore ? '已及格' : '未及格'
    }。${comment ? `复核意见：${comment}` : ''}`,
  });

  return mapRow(updated!);
}

/** 管理员复核：驳回。 */
export async function reject(id: string, adminId: string, comment: string): Promise<ScoreAppealDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('复核申请不存在');
  if (row.status !== 'pending') throw conflict('该申请已复核');
  const trimmed = (comment ?? '').trim();
  if (!trimmed) throw badRequest('请填写复核意见');

  await repo.updateReject(id, { reviewComment: trimmed, reviewedBy: adminId, reviewedAt: nowDb() });
  const updated = await repo.findById(id);

  await auditService.record({
    actorId: adminId,
    action: 'appeal.reject',
    targetType: 'appeal',
    targetId: id,
    targetName: updated!.exam_name,
    detail: { recordId: row.record_id, userName: row.user_name, comment: trimmed },
  });

  await notifyUsers([row.user_id], {
    type: 'appeal',
    title: `成绩复核未通过：${updated!.exam_name}`,
    content: `你的成绩复核申请未通过，原成绩保持不变。复核意见：${trimmed}`,
  });

  return mapRow(updated!);
}

/** 复核申请列表（admin，可按状态过滤）。 */
export async function list(
  filter: { status?: AppealStatus },
  page?: number,
  pageSize?: number,
): Promise<Page<ScoreAppealDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.list(filter, paging), repo.count(filter)]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}

/** 我的复核申请（考生）。 */
export async function listMine(userId: string, page?: number, pageSize?: number): Promise<Page<ScoreAppealDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.listByUser(userId, paging), repo.countByUser(userId)]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}
