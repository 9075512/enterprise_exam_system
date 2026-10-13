/**
 * 试题行 → DTO 映射（questions / papers / import 模块共用）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { parseJsonColumn } from '../../utils/json.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import type { QuestionDto, QuestionType } from '../../types/domain.js';

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
  tags: unknown;
  created_by: string;
  created_at: string;
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
    tags: parseJsonColumn<string[]>(row.tags, []),
    createdBy: row.created_by,
    createdAt: fromDbDateSafe(row.created_at),
  };
}
