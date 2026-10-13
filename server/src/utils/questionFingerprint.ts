/**
 * 题目内容指纹（v1.8⑤ U5）—— 「同一道题」的判定基准。
 *
 * 指纹口径 = **题型 + 规范化题干 + 规范化选项 + 规范化答案**：
 * - 文本一律折叠连续空白并 trim（`A  B` 与 `A B` 视为同一题干）；
 * - 选项按顺序参与（顺序不同视为不同题）；
 * - 答案：客观题为选项索引数组 → **排序后**参与（`[2,0]` 与 `[0,2]` 等价）；
 *   填空/简答为文本数组 → **保持原序**（空位顺序有语义，不可排序）。
 *
 * 用途：题库复制 / Excel 导入时的「内容去重式复用」——同内容的题目只保留一行，
 * 避免重复存储导致题库膨胀（v1.8 决策 D3：不做引用计数与跨库引用表）。
 */
import { createHash } from 'node:crypto';

/** 参与指纹的题目内容。 */
export interface FingerprintInput {
  type: string;
  stem: string;
  options: readonly string[];
  answer: readonly (number | string)[];
}

/** 字段分隔符（避免不同字段拼接后产生歧义碰撞）。 */
const SEP = '\u0001';

/** 文本归一：折叠连续空白 + trim。 */
function normText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 答案归一：全数值则升序排序（客观题），否则保持原序（填空/简答空位有语义）。 */
function normAnswer(answer: readonly (number | string)[]): string[] {
  const list = (answer ?? []).map((item) =>
    typeof item === 'number' ? `#${item}` : normText(item),
  );
  if (list.length > 0 && list.every((item) => item.startsWith('#'))) {
    return [...list].sort();
  }
  return list;
}

/**
 * 计算题目内容指纹（定长十六进制）。
 *
 * 幂等：同一内容多次计算结果一致；不同内容碰撞概率可忽略（sha256 取前 40 位 hex）。
 */
export function questionFingerprint(input: FingerprintInput): string {
  const payload = [
    normText(input.type),
    normText(input.stem),
    (input.options ?? []).map(normText).join(SEP),
    normAnswer(input.answer ?? []).join(SEP),
  ].join(SEP);
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 40);
}

/** 答案归一化后的可读形式（用于审计/日志排查，非判定依据）。 */
export function fingerprintKeyOf(input: FingerprintInput): string {
  return `${normText(input.type)}|${normText(input.stem).slice(0, 40)}`;
}
