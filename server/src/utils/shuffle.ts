/**
 * 人手一卷洗牌纯函数（v1.4 核心）。
 *
 * 用「种子」生成可复现伪随机（FNV-1a + mulberry32），对试卷快照做：
 *   1. 题目顺序 Fisher-Yates 洗牌；
 *   2. 每题选项顺序洗牌，并**同步重映射答案索引**（判分仍走 utils/grading.isAnswerCorrect，
 *      因其依赖快照内的 answer，重映射后无需改动判分逻辑）。
 *
 * 纯函数、无副作用、无外部依赖（仅依赖类型）。同一 seed 结果完全一致（可复现 / 审计）。
 */
import type { PaperSnapshot, PaperSnapshotQuestion } from '../types/domain.js';

/**
 * 由种子字符串生成可复现的 [0,1) 伪随机函数（FNV-1a 散列 + mulberry32）。
 */
export function seededRandom(seed: string): () => number {
  // FNV-1a 32-bit 散列
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates 洗牌，返回新数组（不修改入参）。 */
export function shuffleArray<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 按种子洗牌快照（人手一卷）。返回**新快照**，不修改入参。
 * @param snapshot       试卷快照
 * @param seed           乱序种子（可复现）
 * @param shuffleOptions 是否乱序每题选项（true 时同步重映射 answer）
 */
export function shuffleSnapshot(
  snapshot: PaperSnapshot,
  seed: string,
  shuffleOptions: boolean,
): PaperSnapshot {
  const rnd = seededRandom(seed);
  const questions: PaperSnapshotQuestion[] = shuffleArray(snapshot.questions, rnd).map((sq) => {
    if (!shuffleOptions) {
      return { ...sq, question: { ...sq.question } };
    }
    const opts = sq.question.options;
    if (opts.length <= 1) {
      return { ...sq, question: { ...sq.question, options: [...opts] } };
    }
    const order = shuffleArray(opts.map((_, idx) => idx), rnd);
    const posMap = new Map<number, number>();
    order.forEach((oldIdx, newIdx) => posMap.set(oldIdx, newIdx));
    const newOptions = order.map((oldIdx) => opts[oldIdx]);
    const newAnswer = sq.question.answer.map((oldIdx) => posMap.get(oldIdx) ?? oldIdx).sort((a, b) => a - b);
    return {
      ...sq,
      question: { ...sq.question, options: newOptions, answer: newAnswer },
    };
  });

  return { ...snapshot, questions, seed, shuffled: true };
}
