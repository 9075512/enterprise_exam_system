/**
 * 题库模块 —— 业务逻辑层。
 * 删除策略（§3.3）：无题直接删；有题须 cascade=true，且由 service 在事务内先删题再删库。
 * v1.6③：author 仅能管理被授权题库（列表隔离 + 写操作校验，见 bankAuth.ts）。
 */
import * as repo from './banks.repo.js';
import * as bankAuthorsRepo from './bankAuthors.repo.js';
import * as bankAuth from './bankAuth.js';
import * as bankAccess from './bankAccess.service.js';
import type { Operator } from './bankAuth.js';
import * as usersRepo from '../users/users.repo.js';
import * as questionRepo from '../questions/questions.repo.js';
import * as departmentsService from '../departments/departments.service.js';
import type { BankRowWithCount } from './banks.repo.js';
import type { BankAuthorRow } from './bankAuthors.repo.js';
import type { BankCloneInput } from './banks.schema.js';
import { query, withTransaction } from '../../db/pool.js';
import type { RowDataPacket } from 'mysql2/promise';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { questionFingerprint } from '../../utils/questionFingerprint.js';
import * as auditService from '../audit/audit.service.js';
import type {
  BankAuthorBatchResult,
  BankCloneResultDto,
  BankDetailDto,
  BankDto,
  BankTreeNode,
  Role,
  RubricBand,
} from '../../types/domain.js';

/** 行 → 基础 DTO（authorIds/authorNames 由 attachAuthors 补充）。 */
function mapRow(row: BankRowWithCount): Omit<BankDto, 'authorIds' | 'authorNames'> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    allowPractice: Boolean(Number(row.allow_practice)),
    parentId: row.parent_id,
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status,
    isLeaf: Number(row.child_count ?? 0) === 0,
    effectiveStatus: row.status,
    canView: false,
    canEdit: false,
    createdBy: row.created_by,
    createdAt: fromDbDateSafe(row.created_at),
    questionCount: Number(row.question_count ?? 0),
  };
}

async function enrichRows(rows: BankRowWithCount[], operator: Operator): Promise<BankDto[]> {
  const authorMap = await bankAuthorsRepo.listAuthorsByBanks(rows.map((row) => row.id));
  const access = await bankAccess.loadAccessRows();
  const base = attachAuthors(rows.map(mapRow), authorMap);
  return Promise.all(base.map(async (dto) => ({
    ...dto,
    effectiveStatus: bankAccess.effectiveStatusFor(dto.id, rows),
    ...(await bankAccess.permissionsFor(dto.id, operator, rows, access)),
  })));
}

async function enrichOne(id: string, operator: Operator): Promise<BankDto> {
  const all = await repo.list();
  const dto = (await enrichRows(all, operator)).find((item) => item.id === id);
  if (!dto) throw notFound('科目题库不存在或已被删除');
  return dto;
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
  filter: { keyword?: string },
  operator: Operator,
): Promise<BankDto[]> {
  const rows = await repo.list();
  const enriched = await enrichRows(rows, operator);
  const keyword = filter.keyword?.trim().toLowerCase() ?? '';
  return enriched.filter((bank) => bank.isLeaf && bank.effectiveStatus === 'active' && bank.canView
    && (!keyword || bank.name.toLowerCase().includes(keyword) || bank.description.toLowerCase().includes(keyword)));
}

