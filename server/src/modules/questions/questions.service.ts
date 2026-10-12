/**
 * 试题模块 —— 业务逻辑层。
 * 校验与归一化规则照搬 v1.0 `src/services/questionService.ts`（错误文案中文）。
 */
import * as repo from './questions.repo.js';
import * as banksRepo from '../banks/banks.repo.js';
import { mapQuestionRow } from './question.mapper.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import type { Page, QuestionDto, QuestionType } from '../../types/domain.js';

/** 选项数量上下限（判断题固定 2 项，不受上限约束）。 */
const MAX_OPTIONS = 6;
/** 分值上限。 */
const MAX_SCORE = 9999;
/** 判断题固定选项。 */
const JUDGE_OPTIONS = ['正确', '错误'];

/** 试题入参（新建/编辑/导入共用）。 */
export interface NormalizedQuestion {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: number[];
  defaultScore: number;
  analysis: string;
  subject: string;
}

/**
 * 校验并归一化试题入参。
 * 与 v1.0 `questionService.save` 规则一致：题干非空；选项去空非空、≥2 且 ≤6；
 * 判断题强制两选项；答案去重升序；单选/判断恰 1 个、多选 ≥2 个；索引不越界；分值 > 0 且 ≤ 9999。
 * 失败抛 AppError(1001)。
 */
export function normalizeQuestion(input: {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer?: number[];
  defaultScore?: number;
  analysis?: string;
  subject?: string;
}): NormalizedQuestion {
  const stem = String(input.stem ?? '').trim();
  if (!stem) throw badRequest('题干不能为空');

  const type = input.type;
  const rawOptions = Array.isArray(input.options) ? input.options.map((o) => String(o).trim()) : [];

  let options: string[];
  if (type === 'judge') {
    // 判断题选项强制为 ['正确','错误']
    options = [...JUDGE_OPTIONS];
  } else {
    if (rawOptions.some((o) => !o)) throw badRequest('选项内容不能为空');
    if (rawOptions.length < 2) throw badRequest('至少需要两个选项');
    if (rawOptions.length > MAX_OPTIONS) throw badRequest(`选项最多不能超过 ${MAX_OPTIONS} 个`);
    options = rawOptions;
  }

  const answer = [...new Set((Array.isArray(input.answer) ? input.answer : []).map((n) => Number(n)))]
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  if (answer.length === 0) throw badRequest('请设置正确答案');
  if (type !== 'multiple' && answer.length !== 1) {
    throw badRequest('单选题/判断题只能设置一个正确答案');
  }
  if (type === 'multiple' && answer.length < 2) {
    throw badRequest('多选题至少设置两个正确答案');
  }
  if (answer.some((i) => i < 0 || i >= options.length)) {
    throw badRequest('正确答案的选项索引越界');
  }

  const defaultScore = Number(input.defaultScore ?? 10);
  if (!Number.isFinite(defaultScore) || defaultScore <= 0) throw badRequest('分值必须为正数');
  if (defaultScore > MAX_SCORE) throw badRequest(`分值不能超过 ${MAX_SCORE}`);

  const analysis = String(input.analysis ?? '').trim();
  const subject = String(input.subject ?? '').trim() || '未分类';

  return { type, stem, options, answer, defaultScore, analysis, subject };
}

/** 题库内试题列表（筛选 + 分页）。 */
export async function listByBank(
  bankId: string,
  filter: { type?: QuestionType; subject?: string; keyword?: string; page?: number; pageSize?: number },
): Promise<Page<QuestionDto>> {
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  const paging = normalizePaging(filter.page, filter.pageSize);
  const queryFilter = {
    bankId,
    type: filter.type,
    subject: filter.subject,
    keyword: filter.keyword,
  };
  const [rows, total] = await Promise.all([
    repo.listFiltered(queryFilter, paging),
    repo.countFiltered(queryFilter),
  ]);
  return buildPage(rows.map(mapQuestionRow), total, paging.page, paging.pageSize);
}

/** 全局试题池列表（组卷用，可传 bankIds）。 */
export async function listGlobal(filter: {
  bankIds?: string[];
  type?: QuestionType;
  subject?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<Page<QuestionDto>> {
  const paging = normalizePaging(filter.page, filter.pageSize);
  const queryFilter = {
    bankIds: filter.bankIds,
    type: filter.type,
    subject: filter.subject,
    keyword: filter.keyword,
  };
  const [rows, total] = await Promise.all([
    repo.listFiltered(queryFilter, paging),
    repo.countFiltered(queryFilter),
  ]);
  return buildPage(rows.map(mapQuestionRow), total, paging.page, paging.pageSize);
}

/** 全部科目（去重排序，可限定题库集合）。 */
export async function listSubjects(bankIds?: string[]): Promise<string[]> {
  return repo.listSubjects(bankIds && bankIds.length > 0 ? bankIds : undefined);
}

/** 新增试题（必须归属存在的题库）。 */
export async function create(
  input: {
    bankId?: string;
    type: QuestionType;
    stem: string;
    options?: string[];
    answer?: number[];
    defaultScore?: number;
    analysis?: string;
    subject?: string;
  },
  operatorId: string,
): Promise<QuestionDto> {
  const bankId = (input.bankId ?? '').trim();
  if (!bankId) throw badRequest('请选择归属题库');
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');

  const normalized = normalizeQuestion(input);
  const id = genId('q-');
  await repo.insert({ id, bankId, ...normalized, createdBy: operatorId, createdAt: nowDb() });
  const created = await repo.findById(id);
  return mapQuestionRow(created!);
}

/** 编辑试题（可改归属题库）。 */
export async function update(
  id: string,
  input: {
    bankId?: string;
    type: QuestionType;
    stem: string;
    options?: string[];
    answer?: number[];
    defaultScore?: number;
    analysis?: string;
    subject?: string;
  },
): Promise<QuestionDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试题不存在或已被删除');

  const bankId = (input.bankId ?? current.bank_id ?? '').trim();
  if (!bankId) throw badRequest('请选择归属题库');
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');

  const normalized = normalizeQuestion(input);
  await repo.update(id, { bankId, ...normalized });
  const updated = await repo.findById(id);
  return mapQuestionRow(updated!);
}

/** 删除试题（试卷引用关系由外键 CASCADE 连带移除，历史快照不受影响）。 */
export async function remove(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试题不存在或已被删除');
  await repo.remove(id);
}
