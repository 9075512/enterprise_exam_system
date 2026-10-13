/**
 * 判分纯函数（考试与练题共用的唯一权威口径）。
 *
 * 从 `modules/records/records.service.ts` 抽出，保证「练题单题判分」与「考试判分」
 * **逐字一致**（架构 §4.4、共享约定 §10-5）。任何判分逻辑都不得在别处另写一套。
 *
 * 纯函数、无副作用、无外部依赖（仅依赖类型）。
 */
import type { QuestionType } from '../types/domain.js';

/** 客观题：单选 / 多选 / 判断（有选项、自动判分）。 */
export function isObjectiveType(type: QuestionType): boolean {
  return type === 'single' || type === 'multiple' || type === 'judge';
}

/** 判分所需的最小题目信息（只关心题型与正确答案）。 */
export interface GradableQuestion {
  /** 题型：单选 / 多选 / 判断 / 填空 / 简答 */
  type: QuestionType;
  /** 正确答案：客观题为选项索引数组；填空为逐空文本数组；简答为参考文本数组 */
  answer: number[] | string[];
}

/** 填空逐空归一：trim + 忽略大小写。 */
function normalizeFill(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * 判分规则（与考试完全一致）：
 * - 单选 / 判断：单值相等才正确；
 * - 多选：升序后完全相等才正确（漏选 / 错选均 0 分）；
 * - 填空：逐空 trim + 忽略大小写匹配，长度一致且每空一致才正确；
 * - 简答：主观题，不自动判分（恒 false，由人工阅卷给分）；
 * - 空答案 / undefined：不得分。
 *
 * @param question 题目（含题型与正确答案）
 * @param answer 用户作答（选项索引数组 / 文本数组）
 * @returns 是否正确
 */
export function isAnswerCorrect(
  question: GradableQuestion,
  answer: number[] | string[] | undefined,
): boolean {
  if (!answer || answer.length === 0) return false;

  if (question.type === 'fill') {
    const expected = question.answer as string[];
    const given = answer as string[];
    if (expected.length !== given.length) return false;
    return expected.every((exp, i) => normalizeFill(exp) === normalizeFill(given[i]));
  }

  if (question.type === 'short') {
    return false; // 主观题，人工阅卷
  }

  // 客观题（single / multiple / judge）
  const qa = question.answer as number[];
  const ua = answer as number[];
  if (question.type === 'multiple') {
    const user = [...ua].sort((a, b) => a - b).join(',');
    const correct = [...qa].sort((a, b) => a - b).join(',');
    return user === correct;
  }
  return ua.length === 1 && ua[0] === qa[0];
}
