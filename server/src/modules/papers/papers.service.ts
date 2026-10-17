/**
 * 试卷模块 —— 业务逻辑层。
 * 保存（新建/编辑）在单事务内完成 papers → paper_questions → paper_bank_refs 的整卷重写（§4.5 / PRD §6.2）。
 */
import * as repo from './papers.repo.js';
import type { PaperRow, PaperQuestionRow } from './papers.repo.js';
import * as questionRepo from '../questions/questions.repo.js';
import * as banksRepo from '../banks/banks.repo.js';
import * as bankAuth from '../banks/bankAuth.js';
import type { Operator } from '../banks/bankAuth.js';
import { mapQuestionRow } from '../questions/question.mapper.js';
import { withTransaction, type SqlExecutor } from '../../db/pool.js';
import { badRequest, conflict, notFound, forbidden } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { buildPaperPdfBuffer } from '../../utils/pdfExport.js';
import { getSettings } from '../settings/settings.service.js';
import type { PaperPdfQuestion } from '../../utils/pdfExport.js';
import type {
  DrawQuestionItem,
  DrawResult,
  DrawShortage,
  DrawTagShortage,
  PaperDetailDto,
  PaperDetailQuestionDto,
  PaperDto,
  PaperSnapshot,
  PaperSnapshotQuestion,
  QuestionType,
} from '../../types/domain.js';

/** 保留 1 位小数。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 题型展示顺序：单选 → 多选 → 判断 → 填空 → 简答（组卷页与答题页题号一致）。 */
const QUESTION_TYPE_ORDER: Record<QuestionType, number> = {
  single: 0,
  multiple: 1,
  judge: 2,
  fill: 3,
  short: 4,
};

/** 未识别题型（理论上不会出现）统一排在末尾。 */
const UNKNOWN_TYPE_ORDER = 9;

/**
 * 按题型（单选 → 多选 → 判断）稳定排序，题型内部保持原有相对顺序。
 * 写入（create/update）与读取（getById/getSnapshot）共用，保证存量数据无需重存也能有序。
 * @param items  待排序项
 * @param typeOf 由外部从题目对象解析题型（找不到返回 undefined）
 */
export function sortByQuestionType<T>(items: T[], typeOf: (item: T) => QuestionType | undefined): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const oa = typeOf(a.item);
      const ob = typeOf(b.item);
      const diff =
        (oa ? QUESTION_TYPE_ORDER[oa] : UNKNOWN_TYPE_ORDER) - (ob ? QUESTION_TYPE_ORDER[ob] : UNKNOWN_TYPE_ORDER);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** 试卷行 → 列表 DTO（questions 由调用方补充）。 */
function baseDto(p: PaperRow, bankIds: string[], bankNames: string[]): Omit<PaperDto, 'questions'> {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    totalScore: Number(p.total_score),
    createdBy: p.created_by,
    createdAt: fromDbDateSafe(p.created_at),
    bankIds,
    bankNames,
  };
}

/** 试卷列表（含来源题库 bankIds/bankNames；author 仅返回与授权题库有交集的试卷）。 */
export async function list(operator: Operator): Promise<PaperDto[]> {
  const papers = await repo.list();
  const accessible = await bankAuth.listAccessibleBankIds(operator);
  const result: PaperDto[] = [];
  for (const p of papers) {
    const [pqRows, bankIds] = await Promise.all([repo.listPaperQuestions(p.id), repo.listBankRefs(p.id)]);
    if (accessible !== null && !bankIds.every((id) => accessible.includes(id))) continue;
    const names = await repo.bankNamesByIds(bankIds);
    result.push({
      ...baseDto(p, bankIds, names.map((n) => n.name)),
      questions: pqRows.map((r) => ({ questionId: r.question_id, score: Number(r.score) })),
    });
  }
  return result;
}

/** 校验试卷来源题库对操作者可见（author 需至少有一个交集，否则视为无权查看）。 */
async function assertPaperVisible(bankIds: string[], operator: Operator): Promise<void> {
  const accessible = await bankAuth.listAccessibleBankIds(operator);
  if (accessible === null) return;
  if (!bankIds.every((id) => accessible.includes(id))) {
    throw forbidden('您没有该试卷的查看权限');
  }
}

