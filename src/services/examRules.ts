/**
 * 领域纯函数：组卷/判分相关的**展示层**辅助。
 *
 * 注意（§9-12）：考试判分与状态机的权威实现位于后端
 * （`server/src/modules/records/records.service.ts` 与 `utils/examStatus.ts`）。
 * 本文件仅提供前端展示所需的轻量纯函数（总分汇总、逐题对错对比），不参与服务端判分。
 * `getExamStatus` 由 `@/utils/examStatus` 复用并 re-export，保持单一实现。
 */
import type { PaperQuestion } from '@/types';
import { getExamStatus } from '@/utils/examStatus';

export { getExamStatus };

/** 保留 1 位小数（消除浮点误差） */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 汇总试卷总分（保留 1 位小数） */
export function calcTotalScore(questions: ReadonlyArray<Pick<PaperQuestion, 'score'>>): number {
  const total = questions.reduce((sum, q) => sum + Number(q.score || 0), 0);
  return round1(total);
}

/**
 * 展示层逐题对错对比（非权威判分）。
 * 规则与后端一致：答案升序后完全相等即视为正确（单选/判断长度为 1 时等价）。
 * @param correct 正确选项索引
 * @param user    考生作答（缺省/空表示未作答）
 */
export function isAnswerCorrect(correct: readonly number[], user: readonly number[] | undefined): boolean {
  if (!user || user.length === 0) return false;
  const a = [...correct].sort((x, y) => x - y).join(',');
  const b = [...user].sort((x, y) => x - y).join(',');
  return a === b;
}
