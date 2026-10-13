/**
 * 题库访问鉴权（v1.6③）。
 * 规则：admin 无限制；author 仅能访问 `bank_authors` 中授权的题库。
 */
import { forbidden } from '../../utils/errors.js';
import * as repo from './bankAuthors.repo.js';
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
 * 返回操作者可访问的题库 id 集合；admin 返回 null（表示不限制）。
 */
export async function listAccessibleBankIds(operator: Operator): Promise<string[] | null> {
  if (isAdmin(operator)) return null;
  return repo.listBankIdsByAuthor(operator.id);
}

/**
 * 校验操作者对某题库的访问权限；author 未授权 → 1003/403。
 */
export async function assertBankAccess(bankId: string, operator: Operator): Promise<void> {
  if (isAdmin(operator)) return;
  const ok = await repo.isAuthorized(bankId, operator.id);
  if (!ok) throw forbidden('您没有该题库的访问权限');
}

/**
 * 校验操作者对一组题库的访问权限（任一未授权即拒绝）。
 */
export async function assertBanksAccess(bankIds: string[], operator: Operator): Promise<void> {
  if (isAdmin(operator)) return;
  for (const bankId of bankIds) {
    await assertBankAccess(bankId, operator);
  }
}
