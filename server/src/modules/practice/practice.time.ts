/**
 * 练题域 · 业务时区工具（二期）。
 *
 * 背景：`practice_answers.answered_at` 等时间列一律以 **UTC** 存储（连接池 `timezone:'Z'`）。
 * 「每日一练」「连续打卡」「逐日趋势」需要按**业务自然日**切分，因此：
 *   - 自然日边界一律由 `PRACTICE_TZ_OFFSET`（默认 +08:00）显式折算；
 *   - 过滤 UTC 时间列时使用**半开区间** `[startUtc, endUtc)`，**不使用 `DATE()` / `CONVERT_TZ()`**
 *     直接对 UTC 列取日期（会得到 UTC 日而非业务日），也不依赖 MySQL 时区表是否加载。
 *   - 按日聚合时使用 `DATE(DATE_ADD(col, INTERVAL <offsetMinutes> MINUTE))`（纯算术位移，无时区依赖）。
 */
import { env } from '../../config/env.js';
import { toDbDate } from '../../utils/datetime.js';

/** 默认偏移（+08:00 = 480 分钟）。 */
const DEFAULT_OFFSET_MINUTES = 480;

/**
 * 解析 `±HH:MM` / `±HHMM` / `±HH` 形式的时区偏移为分钟数。
 * 非法输入（格式错 / 超出 ±14 小时）回退 `+08:00`，保证永不抛错。
 */
export function parseTzOffsetMinutes(raw: string): number {
  const m = /^([+-])(\d{1,2}):?(\d{2})$/.exec(String(raw).trim());
  if (!m) return DEFAULT_OFFSET_MINUTES;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  if (hours > 14 || minutes > 59) return DEFAULT_OFFSET_MINUTES;
  return sign * (hours * 60 + minutes);
}

/** 当前配置的业务时区偏移（分钟）。 */
export function practiceTzOffsetMinutes(): number {
  return parseTzOffsetMinutes(env.PRACTICE_TZ_OFFSET);
}

/**
 * 业务日切分偏移（分钟）= 时区偏移 − 重置小时 × 60（v1.9⑤）。
 *
 * 用途：把「每日一练重置时点」折算进既有的「时区偏移」通道，使
 * `bizToday(dayOffset)` / `bizDayRangeUtc(date, dayOffset)` /
 * `DATE_ADD(col, INTERVAL dayOffset MINUTE)` 全部自动按业务日切分，无需改动调用方语义。
 *
 * 语义：设为 4 时，凌晨 04:00（业务时区）之前仍算作**前一个业务日**。
 * `resetHour = 0` 时返回值与 `practiceTzOffsetMinutes()` 完全一致（保持历史行为）。
 * 非法值（非 0~23 整数）按 0 处理。
 */
export function practiceDayOffsetMinutes(resetHour: number): number {
  const hour = Number.isInteger(resetHour) && resetHour >= 0 && resetHour <= 23 ? resetHour : 0;
  return practiceTzOffsetMinutes() - hour * 60;
}

/** 某时刻在业务时区下的自然日（`YYYY-MM-DD`）。 */
export function bizDate(at: Date, offsetMinutes: number = practiceTzOffsetMinutes()): string {
  return new Date(at.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** 今日（业务时区）的自然日字符串。 */
export function bizToday(offsetMinutes: number = practiceTzOffsetMinutes()): string {
  return bizDate(new Date(), offsetMinutes);
}

/** 日期字符串加减天数（纯 UTC 算术，返回 `YYYY-MM-DD`）。 */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y || 1970, (m || 1) - 1, d || 1) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** 校验 `YYYY-MM-DD` 格式。 */
export function isValidBizDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * 业务自然日 → 用于过滤 UTC 时间列的**半开区间** `[startUtc, endUtc)`。
 * 返回值形如 `'2026-10-12 00:00:00.000'`（UTC，可直接与 DATETIME(3) 列比较）。
 */
export function bizDayRangeUtc(
  date: string,
  offsetMinutes: number = practiceTzOffsetMinutes(),
): { startUtc: string; endUtc: string } {
  const [y, m, d] = date.split('-').map(Number);
  const startMs = Date.UTC(y || 1970, (m || 1) - 1, d || 1) - offsetMinutes * 60_000;
  return {
    startUtc: toDbDate(new Date(startMs)),
    endUtc: toDbDate(new Date(startMs + 86_400_000)),
  };
}
