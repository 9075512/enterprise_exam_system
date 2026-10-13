/**
 * 试题模块 —— 业务逻辑层。
 * 校验与归一化规则照搬 v1.0 `src/services/questionService.ts`（错误文案中文）。
 */
import * as repo from './questions.repo.js';
import * as banksRepo from '../banks/banks.repo.js';
import * as bankAuth from '../banks/bankAuth.js';
import type { Operator } from '../banks/bankAuth.js';
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
  answer: number[] | string[];
  defaultScore: number;
  analysis: string;
  subject: string;
}

/** 分值归一（> 0 且 ≤ MAX_SCORE）。 */
function normalizeScore(raw: unknown): number {
  const defaultScore = Number(raw ?? 10);
  if (!Number.isFinite(defaultScore) || defaultScore <= 0) throw badRequest('分值必须为正数');
  if (defaultScore > MAX_SCORE) throw badRequest(`分值不能超过 ${MAX_SCORE}`);
  return defaultScore;
}

/**
 * 校验并归一化试题入参。
 * 客观题（单选/多选/判断）规则与 v1.0 一致；填空/简答为文本答案、无选项。
 */
export function normalizeQuestion(input: {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer?: Array<number | string>;
  defaultScore?: number;
  analysis?: string;
  subject?: string;
}): NormalizedQuestion {
  const stem = String(input.stem ?? '').trim();
  if (!stem) throw badRequest('题干不能为空');

  const type = input.type;

  // 填空 / 简答：无选项，答案为文本数组
  if (type === 'fill' || type === 'short') {
    const answer = (Array.isArray(input.answer) ? input.answer : [])
      .map((a) => String(a ?? '').trim())
      .filter((s) => s !== '');
    if (answer.length === 0) {
      throw badRequest(type === 'fill' ? '请填写每空的参考答案' : '请填写参考答案');
    }
    const analysis = String(input.analysis ?? '').trim();
    const subject = String(input.subject ?? '').trim() || '未分类';
    return { type, stem, options: [], answer, defaultScore: normalizeScore(input.defaultScore), analysis, subject };
  }

  // 客观题（single / multiple / judge）
  const rawOptions = Array.isArray(input.options) ? input.options.map((o) => String(o).trim()) : [];
  let options: string[];
  if (type === 'judge') {
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

  const analysis = String(input.analysis ?? '').trim();
  const subject = String(input.subject ?? '').trim() || '未分类';

  return { type, stem, options, answer, defaultScore: normalizeScore(input.defaultScore), analysis, subject };
}

/** 题库内试题列表（筛选 + 分页；author 需授权）。 */
export async function listByBank(
  bankId: string,
  filter: { type?: QuestionType; subject?: string; keyword?: string; page?: number; pageSize?: number },
  operator: Operator,
): Promise<Page<QuestionDto>> {
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(bankId, operator);
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

/** 全局试题池列表（组卷用，可传 bankIds；author 限定到被授权题库）。 */
export async function listGlobal(
  filter: {
    bankIds?: string[];
    type?: QuestionType;
    subject?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  },
  operator: Operator,
): Promise<Page<QuestionDto>> {
  const paging = normalizePaging(filter.page, filter.pageSize);
  const bankIds = await resolveAccessibleBankIds(filter.bankIds, operator);
  const queryFilter = {
    bankIds,
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

/** 全部科目（去重排序，可限定题库集合；author 限定到被授权题库）。 */
export async function listSubjects(bankIds?: string[], operator?: Operator): Promise<string[]> {
  const accessible = operator ? await resolveAccessibleBankIds(bankIds, operator) : bankIds;
  return repo.listSubjects(accessible && accessible.length > 0 ? accessible : undefined);
}

/**
 * 计算「给定题库集合 ∩ 操作者可见题库」。
 * admin 返回原集合（无限制）；author 返回与授权题库的交集（未指定时 = 全部授权题库）。
 */
async function resolveAccessibleBankIds(
  bankIds: string[] | undefined,
  operator: Operator,
): Promise<string[] | undefined> {
  const accessible = await bankAuth.listAccessibleBankIds(operator);
  if (accessible === null) return bankIds;
  if (!bankIds || bankIds.length === 0) return accessible;
  return bankIds.filter((id) => accessible.includes(id));
}

/** 新增试题（必须归属存在的题库；author 需授权）。 */
export async function create(
  input: {
    bankId?: string;
    type: QuestionType;
    stem: string;
    options?: string[];
    answer?: Array<number | string>;
    defaultScore?: number;
    analysis?: string;
    subject?: string;
  },
  operator: Operator,
): Promise<QuestionDto> {
  const bankId = (input.bankId ?? '').trim();
  if (!bankId) throw badRequest('请选择归属题库');
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(bankId, operator);

  const normalized = normalizeQuestion(input);
  const id = genId('q-');
  await repo.insert({ id, bankId, ...normalized, createdBy: operator.id, createdAt: nowDb() });
  const created = await repo.findById(id);
  return mapQuestionRow(created!);
}

/** 编辑试题（可改归属题库；author 需对源/目标题库均授权）。 */
export async function update(
  id: string,
  input: {
    bankId?: string;
    type: QuestionType;
    stem: string;
    options?: string[];
    answer?: Array<number | string>;
    defaultScore?: number;
    analysis?: string;
    subject?: string;
  },
  operator: Operator,
): Promise<QuestionDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试题不存在或已被删除');
  await bankAuth.assertBankAccess(current.bank_id, operator);

  const bankId = (input.bankId ?? current.bank_id ?? '').trim();
  if (!bankId) throw badRequest('请选择归属题库');
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  if (bankId !== current.bank_id) {
    await bankAuth.assertBankAccess(bankId, operator);
  }

  const normalized = normalizeQuestion(input);
  await repo.update(id, { bankId, ...normalized });
  const updated = await repo.findById(id);
  return mapQuestionRow(updated!);
}

/** 删除试题（author 需授权其归属题库；试卷引用关系由外键 CASCADE 连带移除，历史快照不受影响）。 */
export async function remove(id: string, operator: Operator): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试题不存在或已被删除');
  await bankAuth.assertBankAccess(current.bank_id, operator);
  await repo.remove(id);
}
