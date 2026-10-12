/**
 * 考试状态机（纯函数）—— 时间窗「左闭右闭」推导，不落库。
 * 与后端 `server/src/utils/examStatus.ts` 行为保持一致（§9-11）。
 */
import type { Exam, ExamStatus } from '@/types';

/**
 * 根据考试时间窗实时推导状态。
 * @param exam 至少包含 startTime / endTime（ISO 8601）
 * @param now  参考时刻，默认当前时间
 * @returns not_started（now < start）| ongoing（start <= now <= end）| ended（now > end）
 */
export function getExamStatus(
  exam: Pick<Exam, 'startTime' | 'endTime'>,
  now: Date = new Date(),
): ExamStatus {
  const t = now.getTime();
  const start = new Date(exam.startTime).getTime();
  const end = new Date(exam.endTime).getTime();
  if (t < start) return 'not_started';
  if (t > end) return 'ended';
  return 'ongoing';
}
