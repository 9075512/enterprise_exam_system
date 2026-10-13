/**
 * 领域纯函数：组卷/判分相关的**展示层**辅助。
 *
 * 注意（§9-12）：考试判分与状态机的权威实现位于后端
 * （`server/src/modules/records/records.service.ts` 与 `utils/examStatus.ts`）。
 * 本文件仅提供前端展示所需的轻量纯函数（总分汇总、逐题对错对比），不参与服务端判分。
 * `getExamStatus` 由 `@/utils/examStatus` 复用并 re-export，保持单一实现。
 */
import type { PaperQuestion, QuestionType } from '@/types';
import { getExamStatus } from '@/utils/examStatus';

export { getExamStatus };

/** 保留 1 位小数（消除浮点误差） */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 汇总试卷总分（保留 1 位小数） */
export function calcTotalScore(questions: ReadonlyArray<Pick<PaperQuestion, 'score'>>): number {
  const total = questions.reduce((sum, q) => sum + Number(q.score || 0), 0);
  return round1(total);
}

/** 填空逐空归一：trim + 忽略大小写（与后端 grading.ts 一致）。 */
function normalizeFill(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * 展示层逐题对错对比（非权威判分，权威口径在后端 grading.ts）。
 * 规则与后端一致：
 * - 单选 / 判断：单值相等；
 * - 多选：升序后完全相等；
 * - 填空：逐空 trim + 忽略大小写匹配，长度一致且每空一致；
 * - 简答：主观题，恒 false（人工阅卷给分）。
 * @param question 题目（含题型与正确答案）
 * @param user    考生作答（缺省/空表示未作答）
 */
export function isAnswerCorrect(
  question: { type: QuestionType; answer: number[] | string[] },
  user: number[] | string[] | undefined,
): boolean {
  if (!user || user.length === 0) return false;

  if (question.type === 'fill') {
    const expected = question.answer as string[];
    const given = user as string[];
    if (expected.length !== given.length) return false;
    return expected.every((exp, i) => normalizeFill(exp) === normalizeFill(given[i]));
  }

  if (question.type === 'short') return false;

  const qa = question.answer as number[];
  const ua = user as number[];
  if (question.type === 'multiple') {
    const a = [...qa].sort((x, y) => x - y).join(',');
    const b = [...ua].sort((x, y) => x - y).join(',');
    return a === b;
  }
  return ua.length === 1 && ua[0] === qa[0];
}