/** 试卷详情（题目 + 来源题库 + 逐题来源题库；author 需授权）。 */
export async function getById(id: string, operator: Operator): Promise<PaperDetailDto> {
  const p = await repo.findById(id);
  if (!p) throw notFound('试卷不存在或已被删除');

  const pqRows = await repo.listPaperQuestions(id);
  const bankIds = await repo.listBankRefs(id);
  await assertPaperVisible(bankIds, operator);
  const names = await repo.bankNamesByIds(bankIds);
  const nameMap = new Map(names.map((n) => [n.id, n.name]));

  const qRows = await questionRepo.findByIds(pqRows.map((r) => r.question_id));
  const qMap = new Map(qRows.map((r) => [r.id, r]));
  // 实测正确率：供组卷页「难度系数（P 值）」评估（无练题作答 → null）
  const rateMap = await questionRepo.correctRateByQuestionIds(qRows.map((r) => r.id));

  // 兼容存量乱序数据：详情按题型（单选→多选→判断）稳定排序返回。
  const orderedRows = sortByQuestionType(pqRows, (r) => qMap.get(r.question_id)?.type);

  const questions: PaperDetailQuestionDto[] = [];
  for (const r of orderedRows) {
    const qr = qMap.get(r.question_id);
    if (!qr) continue; // 理论上不会发生（外键 CASCADE 保证一致性）
    const dto = mapQuestionRow(qr, rateMap.get(qr.id) ?? null);
    questions.push({
      questionId: r.question_id,
      score: Number(r.score),
      question: dto,
      bankId: dto.bankId,
      bankName: nameMap.get(dto.bankId) ?? '',
    });
  }

  return { ...baseDto(p, bankIds, names.map((n) => n.name)), questions };
}

/** 校验题库集合均存在。 */
async function assertBanksExist(bankIds: string[]): Promise<void> {
  for (const bankId of bankIds) {
    const bank = await banksRepo.findById(bankId);
    if (!bank) throw notFound('题库不存在或已被删除');
  }
}

/**
 * 校验试题均存在，并返回 questionId → 题型 映射与题目归属题库集合（供写入前排序与授权校验）。
 */
async function assertQuestionsExist(
  items: Array<{ questionId: string; score: number }>,
): Promise<{ types: Map<string, QuestionType>; bankIds: string[] }> {
  const ids = [...new Set(items.map((i) => i.questionId))];
  const rows = await questionRepo.findByIds(ids);
  const types = new Map<string, QuestionType>();
  const bankIds = new Set<string>();
  for (const r of rows) {
    types.set(r.id, r.type);
    bankIds.add(r.bank_id);
  }
  for (const id of ids) {
    if (!types.has(id)) throw notFound('试题不存在或已被删除');
  }
  return { types, bankIds: [...bankIds] };
}

/** 校验题库与试题归属题库均对操作者授权（author 隔离）。 */
async function assertComposeAccessible(
  bankIds: string[],
  questionBankIds: string[],
  operator: Operator,
): Promise<void> {
  await bankAuth.assertBanksAccess([...new Set([...bankIds, ...questionBankIds])], operator);
}

/** 新建试卷（单事务）。 */
export async function create(
  input: { name: string; description?: string; bankIds: string[]; questions: Array<{ questionId: string; score: number }> },
  operator: Operator,
): Promise<PaperDto> {
  if (input.bankIds.length === 0) throw badRequest('请至少选择一个题库');
  if (input.questions.length === 0) throw badRequest('试卷至少需要一道题目');
  if (input.questions.some((q) => !(q.score > 0))) throw badRequest('每题分值必须为正数');

  await assertBanksExist(input.bankIds);
  const { types: typeMap, bankIds: questionBankIds } = await assertQuestionsExist(input.questions);
  await assertComposeAccessible(input.bankIds, questionBankIds, operator);

  const id = genId('paper-');
  const totalScore = round1(input.questions.reduce((s, q) => s + q.score, 0));
  const createdAt = nowDb();
  const orderedQuestions = sortByQuestionType(input.questions, (q) => typeMap.get(q.questionId));

  await withTransaction(async (conn) => {
    await repo.insert(
      { id, name: input.name.trim(), description: input.description?.trim() ?? '', totalScore, createdBy: operator.id, createdAt },
      conn,
    );
    await repo.insertPaperQuestions(id, orderedQuestions, conn);
    await repo.insertBankRefs(id, input.bankIds, conn);
  });

  return getById(id, operator);
}

