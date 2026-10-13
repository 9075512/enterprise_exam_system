/**
 * 单元测试：判分规则（isAnswerCorrect / grade）与考试状态机（getExamStatus）。
 */
import { describe, it, expect } from 'vitest';
import { isAnswerCorrect, grade } from '../modules/records/records.service.js';
import { getExamStatus } from '../utils/examStatus.js';
import type { ExamRecordDto, PaperSnapshot, QuestionDto, QuestionType } from '../types/domain.js';

/** 构造仅含判分所需字段的题目。 */
function q(type: QuestionType, answer: number[] | string[]): Pick<QuestionDto, 'type' | 'answer'> {
  return { type, answer };
}

function recordWith(
  questions: Array<{ questionId: string; score: number; question: Pick<QuestionDto, 'type' | 'answer'> }>,
  answers: Record<string, number[] | string[]>,
): ExamRecordDto {
  const snapshot: PaperSnapshot = {
    paperId: 'p',
    paperName: 'p',
    totalScore: questions.reduce((s, x) => s + x.score, 0),
    questions: questions as PaperSnapshot['questions'],
  };
  return {
    id: 'r', examId: 'e', userId: 'u', departmentId: '', paperSnapshot: snapshot, status: 'in_progress',
    answers, startedAt: '', submittedAt: null, autoSubmitted: false, score: 0, cheatEvents: [],
  };
}

describe('isAnswerCorrect', () => {
  it('单选：单值相等才正确', () => {
    expect(isAnswerCorrect(q('single', [1]), [1])).toBe(true);
    expect(isAnswerCorrect(q('single', [1]), [0])).toBe(false);
    expect(isAnswerCorrect(q('single', [1]), [1, 2])).toBe(false);
  });

  it('判断：单值相等才正确', () => {
    expect(isAnswerCorrect(q('judge', [0]), [0])).toBe(true);
    expect(isAnswerCorrect(q('judge', [1]), [0])).toBe(false);
  });

  it('多选：排序后完全相等才正确（漏选/错选均 0 分）', () => {
    expect(isAnswerCorrect(q('multiple', [0, 1, 3]), [3, 1, 0])).toBe(true);
    expect(isAnswerCorrect(q('multiple', [0, 1, 3]), [0, 1])).toBe(false); // 漏选
    expect(isAnswerCorrect(q('multiple', [0, 1, 3]), [0, 1, 3, 4])).toBe(false); // 错选
  });

  it('空答案/未作答不得分', () => {
    expect(isAnswerCorrect(q('single', [0]), [])).toBe(false);
    expect(isAnswerCorrect(q('single', [0]), undefined)).toBe(false);
  });

  it('填空：逐空 trim + 忽略大小写匹配，全对才得分', () => {
    expect(isAnswerCorrect(q('fill', ['北京', 'China']), [' 北京 ', 'china'])).toBe(true);
    expect(isAnswerCorrect(q('fill', ['北京', 'China']), ['北京', 'china'])).toBe(true);
    expect(isAnswerCorrect(q('fill', ['北京', 'China']), ['上海', 'china'])).toBe(false);
    expect(isAnswerCorrect(q('fill', ['北京', 'China']), ['北京'])).toBe(false); // 漏空
    expect(isAnswerCorrect(q('fill', ['北京']), [])).toBe(false);
  });

  it('简答：不自动判分（恒 false，人工阅卷给分）', () => {
    expect(isAnswerCorrect(q('short', ['参考答案']), ['参考答案'])).toBe(false);
    expect(isAnswerCorrect(q('short', ['参考答案']), [])).toBe(false);
    expect(isAnswerCorrect(q('short', ['参考答案']), undefined)).toBe(false);
  });
});

describe('grade', () => {
  it('累加正确题得分并保留 1 位小数', () => {
    const record = recordWith(
      [
        { questionId: 'a', score: 3.33, question: q('single', [1]) },
        { questionId: 'b', score: 3.33, question: q('judge', [0]) },
        { questionId: 'c', score: 3.34, question: q('multiple', [0, 1]) },
      ],
      { a: [1], b: [0], c: [0, 1] },
    );
    expect(grade(record)).toBe(10);
  });

  it('四舍五入到 1 位小数（0.1 + 0.2 浮点误差被消除）', () => {
    const record = recordWith(
      [
        { questionId: 'a', score: 0.1, question: q('single', [0]) },
        { questionId: 'b', score: 0.2, question: q('single', [0]) },
      ],
      { a: [0], b: [0] },
    );
    expect(grade(record)).toBe(0.3);
  });

  it('全错或未作答得 0', () => {
    const record = recordWith(
      [
        { questionId: 'a', score: 5, question: q('single', [1]) },
        { questionId: 'b', score: 5, question: q('multiple', [0, 1]) },
      ],
      { a: [0], b: [0] },
    );
    expect(grade(record)).toBe(0);
  });

  it('混合题型：填空自动判分、简答记 0（阅卷后补）', () => {
    const record = recordWith(
      [
        { questionId: 'a', score: 5, question: q('fill', ['北京']) },
        { questionId: 'b', score: 5, question: q('short', ['参考']) },
        { questionId: 'c', score: 2, question: q('single', [0]) },
      ],
      { a: ['北京'], b: ['参考'], c: [0] },
    );
    expect(grade(record)).toBe(7); // 5 + 0 + 2
  });
});

describe('getExamStatus（时间窗左闭右闭）', () => {
  const exam = { startTime: '2026-01-01T10:00:00.000Z', endTime: '2026-01-01T11:00:00.000Z' };

  it('now < startTime → not_started', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T09:59:59.999Z'))).toBe('not_started');
  });
  it('now == startTime → ongoing（边界）', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T10:00:00.000Z'))).toBe('ongoing');
  });
  it('now == endTime → ongoing（边界）', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T11:00:00.000Z'))).toBe('ongoing');
  });
  it('now > endTime → ended', () => {
    expect(getExamStatus(exam, new Date('2026-01-01T11:00:00.001Z'))).toBe('ended');
  });
});
