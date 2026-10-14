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

  // v1.5：用户邮箱（邮件通知接收地址，可空）
  if (!(await columnExists(conn, 'users', 'email'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN email VARCHAR(120) NULL AFTER department_id`);
    changes.push('users.email');
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

  // v1.6：菜单权限目录新增「人工阅卷」（defaultRoles: admin/author）。
  // 若已有角色权限行（admin 曾在菜单权限页保存过），需把新菜单合并进去，否则会看不到新入口。
  // v1.7①：新增「成绩复核」（admin）。
  // v1.7④：新增「系统维护」（admin）。
  // v1.9⑥：新增「公告与轮播」（admin）。
  // v1.9⑦：新增「首页」（examinee，考生默认落地页）。
  // v2.0⑥：新增「首页配置」（admin，考生首页科室级个性化）。
  const NEW_MENU_KEYS: Record<string, string[]> = {
    reviews: ['admin', 'author'],
    appeals: ['admin'],
    'login-logs': ['admin'],
    maintenance: ['admin'],
    content: ['admin'],
    home: ['examinee'],
    'home-config': ['admin'],
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
