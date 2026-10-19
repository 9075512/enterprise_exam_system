import { describe, expect, it } from 'vitest';
import { blankCount, isAnswered } from './answerState';
describe('真实作答进度', () => {
  it('填空须完整，空数组和空白文本不算已答', () => {
    expect(blankCount('___ 和 ___')).toBe(2);
    expect(blankCount('旧题干', ['甲', '乙'])).toBe(2);
    expect(isAnswered(['甲', ''], 'fill', 2)).toBe(false);
    expect(isAnswered(['甲'], 'fill', 2)).toBe(false);
    expect(isAnswered(['甲', '乙'], 'fill', 2)).toBe(true);
    expect(isAnswered([], 'single')).toBe(false);
    expect(isAnswered([0], 'single')).toBe(true);
  });
  it('富文本空标签不算答案，图片作答仍有效', () => {
    expect(isAnswered(['<p><br>&nbsp;</p>'], 'short')).toBe(false);
    expect(isAnswered(['<p>答案</p>'], 'short')).toBe(true);
    expect(isAnswered(['<img src="/api/attachments/example">'], 'short')).toBe(true);
  });
});
