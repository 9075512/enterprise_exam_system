/**
 * 两步验证恢复码（v1.8② U2）—— 生成 / 归一化 / 校验。
 *
 * 设计：
 *  - 明文格式 `XXXXX-XXXXX`：10 位，取自 31 字符集（去除 `0/O/1/I/L` 易混字符），
 *    约 49 bit 熵；**仅在启用 / 重新生成时下发一次**，服务端只保存 bcrypt 哈希；
 *  - 恢复码为**一次性**：登录命中后立即标记已用；
 *  - 归一化对大小写与空格宽容（用户常手抄），非法格式直接判定不匹配，避免无谓的 bcrypt 计算。
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * 恢复码字符集（31 字符；去除 `0/O/1/I/L` 易混字符，与下方正则严格一致）。
 * 31^10 ≈ 2^49.6，足以抵抗在线爆破（且服务端只存 bcrypt 哈希）。
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** 单个恢复码的字符数（不含分隔符）。 */
const CODE_LEN = 10;
/** 分组长度（展示为 XXXXX-XXXXX）。 */
const GROUP_LEN = 5;
/** 默认下发的恢复码数量。 */
export const RECOVERY_CODE_COUNT = 10;
/** bcrypt 计算强度（与账号密码一致）。 */
const BCRYPT_ROUNDS = 10;

/** 恢复码字符类（与 ALPHABET 严格一致：排除 0/O/1/I/L）。 */
const CODE_CHAR = '[2-9A-HJKM-NP-Z]';
const CODE_PATTERN = new RegExp(`^${CODE_CHAR}{${GROUP_LEN}}-${CODE_CHAR}{${GROUP_LEN}}$`);

/** 生成单个恢复码明文（`XXXXX-XXXXX`）。 */
export function generateRecoveryCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    if (i === GROUP_LEN - 1) out += '-';
  }
  return out;
}

/** 生成一批互不重复的恢复码明文。 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(generateRecoveryCode());
  return [...set];
}

/**
 * 归一化用户输入：去除空白、转为大写。
 * 兼容用户输入全角连字符 / 无连字符（无连字符时尝试按分组补回）。
 */
export function normalizeRecoveryCode(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/[‐‑‒–—ー－_]/g, '-')
    .toUpperCase();
  if (cleaned.includes('-')) return cleaned;
  if (cleaned.length === CODE_LEN) return `${cleaned.slice(0, GROUP_LEN)}-${cleaned.slice(GROUP_LEN)}`;
  return cleaned;
}

/** 是否为合法恢复码格式（用于区分 TOTP 6 位码，避免无谓的 bcrypt 计算）。 */
export function isRecoveryCodeFormat(raw: string): boolean {
  return CODE_PATTERN.test(normalizeRecoveryCode(raw));
}

/** 计算恢复码哈希。 */
export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_ROUNDS);
}

/**
 * 在一组候选记录中匹配恢复码，返回命中的记录 id（未命中返回 null）。
 * 入参 `candidates` 为「记录 id + 哈希」列表（通常为该用户未使用的恢复码）。
 */
export async function matchRecoveryCode(
  code: string,
  candidates: Array<{ id: string; codeHash: string }>,
): Promise<string | null> {
  const normalized = normalizeRecoveryCode(code);
  if (!CODE_PATTERN.test(normalized)) return null;
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop -- 需逐个比对，命中即返回
    if (await bcrypt.compare(normalized, c.codeHash)) return c.id;
  }
  return null;
}
