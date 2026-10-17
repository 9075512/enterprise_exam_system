/**
 * 数据库初始化脚本（`npm run db:init` / `npm run db:reset`）。
 * 流程：
 *   1. 以 root 连接、不指定 database；
 *   2. （--reset 时）DROP 本项目库；
 *   3. CREATE DATABASE IF NOT EXISTS enterprise_exam_system；
 *   4. USE 该库并执行全部表 DDL（11 张考试域 + 6 张练题域）；
 *   5. 事务内幂等写入种子数据；
 *   6. 打印摘要并退出。
 *
 * 注意：绝不触碰本机已有的 `exam_system` 库（另一个项目）。
 */
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { fromDbDate } from '../utils/datetime.js';
import { CREATE_DATABASE_SQL, DB_NAME, DDL_STATEMENTS, TABLE_NAMES } from './schema.js';
import { seed } from './seed.js';

const reset = process.argv.includes('--reset');

/** 逐表统计行数。 */
async function countRows(conn: mysql.Connection): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLE_NAMES) {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS c FROM \`${table}\``);
    counts[table] = Number(rows[0]?.c ?? 0);
  }
  return counts;
}

/** 判断某列是否存在（information_schema，兼容旧库原地升级）。 */
async function columnExists(conn: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** 判断某列 ENUM 是否已包含指定值（用于幂等扩 ENUM 成员）。 */
async function enumHasValue(conn: mysql.Connection, table: string, column: string, value: string): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column],
  );
  return String(rows[0]?.COLUMN_TYPE ?? '').includes(`'${value}'`);
}

/** 判断某索引是否存在（information_schema）。 */
async function indexExists(conn: mysql.Connection, table: string, index: string): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, table, index],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function foreignDeleteRule(conn: mysql.Connection, table: string, constraint: string): Promise<string | null> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [DB_NAME, table, constraint],
  );
  return rows[0] ? String(rows[0].DELETE_RULE) : null;
}

/**
 * 幂等增量升级（支持已有库原地升级，重复执行安全）。
 * MySQL 不支持 `ADD COLUMN IF NOT EXISTS`，故一律先查 information_schema 再决定是否变更。
 * 升级项：
 *   1) exams.max_attempts（答题次数上限，默认 1）；
 *   2) exam_records.attempt_no（第几次作答，默认 1）；
 *   3) 唯一键 uk_records_exam_user → uk_records_exam_user_attempt (exam_id, user_id, attempt_no)。
 *      注意：旧唯一键被外键 fk_records_exam(exam_id) 依赖，必须先建新唯一键（以 exam_id 为最左列）
 *      再删旧键，否则 MySQL 报 ER_DROP_INDEX_FK。
 *   4) question_banks.allow_practice（对外开放练题开关，默认 0；练题域，架构 §3.1）。
 *      注：3 张 practice_* 表由 DDL_STATEMENTS 的 CREATE TABLE IF NOT EXISTS 天然幂等创建。
 *   5) practice_answers 复合索引 idx_pa_user_answered (user_id, answered_at)：学习报告按时间区间聚合、
 *      每日一练当日统计用（二期增量）；旧库需原地补建，新库已含在 CREATE TABLE 中。
 *      注：二期 3 张 practice_* 新表（favorites / daily_tasks / settings）同样由 DDL 幂等创建。
 *   6) questions.difficulty（题目难度 low/medium/high，NULL = 未标注；组卷「难度分布」与题库列筛选用）。
 *   7) exam_records.review_notes / exam_records_archive.review_notes（阅卷逐题评语与标记存疑 JSON，NULL = 无）。
 */
