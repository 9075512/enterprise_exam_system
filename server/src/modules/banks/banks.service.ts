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
import * as questionRepo from '../questions/questions.repo.js';
import * as departmentsService from '../departments/departments.service.js';
import type { BankRowWithCount } from './banks.repo.js';
import type { BankAuthorRow } from './bankAuthors.repo.js';
import type { BankCloneInput } from './banks.schema.js';
import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import * as auditService from '../audit/audit.service.js';
import type { BankAuthorBatchResult, BankDetailDto, BankDto, Role, RubricBand } from '../../types/domain.js';

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

/* ============================ 授权出题人批量维护（v1.7③ S2） ============================ */

/** 批量维护入参（与 banks.schema.bankAuthorsBatchSchema 对应）。 */
export interface BankAuthorsBatchInput {
  userIds?: string[];
  departmentId?: string;
  includeSubDepartments?: boolean;
  role?: Role;
}

/**
 * 按选择器解析目标用户 id 集合。
 * - `userIds` 直接并入；
 * - `departmentId` 若给出：取该科室（默认含子树）成员，`role` 在其内做交集过滤；
 * - 仅给 `role`（无科室）：取全部该角色账号。
 */
async function resolveTargetUserIds(input: BankAuthorsBatchInput): Promise<string[]> {
  const ids = new Set<string>();
  for (const id of input.userIds ?? []) {
    const t = String(id ?? '').trim();
    if (t) ids.add(t);
  }

  const departmentId = String(input.departmentId ?? '').trim();
  if (departmentId) {
    const deptIds =
      input.includeSubDepartments === false
        ? [departmentId]
        : await departmentsService.expandDepartmentIds([departmentId]);
    for (const id of await usersRepo.findIdsByDepartments(deptIds, input.role)) ids.add(id);
  } else if (input.role) {
    const rows = await usersRepo.list({ role: input.role });
    for (const r of rows) ids.add(r.id);
  }

  return [...ids];
}

/** 划分命中用户：存在的出题人 / 非出题人 / 不存在的账号。 */
async function classifyTargets(targetIds: string[]): Promise<{
  authors: string[];
  nonAuthor: number;
  missing: number;
}> {
  if (targetIds.length === 0) return { authors: [], nonAuthor: 0, missing: 0 };
  const all = await usersRepo.list();
  const map = new Map(all.map((u) => [u.id, u]));
  const authors: string[] = [];
  let nonAuthor = 0;
  let missing = 0;
  for (const id of targetIds) {
    const user = map.get(id);
    if (!user) missing += 1;
    else if (user.role !== 'author') nonAuthor += 1;
    else authors.push(id);
  }
  return { authors, nonAuthor, missing };
}

/** 读取题库当前授权出题人（id + 姓名）。 */
async function currentAuthors(bankId: string): Promise<{ authorIds: string[]; authorNames: string[] }> {
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks([bankId]);
  const rows = authorMap.get(bankId) ?? [];
  return { authorIds: rows.map((r) => r.user_id), authorNames: rows.map((r) => r.name) };
}

/**
 * 批量授权出题人（仅 admin）。
 * 命中集合中「角色不是出题人 / 账号不存在」的个体被跳过并计数，不阻断整体操作。
 */
export async function batchGrantAuthors(
  bankId: string,
  input: BankAuthorsBatchInput,
  operator: Operator,
): Promise<BankAuthorBatchResult> {
  const bank = await repo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  if (!bankAuth.isAdmin(operator)) throw forbidden('仅管理员可维护题库授权出题人');

  const targets = await resolveTargetUserIds(input);
  if (targets.length === 0) throw badRequest('未匹配到任何用户');
  const { authors, nonAuthor, missing } = await classifyTargets(targets);

  const existing = new Set(await bankAuthorsRepo.listAuthorIdsByBank(bankId));
  const toAdd = authors.filter((id) => !existing.has(id));
  await bankAuthorsRepo.addAuthors(bankId, toAdd);

  const result: BankAuthorBatchResult = {
    changed: toAdd.length,
    skipped: authors.length - toAdd.length,
    nonAuthor,
    missing,
    ...(await currentAuthors(bankId)),
  };

  await auditService.record({
    actorId: operator.id,
    action: 'bank.author_grant',
    targetType: 'bank',
    targetId: bankId,
    targetName: bank.name,
    detail: {
      changed: result.changed,
      skipped: result.skipped,
      nonAuthor,
      missing,
      departmentId: input.departmentId || undefined,
      role: input.role ?? undefined,
      userIds: input.userIds?.length ? input.userIds : undefined,
    },
  });
  return result;
}

