/**
 * 数据库 DDL 常量（权威来源，纯 TS 内联）。
 * 采用内联而非读取 .sql 文件，避免 `tsc` 构建后 SQL 文件不被复制的问题，
 * 保证 `tsx`（开发）与 `node dist`（生产）两种运行方式都能建表。
 * 与 `schema.sql`（文档副本）保持一致。
 */

/** 库名（新建独立库，绝不触碰本机已有的 exam_system 库）。 */
export const DB_NAME = 'enterprise_exam_system';

/** 建库语句（以 root 连接、不指定 database 时执行）。 */
export const CREATE_DATABASE_SQL = `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

/** 业务表 DDL（11 张考试域 + 6 张练题域），按依赖顺序排列。 */
export const DDL_STATEMENTS: readonly string[] = [
  // 1. 科室（v1.6③ 支持多级：parent_id 自引用；名称全局唯一，便于用户导入按名解析）
  `CREATE TABLE IF NOT EXISTS departments (
    id            VARCHAR(64)  NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    parent_id     VARCHAR(64)  NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_departments_name (name),
    KEY idx_departments_parent (parent_id),
    CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id)
      REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 2. 用户
  `CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(64)  NOT NULL,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    name          VARCHAR(64)  NOT NULL,
    role          ENUM('admin','author','examinee') NOT NULL,
    department_id VARCHAR(64)  NULL,
    email         VARCHAR(120) NULL,
    status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    KEY idx_users_department (department_id),
    CONSTRAINT fk_users_department FOREIGN KEY (department_id)
      REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. 题库
  `CREATE TABLE IF NOT EXISTS question_banks (
    id            VARCHAR(64)  NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    category      VARCHAR(64)  NOT NULL DEFAULT '未分类',
    allow_practice TINYINT(1)  NOT NULL DEFAULT 0,
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_banks_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. 试题
  `CREATE TABLE IF NOT EXISTS questions (
    id            VARCHAR(64)  NOT NULL,
    bank_id       VARCHAR(64)  NOT NULL,
    type          ENUM('single','multiple','judge','fill','short') NOT NULL,
    stem          TEXT         NOT NULL,
    options       JSON         NOT NULL,
    answer        JSON         NOT NULL,
    default_score DECIMAL(6,1) NOT NULL DEFAULT 10.0,
    analysis      TEXT         NULL,
    subject       VARCHAR(64)  NOT NULL DEFAULT '未分类',
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_questions_bank (bank_id),
    KEY idx_questions_type (type),
    KEY idx_questions_subject (subject),
    CONSTRAINT fk_questions_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 5. 试卷
  `CREATE TABLE IF NOT EXISTS papers (
    id            VARCHAR(64)  NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    total_score   DECIMAL(7,1) NOT NULL DEFAULT 0.0,
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 6. 试卷题目
  `CREATE TABLE IF NOT EXISTS paper_questions (
    paper_id      VARCHAR(64)  NOT NULL,
    question_id   VARCHAR(64)  NOT NULL,
    score         DECIMAL(6,1) NOT NULL,
    sort_order    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (paper_id, question_id),
    KEY idx_pq_question (question_id),
    CONSTRAINT fk_pq_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pq_question FOREIGN KEY (question_id)
      REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 7. 试卷-题库关联
  `CREATE TABLE IF NOT EXISTS paper_bank_refs (
    paper_id      VARCHAR(64) NOT NULL,
    bank_id       VARCHAR(64) NOT NULL,
    PRIMARY KEY (paper_id, bank_id),
    KEY idx_pbr_bank (bank_id),
    CONSTRAINT fk_pbr_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pbr_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 8. 考试
  `CREATE TABLE IF NOT EXISTS exams (
    id               VARCHAR(64)  NOT NULL,
    name             VARCHAR(120) NOT NULL,
    paper_id         VARCHAR(64)  NOT NULL,
    department_ids   JSON         NOT NULL,
    start_time       DATETIME(3)  NOT NULL,
    end_time         DATETIME(3)  NOT NULL,
    duration_minutes INT          NOT NULL,
    pass_score       DECIMAL(7,1) NOT NULL,
    max_attempts     INT          NOT NULL DEFAULT 1,
    shuffle_enabled  TINYINT(1)   NULL,
    shuffle_options  TINYINT(1)   NULL,
    allow_retake     TINYINT(1)   NULL,
    allow_appeal     TINYINT(1)   NULL,
    created_by       VARCHAR(64)  NOT NULL,
    created_at       DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_exams_paper (paper_id),
    CONSTRAINT fk_exams_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 9. 考试记录
  `CREATE TABLE IF NOT EXISTS exam_records (
    id              VARCHAR(64)  NOT NULL,
    exam_id         VARCHAR(64)  NOT NULL,
    user_id         VARCHAR(64)  NOT NULL,
    attempt_no      INT          NOT NULL DEFAULT 1,
    department_id   VARCHAR(64)  NULL,
    paper_snapshot  JSON         NOT NULL,
    status          ENUM('in_progress','submitted','pending_review') NOT NULL DEFAULT 'in_progress',
    answers         JSON         NOT NULL,
    started_at      DATETIME(3)  NOT NULL,
    submitted_at    DATETIME(3)  NULL,
    auto_submitted  TINYINT(1)   NOT NULL DEFAULT 0,
    score           DECIMAL(7,1) NOT NULL DEFAULT 0.0,
    subjective_scores JSON       NOT NULL,
    cheat_events    JSON         NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_records_exam_user_attempt (exam_id, user_id, attempt_no),
    KEY idx_records_user (user_id),
    CONSTRAINT fk_records_exam FOREIGN KEY (exam_id)
      REFERENCES exams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_records_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 10. 导入批次
  `CREATE TABLE IF NOT EXISTS import_batches (
    id             VARCHAR(64)  NOT NULL,
    bank_id        VARCHAR(64)  NOT NULL,
    file_name      VARCHAR(255) NOT NULL,
    total_rows     INT          NOT NULL DEFAULT 0,
    success_count  INT          NOT NULL DEFAULT 0,
    fail_count     INT          NOT NULL DEFAULT 0,
    errors_json    JSON         NOT NULL,
    operator_id    VARCHAR(64)  NOT NULL,
    created_at     DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_batches_bank (bank_id),
    CONSTRAINT fk_batches_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 11. 系统设置（全局单行表，应用层永远使用 id = 1；无需外键）
  `CREATE TABLE IF NOT EXISTS system_settings (
    id         TINYINT      NOT NULL DEFAULT 1,
    settings   JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ============================================================
  // 练题域（增量 · 公网练题）：
  //   一期 practice_progress / practice_answers / practice_wrong_book
  //   二期 practice_favorites / practice_daily_tasks / practice_settings
  // 隔离约定：命名独立；user_id 弱关联内网 users.id（**无外键**）；
  //          question_id / bank_id 保留外键（题域内 CASCADE）；绝不关联考试域表。
  // ============================================================

  // 12. 练题进度（按 用户×题库 唯一）
  `CREATE TABLE IF NOT EXISTS practice_progress (
    id               VARCHAR(64) NOT NULL,
    user_id          VARCHAR(64) NOT NULL,
    bank_id          VARCHAR(64) NOT NULL,
    last_question_id VARCHAR(64) NULL,
    done_count       INT NOT NULL DEFAULT 0,
    correct_count    INT NOT NULL DEFAULT 0,
    updated_at       DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pp_user_bank (user_id, bank_id),
    KEY idx_pp_user (user_id),
    CONSTRAINT fk_pp_bank FOREIGN KEY (bank_id) REFERENCES question_banks(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 13. 练题作答明细（正确率/错题本/学习报告数据源；「首次作答为准」统计口径）
  //     idx_pa_user_answered：学习报告按「用户 + 时间区间」聚合与每日任务当日统计用（旧库由 applyMigrations 幂等补建）
  `CREATE TABLE IF NOT EXISTS practice_answers (
    id          VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    answer      JSON NOT NULL,
    is_correct  TINYINT(1) NOT NULL,
    answered_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_pa_user (user_id),
    KEY idx_pa_user_question (user_id, question_id),
    KEY idx_pa_user_answered (user_id, answered_at),
    CONSTRAINT fk_pa_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 14. 错题本（由 practice_answers 派生维护）
  `CREATE TABLE IF NOT EXISTS practice_wrong_book (
    id            VARCHAR(64) NOT NULL,
    user_id       VARCHAR(64) NOT NULL,
    question_id   VARCHAR(64) NOT NULL,
    wrong_count   INT NOT NULL DEFAULT 1,
    last_wrong_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pwb_user_question (user_id, question_id),
    CONSTRAINT fk_pwb_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 15. 收藏夹（二期；按 用户×题目 唯一。上限由 practice_settings.favoriteLimit 控制）
  `CREATE TABLE IF NOT EXISTS practice_favorites (
    id          VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    created_at  DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pf_user_question (user_id, question_id),
    KEY idx_pf_user (user_id),
    CONSTRAINT fk_pf_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 16. 每日一练任务（二期；按 用户×自然日 唯一。question_ids 为当日**固定题序**，生成后不再变化）
  //     practice_date 为服务端按 PRACTICE_TZ_OFFSET 折算的自然日；done/correct 由服务端从 practice_answers 重算。
  `CREATE TABLE IF NOT EXISTS practice_daily_tasks (
    id            VARCHAR(64) NOT NULL,
    user_id       VARCHAR(64) NOT NULL,
    practice_date DATE        NOT NULL,
    question_ids  JSON        NOT NULL,
    total         INT         NOT NULL DEFAULT 0,
    done_count    INT         NOT NULL DEFAULT 0,
    correct_count INT         NOT NULL DEFAULT 0,
    completed_at  DATETIME(3) NULL,
    created_at    DATETIME(3) NOT NULL,
    updated_at    DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pdt_user_date (user_id, practice_date),
    KEY idx_pdt_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 17. 练题配置（二期；单行表，应用层永远使用 id = 1）
  //     写入方 = 内网实例（管理端 /api/settings/practice）；**练题实例只读**（最小权限账号仅授 SELECT）。
  `CREATE TABLE IF NOT EXISTS practice_settings (
    id         TINYINT      NOT NULL DEFAULT 1,
    settings   JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 18. 登录失败锁定（v1.4；按 username 唯一，登录失败累计 / 成功清零）
  `CREATE TABLE IF NOT EXISTS login_attempts (
    username     VARCHAR(64)  NOT NULL,
    fail_count   INT          NOT NULL DEFAULT 0,
    locked_until DATETIME(3)  NULL,
    updated_at   DATETIME(3)  NOT NULL,
    PRIMARY KEY (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 19. 限流计数（v1.4；固定窗口计数，多实例共享，替代进程内存 Map）
  //     键 = sha1(group:IP|deviceFp)，由 upsert 原子递增。
  `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key   VARCHAR(191) NOT NULL,
    count        INT          NOT NULL DEFAULT 0,
    window_start DATETIME(3)  NOT NULL,
    updated_at   DATETIME(3)  NOT NULL,
    PRIMARY KEY (bucket_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 20. 站内信通知（v1.5；user_id 弱关联，无外键以便清理与降级）
  `CREATE TABLE IF NOT EXISTS notifications (
    id         VARCHAR(64)  NOT NULL,
    user_id    VARCHAR(64)  NOT NULL,
    type       VARCHAR(32)  NOT NULL DEFAULT 'system',
    title      VARCHAR(120) NOT NULL,
    content    VARCHAR(500) NOT NULL DEFAULT '',
    is_read    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_notif_user (user_id, is_read),
    KEY idx_notif_user_created (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 21. 补考申请（v1.5；按 考试×考生 唯一，申请-审批流；仅 max_attempts=1 的考试可补考）
  `CREATE TABLE IF NOT EXISTS exam_retakes (
    id          VARCHAR(64)  NOT NULL,
    exam_id     VARCHAR(64)  NOT NULL,
    user_id     VARCHAR(64)  NOT NULL,
    status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reason      VARCHAR(255) NOT NULL DEFAULT '',
    applied_at  DATETIME(3)  NOT NULL,
    reviewed_by VARCHAR(64)  NULL,
    reviewed_at DATETIME(3)  NULL,
    created_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_retakes_exam_user (exam_id, user_id),
    KEY idx_retakes_status (status),
    CONSTRAINT fk_retakes_exam FOREIGN KEY (exam_id)
      REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 22. 用户导入批次（v1.5；同 import_batches 结构但无 bank_id）
  `CREATE TABLE IF NOT EXISTS user_import_batches (
    id            VARCHAR(64)  NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    total_rows    INT          NOT NULL DEFAULT 0,
    success_count INT          NOT NULL DEFAULT 0,
    fail_count    INT          NOT NULL DEFAULT 0,
    errors_json   JSON         NOT NULL,
    operator_id   VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 23. 菜单权限（v1.5；按角色一行，menu_keys = 该角色可见的菜单 key 列表；无行=使用内置默认）
  `CREATE TABLE IF NOT EXISTS menu_permissions (
    role       ENUM('admin','author','examinee') NOT NULL,
    menu_keys  JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 24. 题库-出题人授权（v1.6③；bank_id ↔ user_id 多对多；author 仅能管理被授权题库）
  `CREATE TABLE IF NOT EXISTS bank_authors (
    bank_id    VARCHAR(64) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (bank_id, user_id),
    KEY idx_ba_user (user_id),
    CONSTRAINT fk_ba_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ba_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 25. 操作审计日志（v1.6④；actor 弱关联无外键——被审计对象/操作者可能已删除，日志须自包含）
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id          VARCHAR(64)  NOT NULL,
    actor_id    VARCHAR(64)  NOT NULL,
    actor_name  VARCHAR(64)  NOT NULL DEFAULT '',
    action      VARCHAR(64)  NOT NULL,
    target_type VARCHAR(32)  NOT NULL,
    target_id   VARCHAR(64)  NOT NULL DEFAULT '',
    target_name VARCHAR(255) NOT NULL DEFAULT '',
    detail      JSON         NOT NULL,
    created_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_audit_actor (actor_id),
    KEY idx_audit_action (action),
    KEY idx_audit_target (target_type, target_id),
    KEY idx_audit_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 26. 成绩复核申请（v1.7①；按记录唯一——每条答卷至多一次复核；申请-复核改分流）
  `CREATE TABLE IF NOT EXISTS score_appeals (
    id             VARCHAR(64)  NOT NULL,
    record_id      VARCHAR(64)  NOT NULL,
    exam_id        VARCHAR(64)  NOT NULL,
    user_id        VARCHAR(64)  NOT NULL,
    status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reason         VARCHAR(500) NOT NULL DEFAULT '',
    original_score DECIMAL(7,1) NOT NULL,
    new_score      DECIMAL(7,1) NULL,
    review_comment VARCHAR(500) NOT NULL DEFAULT '',
    applied_at     DATETIME(3)  NOT NULL,
    reviewed_by    VARCHAR(64)  NULL,
    reviewed_at    DATETIME(3)  NULL,
    created_at     DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_appeals_record (record_id),
    KEY idx_appeals_status (status),
    KEY idx_appeals_user (user_id),
    CONSTRAINT fk_appeals_record FOREIGN KEY (record_id)
      REFERENCES exam_records(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 27. 特殊考试安排（v1.7①；按 考试×考生 唯一：加时 / 额外次数 / 免考）
  `CREATE TABLE IF NOT EXISTS exam_exceptions (
    id             VARCHAR(64)  NOT NULL,
    exam_id        VARCHAR(64)  NOT NULL,
    user_id        VARCHAR(64)  NOT NULL,
    extra_minutes  INT          NOT NULL DEFAULT 0,
    extra_attempts INT          NOT NULL DEFAULT 0,
    exempt         TINYINT(1)   NOT NULL DEFAULT 0,
    note           VARCHAR(255) NOT NULL DEFAULT '',
    created_by     VARCHAR(64)  NOT NULL,
    created_at     DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_exceptions_exam_user (exam_id, user_id),
    KEY idx_exceptions_user (user_id),
    CONSTRAINT fk_exceptions_exam FOREIGN KEY (exam_id)
      REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** 建表完成后用于统计的核心表名列表（含练题域 6 张表）。 */
export const TABLE_NAMES: readonly string[] = [
  'departments',
  'users',
  'question_banks',
  'questions',
  'papers',
  'paper_questions',
  'paper_bank_refs',
  'exams',
  'exam_records',
  'import_batches',
  'system_settings',
  'practice_progress',
  'practice_answers',
  'practice_wrong_book',
  'practice_favorites',
  'practice_daily_tasks',
  'practice_settings',
  'login_attempts',
  'rate_limit_buckets',
  'notifications',
  'exam_retakes',
  'user_import_batches',
  'menu_permissions',
  'bank_authors',
  'audit_logs',
  'score_appeals',
  'exam_exceptions',
];
