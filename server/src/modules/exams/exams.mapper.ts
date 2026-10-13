/**
 * 考试行 → DTO 映射（exams / records / reports 模块共用）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { parseJsonColumn } from '../../utils/json.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import type { ExamDto } from '../../types/domain.js';

/** `exams` 表原始行。 */
export interface ExamRow extends RowDataPacket {
  id: string;
  name: string;
  paper_id: string;
  department_ids: unknown;
  start_time: string;
  end_time: string;
  duration_minutes: number | string;
  pass_score: number | string;
  max_attempts: number | string;
  shuffle_enabled: number | boolean | null;
  shuffle_options: number | boolean | null;
  allow_retake: number | boolean | null;
  created_by: string;
  created_at: string;
}

/** TINYINT(1) NULL → boolean | null（NULL=继承全局默认）。 */
function nullableBool(value: number | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(Number(value));
}

/** 映射为对外 DTO（JSON 列归一、时间转 ISO）。 */
export function mapExamRow(row: ExamRow): ExamDto {
  return {
    id: row.id,
    name: row.name,
    paperId: row.paper_id,
    departmentIds: parseJsonColumn<string[]>(row.department_ids, []),
    startTime: fromDbDateSafe(row.start_time),
    endTime: fromDbDateSafe(row.end_time),
    durationMinutes: Number(row.duration_minutes),
    passScore: Number(row.pass_score),
    maxAttempts: Number(row.max_attempts),
    shuffleEnabled: nullableBool(row.shuffle_enabled),
    shuffleOptions: nullableBool(row.shuffle_options),
    allowRetake: nullableBool(row.allow_retake),
    createdBy: row.created_by,
    createdAt: fromDbDateSafe(row.created_at),
  };
}
