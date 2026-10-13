/**
 * 考试模块 —— 业务逻辑层。
 * 考试状态不落库，由时间窗实时推导（getExamStatus）；考生端做科室隔离。
 */
import * as repo from './exams.repo.js';
import * as exceptionsRepo from './examExceptions.repo.js';
import * as monitorRepo from './examMonitor.repo.js';
import type { MonitorRecordRow } from './examMonitor.repo.js';
import { mapExamRow } from './exams.mapper.js';
import * as papersRepo from '../papers/papers.repo.js';
import * as recordsRepo from '../records/records.repo.js';
import * as retakesRepo from '../retakes/retakes.repo.js';
import * as usersRepo from '../users/users.repo.js';
import * as departmentsService from '../departments/departments.service.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, toDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { getSettings } from '../settings/settings.service.js';
import { notifyEvent } from '../../utils/notify.js';
import * as auditService from '../audit/audit.service.js';
import type {
  CheatEvent,
  ExamDto,
  ExamExceptionDto,
  ExamMonitorDto,
  ExamMonitorRowDto,
  ExamMonitorSummaryDto,
  ExamMyDto,
  MonitorStatus,
  RecordStatus,
  RetakeStatus,
} from '../../types/domain.js';

/** 校验并归一化考试入参（照搬 v1.0 examService.save 规则）。 */
async function validateExamInput(input: {
  name: string;
  paperId: string;
  departmentIds: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  passScore: number;
  maxAttempts: number;
  shuffleEnabled?: boolean | null;
  shuffleOptions?: boolean | null;
  allowRetake?: boolean | null;
  allowAppeal?: boolean | null;
}): Promise<{
  name: string;
  paperId: string;
  departmentIds: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  passScore: number;
  maxAttempts: number;
  shuffleEnabled: boolean | null;
  shuffleOptions: boolean | null;
  allowRetake: boolean | null;
  allowAppeal: boolean | null;
}> {
  const name = input.name.trim();
  if (!name) throw badRequest('考试名称不能为空');

  const paper = await papersRepo.findById(input.paperId);
  if (!paper) throw notFound('关联试卷不存在或已被删除');

  if (input.departmentIds.length === 0) throw badRequest('请至少选择一个参与科室');

  const start = new Date(input.startTime).getTime();
  const end = new Date(input.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw badRequest('请填写完整的考试时间窗');
  if (end <= start) throw badRequest('截止时间必须晚于开始时间');

  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1) throw badRequest('考试时长必须不少于 1 分钟');

  const passScore = Number(input.passScore);
  if (!Number.isFinite(passScore) || passScore < 1) throw badRequest('及格线必须为正数');
  if (passScore > Number(paper.total_score)) throw badRequest('及格线不能超过试卷总分');

  const maxAttempts = Number(input.maxAttempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw badRequest('答题次数至少为 1');
  if (maxAttempts > 10) throw badRequest('答题次数最多为 10');

  return {
    name,
    paperId: input.paperId,
    departmentIds: input.departmentIds,
    startTime: toDbDate(input.startTime),
    endTime: toDbDate(input.endTime),
    durationMinutes,
    passScore,
    maxAttempts,
    shuffleEnabled: input.shuffleEnabled ?? null,
    shuffleOptions: input.shuffleOptions ?? null,
    allowRetake: input.allowRetake ?? null,
    allowAppeal: input.allowAppeal ?? null,
  };
}

/** 全部考试（admin）。 */
export async function list(): Promise<ExamDto[]> {
  const rows = await repo.list();
  return rows.map(mapExamRow);
}

/** 考试详情（登录）。 */
export async function getById(id: string): Promise<ExamDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('考试不存在或已被删除');
  return mapExamRow(row);
}

