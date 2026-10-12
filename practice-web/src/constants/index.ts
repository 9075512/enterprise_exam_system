/**
 * 练题端最小常量集。
 * 仅保留 `QuestionCard.vue` 所需的题型文案（其余内网/考试端常量不进入练题工程）。
 */
import type { QuestionType } from '@/types';

/** 题型文案 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
};
