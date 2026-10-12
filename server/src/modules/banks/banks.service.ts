/**
 * 题库模块 —— 业务逻辑层。
 * 删除策略（§3.3）：无题直接删；有题须 cascade=true，且由 service 在事务内先删题再删库。
 */
import * as repo from './banks.repo.js';
import type { BankRowWithCount } from './banks.repo.js';
import { withTransaction } from '../../db/pool.js';
import { conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import type { BankDetailDto, BankDto } from '../../types/domain.js';

/** 行 → 列表 DTO。 */
function mapRow(row: BankRowWithCount): BankDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    allowPractice: Boolean(Number(row.allow_practice)),
    createdBy: row.created_by,
    createdAt: fromDbDateSafe(row.created_at),
    questionCount: Number(row.question_count ?? 0),
  };
}

/** 题库列表。 */
export async function list(filter: { category?: string; keyword?: string }): Promise<BankDto[]> {
  const rows = await repo.list(filter);
  return rows.map(mapRow);
}

/** 题库详情（含被引用统计）。 */
export async function getById(id: string): Promise<BankDetailDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('题库不存在或已被删除');
  const { referencedQuestionCount, referencedPaperCount } = await repo.countReferences(id);
  return { ...mapRow(row), referencedQuestionCount, referencedPaperCount };
}

/** 新建题库。 */
export async function create(
  input: { name: string; description?: string; category?: string; allowPractice?: boolean },
  operatorId: string,
): Promise<BankDto> {
  const id = genId('bank-');
  await repo.insert({
    id,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    category: input.category?.trim() || '未分类',
    allowPractice: input.allowPractice === true,
    createdBy: operatorId,
    createdAt: nowDb(),
  });
  const created = await repo.findById(id);
  return mapRow(created!);
}

/** 编辑题库。 */
export async function update(
  id: string,
  input: { name: string; description?: string; category?: string; allowPractice?: boolean },
): Promise<BankDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');
  await repo.update(id, {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    category: input.category?.trim() || '未分类',
    allowPractice: input.allowPractice === true,
  });
  const updated = await repo.findById(id);
  return mapRow(updated!);
}

/**
 * 删除题库。
 * @param cascade 是否连同试题一起删除（`?cascade=true`）
 */
export async function remove(id: string, cascade: boolean): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');

  const questionCount = await repo.countQuestions(id);
  if (questionCount === 0) {
    await repo.remove(id);
    return;
  }

  if (!cascade) {
    const { referencedQuestionCount, referencedPaperCount } = await repo.countReferences(id);
    throw conflict(
      `该题库下存在 ${questionCount} 道试题（其中 ${referencedQuestionCount} 道已被 ${referencedPaperCount} 份试卷引用），如需删除请确认级联`,
    );
  }

  // 级联：事务内先删题再删库（questions.bank_id 为 RESTRICT，须显式先删）
  await withTransaction(async (conn) => {
    await repo.deleteQuestionsByBank(id, conn);
    await repo.remove(id, conn);
  });
}
