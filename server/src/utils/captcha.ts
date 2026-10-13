/**
 * 图形验证码（v1.7③ T1）——零依赖 SVG 实现，替换原先的自研算术验证码。
 *
 * 设计要点：
 * - 4 位字符（剔除 0/O/1/I/L 等易混字符），逐字符随机旋转 / 颜色 / 纵向抖动；
 * - 叠加干扰线 + 噪点，提升 OCR 与脚本识别成本；
 * - 进程内一次性存储（校验后立即作废），TTL 5 分钟，惰性清理过期项。
 *
 * 说明：内存态在多实例下需共享存储（与 `rate_limit_buckets` 的取舍一致，单实例部署足够）；
 * 接口不变，多实例时可替换为 Redis 实现。
 */
import crypto from 'node:crypto';

/** 验证码字符集（无 0/O/1/I/L 等易混字符）。 */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXY23456789';
/** 验证码位数。 */
const CODE_LENGTH = 4;
/** 有效期（毫秒）。 */
const TTL_MS = 5 * 60 * 1000;

interface CaptchaEntry {
  /** 正确答案（大写） */
  answer: string;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

const store = new Map<string, CaptchaEntry>();

/** 惰性清理过期项（每次下发时顺带执行，避免 Map 无限增长）。 */
function prune(now: number): void {
  if (store.size < 500) return;
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

/** 生成 0 ~ max-1 的安全随机整数。 */
function randomInt(max: number): number {
  return crypto.randomInt(0, max);
}

/** 生成 SVG 图形验证码文本（含干扰线与噪点）。 */
function renderSvg(code: string): string {
  const width = 128;
  const height = 44;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  // 背景（浅色随机渐变底）
  const hue = randomInt(360);
  parts.push(`<rect width="${width}" height="${height}" fill="hsl(${hue}, 45%, 95%)"/>`);

  // 干扰线
  for (let i = 0; i < 5; i += 1) {
    const x1 = randomInt(width);
    const y1 = randomInt(height);
    const x2 = randomInt(width);
    const y2 = randomInt(height);
    const color = `hsl(${randomInt(360)}, 60%, ${55 + randomInt(20)}%)`;
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2" opacity="0.65"/>`,
    );
  }

  // 噪点
  for (let i = 0; i < 40; i += 1) {
    const cx = randomInt(width);
    const cy = randomInt(height);
    const color = `hsl(${randomInt(360)}, 55%, 60%)`;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="1" fill="${color}" opacity="0.5"/>`);
  }

  // 字符（逐字旋转 + 抖动 + 随机深色）
  const step = width / (code.length + 1);
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i]!;
    const x = Math.round(step * (i + 1));
    const y = Math.round(height / 2 + 12 + (randomInt(9) - 4));
    const rotate = randomInt(50) - 25;
    const color = `hsl(${randomInt(360)}, 65%, ${22 + randomInt(18)}%)`;
    parts.push(
      `<text x="${x}" y="${y}" font-family="Consolas, Menlo, monospace" font-size="26" font-weight="700" ` +
        `fill="${color}" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** 下发一枚图形验证码（一次性，5 分钟有效）。 */
export function issueCaptcha(): { captchaId: string; image: string } {
  const now = Date.now();
  prune(now);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CHARSET[randomInt(CHARSET.length)];
  const captchaId = crypto.randomBytes(12).toString('hex');
  store.set(captchaId, { answer: code, expiresAt: now + TTL_MS });
  const svg = renderSvg(code);
  return { captchaId, image: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}` };
}

/** 校验验证码（一次性：无论对错，校验后即作废；大小写不敏感）。 */
export function verifyCaptcha(captchaId: string, value: string): boolean {
  const entry = store.get(captchaId);
  if (!entry) return false;
  store.delete(captchaId);
  if (entry.expiresAt < Date.now()) return false;
  return String(value ?? '').trim().toUpperCase() === entry.answer;
}

/** 仅供测试：清空存储。 */
export function __clearCaptchaStore(): void {
  store.clear();
}

/**
 * 仅供测试：读取验证码明文答案（图形验证码的答案不再随响应返回，
 * 单进程集成测试通过该钩子取值）。**生产代码不得调用**。
 */
export function __peekCaptchaAnswer(captchaId: string): string | null {
  const entry = store.get(captchaId);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.answer;
}
