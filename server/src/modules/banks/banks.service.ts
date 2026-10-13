/**
 * 题库模块 —— 业务逻辑层。
 * 删除策略（§3.3）：无题直接删；有题须 cascade=true，且由 service 在事务内先删题再删库。
 * v1.6③：author 仅能管理被授权题库（列表隔离 + 写操作校验，见 bankAuth.ts）。
 */
import * as repo from './banks.repo.js';
import * as bankAuthorsRepo from './bankAuthors.repo.js';
import * as bankAuth from './bankAuth.js';
import type { Operator } from './bankAuth.js';
import * as usersRepo from '../users/users.repo.js';
import type { BankRowWithCount } from './banks.repo.js';
import type { BankAuthorRow } from './bankAuthors.repo.js';
import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import * as auditService from '../audit/audit.service.js';
import type { BankDetailDto, BankDto } from '../../types/domain.js';

/** 行 → 基础 DTO（authorIds/authorNames 由 attachAuthors 补充）。 */
function mapRow(row: BankRowWithCount): Omit<BankDto, 'authorIds' | 'authorNames'> {
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

/** 为 DTO 批量挂接授权出题人（id + 姓名）。 */
function attachAuthors(
  dtos: Array<Omit<BankDto, 'authorIds' | 'authorNames'>>,
  authorMap: Map<string, BankAuthorRow[]>,
): BankDto[] {
  return dtos.map((d) => {
    const rows = authorMap.get(d.id) ?? [];
    return {
      ...d,
      authorIds: rows.map((r) => r.user_id),
      authorNames: rows.map((r) => r.name),
    };
  });
}

/** 校验授权出题人 id 均为存在的 author 角色账号。 */
async function assertAuthorsValid(authorIds: string[]): Promise<string[]> {
  const unique = [...new Set(authorIds.map((s) => s.trim()).filter(Boolean))];
  for (const id of unique) {
    const u = await usersRepo.findById(id);
    if (!u || u.role !== 'author') {
      throw badRequest('授权出题人不存在或角色不是出题人');
    }
  }
  return unique;
}

/** 题库列表（admin 全量；author 仅返回被授权题库）。 */
export async function list(
  filter: { category?: string; keyword?: string },
  operator: Operator,
): Promise<BankDto[]> {
  const rows = await repo.list(filter);
  const accessible = await bankAuth.listAccessibleBankIds(operator);
  const visible = accessible === null ? rows : rows.filter((r) => accessible.includes(r.id));
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks(visible.map((r) => r.id));
  return attachAuthors(visible.map(mapRow), authorMap);
}

/** 题库详情（含被引用统计；author 需授权）。 */
export async function getById(id: string, operator: Operator): Promise<BankDetailDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(id, operator);
  const { referencedQuestionCount, referencedPaperCount } = await repo.countReferences(id);
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks([id]);
  const [dto] = attachAuthors([mapRow(row)], authorMap);
  return { ...dto, referencedQuestionCount, referencedPaperCount };
}

/** 新建题库（admin 按入参设置授权出题人；author 自动成为授权出题人）。 */
export async function create(
  input: { name: string; description?: string; category?: string; allowPractice?: boolean; authorIds?: string[] },
  operator: Operator,
): Promise<BankDto> {
  const id = genId('bank-');
  await repo.insert({
    id,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    category: input.category?.trim() || '未分类',
    allowPractice: input.allowPractice === true,
    createdBy: operator.id,
    createdAt: nowDb(),
  });

  // 授权出题人：admin 按入参设置；author 自动授权自己
  if (bankAuth.isAdmin(operator)) {
    const authorIds = await assertAuthorsValid(input.authorIds ?? []);
    await bankAuthorsRepo.setAuthors(id, authorIds);
  } else {
    await bankAuthorsRepo.addAuthor(id, operator.id);
  }

  const created = await repo.findById(id);
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks([id]);
  const [dto] = attachAuthors([mapRow(created!)], authorMap);
  await auditService.record({
    actorId: operator.id,
    action: 'bank.create',
    targetType: 'bank',
    targetId: dto.id,
    targetName: dto.name,
    detail: { category: dto.category },
  });
  return dto;
}

/** 编辑题库（author 需授权；仅 admin 可调整授权出题人）。 */
export async function update(
  id: string,
  input: { name: string; description?: string; category?: string; allowPractice?: boolean; authorIds?: string[] },
  operator: Operator,
): Promise<BankDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(id, operator);

  await repo.update(id, {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    category: input.category?.trim() || '未分类',
    allowPractice: input.allowPractice === true,
  });

  // 仅 admin 可调整授权出题人；author 编辑时保持原授权不变
  if (bankAuth.isAdmin(operator) && input.authorIds !== undefined) {
    const authorIds = await assertAuthorsValid(input.authorIds);
    await bankAuthorsRepo.setAuthors(id, authorIds);
  }

  const updated = await repo.findById(id);
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks([id]);
  const [dto] = attachAuthors([mapRow(updated!)], authorMap);
  await auditService.record({
    actorId: operator.id,
    action: 'bank.update',
    targetType: 'bank',
    targetId: dto.id,
    targetName: dto.name,
    detail: { category: dto.category },
  });
  return dto;
}

/**
 * 删除题库（author 需授权）。
 * @param cascade 是否连同试题一起删除（`?cascade=true`）
 */
export async function remove(id: string, cascade: boolean, operator: Operator): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(id, operator);

  const questionCount = await repo.countQuestions(id);
  if (questionCount === 0) {
    await withTransaction(async (conn) => {
      await bankAuthorsRepo.removeByBank(id, conn);
      await repo.remove(id, conn);
    });
    await auditService.record({
      actorId: operator.id,
      action: 'bank.delete',
      targetType: 'bank',
      targetId: id,
      targetName: current.name,
    });
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
    await bankAuthorsRepo.removeByBank(id, conn);
    await repo.remove(id, conn);
  });
  await auditService.record({
    actorId: operator.id,
    action: 'bank.delete',
    targetType: 'bank',
    targetId: id,
    targetName: current.name,
    detail: { cascade: true, questionCount },
  });
}

/**
 * 迁移试题到目标题库（P1-3）。
 * 题目 id 不变（paper_questions 引用不受影响），仅改归属题库。author 需源/目标题库均授权。
 */
export async function migrateQuestions(
  sourceBankId: string,
  input: { targetBankId: string; questionIds: string[] },
  operator: Operator,
): Promise<{ moved: number }> {
  if (input.targetBankId === sourceBankId) throw badRequest('目标题库不能与源题库相同');

  const [source, target] = await Promise.all([
    repo.findById(sourceBankId),
    repo.findById(input.targetBankId),
  ]);
  if (!source) throw notFound('源题库不存在或已被删除');
  if (!target) throw notFound('目标题库不存在或已被删除');
  await bankAuth.assertBankAccess(sourceBankId, operator);
  await bankAuth.assertBankAccess(input.targetBankId, operator);

  const ids = [...new Set(input.questionIds)];
  let moved = 0;
  await withTransaction(async (conn) => {
    moved = await repo.migrateQuestions(sourceBankId, input.targetBankId, ids, conn);
  });
  if (moved < ids.length) {
    throw badRequest(`仅迁移 ${moved}/${ids.length} 道试题，部分题目不属于该题库或不存在`);
  }
  await auditService.record({
    actorId: operator.id,
    action: 'bank.migrate',
    targetType: 'bank',
    targetId: sourceBankId,
    targetName: source.name,
    detail: { targetBankId: input.targetBankId, targetBankName: target.name, moved },
  });
  return { moved };
}