/** 完整科目题库树；author 仅得到可浏览节点及其导航祖先。 */
export async function tree(operator: Operator): Promise<BankTreeNode[]> {
  const rows = await repo.list();
  const enriched = await enrichRows(rows, operator);
  const byId = new Map(enriched.map((bank) => [bank.id, bank]));
  const keep = new Set<string>();
  for (const bank of enriched) {
    if (!bank.canView && operator.role !== 'admin') continue;
    let cursor: BankDto | undefined = bank;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id); keep.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  const nodes = new Map<string, BankTreeNode>();
  for (const bank of enriched) if (operator.role === 'admin' || keep.has(bank.id)) nodes.set(bank.id, { ...bank, children: [] });
  const roots: BankTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  const sort = (items: BankTreeNode[]) => {
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

/** 最近一次旧科目迁移报告（无旧数据时也返回空报告）。 */
export async function migrationReport(): Promise<unknown> {
  const rows = await query<Array<RowDataPacket & { report_json: unknown; updated_at: string }>>(
    `SELECT report_json, updated_at FROM bank_tree_migration_reports WHERE migration_key = 'subject-to-bank-tree-v1' LIMIT 1`,
  );
  if (!rows[0]) return { migrationKey: 'subject-to-bank-tree-v1', matched: [], conflicts: [], unresolvedGrants: [], updatedAt: null };
  return { ...parseJsonColumn<Record<string, unknown>>(rows[0].report_json, {}), updatedAt: fromDbDateSafe(rows[0].updated_at) };
}

/** 题库详情（含被引用统计；author 需授权）。 */
export async function getById(id: string, operator: Operator): Promise<BankDetailDto> {
  const row = await repo.findById(id);
  if (!row) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankView(id, operator);
  const { referencedQuestionCount, referencedPaperCount } = await repo.countReferences(id);
  const dto = await enrichOne(id, operator);
  return { ...dto, referencedQuestionCount, referencedPaperCount };
}

/** 新建科目题库：默认开放练题和全部人员浏览，编辑权限仍需单独授权。 */
export async function create(
  input: { name: string; description?: string; parentId?: string | null; sortOrder?: number; status?: 'active' | 'disabled'; allowPractice?: boolean; authorIds?: string[] },
  operator: Operator,
): Promise<BankDto> {
  if (!bankAuth.isAdmin(operator)) throw forbidden('仅管理员可新增科目');
  const parentId = input.parentId?.trim() || null;
  if (parentId) {
    const parent = await repo.findById(parentId);
    if (!parent) throw badRequest('上级科目不存在');
    if (Number(parent.question_count) > 0) throw conflict('已有题目的题库不能新增下级科目，请先迁走题目');
  }
  const defaultEditorIds = parentId && input.authorIds === undefined
    ? (await bankAccess.getAccessConfig(parentId)).effectiveEditorIds
    : [];
  const name = input.name.trim();
  if (await repo.findSiblingByName(name, parentId)) throw conflict('同一上级下已存在同名科目');
  const id = genId('bank-');
  await repo.insert({
    id,
    name,
    description: input.description?.trim() ?? '',
    category: '未分类',
    allowPractice: input.allowPractice !== false,
    parentId,
    sortOrder: input.sortOrder ?? 0,
    status: input.status ?? 'active',
    permissionMode: 'override',
    viewAll: true,
    createdBy: operator.id,
    createdAt: nowDb(),
  });

  // 授权出题人：admin 按入参设置；author 自动授权自己
  if (bankAuth.isAdmin(operator)) {
    const authorIds = await assertAuthorsValid(input.authorIds ?? defaultEditorIds);
    await bankAuthorsRepo.setAuthors(id, authorIds);
  } else {
    await bankAuthorsRepo.addAuthor(id, operator.id);
  }

  const dto = await enrichOne(id, operator);
  await auditService.record({
    actorId: operator.id,
    action: 'bank.create',
    targetType: 'bank',
    targetId: dto.id,
    targetName: dto.name,
    detail: { parentId: dto.parentId, viewAll: true },
  });
  return dto;
}

/** 编辑题库（author 需授权；仅 admin 可调整授权出题人）。 */
export async function update(
  id: string,
  input: { name: string; description?: string; parentId?: string | null; sortOrder?: number; status?: 'active' | 'disabled'; allowPractice?: boolean; authorIds?: string[] },
  operator: Operator,
): Promise<BankDto> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');
  if (!bankAuth.isAdmin(operator)) throw forbidden('仅管理员可修改科目层级、名称和状态');
  const parentId = input.parentId?.trim() || null;
  if (parentId === id) throw badRequest('上级科目不能是自身');
  const all = await repo.list();
  const descendants = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const currentId = queue.shift()!;
    for (const row of all.filter((item) => item.parent_id === currentId)) {
      descendants.add(row.id); queue.push(row.id);
    }
  }
  if (parentId && descendants.has(parentId)) throw badRequest('不能将科目移动到其子科目下');
  if (parentId) {
    const parent = all.find((item) => item.id === parentId);
    if (!parent) throw badRequest('上级科目不存在');
    if (Number(parent.question_count) > 0) throw conflict('已有题目的题库不能新增下级科目，请先迁走题目');
  }
  const name = input.name.trim();
  const duplicate = await repo.findSiblingByName(name, parentId);
  if (duplicate && duplicate.id !== id) throw conflict('同一上级下已存在同名科目');

  await repo.update(id, {
    name,
    description: input.description?.trim() ?? '',
    allowPractice: input.allowPractice === true,
    parentId,
    sortOrder: input.sortOrder ?? Number(current.sort_order),
    status: input.status ?? current.status,
  });
  // 科目就是题库名称：题库改名时同步所有库内试题的兼容字段。
  await query(`UPDATE questions SET subject = ?, subject_id = bank_id WHERE bank_id = ?`, [input.name.trim(), id]);

  // 仅 admin 可调整授权出题人；author 编辑时保持原授权不变
  if (bankAuth.isAdmin(operator) && input.authorIds !== undefined) {
    const authorIds = await assertAuthorsValid(input.authorIds);
    await bankAuthorsRepo.setAuthors(id, authorIds);
  }

  const dto = await enrichOne(id, operator);
  await auditService.record({
    actorId: operator.id,
    action: 'bank.update',
    targetType: 'bank',
    targetId: dto.id,
    targetName: dto.name,
    detail: { parentId: dto.parentId },
  });
  return dto;
}

