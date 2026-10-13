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
import { parseJsonColumn } from '../../utils/json.js';
import type { Page, QuestionDto, QuestionType, RubricBand } from '../../types/domain.js';

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
  tags: string[];
  rubric: RubricBand[];
}

/** 知识点标签上限与单个标签长度上限（v1.7②）。 */
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;

/** 评分细则上限（v1.7③ S1）。 */
const MAX_RUBRIC_BANDS = 10;
const MAX_RUBRIC_LABEL = 32;
const MAX_RUBRIC_DESC = 200;

/** 标签归一化：trim → 去空 → 去重 → 截断长度 → 限个数。 */
function normalizeTags(raw?: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item ?? '').trim().slice(0, MAX_TAG_LEN);
    if (!t) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * 评分细则归一化（v1.7③ S1）：仅简答题保留；
 * 分值合法（0~MAX_SCORE）→ 同分去重 → 按分值降序 → 最多 10 档。
 */
function normalizeRubric(raw: unknown, type: QuestionType): RubricBand[] {
  if (type !== 'short' || !Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: RubricBand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const band = item as Record<string, unknown>;
    const score = Number(band.score);
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) continue;
    const rounded = Math.round(score * 10) / 10;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    out.push({
      score: rounded,
      label: String(band.label ?? '').trim().slice(0, MAX_RUBRIC_LABEL),
      description: String(band.description ?? '').trim().slice(0, MAX_RUBRIC_DESC),
    });
    if (out.length >= MAX_RUBRIC_BANDS) break;
  }
  return out.sort((a, b) => b.score - a.score);
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
  tags?: string[];
  rubric?: unknown;
}): NormalizedQuestion {
  const stem = String(input.stem ?? '').trim();
  if (!stem) throw badRequest('题干不能为空');

  const type = input.type;
  const tags = normalizeTags(input.tags);
  const rubric = normalizeRubric(input.rubric, type);

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
    return {
      type,
      stem,
      options: [],
      answer,
      defaultScore: normalizeScore(input.defaultScore),
      analysis,
      subject,
      tags,
      rubric,
    };
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

  return {
    type,
    stem,
    options,
    answer,
    defaultScore: normalizeScore(input.defaultScore),
    analysis,
    subject,
    tags,
    rubric: [], // 评分细则仅简答题可用
  };
}

/** 题库内试题列表（筛选 + 分页；author 需授权）。 */
export async function listByBank(
  bankId: string,
  filter: {
    type?: QuestionType;
    subject?: string;
    tag?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  },
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
    tag: filter.tag,
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
    tag?: string;
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
    tag: filter.tag,
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

/** 全部知识点标签（去重排序，可限定题库集合；author 限定到被授权题库，v1.7②）。 */
export async function listTags(bankIds?: string[], operator?: Operator): Promise<string[]> {
  const accessible = operator ? await resolveAccessibleBankIds(bankIds, operator) : bankIds;
  return repo.listTags(accessible && accessible.length > 0 ? accessible : undefined);
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
    tags?: string[];
    rubric?: unknown;
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
    tags?: string[];
    rubric?: unknown;
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

/* ============================ 批量编辑（v1.7②） ============================ */

/** 单次批量编辑的题目数上限。 */
const MAX_BATCH = 500;

/** 批量编辑入参：仅修改显式提供的字段。 */
export interface BatchEditInput {
  ids: string[];
  /** 目标科目（省略 = 不改） */
  subject?: string;
  /** 知识点标签（省略 = 不改；tagsMode=append 时与现有标签合并去重） */
  tags?: string[];
  /** 标签写入模式：append（追加，默认）/ replace（覆盖） */
  tagsMode?: 'append' | 'replace';
  /** 目标默认分值（省略 = 不改；校验 > 0） */
  defaultScore?: number;
}

/**
 * 批量编辑试题（科目 / 知识点标签 / 默认分值）。
 * - 仅修改显式传入的字段，未传字段保持原值（题干、选项、答案等一律不动）；
 * - author 需对其归属题库授权（逐题校验，任一无权即整体失败）；
 * - 标签追加模式按题读取现有标签后再合并去重（保序）。
 * @returns 实际更新条数
 */
export async function batchEdit(
  input: BatchEditInput,
  operator: Operator,
): Promise<{ updated: number }> {
  const ids = [...new Set((input.ids ?? []).map((s) => String(s ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) throw badRequest('请至少选择一道试题');
  if (ids.length > MAX_BATCH) throw badRequest(`单次最多批量编辑 ${MAX_BATCH} 道试题`);

  const rows = await repo.findByIds(ids);
  if (rows.length !== ids.length) throw notFound('部分试题不存在或已被删除');
  for (const row of rows) {
    await bankAuth.assertBankAccess(row.bank_id, operator);
  }

  const hasSubject = input.subject !== undefined;
  const hasTags = input.tags !== undefined;
  const hasScore = input.defaultScore !== undefined;
  if (!hasSubject && !hasTags && !hasScore) {
    throw badRequest('请至少选择一个要修改的字段');
  }

  const nextSubject = hasSubject ? String(input.subject ?? '').trim() || '未分类' : undefined;
  const nextScore = hasScore ? normalizeScore(input.defaultScore) : undefined;
  const nextTags = hasTags ? normalizeTags(input.tags) : undefined;
  const mode: 'append' | 'replace' = input.tagsMode === 'replace' ? 'replace' : 'append';

  for (const row of rows) {
    const currentTags = parseJsonColumn<string[]>(row.tags, []);
    const mergedTags =
      nextTags === undefined
        ? currentTags
        : mode === 'append'
          ? normalizeTags([...currentTags, ...nextTags])
          : nextTags;
    await repo.update(row.id, {
      bankId: row.bank_id,
      type: row.type,
      stem: row.stem,
      options: parseJsonColumn<string[]>(row.options, []),
      answer: parseJsonColumn<number[] | string[]>(row.answer, []),
      defaultScore: nextScore ?? Number(row.default_score),
      analysis: row.analysis ?? '',
      subject: nextSubject ?? row.subject,
      tags: mergedTags,
      rubric: parseJsonColumn<RubricBand[]>(row.rubric, []),
    });
  }

  return { updated: rows.length };
}
