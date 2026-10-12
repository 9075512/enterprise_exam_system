/**
 * 短随机 ID 生成（时间戳 + 随机串），全库通用，无第三方依赖。
 */
export function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