/**
 * 批量设置「对外开放练题」开关（v1.8+ 练题端可见性修复）。
 *
 * 场景：题库数量多时逐个进「编辑题库」改开关成本高，且新手容易漏开导致练题端题库列表为空。
 * 语义：**仅改 `allow_practice` 一列**，不触碰名称、描述或授权出题人。
 * 校验：入参 id 必须全部存在（任一不存在 → 404），避免静默漏改。
 * 审计：按银行流水记录一条 `bank.practice_flag`（含题库 id 列表与目标状态）。
 */
export async function setPracticeFlagBatch(
  input: { bankIds: string[]; allowPractice: boolean },
  operator: Operator,
): Promise<BankDto[]> {
  const unique = [...new Set(input.bankIds.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) throw badRequest('请至少选择一个题库');

  const existing: string[] = [];
  for (const id of unique) {
    const row = await repo.findById(id);
    if (!row) throw notFound(`题库不存在或已被删除：${id}`);
    existing.push(id);
  }

  await repo.updatePracticeFlag(existing, input.allowPractice);

  const allDtos = await enrichRows(await repo.list(), operator);
  const dtos = allDtos.filter((item) => existing.includes(item.id));

  await auditService.record({
    actorId: operator.id,
    action: 'bank.practice_flag',
    targetType: 'bank',
    targetId: existing.length === 1 ? existing[0] : `${existing.length} 个题库`,
    targetName: dtos.map((d) => d.name).join('、') || '（无）',
    detail: { bankIds: existing, allowPractice: input.allowPractice },
  });
  return dtos;
}

/**
 * 删除题库（author 需授权）。
 * @param cascade 是否连同试题一起删除（`?cascade=true`）
 */
export async function remove(id: string, cascade: boolean, operator: Operator): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('题库不存在或已被删除');
  if (!bankAuth.isAdmin(operator)) throw forbidden('仅管理员可删除科目');
  if (Number(current.child_count) > 0) throw conflict('该科目下存在子科目，请先移动或删除子科目');

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

  const { referencedQuestionCount, referencedPaperCount } = await repo.countReferences(id);
  if (referencedQuestionCount > 0) {
    throw conflict(`该题库有 ${referencedQuestionCount} 道试题已被 ${referencedPaperCount} 份试卷引用，只能停用或迁移，不能物理删除`);
  }
  const history = await query<Array<RowDataPacket & { c: number }>>(`SELECT
    (SELECT COUNT(*) FROM practice_answers pa JOIN questions q ON q.id = pa.question_id WHERE q.bank_id = ?)
    + (SELECT COUNT(*) FROM practice_wrong_book pw JOIN questions q ON q.id = pw.question_id WHERE q.bank_id = ?) AS c`, [id, id]);
  if (Number(history[0]?.c ?? 0) > 0) throw conflict('该题库已有练题历史，只能停用或迁移，不能物理删除');

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
 * - **内容去重式复用（v1.8⑤ U5）**：以「题型+规范化题干+选项+答案」为指纹，
 *   同一批复制中内容完全相同的题目**只新建一行**（后续同内容题目复用该行 id），
 *   避免题库膨胀（决策 D3：不引入引用计数与跨库引用表）；
 * - 授权出题人：admin 可显式指定 `authorIds`，否则继承源题库作者；
 *   author 复制时在继承基础上自动加入自己（保证可见）。
 *
 * @returns `{ bank, copied, reused }`：`copied` 为实际新建的题目数，`reused` 为被去重复用的题目数。
 */
export async function cloneBank(
  id: string,
  input: BankCloneInput,
  operator: Operator,
): Promise<BankCloneResultDto> {
  const source = await repo.findById(id);
  if (!source) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(id, operator);
  if (Number(source.child_count) > 0) throw badRequest('父级科目仅作为目录，不能复制为题库');

  const trimmed = (input.name ?? '').trim();
  const newName = (trimmed || `${source.name}（副本）`).slice(0, 100);
  if (await repo.findSiblingByName(newName, source.parent_id)) throw conflict('同一上级下已存在同名科目');
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
  let reused = 0;
  await withTransaction(async (conn) => {
    await repo.insert(
      {
        id: newId,
        name: newName,
        description: source.description,
        category: source.category,
        allowPractice: Boolean(Number(source.allow_practice)),
        parentId: source.parent_id,
        sortOrder: Number(source.sort_order) + 1,
        status: source.status,
        permissionMode: 'override',
        viewAll: true,
        createdBy: operator.id,
        createdAt: nowDb(),
      },
      conn,
    );

    if (copyQuestions) {
      const rows = await questionRepo.listAllByBank(id, conn);
      // 指纹 → 已新建题目 id（同一批内同内容只建一行，v1.8⑤ U5）
      const createdByFingerprint = new Map<string, string>();
      for (const r of rows) {
        const options = parseJsonColumn<string[]>(r.options, []);
        const answer = parseJsonColumn<number[] | string[]>(r.answer, []);
        const fingerprint = questionFingerprint({
          type: r.type,
          stem: r.stem,
          options,
          answer,
        });
        if (createdByFingerprint.has(fingerprint)) {
          reused += 1;
          continue;
        }
        const questionId = genId('q-');
        await questionRepo.insert(
          {
            id: questionId,
            bankId: newId,
            type: r.type,
            stem: r.stem,
            options,
            answer,
            defaultScore: Number(r.default_score),
            analysis: r.analysis ?? '',
            subject: newName,
            subjectId: newId,
            status: r.status ?? 'active',
            difficulty: r.difficulty ?? null,
            tags: parseJsonColumn<string[]>(r.tags, []),
            rubric: parseJsonColumn<RubricBand[]>(r.rubric, []),
            createdBy: r.created_by,
            createdAt: nowDb(),
          },
          conn,
        );
        createdByFingerprint.set(fingerprint, questionId);
        copied += 1;
      }
    }

    if (authorIds.length > 0) await bankAuthorsRepo.setAuthors(newId, authorIds, conn);
  });

  const dto = await enrichOne(newId, operator);

  await auditService.record({
    actorId: operator.id,
    action: 'bank.clone',
    targetType: 'bank',
    targetId: newId,
    targetName: dto.name,
    detail: { sourceBankId: id, sourceBankName: source.name, copyQuestions, copied, reused, authorIds },
  });
  return { bank: dto, copied, reused };
}