/** 考生可见考试（科室隔离）+ 本人作答状态、已交卷次数与补考资格。 */
export async function listForExaminee(userId: string, departmentId: string): Promise<ExamMyDto[]> {
  if (!departmentId) return [];
  // 多级科室树：本人科室的祖先链命中考试所选科室即视为参与
  const ancestorIds = await departmentsService.getAncestorIds(departmentId);
  if (ancestorIds.length === 0) return [];
  const [rows, records, retakes, settings, exceptionRows] = await Promise.all([
    repo.listForAncestors(ancestorIds),
    recordsRepo.listByUser(userId),
    retakesRepo.listExamStatusByUser(userId),
    getSettings(),
    exceptionsRepo.listByUser(userId),
  ]);

  // recordStatus：存在进行中记录则优先返回 in_progress，否则取已交卷；attemptsUsed = 已交卷记录数
  const statusMap = new Map<string, RecordStatus>();
  const usedMap = new Map<string, number>();
  const inProgressSet = new Set<string>();
  const latestSubmitted = new Map<string, number>(); // exam_id → 最近一次已交卷分数
  const prevAttempt = new Map<string, number>(); // exam_id → 已交卷的最大 attempt_no
  for (const r of records) {
    if (r.status === 'submitted' || r.status === 'pending_review') {
      usedMap.set(r.exam_id, (usedMap.get(r.exam_id) ?? 0) + 1);
      if (!statusMap.has(r.exam_id)) statusMap.set(r.exam_id, 'submitted');
      const attemptNo = Number(r.attempt_no);
      if (attemptNo > (prevAttempt.get(r.exam_id) ?? 0)) {
        latestSubmitted.set(r.exam_id, Number(r.score));
        prevAttempt.set(r.exam_id, attemptNo);
      }
    }
  }
  for (const r of records) {
    if (r.status === 'in_progress') {
      statusMap.set(r.exam_id, 'in_progress');
      inProgressSet.add(r.exam_id);
    }
  }

  const retakeMap = new Map<string, RetakeStatus>();
  for (const rt of retakes) retakeMap.set(rt.exam_id, rt.status);

  // 特殊安排（加时 / 额外次数 / 免考）：exam_id → 安排
  const exceptionMap = new Map(
    exceptionRows.map((x) => [
      x.exam_id,
      { extraMinutes: Number(x.extra_minutes), extraAttempts: Number(x.extra_attempts), exempt: Boolean(Number(x.exempt)) },
    ]),
  );

  return rows.map((row) => {
    const dto = mapExamRow(row);
    const allowRetake = dto.allowRetake ?? settings.retakeDefaultEnabled;
    const retakeStatus = retakeMap.get(dto.id) ?? null;
    const latestScore = latestSubmitted.get(dto.id);
    const failed = latestScore !== undefined && latestScore < Number(dto.passScore);
    const exception = exceptionMap.get(dto.id);
    const canApplyRetake =
      allowRetake &&
      dto.maxAttempts === 1 &&
      failed &&
      retakeStatus !== 'approved' &&
      retakeStatus !== 'pending' &&
      !inProgressSet.has(dto.id);
    return {
      ...dto,
      recordStatus: statusMap.get(dto.id) ?? null,
      attemptsUsed: usedMap.get(dto.id) ?? 0,
      retakeStatus,
      canApplyRetake,
      extraMinutes: exception?.extraMinutes ?? 0,
      extraAttempts: exception?.extraAttempts ?? 0,
      exempt: exception?.exempt ?? false,
    };
  });
}

/** 新建考试。 */
export async function create(input: Parameters<typeof validateExamInput>[0], operatorId: string): Promise<ExamDto> {
  const data = await validateExamInput(input);
  const id = genId('exam-');
  await repo.insert({ id, ...data, createdBy: operatorId, createdAt: nowDb() });
  const created = await repo.findById(id);
  const dto = mapExamRow(created!);

  // 考试发布通知（fail-open，不影响创建；文案走可配置模板 v1.7④ S3）
  // 多级科室树：通知需覆盖所选科室的整棵子树
  const expandedDepartmentIds = await departmentsService.expandDepartmentIds(dto.departmentIds);
  const examineeIds = await usersRepo.findIdsByDepartments(expandedDepartmentIds, 'examinee');
  await notifyEvent('examPublish', examineeIds, { examName: dto.name });

  await auditService.record({
    actorId: operatorId,
    action: 'exam.create',
    targetType: 'exam',
    targetId: dto.id,
    targetName: dto.name,
    detail: { passScore: dto.passScore, maxAttempts: dto.maxAttempts, departmentCount: dto.departmentIds.length },
  });

  return dto;
}

