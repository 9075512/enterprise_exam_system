/**
 * 考试记录行 → DTO 映射（records / reports 模块共用）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { parseJsonColumn } from '../../utils/json.js';
import { fromDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import type { CheatEvent, ExamRecordDto, PaperSnapshot, RecordStatus } from '../../types/domain.js';

/** `exam_records` 表原始行。 */
export interface ExamRecordRow extends RowDataPacket {
  id: string;
  exam_id: string;
  user_id: string;
  attempt_no: number | string;
  department_id: string | null;
  paper_snapshot: unknown;
  status: RecordStatus;
  answers: unknown;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: number | boolean;
  score: number | string;
  cheat_events: unknown;
  /** 详情查询 JOIN 附加列（列表查询不返回，故为可选） */
  exam_name?: string | null;
  pass_score?: number | string | null;
  user_name?: string | null;
  department_name?: string | null;
}

/** 记录详情行：在 `exam_records` 原始行之上附带 JOIN 得到的展示列（均必需）。 */
export interface ExamRecordDetailRow extends ExamRecordRow {
  exam_name: string | null;
  pass_score: number | string | null;
  user_name: string | null;
  department_name: string | null;
}

/** 空快照回退（理论不会用到，保证类型安全）。 */
const EMPTY_SNAPSHOT: PaperSnapshot = { paperId: '', paperName: '', totalScore: 0, questions: [] };

/** 映射为对外 DTO（JSON 列归一、时间转 ISO、department_id 空值转 ''）。 */
export function mapRecordRow(row: ExamRecordRow): ExamRecordDto {
  return {
    id: row.id,
    examId: row.exam_id,
    userId: row.user_id,
    attemptNo: Number(row.attempt_no),
    departmentId: row.department_id ?? '',
    paperSnapshot: parseJsonColumn<PaperSnapshot>(row.paper_snapshot, EMPTY_SNAPSHOT),
    status: row.status,
    answers: parseJsonColumn<Record<string, number[]>>(row.answers, {}),
    startedAt: fromDbDateSafe(row.started_at),
    submittedAt: fromDbDate(row.submitted_at),
    autoSubmitted: Boolean(row.auto_submitted),
    score: Number(row.score),
    cheatEvents: parseJsonColumn<CheatEvent[]>(row.cheat_events, []),
  };
}

/**
 * 映射为详情 DTO：在 `mapRecordRow` 结果之上附加展示字段（考试名称 / 及格线 / 姓名 / 科室名）。
 * 仅 `GET /records/:id` 使用；缺省一律回退空串或数值归一。
 */
export function mapRecordDetailRow(row: ExamRecordDetailRow): ExamRecordDto {
  return {
    ...mapRecordRow(row),
    examName: row.exam_name ?? '',
    passScore: Number(row.pass_score),
    userName: row.user_name ?? '',
    departmentName: row.department_name ?? '',
  };
}
