/**
 * 考试模块 —— 业务逻辑层。
 * 考试状态不落库，由时间窗实时推导（getExamStatus）；考生端做科室隔离。
 */
import * as repo from './exams.repo.js';
import { mapExamRow } from './exams.mapper.js';
import * as papersRepo from '../papers/papers.repo.js';
import * as recordsRepo from '../records/records.repo.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, toDbDate } from '../../utils/datetime.js';
import type { ExamDto, ExamMyDto, RecordStatus } from '../../types/domain.js';

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
}): Promise<{
  name: string;
  paperId: string;
  departmentIds: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  passScore: number;
  maxAttempts: number;
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

/** 考生可见考试（科室隔离）+ 本人作答状态与已交卷次数。 */
export async function listForExaminee(userId: string, departmentId: string): Promise<ExamMyDto[]> {
  if (!departmentId) return [];
  const [rows, records] = await Promise.all([
    repo.listForDepartment(departmentId),
    recordsRepo.listByUser(userId),
  ]);

  // recordStatus：存在进行中记录则优先返回 in_progress，否则取已交卷；attemptsUsed = 已交卷记录数
  const statusMap = new Map<string, RecordStatus>();
  const usedMap = new Map<string, number>();
  for (const r of records) {
    if (r.status === 'submitted') {
      usedMap.set(r.exam_id, (usedMap.get(r.exam_id) ?? 0) + 1);
      if (!statusMap.has(r.exam_id)) statusMap.set(r.exam_id, 'submitted');
    }
  }
  for (const r of records) {
    if (r.status === 'in_progress') statusMap.set(r.exam_id, 'in_progress');
  }

  return rows.map((row) => {
    const dto = mapExamRow(row);
    return {
      ...dto,
      recordStatus: statusMap.get(dto.id) ?? null,
      attemptsUsed: usedMap.get(dto.id) ?? 0,
    };
  });
}

/** 新建考试。 */
export async function create(input: Parameters<typeof validateExamInput>[0], operatorId: string): Promise<ExamDto> {
  const data = await validateExamInput(input);
  const id = genId('exam-');
  await repo.insert({ id, ...data, createdBy: operatorId, createdAt: nowDb() });
  const created = await repo.findById(id);
  return mapExamRow(created!);
}

/** 编辑考试。 */
export async function update(id: string, input: Parameters<typeof validateExamInput>[0]): Promise<ExamDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('考试不存在或已被删除');
  const data = await validateExamInput(input);
  await repo.update(id, data);
  const updated = await repo.findById(id);
  return mapExamRow(updated!);
}

/** 删除考试（已有成绩记录 → 1005）。 */
export async function remove(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('考试不存在或已被删除');
  const recordCount = await repo.countRecords(id);
  if (recordCount > 0) {
    throw conflict('该考试已存在成绩记录，无法删除');
  }
  await repo.remove(id);
}