/** 编辑试卷（单事务：整卷重写）。 */
export async function update(
  id: string,
  input: { name: string; description?: string; bankIds: string[]; questions: Array<{ questionId: string; score: number }> },
  operator: Operator,
): Promise<PaperDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试卷不存在或已被删除');
  if (input.bankIds.length === 0) throw badRequest('请至少选择一个题库');
  if (input.questions.length === 0) throw badRequest('试卷至少需要一道题目');
  if (input.questions.some((q) => !(q.score > 0))) throw badRequest('每题分值必须为正数');

  await assertBanksExist(input.bankIds);
  const { types: typeMap, bankIds: questionBankIds } = await assertQuestionsExist(input.questions);
  await assertComposeAccessible(input.bankIds, questionBankIds, operator);

  const totalScore = round1(input.questions.reduce((s, q) => s + q.score, 0));
  const orderedQuestions = sortByQuestionType(input.questions, (q) => typeMap.get(q.questionId));

  await withTransaction(async (conn) => {
    await repo.update(id, { name: input.name.trim(), description: input.description?.trim() ?? '', totalScore }, conn);
    await repo.deletePaperQuestions(id, conn);
    await repo.insertPaperQuestions(id, orderedQuestions, conn);
    await repo.deleteBankRefs(id, conn);
    await repo.insertBankRefs(id, input.bankIds, conn);
  });

  return getById(id, operator);
}

/** 删除试卷（被考试引用 → 1005）。 */
export async function remove(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('试卷不存在或已被删除');
  const refCount = await repo.countExamRefs(id);
  if (refCount > 0) {
    throw conflict('该试卷已被考试引用，无法删除');
  }
  await repo.remove(id);
}

/**
 * 随机抽题（§4.5 draw-questions 契约，v1.7② 扩展按知识点配比）。
 * - 题型规则（single/multiple/judge）与标签规则（tagRules）可同时使用，先统一预检再抽取；
 * - 任一规则存量不足 → 不生成任何题目，返回 shortages / tagShortages（HTTP 200）；
 * - 多规则之间通过排除已抽中题目自动去重。
 */
