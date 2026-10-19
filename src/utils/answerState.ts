import type { QuestionType } from '@/types';

export function blankCount(stem: string, reference: readonly unknown[] = []): number {
  return stem.match(/_{3,}/g)?.length || reference.length || 1;
}

/** 空选项、空白填空和只有空标签的富文本不计作已答；图片答案仍有效。 */
export function isAnswered(value: readonly (number | string)[] | undefined, type?: QuestionType, blanks = 1): boolean {
  if (!value?.length) return false;
  if (type === 'fill') return value.length >= blanks && value.every(item => String(item).trim().length > 0);
  if (type === 'short') return value.some(item => /<img\b[^>]*\bsrc\s*=/i.test(String(item)) || String(item).replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#xa0);/gi, ' ').trim().length > 0);
  return value.some(item => typeof item === 'number' || String(item).trim().length > 0);
}
