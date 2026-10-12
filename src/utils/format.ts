/**
 * 数值/时长/分数格式化工具。
 */

/** 分数展示：四舍五入 1 位小数，整数不带小数点 */
export function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 秒数 → 'x 分 y 秒' */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} 秒`;
  return `${m} 分 ${r} 秒`;
}

/** 比例 0~1 → 百分比整数 */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 总秒数 → 'HH:mm:ss' 倒计时展示 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

/** 选项索引 → 选项字母（0→A） */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