export async function drawQuestions(
  input: {
    bankIds: string[];
    /** 抽题规则（仅客观题 single/multiple/judge 可随机抽；填空/简答需手动勾选） */
    rules: Partial<Record<QuestionType, { count: number; score: number }>>;
    /** 按知识点（标签）抽题规则（v1.7②） */
    tagRules?: Array<{ tag: string; count: number; score: number }>;
  },
  operator: Operator,
): Promise<DrawResult> {
  // author 仅能在被授权题库内抽题
  await bankAuth.assertBanksAccess(input.bankIds, operator);

  /** 归一化后的抽题计划项：题型规则与标签规则统一表示。 */
  interface PlanItem {
    kind: 'type' | 'tag';
    type?: QuestionType;
    tag?: string;
    count: number;
    score: number;
  }

  const types: QuestionType[] = ['single', 'multiple', 'judge'];
  const plan: PlanItem[] = [];
  for (const type of types) {
    const rule = input.rules[type];
    if (!rule || rule.count <= 0) continue;
    plan.push({ kind: 'type', type, count: rule.count, score: rule.score });
  }
  for (const rule of input.tagRules ?? []) {
    const tag = String(rule.tag ?? '').trim();
    if (!tag || rule.count <= 0) continue;
    plan.push({ kind: 'tag', tag, count: rule.count, score: rule.score });
  }

  // 阶段一：预检存量（不足则不抽任何题）
  const shortages: DrawShortage[] = [];
  const tagShortages: DrawTagShortage[] = [];
  for (const p of plan) {
    const available =
      p.kind === 'type'
        ? await questionRepo.countByType(input.bankIds, p.type!)
        : await questionRepo.countByTag(input.bankIds, p.tag!);
    if (available < p.count) {
      if (p.kind === 'type') shortages.push({ type: p.type!, required: p.count, available });
      else tagShortages.push({ tag: p.tag!, required: p.count, available });
    }
  }
  if (shortages.length > 0 || tagShortages.length > 0) {
    return { questions: [], shortages, tagShortages };
  }

  // 阶段二：逐规则抽取（排除已抽中题目，防跨规则重复）
  const questions: DrawQuestionItem[] = [];
  const drawnIds: string[] = [];
  for (const p of plan) {
    const rows =
      p.kind === 'type'
        ? await questionRepo.drawByType(input.bankIds, p.type!, p.count, drawnIds)
        : await questionRepo.drawByTag(input.bankIds, p.tag!, p.count, drawnIds);
    // 兜底：极端情况下（多规则重叠）抽取数不足，按契约整体作废
    if (rows.length < p.count) {
      if (p.kind === 'type') {
        shortages.push({ type: p.type!, required: p.count, available: rows.length });
      } else {
        tagShortages.push({ tag: p.tag!, required: p.count, available: rows.length });
      }
      return { questions: [], shortages, tagShortages };
    }
    for (const r of rows) {
      drawnIds.push(r.id);
      questions.push({ questionId: r.id, score: p.score, type: r.type, stem: r.stem, difficulty: r.difficulty ?? null });
    }
  }
  return { questions, shortages, tagShortages };
}

/* ============================ 试卷克隆（v1.7②） ============================ */

/**
 * 克隆试卷（复制题目、分值、来源题库；新卷归属当前操作者）。
 * author 需对来源题库全部有授权（沿用 create 的授权口径）。
 * @param id   源试卷 id
 * @param name 新试卷名称（省略 → 「原名（副本）」）
 */
export async function clonePaper(id: string, name: string | undefined, operator: Operator): Promise<PaperDto> {
  const detail = await getById(id, operator); // 内含存在性 + 授权校验
  const trimmed = (name ?? '').trim();
  const newName = (trimmed || `${detail.name}（副本）`).slice(0, 100);
  return create(
    {
      name: newName,
      description: detail.description,
      bankIds: [...detail.bankIds],
      questions: detail.questions.map((q) => ({ questionId: q.questionId, score: q.score })),
    },
    operator,
  );
}

/** 供外部复用的行类型导出（如测试）。 */
export type { PaperRow, PaperQuestionRow };/**
 * 生成试卷快照（冻结题目内容副本，供开考落库与判分使用）。
 * `options`/`answer` 做深拷贝，避免快照与被引用的题目对象共享。
 */
export async function getSnapshot(paperId: string, exec?: SqlExecutor): Promise<PaperSnapshot> {
  const p = await repo.findById(paperId, exec);
  if (!p) throw notFound('试卷不存在或已被删除');

  const pqRows = await repo.listPaperQuestions(paperId, exec);
  const qRows = await questionRepo.findByIds(pqRows.map((r) => r.question_id), exec);
  const qMap = new Map(qRows.map((r) => [r.id, r]));

  // 答题页题号顺序由快照决定：按题型（单选→多选→判断）稳定排序，存量试卷同样有序。
  const orderedRows = sortByQuestionType(pqRows, (r) => qMap.get(r.question_id)?.type);

  const questions: PaperSnapshotQuestion[] = [];
  for (const r of orderedRows) {
    const qr = qMap.get(r.question_id);
    if (!qr) continue; // 理论上不会发生
    const dto = mapQuestionRow(qr);
    questions.push({
      questionId: r.question_id,
      score: Number(r.score),
      question: { ...dto, options: [...dto.options], answer: [...dto.answer] as number[] | string[] },
    });
  }

  return {
    paperId: p.id,
    paperName: p.name,
    totalScore: Number(p.total_score),
    questions,
  };
}

/* ============================ 试卷 PDF 导出（v1.7①） ============================ */