async function applyMigrations(conn: mysql.Connection): Promise<void> {
  const changes: string[] = [];

  if (!(await columnExists(conn, 'exams', 'max_attempts'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN max_attempts INT NOT NULL DEFAULT 1 AFTER pass_score`);
    changes.push('exams.max_attempts');
  }

  // v1.4：人手一卷 / 选项乱序开关（NULL=继承全局默认）
  if (!(await columnExists(conn, 'exams', 'shuffle_enabled'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN shuffle_enabled TINYINT(1) NULL AFTER max_attempts`);
    changes.push('exams.shuffle_enabled');
  }
  if (!(await columnExists(conn, 'exams', 'shuffle_options'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN shuffle_options TINYINT(1) NULL AFTER shuffle_enabled`);
    changes.push('exams.shuffle_options');
  }

  // v1.5：补考申请开关（NULL=继承全局默认）
  if (!(await columnExists(conn, 'exams', 'allow_retake'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN allow_retake TINYINT(1) NULL AFTER shuffle_options`);
    changes.push('exams.allow_retake');
  }

  // v1.7①：成绩复核开关（NULL=继承全局默认）
  if (!(await columnExists(conn, 'exams', 'allow_appeal'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN allow_appeal TINYINT(1) NULL AFTER allow_retake`);
    changes.push('exams.allow_appeal');
  }

  // v3.2：考试形式（开卷 / 闭卷，展示用；默认闭卷，与设计稿默认一致）
  if (!(await columnExists(conn, 'exams', 'exam_mode'))) {
    await conn.query(
      `ALTER TABLE exams ADD COLUMN exam_mode ENUM('open','closed') NOT NULL DEFAULT 'closed' AFTER allow_appeal`,
    );
    changes.push('exams.exam_mode');
  }

  // v1.7②：题目标签（知识点，JSON 数组；NULL = 无标签）
  if (!(await columnExists(conn, 'questions', 'tags'))) {
    await conn.query(`ALTER TABLE questions ADD COLUMN tags JSON NULL AFTER subject`);
    changes.push('questions.tags');
  }

  // v1.7③：简答题评分细则（分档 rubric，JSON 数组；NULL / [] = 未设置）
  if (!(await columnExists(conn, 'questions', 'rubric'))) {
    await conn.query(`ALTER TABLE questions ADD COLUMN rubric JSON NULL AFTER tags`);
    changes.push('questions.rubric');
  }

  // v3.2：题目难度（ENUM low/medium/high；NULL = 未标注）。组卷「难度分布」与题库列筛选用。
  if (!(await columnExists(conn, 'questions', 'difficulty'))) {
    await conn.query(
      `ALTER TABLE questions ADD COLUMN difficulty ENUM('low','medium','high') NULL AFTER subject`,
    );
    changes.push('questions.difficulty');
  }

  // 核心功能补齐：多级科目 + 试题状态。
  if (!(await columnExists(conn, 'questions', 'subject_id'))) {
    await conn.query(`ALTER TABLE questions ADD COLUMN subject_id VARCHAR(64) NULL AFTER subject`);
    changes.push('questions.subject_id');
  }
  if (!(await columnExists(conn, 'questions', 'status'))) {
    await conn.query(
      `ALTER TABLE questions ADD COLUMN status ENUM('active','disabled') NOT NULL DEFAULT 'active' AFTER subject_id`,
    );
    changes.push('questions.status');
  }
  if (!(await indexExists(conn, 'questions', 'idx_questions_subject_id'))) {
    await conn.query(`ALTER TABLE questions ADD KEY idx_questions_subject_id (subject_id)`);
    changes.push('questions.idx_questions_subject_id');
  }
  if (!(await indexExists(conn, 'questions', 'idx_questions_status'))) {
    await conn.query(`ALTER TABLE questions ADD KEY idx_questions_status (status)`);
    changes.push('questions.idx_questions_status');
  }

  // 被试卷引用的题目禁止物理删除：存量库把早期 CASCADE 外键收紧为 RESTRICT。
  if ((await foreignDeleteRule(conn, 'paper_questions', 'fk_pq_question')) !== 'RESTRICT') {
    if (await foreignDeleteRule(conn, 'paper_questions', 'fk_pq_question')) {
      await conn.query(`ALTER TABLE paper_questions DROP FOREIGN KEY fk_pq_question`);
    }
    await conn.query(`ALTER TABLE paper_questions ADD CONSTRAINT fk_pq_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT ON UPDATE CASCADE`);
    changes.push('paper_questions.fk_pq_question RESTRICT');
  }

  // v1.5：用户邮箱（邮件通知接收地址，可空）
  if (!(await columnExists(conn, 'users', 'email'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN email VARCHAR(120) NULL AFTER department_id`);
    changes.push('users.email');
  }
  if (!(await columnExists(conn, 'users', 'position_id'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN position_id VARCHAR(64) NULL AFTER department_id`);
    changes.push('users.position_id');
  }
  if (!(await indexExists(conn, 'users', 'idx_users_position'))) {
    await conn.query(`ALTER TABLE users ADD KEY idx_users_position (position_id)`);
    changes.push('users.idx_users_position');
  }

  // v1.7③：账号安全 —— 密码最后修改时间（密码有效期策略用）
  if (!(await columnExists(conn, 'users', 'password_changed_at'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME(3) NULL AFTER status`);
    // 存量用户以创建时间兜底，避免「从未修改过」被误判为永不过期
    await conn.query(`UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL`);
    changes.push('users.password_changed_at');
  }
  // v1.7③：账号安全 —— 两步验证（TOTP）密钥与开关
  if (!(await columnExists(conn, 'users', 'two_factor_secret'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(64) NULL AFTER password_changed_at`);
    changes.push('users.two_factor_secret');
  }
  if (!(await columnExists(conn, 'users', 'two_factor_enabled'))) {
    await conn.query(
      `ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER two_factor_secret`,
    );
    changes.push('users.two_factor_enabled');
  }

  if (!(await columnExists(conn, 'exam_records', 'attempt_no'))) {
    await conn.query(`ALTER TABLE exam_records ADD COLUMN attempt_no INT NOT NULL DEFAULT 1 AFTER user_id`);
    changes.push('exam_records.attempt_no');
  }

  // 考试参考人员冻结规则：存量考试默认 dynamic，零回归保留旧口径。
  if (!(await columnExists(conn, 'exams', 'audience_mode'))) {
    await conn.query(
      `ALTER TABLE exams ADD COLUMN audience_mode ENUM('dynamic','frozen') NOT NULL DEFAULT 'dynamic' AFTER exam_mode`,
    );
    changes.push('exams.audience_mode');
  }
  if (!(await columnExists(conn, 'exams', 'audience_rules'))) {
    await conn.query(`ALTER TABLE exams ADD COLUMN audience_rules JSON NULL AFTER audience_mode`);
    changes.push('exams.audience_rules');
  }

  // 先建新唯一键（可同时充当外键 fk_records_exam 的索引），再删旧唯一键
  if (!(await indexExists(conn, 'exam_records', 'uk_records_exam_user_attempt'))) {
    await conn.query(
      `ALTER TABLE exam_records ADD UNIQUE KEY uk_records_exam_user_attempt (exam_id, user_id, attempt_no)`,
    );
    changes.push('add uk_records_exam_user_attempt');
  }

  if (await indexExists(conn, 'exam_records', 'uk_records_exam_user')) {
    await conn.query(`ALTER TABLE exam_records DROP INDEX uk_records_exam_user`);
    changes.push('drop uk_records_exam_user');
  }

  // 练题开关（幂等加列；默认 0 = 存量题库一律不开放，安全默认）
  if (!(await columnExists(conn, 'question_banks', 'allow_practice'))) {
    await conn.query(
      `ALTER TABLE question_banks ADD COLUMN allow_practice TINYINT(1) NOT NULL DEFAULT 0 AFTER category`,
    );
    changes.push('question_banks.allow_practice');
  }

  // 树形科目题库：question_banks 同时承载目录节点与叶子题库。
  const bankTreeColumns: Array<[string, string]> = [
    ['parent_id', `VARCHAR(64) NULL AFTER allow_practice`],
    ['sort_order', `INT NOT NULL DEFAULT 0 AFTER parent_id`],
    ['status', `ENUM('active','disabled') NOT NULL DEFAULT 'active' AFTER sort_order`],
    ['permission_mode', `ENUM('inherit','override') NOT NULL DEFAULT 'inherit' AFTER status`],
    ['view_all', `TINYINT(1) NOT NULL DEFAULT 0 AFTER permission_mode`],
    ['include_child_departments', `TINYINT(1) NOT NULL DEFAULT 1 AFTER view_all`],
    ['updated_at', `DATETIME(3) NULL AFTER created_at`],
  ];
  for (const [column, ddl] of bankTreeColumns) {
    if (!(await columnExists(conn, 'question_banks', column))) {
      await conn.query(`ALTER TABLE question_banks ADD COLUMN ${column} ${ddl}`);
      changes.push(`question_banks.${column}`);
    }
  }
  await conn.query(`UPDATE question_banks SET updated_at = created_at WHERE updated_at IS NULL`);
  await conn.query(`ALTER TABLE question_banks MODIFY updated_at DATETIME(3) NOT NULL`);
  if (!(await indexExists(conn, 'question_banks', 'idx_banks_parent_sort'))) {
    await conn.query(`ALTER TABLE question_banks ADD KEY idx_banks_parent_sort (parent_id, sort_order, name)`);
    changes.push('question_banks.idx_banks_parent_sort');
  }
  if (!(await foreignDeleteRule(conn, 'question_banks', 'fk_banks_parent'))) {
    await conn.query(`ALTER TABLE question_banks ADD CONSTRAINT fk_banks_parent
      FOREIGN KEY (parent_id) REFERENCES question_banks(id) ON DELETE RESTRICT ON UPDATE CASCADE`);
    changes.push('question_banks.fk_banks_parent');
  }

  await migrateLegacySubjects(conn, changes);

  // 练题作答明细复合索引（幂等加索引；新库已含在 CREATE TABLE，旧库原地补建）
  if (!(await indexExists(conn, 'practice_answers', 'idx_pa_user_answered'))) {
    await conn.query(`ALTER TABLE practice_answers ADD KEY idx_pa_user_answered (user_id, answered_at)`);
    changes.push('practice_answers.idx_pa_user_answered');
  }

  // v1.6：题型扩展（填空/简答）
  if (!(await enumHasValue(conn, 'questions', 'type', 'fill'))) {
    await conn.query(`ALTER TABLE questions MODIFY type ENUM('single','multiple','judge','fill','short') NOT NULL`);
    changes.push('questions.type +fill/short');
  }

  // v1.6：记录状态（待人工阅卷）+ 主观题得分列
  if (!(await enumHasValue(conn, 'exam_records', 'status', 'pending_review'))) {
    await conn.query(
      `ALTER TABLE exam_records MODIFY status ENUM('in_progress','submitted','pending_review') NOT NULL DEFAULT 'in_progress'`,
    );
    changes.push('exam_records.status +pending_review');
  }
  if (!(await columnExists(conn, 'exam_records', 'subjective_scores'))) {
    await conn.query(`ALTER TABLE exam_records ADD COLUMN subjective_scores JSON NOT NULL AFTER score`);
    changes.push('exam_records.subjective_scores');
  }

  // v3.3：阅卷评语与标记存疑（逐题 JSON：{ [questionId]: { comment, commentVisible, doubtful } }；NULL = 无）。
  // 业务表与归档表共用 RECORD_FULL_COLUMNS，两表必须同列，否则归档后的 UNION ALL 查询报缺列。
  for (const table of ['exam_records', 'exam_records_archive'] as const) {
    if (!(await columnExists(conn, table, 'review_notes'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN review_notes JSON NULL AFTER cheat_events`);
      changes.push(`${table}.review_notes`);
    }
  }

  for (const table of ['exam_records', 'exam_records_archive'] as const) {
    if (!(await columnExists(conn, table, 'grade_label'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN grade_label VARCHAR(32) NOT NULL DEFAULT '' AFTER score`);
      changes.push(`${table}.grade_label`);
    }
    if (!(await columnExists(conn, table, 'resume_allowed'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN resume_allowed TINYINT(1) NOT NULL DEFAULT 0 AFTER grade_label`);
      changes.push(`${table}.resume_allowed`);
    }
  }

  // v1.6③：科室树（parent_id 自引用；仅补列与索引，自引用外键由新建库 DDL 保证，
  // 旧库因可能已存在数据、且应用层已做循环校验，不强行补外键约束）
  if (!(await columnExists(conn, 'departments', 'parent_id'))) {
    await conn.query(`ALTER TABLE departments ADD COLUMN parent_id VARCHAR(64) NULL AFTER description`);
    changes.push('departments.parent_id');
  }
  if (!(await indexExists(conn, 'departments', 'idx_departments_parent'))) {
    await conn.query(`ALTER TABLE departments ADD KEY idx_departments_parent (parent_id)`);
    changes.push('departments.idx_departments_parent');
  }

  // v1.7④ T5：性能优化——按「考试 + 状态」过滤（监考/报表）与按「状态 + 交卷时间」排序（待阅卷）
  if (!(await indexExists(conn, 'exam_records', 'idx_records_exam_status'))) {
    await conn.query(`ALTER TABLE exam_records ADD KEY idx_records_exam_status (exam_id, status)`);
    changes.push('exam_records.idx_records_exam_status');
  }
  if (!(await indexExists(conn, 'exam_records', 'idx_records_status_submitted'))) {
    await conn.query(`ALTER TABLE exam_records ADD KEY idx_records_status_submitted (status, submitted_at)`);
    changes.push('exam_records.idx_records_status_submitted');
  }
  if (!(await indexExists(conn, 'login_logs', 'idx_login_logs_source_created'))) {
    await conn.query(`ALTER TABLE login_logs ADD KEY idx_login_logs_source_created (source, created_at)`);
    changes.push('login_logs.idx_login_logs_source_created');
  }

  // v1.9⑤：错题本新增「连续答对次数」列（进入错题本后连续答对 N 次可自动移出，阈值可配）。
  if (!(await columnExists(conn, 'practice_wrong_book', 'correct_streak'))) {
    await conn.query(
      `ALTER TABLE practice_wrong_book ADD COLUMN correct_streak INT NOT NULL DEFAULT 0 AFTER wrong_count`,
    );
    changes.push('practice_wrong_book.correct_streak');
  }

  // 统一口径：科目就是题库，科目名=题库名，科目 id=题库 id。
  await conn.query(`UPDATE questions q
    JOIN question_banks b ON b.id = q.bank_id
    SET q.subject = b.name, q.subject_id = b.id
    WHERE q.subject_id IS NULL OR q.subject_id <> q.bank_id OR q.subject <> b.name`);

  // v1.6：菜单权限目录新增「人工阅卷」（defaultRoles: admin/author）。
  // 若已有角色权限行（admin 曾在菜单权限页保存过），需把新菜单合并进去，否则会看不到新入口。
  // v1.7①：新增「成绩复核」（admin）。
  // v1.7④：新增「系统维护」（admin）。
  // v1.9⑥：新增「公告与轮播」（admin）。
  // v1.9⑦：新增「首页」（examinee，考生默认落地页）。
  // v2.0⑥：新增「首页配置」（admin，考生首页科室级个性化）。
  const NEW_MENU_KEYS: Record<string, string[]> = {
    subjects: ['admin'],
    reviews: ['admin', 'author'],
    appeals: ['admin'],
    'login-logs': ['admin'],
    maintenance: ['admin'],
    content: ['admin'],
    home: ['examinee'],
    'my-retakes': ['examinee'],
    'exam-messages': ['examinee'],
    'home-config': ['admin'],
    'org-extensions': ['admin'],
    templates: ['admin', 'author'],
    'question-feedback': ['admin', 'author'],
    'duplicate-questions': ['admin'],
    'practice-monitor': ['admin'],
    practice: ['admin', 'author', 'examinee'],
  };
  const [menuRows] = await conn.query<mysql.RowDataPacket[]>(`SELECT role, menu_keys FROM menu_permissions`);
  for (const mr of menuRows) {
    const role = String(mr.role);
    let keys: string[] = [];
    try {
      const raw = typeof mr.menu_keys === 'string' ? mr.menu_keys : JSON.stringify(mr.menu_keys ?? []);
      const parsed = JSON.parse(raw);
      keys = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      keys = [];
    }
    for (const [menuKey, roles] of Object.entries(NEW_MENU_KEYS)) {
      if (!roles.includes(role)) continue;
      if (!keys.includes(menuKey)) {
        keys.push(menuKey);
        await conn.query(`UPDATE menu_permissions SET menu_keys = ? WHERE role = ?`, [JSON.stringify(keys), role]);
        changes.push(`menu_permissions.${role} +${menuKey}`);
      }
    }
  }

  console.log(
    changes.length === 0
      ? '[db:init] 结构升级：无需变更（已是最新）'
      : `[db:init] 结构升级完成：${changes.join('、')}`,
  );
}

/**
 * 把旧 subjects/subject_grants 尽可能投影到 question_banks 树。
 * 所有 id 均由旧 id/分类稳定派生，INSERT IGNORE + UPSERT 保证重复执行幂等。
 */
async function migrateLegacySubjects(conn: mysql.Connection, changes: string[]): Promise<void> {
  const [subjects] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, name, parent_id, sort_order, status, created_at, updated_at FROM subjects ORDER BY created_at, id`,
  );
  const [banksBefore] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT b.id, b.name, b.category, b.parent_id, b.allow_practice, b.created_by,
            (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id) AS question_count
       FROM question_banks b`,
  );
  const report: Record<string, unknown> = {
    migrationKey: 'subject-to-bank-tree-v1',
    matched: [] as unknown[],
    createdDirectories: [] as unknown[],
    categoryDirectories: [] as unknown[],
    conflicts: [] as unknown[],
    unresolvedGrants: [] as unknown[],
    generatedAt: new Date().toISOString(),
  };
  const matched = report.matched as Array<Record<string, unknown>>;
  const createdDirectories = report.createdDirectories as Array<Record<string, unknown>>;
  const conflicts = report.conflicts as Array<Record<string, unknown>>;
  const byParent = new Map<string, string[]>();
  for (const subject of subjects) {
    if (!subject.parent_id) continue;
    const ids = byParent.get(String(subject.parent_id)) ?? [];
    ids.push(String(subject.id));
    byParent.set(String(subject.parent_id), ids);
  }
  const bankBySubject = new Map<string, string>();
  const claimedBankIds = new Set<string>();
  for (const subject of subjects) {
    const subjectId = String(subject.id);
    const candidates = banksBefore.filter((b) => String(b.created_by) !== 'legacy-migration' && String(b.name) === String(subject.name));
    const isLeaf = !(byParent.get(subjectId)?.length);
    const candidateId = candidates.length === 1 ? String(candidates[0].id) : '';
    const reusable = isLeaf && candidates.length === 1 && !claimedBankIds.has(candidateId);
    if (reusable) {
      bankBySubject.set(subjectId, candidateId);
      claimedBankIds.add(candidateId);
      matched.push({ subjectId, bankId: candidateId, name: String(subject.name) });
      continue;
    }
    if (candidates.length > 1) {
      conflicts.push({ subjectId, name: String(subject.name), bankIds: candidates.map((b) => String(b.id)) });
    } else if (isLeaf && candidateId && claimedBankIds.has(candidateId)) {
      conflicts.push({ subjectId, name: String(subject.name), bankIds: [candidateId], reason: 'bank-already-matched' });
    }
    const stableId = `legacy-${subjectId}`.slice(0, 64);
    await conn.query(
      `INSERT IGNORE INTO question_banks
        (id, name, description, category, allow_practice, parent_id, sort_order, status,
         permission_mode, view_all, include_child_departments, created_by, created_at, updated_at)
       VALUES (?, ?, '', 'legacy', 0, NULL, ?, ?, 'inherit', 0, 1, 'legacy-migration', ?, ?)`,
      [stableId, String(subject.name), Number(subject.sort_order ?? 0), String(subject.status ?? 'active'), subject.created_at, subject.updated_at],
    );
    bankBySubject.set(subjectId, stableId);
    createdDirectories.push({ subjectId, bankId: stableId, name: String(subject.name), reason: isLeaf ? 'unmatched-leaf' : 'directory' });
  }
  for (const subject of subjects) {
    const bankId = bankBySubject.get(String(subject.id));
    const parentBankId = subject.parent_id ? bankBySubject.get(String(subject.parent_id)) ?? null : null;
    if (!bankId) continue;
    await conn.query(
      `UPDATE question_banks SET parent_id = ?, sort_order = ?, status = ?, updated_at = GREATEST(updated_at, ?)
        WHERE id = ?`,
      [parentBankId, Number(subject.sort_order ?? 0), String(subject.status ?? 'active'), subject.updated_at, bankId],
    );
  }

  // 老题库未匹配科目时，按历史 category 生成根目录归组；无法判断的保留根级并写报告。
  const usedBanks = new Set(bankBySubject.values());
  const categoryDirectories = report.categoryDirectories as Array<Record<string, unknown>>;
  for (const bank of banksBefore) {
    const bankId = String(bank.id);
    // 迁移器自己生成的目录不能再次按 category 归组，否则重复执行时会产生目录套目录，
    // 极端情况下还会尝试把 legacy 分类目录挂到自身。
    if (usedBanks.has(bankId) || bank.parent_id || String(bank.created_by) === 'legacy-migration') continue;
    const category = String(bank.category ?? '').trim();
    if (!category || category === '未分类') {
      conflicts.push({ bankId, name: String(bank.name), reason: 'no-subject-or-category' });
      continue;
    }
    const hash = createHash('sha1').update(category).digest('hex').slice(0, 24);
    const dirId = `legacy-category-${hash}`;
    await conn.query(
      `INSERT IGNORE INTO question_banks
        (id, name, description, category, allow_practice, parent_id, sort_order, status,
         permission_mode, view_all, include_child_departments, created_by, created_at, updated_at)
       VALUES (?, ?, '', 'legacy', 0, NULL, 0, 'active', 'inherit', 0, 1, 'legacy-migration', NOW(3), NOW(3))`,
      [dirId, category],
    );
    await conn.query(`UPDATE question_banks SET parent_id = ? WHERE id = ? AND parent_id IS NULL`, [dirId, bankId]);
    categoryDirectories.push({ category, bankId: dirId, childBankId: bankId });
  }

  // 迁移旧数据时保留既有权限语义：已有编辑人继续可编辑；旧开放练题库视为全员可浏览。
  await conn.query(`UPDATE question_banks b SET b.permission_mode = 'override'
    WHERE b.permission_mode = 'inherit' AND (b.allow_practice = 1 OR EXISTS (SELECT 1 FROM bank_authors ba WHERE ba.bank_id = b.id))`);
  await conn.query(`UPDATE question_banks SET view_all = 1 WHERE allow_practice = 1 AND permission_mode = 'override'`);

  // 将旧 grants 的最终结果展开为具体用户；deny 会在旧算法中扣除。
  const [users] = await conn.query<mysql.RowDataPacket[]>(`SELECT id, role, department_id, position_id FROM users WHERE status = 'active'`);
  const [memberships] = await conn.query<mysql.RowDataPacket[]>(`SELECT group_id, user_id FROM user_group_members`);
  const groupsByUser = new Map<string, Set<string>>();
  for (const row of memberships) {
    const set = groupsByUser.get(String(row.user_id)) ?? new Set<string>();
    set.add(String(row.group_id)); groupsByUser.set(String(row.user_id), set);
  }
  const [grants] = await conn.query<mysql.RowDataPacket[]>(`SELECT subject_id, principal_type, principal_id, effect, can_view, can_edit FROM subject_grants`);
  const unresolvedGrants = report.unresolvedGrants as Array<Record<string, unknown>>;
  for (const grant of grants) {
    const type = String(grant.principal_type);
    const id = String(grant.principal_id);
    const matchedUser = users.some((user) => {
      if (type === 'user') return String(user.id) === id;
      if (type === 'role') return String(user.role) === id;
      if (type === 'position') return String(user.position_id ?? '') === id;
      if (type === 'group') return groupsByUser.get(String(user.id))?.has(id) === true;
      return false;
    });
    if (!matchedUser) unresolvedGrants.push({
      subjectId: String(grant.subject_id), principalType: type, principalId: id,
      effect: String(grant.effect), reason: 'no-active-user-resolved',
    });
  }
  const subjectParent = new Map(subjects.map((s) => [String(s.id), s.parent_id ? String(s.parent_id) : null]));
  const hasPermission = (user: mysql.RowDataPacket, subjectId: string, action: 'view' | 'edit'): boolean => {
    const lineage: string[] = []; let cursor: string | null = subjectId; const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) { seen.add(cursor); lineage.push(cursor); cursor = subjectParent.get(cursor) ?? null; }
    const principals = new Set([`role:${String(user.role)}`, `user:${String(user.id)}`]);
    if (user.position_id) principals.add(`position:${String(user.position_id)}`);
    for (const gid of groupsByUser.get(String(user.id)) ?? []) principals.add(`group:${gid}`);
    const applies = (g: mysql.RowDataPacket) => Boolean(Number(action === 'view' ? g.can_view : g.can_edit));
    if (grants.some((g) => lineage.includes(String(g.subject_id)) && String(g.principal_type) === 'user' && String(g.principal_id) === String(user.id) && String(g.effect) === 'deny' && applies(g))) return false;
    for (const sid of lineage) {
      const level = grants.filter((g) => String(g.subject_id) === sid && applies(g) && principals.has(`${String(g.principal_type)}:${String(g.principal_id)}`));
      if (level.some((g) => String(g.principal_type) === 'user' && String(g.effect) === 'allow')) return true;
      if (level.some((g) => String(g.effect) === 'deny')) return false;
      if (level.some((g) => String(g.effect) === 'allow')) return true;
    }
    return false;
  };
  for (const subject of subjects) {
    const bankId = bankBySubject.get(String(subject.id));
    if (!bankId) continue;
    const viewers = users.filter((u) => hasPermission(u, String(subject.id), 'view'));
    const editors = users.filter((u) => (String(u.role) === 'author' || String(u.role) === 'admin') && hasPermission(u, String(subject.id), 'edit'));
    if (viewers.length || editors.length) await conn.query(`UPDATE question_banks SET permission_mode = 'override' WHERE id = ?`, [bankId]);
    for (const user of viewers) await conn.query(`INSERT IGNORE INTO bank_view_users (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, String(user.id)]);
    for (const user of editors) if (String(user.role) === 'author') await conn.query(`INSERT IGNORE INTO bank_authors (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, String(user.id)]);
  }

  await conn.query(
    `INSERT INTO bank_tree_migration_reports (migration_key, report_json, updated_at) VALUES ('subject-to-bank-tree-v1', ?, NOW(3))
     ON DUPLICATE KEY UPDATE report_json = VALUES(report_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify(report)],
  );
  if (subjects.length > 0) changes.push('legacy subjects -> question_banks tree (idempotent)');
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[db:init] 目标库：${DB_NAME}${reset ? '（--reset 将先删除重建）' : ''}`);

  // 1. 不指定 database 连接（root 权限）
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
  });

  try {
    // 2. --reset：先删除本项目库（仅限本项目库名）
    if (reset) {
      await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
      console.log(`[db:init] 已删除旧库 ${DB_NAME}`);
    }

    // 3. 建库
    await conn.query(CREATE_DATABASE_SQL);
    console.log(`[db:init] 已确保库存在：${DB_NAME}`);

    // 4. 切换到目标库
    await conn.changeUser({ database: DB_NAME });

    // 执行全部表 DDL（IF NOT EXISTS，幂等）
    for (const stmt of DDL_STATEMENTS) {
      await conn.query(stmt);
    }
    console.log(`[db:init] 已确保 ${DDL_STATEMENTS.length} 张表存在`);

    // 增量升级：旧库原地补齐 max_attempts / attempt_no 与新唯一键（幂等）
    await applyMigrations(conn);

    // 5. 事务内写入种子
    await conn.beginTransaction();
    try {
      await seed(conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    console.log('[db:init] 种子写入完成（幂等）');

    // 6. 摘要
    const counts = await countRows(conn);
    const exam = await conn.query<mysql.RowDataPacket[]>(
      `SELECT start_time, end_time FROM exams WHERE id = 'exam-demo'`,
    );
    const row = exam[0][0];
    console.log('\n========== 建表与数据摘要 ==========');
    console.log(`表数量：${TABLE_NAMES.length}`);
    for (const table of TABLE_NAMES) {
      console.log(`  - ${table.padEnd(16)} : ${counts[table]} 行`);
    }
    if (row) {
      console.log(`示例考试时间窗：${fromDbDate(row.start_time)} ~ ${fromDbDate(row.end_time)}`);
    }
    console.log(`耗时：${Date.now() - startedAt} ms`);
    console.log('====================================\n');
    console.log('[db:init] 完成 ✅');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[db:init] 失败 ❌');
    console.error(err);
    process.exit(1);
  });
