/**
 * 领域纯函数：组卷/判分相关的**展示层**辅助。
 *
 * 注意（§9-12）：考试判分与状态机的权威实现位于后端
 * （`server/src/modules/records/records.service.ts` 与 `utils/examStatus.ts`）。
 * 本文件仅提供前端展示所需的轻量纯函数（总分汇总、逐题对错对比），不参与服务端判分。
 * `getExamStatus` 由 `@/utils/examStatus` 复用并 re-export，保持单一实现。
 */
import {
  PAPER_DIFFICULTY_TOLERANCE,
  PAPER_TARGET_DIFFICULTY,
  QUESTION_DIFFICULTY_P_VALUE,
} from '@/constants';
import type { PaperQuestion, QuestionDifficulty, QuestionType } from '@/types';
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

/* ------------------------------ 组卷难度系数（P 值，v3.3） ------------------------------
 * 纯计算，仅用于组卷页评估：把「已选题目」折算为单一难度系数，与目标值对标，给出发布建议。
 * 口径：单题 P 值优先取实测正确率（练题作答聚合，越易越高），无作答时按人工难度标注锚点估算；
 * 目标值与容差见 `@/constants`（对齐设计稿 composer「目标 0.72」）。
 */

/** 难度系数评估的输入项（只需难度标注、实测正确率与分值） */
export interface DifficultyInput {
  /** 人工难度标注（null = 未标注） */
  difficulty: QuestionDifficulty | null;
  /** 实测正确率 0–100（null/undefined = 无练题作答，回退难度标注估算） */
  correctRate?: number | null;
  /** 题目分值（加权权重） */
  score: number;
}

/** 难度系数对标结论四态：无数据 / 接近目标 / 偏易 / 偏难 */
export type DifficultyVerdict = 'none' | 'near' | 'easy' | 'hard';

/** 单题难度系数（P 值，0–1）：实测正确率优先；否则难度标注锚点；两者皆无 → null（不计入评估） */
export function questionPValue(q: DifficultyInput): number | null {
  if (typeof q.correctRate === 'number' && Number.isFinite(q.correctRate)) {
    return Math.min(Math.max(q.correctRate, 0), 100) / 100;
  }
  if (q.difficulty) return QUESTION_DIFFICULTY_P_VALUE[q.difficulty];
  return null;
}

/** 可评估（有实测正确率或难度标注）的题数 */
export function evaluableQuestionCount(items: readonly DifficultyInput[]): number {
  return items.filter((q) => questionPValue(q) !== null).length;
}

/** 当前难度系数：按分值加权平均（无可用数据 → null，不造数），保留 2 位小数 */
export function calcDifficultyIndex(items: readonly DifficultyInput[]): number | null {
  let weighted = 0;
  let weight = 0;
  for (const q of items) {
    const p = questionPValue(q);
    if (p === null || !(q.score > 0)) continue;
    weighted += p * q.score;
    weight += q.score;
  }
  return weight > 0 ? Math.round((weighted / weight) * 100) / 100 : null;
}

/** 对标目标值的结论态（无数据 → none；|Δ| ≤ 容差 → near；高于目标 → easy；低于 → hard） */
export function difficultyVerdict(current: number | null): DifficultyVerdict {
  if (current === null) return 'none';
  // 千分位取整后再比，消除浮点误差（0.77 − 0.72 = 0.050000000000000044，会误判为偏易）
  const delta = Math.round((current - PAPER_TARGET_DIFFICULTY) * 1000) / 1000;
  if (Math.abs(delta) <= PAPER_DIFFICULTY_TOLERANCE) return 'near';
  return delta > 0 ? 'easy' : 'hard';
}

/** 结论提示文案（供组卷页 tip 展示） */
export function difficultyVerdictText(current: number | null): string {
  const target = PAPER_TARGET_DIFFICULTY.toFixed(2);
  const verdict = difficultyVerdict(current);
  if (verdict === 'none' || current === null) {
    return '已选题目暂无难度数据（未标注难度且无练题作答），无法评估难度系数。';
  }
  const cur = current.toFixed(2);
  if (verdict === 'near') return `当前难度系数 ${cur}，接近目标值 ${target}，可直接发布。`;
  if (verdict === 'easy') return `当前难度系数 ${cur}，偏易（目标 ${target}），建议补充高难度题目。`;
  return `当前难度系数 ${cur}，偏难（目标 ${target}），建议补充低难度题目。`;
}
