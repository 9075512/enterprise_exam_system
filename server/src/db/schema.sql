-- schema.ts 为权威来源；本文件为完整建表语句的文档镜像。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(64) NOT NULL, name VARCHAR(120) NOT NULL,
    base_role ENUM('admin','author','examinee') NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '', is_builtin TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_roles_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(64)  NOT NULL,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    name          VARCHAR(64)  NOT NULL,
    role          ENUM('admin','author','examinee') NOT NULL,
    role_id       VARCHAR(64) NOT NULL,
    department_id VARCHAR(64)  NULL,
    position_id   VARCHAR(64)  NULL,
    email         VARCHAR(120) NULL,
    status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
    password_changed_at DATETIME(3) NULL,
    two_factor_secret   VARCHAR(64) NULL,
    two_factor_enabled  TINYINT(1) NOT NULL DEFAULT 0,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    KEY idx_users_department (department_id),
    KEY idx_users_position (position_id),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_users_department FOREIGN KEY (department_id)
      REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_banks (
    id            VARCHAR(64)  NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    category      VARCHAR(64)  NOT NULL DEFAULT '未分类',
    allow_practice TINYINT(1)  NOT NULL DEFAULT 0,
    parent_id     VARCHAR(64)  NULL,
    sort_order    INT          NOT NULL DEFAULT 0,
    status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
    permission_mode ENUM('inherit','override') NOT NULL DEFAULT 'inherit',
    view_all      TINYINT(1)   NOT NULL DEFAULT 0,
    include_child_departments TINYINT(1) NOT NULL DEFAULT 1,
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_banks_category (category),
    KEY idx_banks_parent_sort (parent_id, sort_order, name),
    CONSTRAINT fk_banks_parent FOREIGN KEY (parent_id)
      REFERENCES question_banks(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
    id            VARCHAR(64)  NOT NULL,
    bank_id       VARCHAR(64)  NOT NULL,
    type          ENUM('single','multiple','judge','fill','short') NOT NULL,
    stem          TEXT         NOT NULL,
    options       JSON         NOT NULL,
    answer        JSON         NOT NULL,
    default_score DECIMAL(6,1) NOT NULL DEFAULT 10.0,
    analysis      TEXT         NULL,
    subject       VARCHAR(64)  NOT NULL DEFAULT '未分类',
    subject_id    VARCHAR(64)  NULL,
    status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
    difficulty    ENUM('low','medium','high') NULL,
    tags          JSON         NULL,
    rubric        JSON         NULL,
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_questions_bank (bank_id),
    KEY idx_questions_type (type),
    KEY idx_questions_subject (subject),
    KEY idx_questions_subject_id (subject_id),
    KEY idx_questions_status (status),
    CONSTRAINT fk_questions_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS papers (
    id            VARCHAR(64)  NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    total_score   DECIMAL(7,1) NOT NULL DEFAULT 0.0,
    created_by    VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paper_questions (
    paper_id      VARCHAR(64)  NOT NULL,
    question_id   VARCHAR(64)  NOT NULL,
    score         DECIMAL(6,1) NOT NULL,
    sort_order    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (paper_id, question_id),
    KEY idx_pq_question (question_id),
    CONSTRAINT fk_pq_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pq_question FOREIGN KEY (question_id)
      REFERENCES questions(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paper_bank_refs (
    paper_id      VARCHAR(64) NOT NULL,
    bank_id       VARCHAR(64) NOT NULL,
    PRIMARY KEY (paper_id, bank_id),
    KEY idx_pbr_bank (bank_id),
    CONSTRAINT fk_pbr_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pbr_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exams (
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
    exam_mode        ENUM('open','closed') NOT NULL DEFAULT 'closed',
    audience_mode    ENUM('dynamic','frozen') NOT NULL DEFAULT 'dynamic',
    audience_rules   JSON         NULL,
    created_by       VARCHAR(64)  NOT NULL,
    created_at       DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_exams_paper (paper_id),
    CONSTRAINT fk_exams_paper FOREIGN KEY (paper_id)
      REFERENCES papers(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_authors (
    exam_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (exam_id, user_id),
    KEY idx_exam_authors_user (user_id),
    CONSTRAINT fk_ea_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_ea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_records (
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
    grade_label     VARCHAR(32)  NOT NULL DEFAULT '',
    resume_allowed  TINYINT(1)   NOT NULL DEFAULT 0,
    subjective_scores JSON       NOT NULL,
    cheat_events    JSON         NOT NULL,
    review_notes    JSON         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_records_exam_user_attempt (exam_id, user_id, attempt_no),
    KEY idx_records_user (user_id),
    KEY idx_records_exam_status (exam_id, status),
    KEY idx_records_status_submitted (status, submitted_at),
    CONSTRAINT fk_records_exam FOREIGN KEY (exam_id)
      REFERENCES exams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_records_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_batches (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
    id         TINYINT      NOT NULL DEFAULT 1,
    settings   JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_progress (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_answers (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_wrong_book (
    id             VARCHAR(64) NOT NULL,
    user_id        VARCHAR(64) NOT NULL,
    question_id    VARCHAR(64) NOT NULL,
    wrong_count    INT NOT NULL DEFAULT 1,
    correct_streak INT NOT NULL DEFAULT 0,
    last_wrong_at  DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pwb_user_question (user_id, question_id),
    CONSTRAINT fk_pwb_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_favorites (
    id          VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    created_at  DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pf_user_question (user_id, question_id),
    KEY idx_pf_user (user_id),
    CONSTRAINT fk_pf_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_daily_tasks (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_settings (
    id         TINYINT      NOT NULL DEFAULT 1,
    settings   JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
    username     VARCHAR(64)  NOT NULL,
    fail_count   INT          NOT NULL DEFAULT 0,
    locked_until DATETIME(3)  NULL,
    updated_at   DATETIME(3)  NOT NULL,
    PRIMARY KEY (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key   VARCHAR(191) NOT NULL,
    count        INT          NOT NULL DEFAULT 0,
    window_start DATETIME(3)  NOT NULL,
    updated_at   DATETIME(3)  NOT NULL,
    PRIMARY KEY (bucket_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_retakes (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_import_batches (
    id            VARCHAR(64)  NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    total_rows    INT          NOT NULL DEFAULT 0,
    success_count INT          NOT NULL DEFAULT 0,
    fail_count    INT          NOT NULL DEFAULT 0,
    errors_json   JSON         NOT NULL,
    operator_id   VARCHAR(64)  NOT NULL,
    created_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_permissions (
    role       VARCHAR(64) NOT NULL,
    menu_keys  JSON         NOT NULL,
    updated_by VARCHAR(64)  NOT NULL DEFAULT '',
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_authors (
    bank_id    VARCHAR(64) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (bank_id, user_id),
    KEY idx_ba_user (user_id),
    CONSTRAINT fk_ba_bank FOREIGN KEY (bank_id)
      REFERENCES question_banks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ba_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS score_appeals (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_exceptions (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_logs (
    id          VARCHAR(64)  NOT NULL,
    username    VARCHAR(64)  NOT NULL,
    user_id     VARCHAR(64)  NULL,
    role        VARCHAR(16)  NOT NULL DEFAULT '',
    ip          VARCHAR(64)  NOT NULL DEFAULT '',
    user_agent  VARCHAR(255) NOT NULL DEFAULT '',
    success     TINYINT(1)   NOT NULL DEFAULT 0,
    reason      VARCHAR(64)  NOT NULL DEFAULT '',
    source      VARCHAR(16)  NOT NULL DEFAULT 'admin',
    created_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_login_logs_created (created_at),
    KEY idx_login_logs_username (username),
    KEY idx_login_logs_user (user_id),
    KEY idx_login_logs_source_created (source, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
    id           VARCHAR(64)  NOT NULL,
    user_id      VARCHAR(64)  NOT NULL,
    ip           VARCHAR(64)  NOT NULL DEFAULT '',
    user_agent   VARCHAR(255) NOT NULL DEFAULT '',
    created_at   DATETIME(3)  NOT NULL,
    last_seen_at DATETIME(3)  NOT NULL,
    revoked_at   DATETIME(3)  NULL,
    expires_at   DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_records_archive (
    id              VARCHAR(64)  NOT NULL,
    exam_id         VARCHAR(64)  NOT NULL,
    user_id         VARCHAR(64)  NOT NULL,
    attempt_no      INT          NOT NULL DEFAULT 1,
    department_id   VARCHAR(64)  NULL,
    paper_snapshot  JSON         NOT NULL,
    status          ENUM('in_progress','submitted','pending_review') NOT NULL DEFAULT 'submitted',
    answers         JSON         NOT NULL,
    started_at      DATETIME(3)  NOT NULL,
    submitted_at    DATETIME(3)  NULL,
    auto_submitted  TINYINT(1)   NOT NULL DEFAULT 0,
    score           DECIMAL(7,1) NOT NULL DEFAULT 0.0,
    grade_label     VARCHAR(32)  NOT NULL DEFAULT '',
    resume_allowed  TINYINT(1)   NOT NULL DEFAULT 0,
    subjective_scores JSON       NOT NULL,
    cheat_events    JSON         NOT NULL,
    review_notes    JSON         NULL,
    archived_at     DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_archive_exam (exam_id),
    KEY idx_archive_user (user_id),
    KEY idx_archive_archived_at (archived_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_recovery_codes (
    id         VARCHAR(64)  NOT NULL,
    user_id    VARCHAR(64)  NOT NULL,
    code_hash  VARCHAR(100) NOT NULL,
    used_at    DATETIME(3)  NULL,
    created_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_recovery_user (user_id),
    KEY idx_recovery_user_used (user_id, used_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attachments (
    id          VARCHAR(64)  NOT NULL,
    owner_id    VARCHAR(64)  NOT NULL,
    kind        VARCHAR(16)  NOT NULL,
    mime        VARCHAR(64)  NOT NULL,
    size        INT          NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    created_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_attachments_owner (owner_id),
    KEY idx_attachments_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
    id         VARCHAR(64)  NOT NULL,
    title      VARCHAR(120) NOT NULL,
    content    TEXT         NOT NULL,
    target     ENUM('exam','practice','both') NOT NULL DEFAULT 'both',
    level      ENUM('normal','important')     NOT NULL DEFAULT 'normal',
    pinned     TINYINT(1)   NOT NULL DEFAULT 0,
    enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    start_at   DATETIME(3)  NULL,
    end_at     DATETIME(3)  NULL,
    created_by VARCHAR(64)  NOT NULL,
    created_at DATETIME(3)  NOT NULL,
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_ann_target_enabled (target, enabled),
    KEY idx_ann_pinned_created (pinned, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banners (
    id         VARCHAR(64)  NOT NULL,
    title      VARCHAR(120) NOT NULL,
    image_url  VARCHAR(500) NOT NULL,
    link_url   VARCHAR(500) NOT NULL DEFAULT '',
    target     ENUM('exam','practice','both') NOT NULL DEFAULT 'both',
    sort_order INT          NOT NULL DEFAULT 0,
    enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    start_at   DATETIME(3)  NULL,
    end_at     DATETIME(3)  NULL,
    created_by VARCHAR(64)  NOT NULL,
    created_at DATETIME(3)  NOT NULL,
    updated_at DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_banner_target_enabled (target, enabled),
    KEY idx_banner_sort (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcement_reads (
    id              VARCHAR(64) NOT NULL,
    announcement_id VARCHAR(64) NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    scope           ENUM('exam','practice') NOT NULL,
    read_at         DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ann_read (announcement_id, user_id, scope),
    KEY idx_ann_read_ann (announcement_id),
    KEY idx_ann_read_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banner_clicks (
    id         VARCHAR(64) NOT NULL,
    banner_id  VARCHAR(64) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    scope      ENUM('exam','practice') NOT NULL,
    clicked_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_banner_click (banner_id, user_id, scope),
    KEY idx_banner_click_banner (banner_id),
    KEY idx_banner_click_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
    id          VARCHAR(64)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    parent_id   VARCHAR(64)  NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    status      ENUM('active','disabled') NOT NULL DEFAULT 'active',
    created_at  DATETIME(3)  NOT NULL,
    updated_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_subject_parent_name (parent_id, name),
    KEY idx_subject_parent (parent_id),
    CONSTRAINT fk_subject_parent FOREIGN KEY (parent_id) REFERENCES subjects(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS positions (
    id          VARCHAR(64)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  DATETIME(3)  NOT NULL,
    updated_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_position_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_groups (
    id          VARCHAR(64)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    role        ENUM('admin','author','examinee') NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  DATETIME(3)  NOT NULL,
    updated_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_group_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_group_members (
    group_id   VARCHAR(64) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (group_id, user_id),
    KEY idx_ugm_user (user_id),
    CONSTRAINT fk_ugm_group FOREIGN KEY (group_id) REFERENCES user_groups(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ugm_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subject_grants (
    id             VARCHAR(64) NOT NULL,
    subject_id     VARCHAR(64) NOT NULL,
    principal_type ENUM('role','group','position','user') NOT NULL,
    principal_id   VARCHAR(64) NOT NULL,
    effect         ENUM('allow','deny') NOT NULL DEFAULT 'allow',
    can_view       TINYINT(1) NOT NULL DEFAULT 1,
    can_edit       TINYINT(1) NOT NULL DEFAULT 0,
    created_at     DATETIME(3) NOT NULL,
    updated_at     DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_subject_grant (subject_id, principal_type, principal_id),
    KEY idx_subject_grant_principal (principal_type, principal_id),
    CONSTRAINT fk_subject_grant_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_overrides (
    user_id    VARCHAR(64) NOT NULL,
    menu_key   VARCHAR(64) NOT NULL,
    effect     ENUM('allow','deny') NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, menu_key),
    CONSTRAINT fk_menu_override_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_participants (
    exam_id       VARCHAR(64) NOT NULL,
    user_id       VARCHAR(64) NOT NULL,
    source        ENUM('department','template','include','legacy') NOT NULL,
    admission_no  VARCHAR(64) NOT NULL,
    created_at    DATETIME(3) NOT NULL,
    PRIMARY KEY (exam_id, user_id),
    UNIQUE KEY uk_exam_admission_no (exam_id, admission_no),
    KEY idx_exam_participant_user (user_id),
    CONSTRAINT fk_exam_participant_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_exam_participant_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_feedback (
    id            VARCHAR(64) NOT NULL,
    question_id   VARCHAR(64) NOT NULL,
    user_id       VARCHAR(64) NOT NULL,
    source        ENUM('exam','practice') NOT NULL,
    source_ref_id VARCHAR(64) NULL,
    category      VARCHAR(32) NOT NULL,
    content       VARCHAR(1000) NOT NULL,
    status        ENUM('pending','processing','resolved','closed') NOT NULL DEFAULT 'pending',
    reply         VARCHAR(1000) NOT NULL DEFAULT '',
    handled_by    VARCHAR(64) NULL,
    handled_at    DATETIME(3) NULL,
    created_at    DATETIME(3) NOT NULL,
    updated_at    DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_feedback_question (question_id),
    KEY idx_feedback_status_created (status, created_at),
    CONSTRAINT fk_feedback_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_sessions (
    id             VARCHAR(64) NOT NULL,
    user_id        VARCHAR(64) NOT NULL,
    bank_id        VARCHAR(64) NULL,
    mode           VARCHAR(24) NOT NULL,
    question_count INT NOT NULL DEFAULT 0,
    answered_count INT NOT NULL DEFAULT 0,
    correct_count  INT NOT NULL DEFAULT 0,
    status         ENUM('active','completed','exited') NOT NULL DEFAULT 'active',
    started_at     DATETIME(3) NOT NULL,
    last_seen_at   DATETIME(3) NOT NULL,
    ended_at       DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_practice_session_active (status, last_seen_at),
    KEY idx_practice_session_user (user_id, started_at),
    KEY idx_practice_session_bank (bank_id, started_at),
    CONSTRAINT fk_practice_session_bank FOREIGN KEY (bank_id) REFERENCES question_banks(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_session_answers (
    session_id  VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    answer      JSON NOT NULL,
    is_correct  TINYINT(1) NOT NULL,
    answered_at DATETIME(3) NOT NULL,
    PRIMARY KEY (session_id, question_id),
    KEY idx_psa_question (question_id),
    CONSTRAINT fk_psa_session FOREIGN KEY (session_id) REFERENCES practice_sessions(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_psa_question FOREIGN KEY (question_id) REFERENCES questions(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_view_departments (
    bank_id       VARCHAR(64) NOT NULL,
    department_id VARCHAR(64) NOT NULL,
    created_at    DATETIME(3) NOT NULL,
    PRIMARY KEY (bank_id, department_id),
    KEY idx_bvd_department (department_id),
    CONSTRAINT fk_bvd_bank FOREIGN KEY (bank_id) REFERENCES question_banks(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_bvd_department FOREIGN KEY (department_id) REFERENCES departments(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_view_users (
    bank_id    VARCHAR(64) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (bank_id, user_id),
    KEY idx_bvu_user (user_id),
    CONSTRAINT fk_bvu_bank FOREIGN KEY (bank_id) REFERENCES question_banks(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_bvu_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_tree_migration_reports (
    migration_key VARCHAR(64) NOT NULL,
    report_json   JSON        NOT NULL,
    updated_at    DATETIME(3) NOT NULL,
    PRIMARY KEY (migration_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Course catalogue, categories and account playback progress
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    sort_order INT NOT NULL DEFAULT 0,
    content_json JSON NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    KEY idx_course_status_sort (deleted_at, status, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_media (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    filename VARCHAR(100) NOT NULL,
    mime VARCHAR(50) NOT NULL,
    size BIGINT UNSIGNED NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_categories (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    revision INT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY uk_course_category_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_progress (
    user_id VARCHAR(64) NOT NULL,
    course_id VARCHAR(64) NOT NULL,
    lesson_id VARCHAR(64) NOT NULL,
    position_seconds DOUBLE NOT NULL DEFAULT 0,
    duration_seconds DOUBLE NOT NULL DEFAULT 0,
    completed TINYINT(1) NOT NULL DEFAULT 0,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    client_id VARCHAR(64) NOT NULL DEFAULT '',
    client_sequence BIGINT UNSIGNED NOT NULL DEFAULT 0,
    selected_at DATETIME(6) NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, course_id, lesson_id),
    CONSTRAINT fk_course_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_course_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- App distribution
CREATE TABLE IF NOT EXISTS app_releases (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  app_name VARCHAR(60) NOT NULL,
  version_name VARCHAR(40) NOT NULL,
  version_code INT UNSIGNED NOT NULL,
  min_android VARCHAR(20) NOT NULL DEFAULT '8.0',
  release_notes TEXT NOT NULL,
  file_key VARCHAR(80) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status ENUM('draft','published','withdrawn') NOT NULL DEFAULT 'draft',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  download_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  published_at DATETIME(3) NULL,
  UNIQUE KEY uk_app_version (version_code),
  KEY idx_app_public (status, version_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
