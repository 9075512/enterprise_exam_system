/**
 * TOTP 两步验证（v1.7③ T2）—— RFC 6238 / RFC 4226 零依赖实现。
 *
 * - 密钥：20 字节随机数 → Base32（无填充），兼容 Google Authenticator / 微软 Authenticator 等
 *   标准验证器 App；
 * - 摘要：HMAC-SHA1（标准默认，被各验证器广泛支持）；
 * - 步长：30 秒；位数：6 位；校验窗口：±1 个步长（容忍客户端时钟偏差）。
 */
import crypto from 'node:crypto';

/** Base32 字母表（RFC 4648）。 */
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 时间步长（秒）。 */
const TIME_STEP_SECONDS = 30;
/** 验证码位数。 */
const DIGITS = 6;

/** 字节数组 → Base32（无填充）。 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Base32（忽略填充/空格/大小写）→ 字节数组。 */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 生成一个新的 TOTP 密钥（Base32，32 字符 / 20 字节）。 */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** 计算指定时间步长的 6 位验证码。 */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** 计算某时刻的验证码（默认当前时间）。 */
export function totpCode(secretBase32: string, timeMs: number = Date.now()): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / TIME_STEP_SECONDS);
  return hotp(secret, counter);
}

/** 校验用户输入的验证码（±1 个步长窗口，容忍时钟偏差）。 */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const input = String(code ?? '').trim();
  if (!/^\d{6}$/.test(input)) return false;
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return false;
  const current = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(secret, current + offset) === input) return true;
  }
  return false;
}

/** 构造 otpauth:// URI（供验证器 App 扫码或手动录入）。 */
export function otpauthUrl(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TIME_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