/** 编辑考试。 */
export async function update(
  id: string,
  input: Parameters<typeof validateExamInput>[0],
  operatorId: string,
): Promise<ExamDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('考试不存在或已被删除');
  const data = await validateExamInput(input);
  await repo.update(id, data);
  const updated = await repo.findById(id);
  const dto = mapExamRow(updated!);
  await auditService.record({
    actorId: operatorId,
    action: 'exam.update',
    targetType: 'exam',
    targetId: dto.id,
    targetName: dto.name,
    detail: { passScore: dto.passScore, maxAttempts: dto.maxAttempts, departmentCount: dto.departmentIds.length },
  });
  return dto;
}

/** 删除考试（已有成绩记录 → 1005）。 */
export async function remove(id: string, operatorId: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('考试不存在或已被删除');
  const recordCount = await repo.countRecords(id);
  if (recordCount > 0) {
    throw conflict('该考试已存在成绩记录，无法删除');
  }
  await repo.remove(id);
  await auditService.record({
    actorId: operatorId,
    action: 'exam.delete',
    targetType: 'exam',
    targetId: id,
    targetName: current.name,
  });
}

/* ============================ 特殊考试安排（v1.7①） ============================ */

/** 特殊安排行 → DTO。 */
function mapException(row: exceptionsRepo.ExamExceptionRow): ExamExceptionDto {
  return {
    id: row.id,
    examId: row.exam_id,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    departmentName: row.department_name ?? '',
    extraMinutes: Number(row.extra_minutes),
    extraAttempts: Number(row.extra_attempts),
    exempt: Boolean(Number(row.exempt)),
    note: row.note,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 某场考试的特殊安排列表（admin）。 */
export async function listExceptions(examId: string): Promise<ExamExceptionDto[]> {
  const exam = await repo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const rows = await exceptionsRepo.listByExam(examId);
  return rows.map(mapException);
}

/**
 * 新增 / 更新一条特殊安排（admin，按 考试×考生 upsert）。
 * 约束：加时 0~600 分钟、额外次数 0~10、备注 ≤255 字；考生必须存在。
 */
export async function upsertException(
  examId: string,
  userId: string,
  input: { extraMinutes?: number; extraAttempts?: number; exempt?: boolean; note?: string },
  operatorId: string,
): Promise<ExamExceptionDto> {
  const exam = await repo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const user = await usersRepo.findById(userId);
  if (!user) throw notFound('考生不存在或已被删除');

  const extraMinutes = Number(input.extraMinutes ?? 0);
  const extraAttempts = Number(input.extraAttempts ?? 0);
  const exempt = Boolean(input.exempt ?? false);
  const note = (input.note ?? '').trim();

  if (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 600) {
    throw badRequest('加时必须在 0~600 分钟之间');
  }
  if (!Number.isInteger(extraAttempts) || extraAttempts < 0 || extraAttempts > 10) {
    throw badRequest('额外答题次数必须在 0~10 之间');
  }
  if (note.length > 255) throw badRequest('备注不能超过 255 个字符');

  const existing = await exceptionsRepo.findByExamAndUser(examId, userId);
  const payload = { extraMinutes, extraAttempts, exempt, note };
  if (existing) {
    await exceptionsRepo.updateByExamAndUser(examId, userId, payload);
  } else {
    await exceptionsRepo.insert({
      id: genId('exc-'),
      examId,
      userId,
      ...payload,
      createdBy: operatorId,
      createdAt: nowDb(),
    });
  }
  const saved = await exceptionsRepo.findByExamAndUser(examId, userId);

  await auditService.record({
    actorId: operatorId,
    action: 'exam.exception_update',
    targetType: 'exam',
    targetId: examId,
    targetName: exam.name,
    detail: { userId, userName: user.name, extraMinutes, extraAttempts, exempt, note },
  });

  return mapException(saved!);
}

/** 删除一条特殊安排（admin）。 */
export async function removeException(examId: string, userId: string, operatorId: string): Promise<void> {
  const exam = await repo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const existing = await exceptionsRepo.findByExamAndUser(examId, userId);
  if (!existing) throw notFound('该考生没有特殊安排');
  await exceptionsRepo.removeByExamAndUser(examId, userId);
  await auditService.record({
    actorId: operatorId,
    action: 'exam.exception_update',
    targetType: 'exam',
    targetId: examId,
    targetName: exam.name,
    detail: { userId, userName: existing.user_name, removed: true },
  });
}

/* ============================ 实时考试监控（v1.7④ T3，admin） ============================ */

interface RosterUser {
  id: string;
  username: string;
  name: string;
  departmentName: string;
}

/** 由考生信息 + 最新作答行构造监考明细行。 */
function buildMonitorRow(
  user: RosterUser,
  record: MonitorRecordRow | undefined,
  exam: ExamDto,
  nowMs: number,
): ExamMonitorRowDto {
  const extraMinutes = record ? Number(record.extra_minutes ?? 0) : 0;
  const cheatEvents = parseJsonColumn<CheatEvent[]>(record?.cheat_events, []);
  const cheatSeconds = cheatEvents.reduce((s, e) => s + (Number(e.awaySeconds) || 0), 0);

  const status: MonitorStatus = record ? record.status : 'not_started';
  let remainingSeconds = 0;
  if (record && status === 'in_progress') {
    const startedMs = new Date(fromDbDateSafe(record.started_at)).getTime();
    const endMs = new Date(exam.endTime).getTime();
    // 交卷截止 = min(开考 + 时长 + 加时, 考试结束时间)
    const deadline = Math.min(startedMs + (exam.durationMinutes + extraMinutes) * 60_000, endMs);
    remainingSeconds = Math.max(0, Math.round((deadline - nowMs) / 1000));
  }

  return {
    userId: user.id,
    username: user.username,
    userName: user.name,
    departmentName: user.departmentName,
    status,
    attemptNo: record ? Number(record.attempt_no) : 0,
    startedAt: record ? fromDbDateSafe(record.started_at) : '',
    submittedAt: record && record.submitted_at ? fromDbDateSafe(record.submitted_at) : '',
    remainingSeconds,
    extraMinutes,
    cheatCount: cheatEvents.length,
    cheatSeconds,
    score: record ? Number(record.score) : 0,
    autoSubmitted: Boolean(record && Number(record.auto_submitted)),
    recordId: record?.id ?? '',
  };
}

/** 该行是否命中切屏异常阈值（与前端「切屏审查」口径一致）。 */
function isCheatWarned(
  row: ExamMonitorRowDto,
  settings: { cheatCountThreshold: number; cheatSecondsThreshold: number },
): boolean {
  return row.cheatCount >= settings.cheatCountThreshold || row.cheatSeconds >= settings.cheatSecondsThreshold;
}

/**
 * 监考大屏数据（并集口径）：
 *  - 花名册 = 考试所选科室（含子树）的 examinee 账号全员；
 *  - 叠加「有作答记录但已不在花名册」的考生（如调动科室），保证不漏监考。
 * 剩余时间由服务端按 `min(开考 + 时长 + 加时, 考试结束)` 计算，前端仅展示。
 */
export async function getMonitor(examId: string): Promise<ExamMonitorDto> {
  const examRow = await repo.findById(examId);
  if (!examRow) throw notFound('考试不存在或已被删除');
  const exam = mapExamRow(examRow);
  const settings = await getSettings();

  const expanded = await departmentsService.expandDepartmentIds(exam.departmentIds);
  const [roster, recordRows] = await Promise.all([
    usersRepo.listByDepartmentsAndRole(expanded, 'examinee'),
    monitorRepo.listLatestByExam(examId),
  ]);

  const recordMap = new Map<string, MonitorRecordRow>();
  for (const r of recordRows) recordMap.set(r.user_id, r);

  const nowMs = Date.now();
  const rows: ExamMonitorRowDto[] = [];
  const seen = new Set<string>();
  for (const u of roster) {
    seen.add(u.id);
    rows.push(buildMonitorRow(u, recordMap.get(u.id), exam, nowMs));
  }
  for (const r of recordRows) {
    if (seen.has(r.user_id)) continue;
    rows.push(
      buildMonitorRow(
        {
          id: r.user_id,
          username: r.username ?? '',
          name: r.user_name ?? '',
          departmentName: r.department_name ?? '',
        },
        r,
        exam,
        nowMs,
      ),
    );
  }

  // 排序：进行中（剩余少的在前）→ 未开始 → 待阅卷 → 已交卷
  const order: Record<MonitorStatus, number> = {
    in_progress: 0,
    not_started: 1,
    pending_review: 2,
    submitted: 3,
  };
  rows.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === 'in_progress') return a.remainingSeconds - b.remainingSeconds;
    return a.userName.localeCompare(b.userName, 'zh-CN');
  });

  const summary: ExamMonitorSummaryDto = {
    total: rows.length,
    notStarted: rows.filter((r) => r.status === 'not_started').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
    submitted: rows.filter((r) => r.status === 'submitted').length,
    pendingReview: rows.filter((r) => r.status === 'pending_review').length,
    cheatWarned: rows.filter((r) => isCheatWarned(r, settings)).length,
    averageScore: 0,
  };
  const scored = rows.filter((r) => r.status === 'submitted');
  if (scored.length > 0) {
    const sum = scored.reduce((s, r) => s + r.score, 0);
    summary.averageScore = Math.round((sum / scored.length) * 10) / 10;
  }

  return { exam, summary, rows, generatedAt: new Date().toISOString() };
}

