/**
 * 考试状态机（纯函数，§9-11）：考试状态不落库，由时间窗实时推导（左闭右闭）。
 * `now < startTime` → not_started；`startTime ≤ now ≤ endTime` → ongoing；`now > endTime` → ended。
 */
import type { ExamStatus } from '../types/domain.js';

/** 依据时间窗推导考试状态。 */
export function getExamStatus(
  exam: { startTime: string; endTime: string },
  now: Date = new Date(),
): ExamStatus {
  const t = now.getTime();
  if (t < new Date(exam.startTime).getTime()) return 'not_started';
  if (t > new Date(exam.endTime).getTime()) return 'ended';
  return 'ongoing';
}
