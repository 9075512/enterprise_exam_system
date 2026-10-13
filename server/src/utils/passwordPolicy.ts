/**
 * 密码策略（v1.7③ T2）—— 统一校验入口。
 *
 * 策略项全部来自 `system_settings`（可配）：最小长度 + 是否要求大写/小写/数字/符号。
 * 与前端 `src/utils/passwordPolicy.ts` 的提示口径保持一致。
 */
import { badRequest } from './errors.js';

/** 策略相关设置子集（避免与 settings 模块循环依赖）。 */
export interface PasswordPolicySettings {
  minPasswordLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
}

/** 是否含大写字母。 */
export function hasUpper(v: string): boolean {
  return /[A-Z]/.test(v);
}
/** 是否含小写字母。 */
export function hasLower(v: string): boolean {
  return /[a-z]/.test(v);
}
/** 是否含数字。 */
export function hasDigit(v: string): boolean {
  return /\d/.test(v);
}
/** 是否含符号（非字母数字）。 */
export function hasSymbol(v: string): boolean {
  return /[^A-Za-z0-9]/.test(v);
}

/** 逐项检查，返回未满足项的中文提示列表（空数组 = 全部满足）。 */
export function passwordPolicyErrors(password: string, policy: PasswordPolicySettings): string[] {
  const errors: string[] = [];
  if (password.length < policy.minPasswordLength) {
    errors.push(`长度不能少于 ${policy.minPasswordLength} 位`);
  }
  if (policy.passwordRequireUpper && !hasUpper(password)) errors.push('需包含大写字母');
  if (policy.passwordRequireLower && !hasLower(password)) errors.push('需包含小写字母');
  if (policy.passwordRequireDigit && !hasDigit(password)) errors.push('需包含数字');
  if (policy.passwordRequireSymbol && !hasSymbol(password)) errors.push('需包含符号');
  return errors;
}

/** 校验密码是否满足策略，不满足 → 1001（中文聚合文案）。 */
export function assertPasswordPolicy(password: string, policy: PasswordPolicySettings): void {
  const errors = passwordPolicyErrors(password, policy);
  if (errors.length > 0) {
    throw badRequest(`密码不符合安全策略：${errors.join('、')}`);
  }
}

/** 策略的中文描述（用于设置页与接口提示）。 */
export function describePolicy(policy: PasswordPolicySettings): string {
  const parts = [`至少 ${policy.minPasswordLength} 位`];
  if (policy.passwordRequireUpper) parts.push('含大写字母');
  if (policy.passwordRequireLower) parts.push('含小写字母');
  if (policy.passwordRequireDigit) parts.push('含数字');
  if (policy.passwordRequireSymbol) parts.push('含符号');
  return parts.join('、');
}

/**
 * 密码是否已过期。
 * `days <= 0` 表示不启用有效期；`changedAt` 为空视为不过期（兼容历史数据）。
 */
export function isPasswordExpired(changedAt: string | null | undefined, days: number): boolean {
  if (!days || days <= 0) return false;
  if (!changedAt) return false;
  const changed = new Date(changedAt).getTime();
  if (Number.isNaN(changed)) return false;
  return Date.now() - changed > days * 24 * 60 * 60 * 1000;
}
