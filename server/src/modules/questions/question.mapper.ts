/**
 * 试题行 → DTO 映射（questions / papers / import 模块共用）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { parseJsonColumn } from '../../utils/json.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import type { QuestionDto, QuestionType, QuestionDifficulty, RubricBand } from '../../types/domain.js';

/** `questions` 表原始行。 */
export interface QuestionRow extends RowDataPacket {
  id: string;
  bank_id: string;
  type: QuestionType;
  stem: string;
  options: unknown;
  answer: unknown;
  default_score: number | string;
  analysis: string | null;
  subject: string;
  difficulty: QuestionDifficulty | null;
  tags: unknown;
  rubric: unknown;
  created_by: string;
  created_at: string;
}

/** 评分细则行解析（容错：脏数据跳过）。 */
function parseRubric(raw: unknown): RubricBand[] {
  const arr = parseJsonColumn<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  const out: RubricBand[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const band = item as Record<string, unknown>;
    const score = Number(band.score);
    if (!Number.isFinite(score)) continue;
    out.push({
      score,
      label: String(band.label ?? '').trim(),
      description: String(band.description ?? '').trim(),
    });
  }
  return out;
}

/** 映射为对外 DTO（JSON 列归一、时间转 ISO）。 */
export function mapQuestionRow(row: QuestionRow): QuestionDto {
  return {
    id: row.id,
    bankId: row.bank_id,
    type: row.type,
    stem: row.stem,
    options: parseJsonColumn<string[]>(row.options, []),
    answer: parseJsonColumn<number[] | string[]>(row.answer, []),
    defaultScore: Number(row.default_score),
    analysis: row.analysis ?? '',
    subject: row.subject,
    difficulty: row.difficulty ?? null,
    tags: parseJsonColumn<string[]>(row.tags, []),
    rubric: row.type === 'short' ? parseRubric(row.rubric) : [],
    createdBy: row.created_by,
    createdAt: fromDbDateSafe(row.created_at),
  };
}
