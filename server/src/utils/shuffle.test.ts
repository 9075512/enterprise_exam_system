/**
 * 人手一卷洗牌纯函数单测（v1.4 核心）。
 * 重点验证：可复现性、题目集合不丢失、选项乱序后答案索引重映射正确（判分口径不变）。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom, shuffleArray, shuffleSnapshot } from './shuffle.js';
import type { PaperSnapshot } from '../types/domain.js';

function makeSnapshot(): PaperSnapshot {
  return {
    paperId: 'p1',
    paperName: '测试卷',
    totalScore: 40,
    questions: [
      {
        questionId: 'q1',
        score: 10,
        question: {
          id: 'q1', bankId: 'b1', type: 'single', stem: '单选',
          options: ['A', 'B', 'C', 'D'], answer: [1], defaultScore: 10,
          analysis: '', subject: 's', createdBy: '', createdAt: '',
        },
      },
      {
        questionId: 'q2',
        score: 10,
        question: {
          id: 'q2', bankId: 'b1', type: 'multiple', stem: '多选',
          options: ['甲', '乙', '丙', '丁'], answer: [0, 2], defaultScore: 10,
          analysis: '', subject: 's', createdBy: '', createdAt: '',
        },
      },
      {
        questionId: 'q3',
        score: 20,
        question: {
          id: 'q3', bankId: 'b1', type: 'judge', stem: '判断',
          options: ['正确', '错误'], answer: [0], defaultScore: 20,
          analysis: '', subject: 's', createdBy: '', createdAt: '',
        },
      },
    ],
  };
}

describe('seededRandom', () => {
  it('同种子产生相同序列', () => {
    const a = seededRandom('seed-a');
    const b = seededRandom('seed-a');
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('不同种子通常产生不同序列', () => {
    const a = seededRandom('seed-a');
    const b = seededRandom('seed-b');
    expect(a()).not.toEqual(b());
  });
});

describe('shuffleArray', () => {
  it('洗牌不丢失元素', () => {
    const rnd = seededRandom('x');
    const out = shuffleArray([1, 2, 3, 4, 5], rnd);
    expect([...out].sort((m, n) => m - n)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('shuffleSnapshot', () => {
  it('同种子可复现（两次结果完全一致）', () => {
    const s1 = shuffleSnapshot(makeSnapshot(), 'same-seed', true);
    const s2 = shuffleSnapshot(makeSnapshot(), 'same-seed', true);
    expect(JSON.stringify(s1)).toEqual(JSON.stringify(s2));
    expect(s1.seed).toBe('same-seed');
    expect(s1.shuffled).toBe(true);
  });

  it('题目集合不丢失（仅顺序变化）', () => {
    const snapshot = makeSnapshot();
    const out = shuffleSnapshot(snapshot, 's', true);
    const ids = out.questions.map((q) => q.questionId).sort();
    expect(ids).toEqual(['q1', 'q2', 'q3']);
  });

  it('选项乱序后答案索引重映射正确（判分口径不变）', () => {
    const snapshot = makeSnapshot();
    // 记录每道题「正确答案对应的选项文本」（按 questionId 索引，题目顺序会乱序）
    const correctTexts = new Map(
      snapshot.questions.map((sq) => [
        sq.questionId,
        sq.question.answer.map((idx) => sq.question.options[idx]).sort().join(','),
      ]),
    );
    const out = shuffleSnapshot(snapshot, 'shuffle-opt', true);
    out.questions.forEach((sq) => {
      const text = sq.question.answer.map((idx) => sq.question.options[idx]).sort().join(',');
      expect(text).toEqual(correctTexts.get(sq.questionId));
    });
  });

  it('shuffleOptions=false 时选项与答案保持原样', () => {
    const snapshot = makeSnapshot();
    const out = shuffleSnapshot(snapshot, 'no-opt', false);
    out.questions.forEach((sq) => {
      const orig = snapshot.questions.find((o) => o.questionId === sq.questionId)!;
      expect(sq.question.options).toEqual(orig.question.options);
      expect(sq.question.answer).toEqual(orig.question.answer);
    });
    expect(out.shuffled).toBe(true); // 题目顺序仍乱序
  });

  it('不同种子题目顺序不同（人手一卷）', () => {
    const a = shuffleSnapshot(makeSnapshot(), 'seed-1', false);
    const b = shuffleSnapshot(makeSnapshot(), 'seed-2', false);
    const orderA = a.questions.map((q) => q.questionId).join(',');
    const orderB = b.questions.map((q) => q.questionId).join(',');
    expect(orderA).not.toEqual(orderB);
  });
});
