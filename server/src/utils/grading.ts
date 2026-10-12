/**
 * 判分纯函数（考试与练题共用的唯一权威口径）。
 *
 * 从 `modules/records/records.service.ts` 抽出，保证「练题单题判分」与「考试判分」
 * **逐字一致**（架构 §4.4、共享约定 §10-5）。任何判分逻辑都不得在别处另写一套。
 *
 * 纯函数、无副作用、无外部依赖（仅依赖类型）。
 */
import type { QuestionType } from '../types/domain.js';

/** 判分所需的最小题目信息（只关心题型与正确答案）。 */
export interface GradableQuestion {
  /** 题型：单选 / 多选 / 判断 */
  type: QuestionType;
  /** 正确答案：选项索引数组（单选/判断恒长度 1；多选升序） */
  answer: number[];
}

/**
 * 判分规则（与考试完全一致）：
 * - 单选 / 判断：单值相等才正确；
 * - 多选：升序后完全相等才正确（漏选 / 错选均 0 分）；
 * - 空答案 / undefined：不得分。
 *
 * @param question 题目（含题型与正确答案）
 * @param answer 用户作答（选项索引数组）
 * @returns 是否正确
 */
export function isAnswerCorrect(question: GradableQuestion, answer: number[] | undefined): boolean {
  if (!answer || answer.length === 0) return false;
  if (question.type === 'multiple') {
    const user = [...answer].sort((a, b) => a - b).join(',');
    const correct = [...question.answer].sort((a, b) => a - b).join(',');
    return user === correct;
  }
  return answer.length === 1 && answer[0] === question.answer[0];
}
