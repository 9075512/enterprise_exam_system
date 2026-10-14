/**
 * 组卷难度系数（P 值，v3.3）—— 纯函数单测。
 *
 * 口径：单题 P 值优先取实测正确率（0–100 → 0–1），无作答时按难度标注锚点（低 0.9 / 中 0.7 / 高 0.5）；
 * 当前难度系数按分值加权平均；与目标值 0.72 对标，容差 0.05 判定四态。
 */
import { describe, it, expect } from 'vitest';

import {
  calcDifficultyIndex,
  difficultyVerdict,
  difficultyVerdictText,
  evaluableQuestionCount,
  questionPValue,
} from './examRules';

describe('v3.3 组卷难度系数（P 值）', () => {
  it('单题 P 值：实测正确率优先（0–100 → 0–1，越界 clamp）', () => {
    expect(questionPValue({ difficulty: 'high', correctRate: 100, score: 10 })).toBe(1);
    expect(questionPValue({ difficulty: 'high', correctRate: 50, score: 10 })).toBe(0.5);
    expect(questionPValue({ difficulty: null, correctRate: 150, score: 10 })).toBe(1);
    expect(questionPValue({ difficulty: null, correctRate: -20, score: 10 })).toBe(0);
  });

  it('单题 P 值：无作答时按难度标注锚点（低 0.9 / 中 0.7 / 高 0.5）', () => {
    expect(questionPValue({ difficulty: 'low', score: 10 })).toBe(0.9);
    expect(questionPValue({ difficulty: 'medium', correctRate: null, score: 10 })).toBe(0.7);
    expect(questionPValue({ difficulty: 'high', correctRate: null, score: 10 })).toBe(0.5);
  });

  it('单题 P 值：无标注且无实测 → null（不计入评估，不造数）', () => {
    expect(questionPValue({ difficulty: null, correctRate: null, score: 10 })).toBeNull();
    expect(questionPValue({ difficulty: null, score: 10 })).toBeNull();
  });

  it('当前难度系数：等分时等价算术平均（低中高各 10 分 → 0.7）', () => {
    expect(
      calcDifficultyIndex([
        { difficulty: 'low', score: 10 },
        { difficulty: 'medium', score: 10 },
        { difficulty: 'high', score: 10 },
      ]),
    ).toBe(0.7);
  });

  it('当前难度系数：分值不同按分值加权（低 10 分 + 高 30 分 → 0.6）', () => {
    expect(
      calcDifficultyIndex([
        { difficulty: 'low', score: 10 },
        { difficulty: 'high', score: 30 },
      ]),
    ).toBe(0.6);
  });

  it('当前难度系数：跳过未标注题，不并入权重', () => {
    expect(
      calcDifficultyIndex([
        { difficulty: 'low', score: 10 },
        { difficulty: null, correctRate: null, score: 20 },
      ]),
    ).toBe(0.9);
  });

  it('当前难度系数：无可用数据 → null（不造数）', () => {
    expect(calcDifficultyIndex([])).toBeNull();
    expect(
      calcDifficultyIndex([
        { difficulty: null, score: 10 },
        { difficulty: null, correctRate: null, score: 20 },
      ]),
    ).toBeNull();
  });

  it('可评估题数：有实测或难度标注即计入', () => {
    expect(
      evaluableQuestionCount([
        { difficulty: 'low', score: 10 },
        { difficulty: null, correctRate: 80, score: 10 },
        { difficulty: null, score: 10 },
      ]),
    ).toBe(2);
  });

  it('结论态：无数据 none / 接近 near（|Δ|≤0.05） / 偏易 easy / 偏难 hard', () => {
    expect(difficultyVerdict(null)).toBe('none');
    expect(difficultyVerdict(0.72)).toBe('near');
    expect(difficultyVerdict(0.74)).toBe('near'); // 设计稿示例值
    expect(difficultyVerdict(0.77)).toBe('near'); // 边界：0.72 + 0.05
    expect(difficultyVerdict(0.78)).toBe('easy');
    expect(difficultyVerdict(0.67)).toBe('near'); // 边界：0.72 − 0.05
    expect(difficultyVerdict(0.66)).toBe('hard');
  });

  it('结论文案：对齐设计稿口径（接近目标值，可直接发布）', () => {
    expect(difficultyVerdictText(0.74)).toContain('当前难度系数 0.74');
    expect(difficultyVerdictText(0.74)).toContain('接近目标值 0.72');
    expect(difficultyVerdictText(0.74)).toContain('可直接发布');
    expect(difficultyVerdictText(0.9)).toContain('偏易');
    expect(difficultyVerdictText(0.3)).toContain('偏难');
    expect(difficultyVerdictText(null)).toContain('无法评估');
  });
});
