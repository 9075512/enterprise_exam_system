/**
 * 短随机 ID 生成：时间戳 base36 + 随机串。
 * 运行时新实体统一由服务层调用，带业务前缀（如 `bank-`、`q-`、`batch-`）便于阅读。
 */
export function genId(prefix = ''): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const core = `${ts}-${rand}`;
  return prefix ? `${prefix}${core}` : core;
}
