/**
 * 试卷题目按题型排序测试。
 * - 纯函数 sortByQuestionType：单选→多选→判断，且组内稳定（保持原有相对顺序）。
 * - service.create / update：乱序入参 → 详情返回有序。
 * - service.getSnapshot：存量乱序试卷（直接落库）→ 快照同样有序，无需重存。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sortByQuestionType, create, update, getById, getSnapshot } from './papers.service.js';
import { prepareTestDb } from '../../test/db.js';
import { closePool, query } from '../../db/pool.js';
import { nowDb } from '../../utils/datetime.js';
import type { QuestionType } from '../../types/domain.js';

/** 测试用操作者上下文（user-author 已被 seed 授权 bank-security）。 */
const OPERATOR = { id: 'user-author', role: 'author' as const };

/** 待排序项（仅含排序所需字段）。 */
interface Item {
  id: string;
  type: QuestionType;
}

/** 构造带题型的题目项。 */
function item(id: string, type: QuestionType): Item {
  return { id, type };
}

describe('sortByQuestionType（纯函数，稳定排序）', () => {
  it('乱序输入 → 单选 → 多选 → 判断，组内保持原有相对顺序', () => {
    const input = [
      item('j1', 'judge'),
      item('s1', 'single'),
      item('m1', 'multiple'),
      item('s2', 'single'),
      item('j2', 'judge'),
      item('m2', 'multiple'),
    ];
    const out = sortByQuestionType(input, (x) => x.type).map((x) => x.id);
    expect(out).toEqual(['s1', 's2', 'm1', 'm2', 'j1', 'j2']);
  });

  it('已是目标顺序时保持不变', () => {
    const input = [item('s', 'single'), item('m', 'multiple'), item('j', 'judge')];
    expect(sortByQuestionType(input, (x) => x.type).map((x) => x.id)).toEqual(['s', 'm', 'j']);
  });

  it('不修改原数组（返回新数组）', () => {
    const input = [item('j', 'judge'), item('s', 'single')];
    const snapshot = input.map((x) => x.id);
    sortByQuestionType(input, (x) => x.type);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });

  it('解析不到题型时排到末尾（防御性）', () => {
    const input: Array<{ id: string; type?: QuestionType }> = [
      { id: 'unknown' },
      item('s', 'single'),
    ];
    const out = sortByQuestionType(input, (x) => x.type).map((x) => x.id);
    expect(out).toEqual(['s', 'unknown']);
  });
});

describe('试卷题目按题型排序（集成，落测试库）', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  it('create 乱序入参 → 详情按 单选→多选→判断 返回，总卷面分不变', async () => {
    const res = await create(
      {
        name: '乱序组卷测试卷',
        description: '',
        bankIds: ['bank-security'],
        // 入参顺序：判断、多选、单选、判断、多选、单选
        questions: [
          { questionId: 'q-05', score: 10 }, // judge
          { questionId: 'q-03', score: 10 }, // multiple
          { questionId: 'q-01', score: 10 }, // single
          { questionId: 'q-06', score: 10 }, // judge
          { questionId: 'q-04', score: 10 }, // multiple
          { questionId: 'q-02', score: 10 }, // single
        ],
      },
      OPERATOR,
    );

    const detail = await getById(res.id, OPERATOR);
    expect(detail.questions.map((q) => q.question.type)).toEqual([
      'single', 'single', 'multiple', 'multiple', 'judge', 'judge',
    ]);
    // 组内保持原有相对顺序（q-01 在 q-02 之前、q-03 在 q-04 之前、q-05 在 q-06 之前）
    expect(detail.questions.map((q) => q.questionId)).toEqual([
      'q-01', 'q-02', 'q-03', 'q-04', 'q-05', 'q-06',
    ]);
    expect(detail.totalScore).toBe(60);
  });

  it('update 乱序入参 → 详情按题型有序', async () => {
    const created = await create(
      {
        name: '更新排序测试卷',
        description: '',
        bankIds: ['bank-security'],
        questions: [{ questionId: 'q-01', score: 10 }],
      },
      OPERATOR,
    );

    const updated = await update(created.id, {
      name: '更新排序测试卷',
      description: '',
      bankIds: ['bank-security'],
      questions: [
        { questionId: 'q-03', score: 10 }, // multiple
        { questionId: 'q-05', score: 10 }, // judge
        { questionId: 'q-01', score: 10 }, // single
        { questionId: 'q-06', score: 10 }, // judge
        { questionId: 'q-02', score: 10 }, // single
      ],
    }, OPERATOR);

    expect(updated.questions.map((q) => q.question.type)).toEqual([
      'single', 'single', 'multiple', 'judge', 'judge',
    ]);
    expect(updated.questions.map((q) => q.questionId)).toEqual([
      'q-01', 'q-02', 'q-03', 'q-05', 'q-06',
    ]);
  });

  it('getSnapshot 对存量乱序试卷（直接落库 sort_order）返回有序', async () => {
    const paperId = 'paper-legacy-shuffled';
    await query(
      `INSERT INTO papers (id, name, description, total_score, created_by, created_at)
       VALUES (?, ?, '', 30, 'user-author', ?)`,
      [paperId, '存量乱序卷', nowDb()],
    );
    // 故意以 判断 → 单选 → 多选 的 sort_order 落库，模拟历史乱序数据
    const legacy = [
      { questionId: 'q-06', type: 'judge', order: 0 },
      { questionId: 'q-01', type: 'single', order: 1 },
      { questionId: 'q-03', type: 'multiple', order: 2 },
    ] as const;
    for (const row of legacy) {
      await query(
        `INSERT INTO paper_questions (paper_id, question_id, score, sort_order) VALUES (?, ?, 10, ?)`,
        [paperId, row.questionId, row.order],
      );
    }

    const snap = await getSnapshot(paperId);
    expect(snap.questions.map((q) => q.question.type)).toEqual(['single', 'multiple', 'judge']);
    expect(snap.questions.map((q) => q.questionId)).toEqual(['q-01', 'q-03', 'q-06']);
  });
});
