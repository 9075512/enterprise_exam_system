/**
 * 考试记录数据源（v1.7④ T5）。
 *
 * 归档（`exam_records_archive`）采用「搬移」语义：记录写入归档表后即从业务表删除，
 * 两表**无重复行**。因此历史查询（成绩报表 / 导出 / 看板 / 考生历史成绩 / 记录详情）
 * 统一使用 `RECORD_SOURCE`（业务表 ∪ 归档表），保证归档后查询结果不变。
 *
 * 注意：写操作（暂存答案 / 交卷 / 阅卷 / 复核改分）仍只针对 `exam_records`；
 * 归档只处理已出成绩（status='submitted'）且考试结束早于保留期、且无复核申请的记录。
 */

/** `exam_records` 全列（不含表别名）。 */
export const RECORD_FULL_COLUMNS =
  'id, exam_id, user_id, attempt_no, department_id, paper_snapshot, status, answers, started_at, submitted_at, auto_submitted, score, grade_label, resume_allowed, subjective_scores, cheat_events, review_notes';

/** 带 `r.` 前缀的全列清单（JOIN 查询选择列表用）。 */
export const RECORD_FULL_COLUMNS_R = RECORD_FULL_COLUMNS.split(', ')
  .map((c) => `r.${c}`)
  .join(', ');

/** 记录数据源派生表（业务表 ∪ 归档表；**已带别名 `r`**，直接用于 FROM / JOIN）。 */
export const RECORD_SOURCE = `(SELECT ${RECORD_FULL_COLUMNS} FROM exam_records
       UNION ALL
       SELECT ${RECORD_FULL_COLUMNS} FROM exam_records_archive) r`;