/** 题型中文名（试卷排版用）。 */
const TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  fill: '填空',
  short: '简答',
};

/** 文件名安全化。 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/** 题目答案文本化：客观题转选项文本；填空按空拼接；简答取参考文本。 */
function answerTextOf(q: PaperDetailQuestionDto['question']): string {
  if (q.type === 'short') return (q.answer as string[])[0] ?? '';
  if (q.type === 'fill') return (q.answer as string[]).join(' / ');
  const indexes = q.answer as number[];
  return indexes.map((i) => q.options[i] ?? String(i + 1)).join('、');
}

/** 试卷 PDF 导出结果。 */
export interface PaperPdfResult {
  buffer: Buffer;
  filename: string;
  questionCount: number;
}

/**
 * 导出试卷为 PDF（考生版 / 答案版）。
 * 版面：标题 + 摘要（总分/题量/来源题库）+ 逐题（题干、选项、答案版附参考答案与解析）。
 * 权限沿用 getById（author 需被授权该试卷来源题库）。
 */
export async function exportPaperPdf(
  paperId: string,
  withAnswer: boolean,
  operator: Operator,
): Promise<PaperPdfResult> {
  const [detail, settings] = await Promise.all([getById(paperId, operator), getSettings()]);
  const questions: PaperPdfQuestion[] = detail.questions.map((item, i) => ({
    index: i + 1,
    typeLabel: TYPE_LABELS[item.question.type] ?? '未知',
    stem: item.question.stem,
    options: item.question.options,
    score: item.score,
    answerText: answerTextOf(item.question),
    analysis: item.question.analysis ?? '',
  }));

  const bankNames = detail.bankNames.filter(Boolean).join('、');
  const subtitle =
    `总分 ${detail.totalScore} 分 · 共 ${questions.length} 题` + (bankNames ? ` · 来源题库：${bankNames}` : '');
  const buffer = await buildPaperPdfBuffer({
    title: detail.name,
    subtitle,
    questions,
    withAnswer,
    footer: `本试卷由${settings.systemName}生成 · ${withAnswer ? '答案版（含参考答案与解析）' : '考生版'}`,
  });

  const filename = `${sanitizeFilename(detail.name)}-试卷-${withAnswer ? '答案版' : '考生版'}.pdf`;
  return { buffer, filename, questionCount: questions.length };
}

/** Prepare exam-owned content without starting a nested transaction. */
export async function prepareExamPaper(input: { bankIds: string[]; questions: Array<{ questionId: string; score: number }> }, operator: Operator) {
  if (!input.bankIds.length || !input.questions.length) throw badRequest('请选择来源题库并至少配置一道题目');
  if (new Set(input.questions.map(q => q.questionId)).size !== input.questions.length) throw badRequest('考试题目不能重复');
  if (input.questions.some(q => !Number.isFinite(q.score) || q.score <= 0)) throw badRequest('每题分值必须为正数');
  const bankIds = [...new Set(input.bankIds)];
  await assertBanksExist(bankIds);
  const { types, bankIds: questionBanks } = await assertQuestionsExist(input.questions);
  if (questionBanks.some(id => !bankIds.includes(id))) throw badRequest('所选题目必须属于来源题库');
  await assertComposeAccessible(bankIds, questionBanks, operator);
  return { bankIds, questions: sortByQuestionType(input.questions, q => types.get(q.questionId)), totalScore: round1(input.questions.reduce((n, q) => n + q.score, 0)) };
}

export async function writeExamPaper(id: string, name: string, data: Awaited<ReturnType<typeof prepareExamPaper>>, operator: Operator, exec: SqlExecutor, create = false): Promise<void> {
  if (create) await repo.insert({ id, name, description: '', totalScore: data.totalScore, createdBy: operator.id, createdAt: nowDb() }, exec);
  else {
    await repo.update(id, { name, description: '', totalScore: data.totalScore }, exec);
    await repo.deletePaperQuestions(id, exec);
    await repo.deleteBankRefs(id, exec);
  }
  await repo.insertPaperQuestions(id, data.questions, exec);
  await repo.insertBankRefs(id, data.bankIds, exec);
}