/**
 * 批量取消出题人授权（仅 admin）。
 * 非出题人 / 不存在的账号计入 skipped，不阻断整体操作。
 */
export async function batchRevokeAuthors(
  bankId: string,
  input: BankAuthorsBatchInput,
  operator: Operator,
): Promise<BankAuthorBatchResult> {
  const bank = await repo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  if (!bankAuth.isAdmin(operator)) throw forbidden('仅管理员可维护题库授权出题人');

  const targets = await resolveTargetUserIds(input);
  if (targets.length === 0) throw badRequest('未匹配到任何用户');

  const existing = new Set(await bankAuthorsRepo.listAuthorIdsByBank(bankId));
  const toRemove = targets.filter((id) => existing.has(id));
  await bankAuthorsRepo.removeAuthors(bankId, toRemove);

  const result: BankAuthorBatchResult = {
    changed: toRemove.length,
    skipped: targets.length - toRemove.length,
    nonAuthor: 0,
    missing: 0,
    ...(await currentAuthors(bankId)),
  };

  await auditService.record({
    actorId: operator.id,
    action: 'bank.author_revoke',
    targetType: 'bank',
    targetId: bankId,
    targetName: bank.name,
    detail: {
      changed: result.changed,
      skipped: result.skipped,
      departmentId: input.departmentId || undefined,
      role: input.role ?? undefined,
      userIds: input.userIds?.length ? input.userIds : undefined,
    },
  });
  return result;
}

/* ============================ 题库复制（v1.7④ S4） ============================ */

/**
 * 复制题库（可选连同试题）。
 *
 * - 需对源题库有访问权限（admin 无限制；author 需被授权）；
 * - 新题库归属当前操作者，名称默认「原名（副本）」；
 * - `copyQuestions` 默认 true：题目以**新 id** 复制（不影响源题与其试卷引用），
 *   保留题型/选项/答案/分值/解析/科目/知识点标签/评分细则；
 * - 授权出题人：admin 可显式指定 `authorIds`，否则继承源题库作者；
 *   author 复制时在继承基础上自动加入自己（保证可见）。
 */
export async function cloneBank(
  id: string,
  input: BankCloneInput,
  operator: Operator,
): Promise<BankDto> {
  const source = await repo.findById(id);
  if (!source) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(id, operator);

  const trimmed = (input.name ?? '').trim();
  const newName = (trimmed || `${source.name}（副本）`).slice(0, 100);
  const newId = genId('bank-');
  const copyQuestions = input.copyQuestions !== false;

  // 授权出题人集合（事务外先解析，含角色校验）
  const sourceAuthors = await bankAuthorsRepo.listAuthorIdsByBank(id);
  let authorIds: string[];
  if (bankAuth.isAdmin(operator) && input.authorIds && input.authorIds.length > 0) {
    authorIds = await assertAuthorsValid(input.authorIds);
  } else {
    const set = new Set(sourceAuthors);
    if (!bankAuth.isAdmin(operator)) set.add(operator.id);
    authorIds = [...set];
  }

  let copied = 0;
  await withTransaction(async (conn) => {
    await repo.insert(
      {
        id: newId,
        name: newName,
        description: source.description,
        category: source.category,
        allowPractice: Boolean(Number(source.allow_practice)),
        createdBy: operator.id,
        createdAt: nowDb(),
      },
      conn,
    );

    if (copyQuestions) {
      const rows = await questionRepo.listAllByBank(id, conn);
      for (const r of rows) {
        await questionRepo.insert(
          {
            id: genId('q-'),
            bankId: newId,
            type: r.type,
            stem: r.stem,
            options: parseJsonColumn<string[]>(r.options, []),
            answer: parseJsonColumn<number[] | string[]>(r.answer, []),
            defaultScore: Number(r.default_score),
            analysis: r.analysis ?? '',
            subject: r.subject,
            tags: parseJsonColumn<string[]>(r.tags, []),
            rubric: parseJsonColumn<RubricBand[]>(r.rubric, []),
            createdBy: r.created_by,
            createdAt: nowDb(),
          },
          conn,
        );
        copied += 1;
      }
    }

    if (authorIds.length > 0) await bankAuthorsRepo.setAuthors(newId, authorIds, conn);
  });

  const created = await repo.findById(newId);
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks([newId]);
  const [dto] = attachAuthors([mapRow(created!)], authorMap);

  await auditService.record({
    actorId: operator.id,
    action: 'bank.clone',
    targetType: 'bank',
    targetId: newId,
    targetName: dto.name,
    detail: { sourceBankId: id, sourceBankName: source.name, copyQuestions, copied, authorIds },
  });
  return dto;
}
