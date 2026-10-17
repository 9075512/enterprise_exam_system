/**
 * 题库访问鉴权（v1.6③）。
 * 规则：admin 无限制；其他角色按树上最近的 override 节点解析浏览/编辑权限。
 */
import * as banksRepo from './banks.repo.js';
import * as accessService from './bankAccess.service.js';
import type { Role } from '../../types/domain.js';

/** 操作者上下文（与 req.user 兼容：id + role）。 */
export interface Operator {
  id: string;
  role: Role;
}

/** 判断操作者是否为管理员。 */
export function isAdmin(operator: Operator): boolean {
  return operator.role === 'admin';
}

/**
 * 返回操作者可浏览的题库 id 集合；admin 返回 null（表示不限制）。
 */
export async function listAccessibleBankIds(operator: Operator): Promise<string[] | null> {
  if (isAdmin(operator)) return null;
  const rows = await banksRepo.list();
  const access = await accessService.loadAccessRows();
  const result: string[] = [];
  for (const row of rows) {
    if ((await accessService.permissionsFor(row.id, operator, rows, access)).canView) result.push(row.id);
  }
  return result;
}

/**
 * 校验操作者对叶子题库的编辑权限；无权、停用或非叶子均拒绝。
 */
export async function assertBankAccess(bankId: string, operator: Operator): Promise<void> {
  await accessService.assertCanEdit(bankId, operator);
}

/** 校验浏览权限（详情、列表、统计）；编辑权限单独走 assertBankAccess。 */
export async function assertBankView(bankId: string, operator: Operator): Promise<void> {
  await accessService.assertCanView(bankId, operator);
}

/**
 * 校验操作者对一组题库的访问权限（任一未授权即拒绝）。
 */
export async function assertBanksAccess(bankIds: string[], operator: Operator): Promise<void> {
  if (isAdmin(operator)) return;
  for (const bankId of bankIds) {
    await assertBankView(bankId, operator);
  }
}