/**
 * 监考加时（admin）：在既有特殊安排上累加分钟数（沿用 exam_exceptions.extra_minutes）。
 * 加时上限 600 分钟；无安排则新建一条。
 */
export async function extendTime(
  examId: string,
  userId: string,
  minutes: number,
  operatorId: string,
): Promise<ExamExceptionDto> {
  const exam = await repo.findById(examId);
  if (!exam) throw notFound('考试不存在或已被删除');
  const user = await usersRepo.findById(userId);
  if (!user) throw notFound('考生不存在或已被删除');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    throw badRequest('加时分钟数必须在 1~600 之间');
  }

  const existing = await exceptionsRepo.findByExamAndUser(examId, userId);
  const prevExtra = existing ? Number(existing.extra_minutes) : 0;
  const nextExtra = prevExtra + minutes;
  if (nextExtra > 600) throw badRequest('累计加时不能超过 600 分钟');

  const payload = {
    extraMinutes: nextExtra,
    extraAttempts: existing ? Number(existing.extra_attempts) : 0,
    exempt: existing ? Boolean(Number(existing.exempt)) : false,
    note: existing?.note ?? '',
  };
  if (existing) {
    await exceptionsRepo.updateByExamAndUser(examId, userId, payload);
  } else {
    await exceptionsRepo.insert({
      id: genId('exc-'),
      examId,
      userId,
      ...payload,
      createdBy: operatorId,
      createdAt: nowDb(),
    });
  }
  const saved = await exceptionsRepo.findByExamAndUser(examId, userId);

  await auditService.record({
    actorId: operatorId,
    action: 'exam.extend_time',
    targetType: 'exam',
    targetId: examId,
    targetName: exam.name,
    detail: { userId, userName: user.name, addedMinutes: minutes, totalExtraMinutes: nextExtra },
  });

  return mapException(saved!);
}
