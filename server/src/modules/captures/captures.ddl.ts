// No foreign key to exam_records: archival moves records into a separate table.
export const CAPTURE_DDL = [
  `CREATE TABLE IF NOT EXISTS exam_capture_sessions (
    record_id VARCHAR(64) NOT NULL PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL, attempt_no INT NOT NULL,
    config JSON NOT NULL, camera_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
    status_at DATETIME(3) NULL, KEY idx_capture_session_exam (exam_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS exam_captures (
    id VARCHAR(64) NOT NULL PRIMARY KEY, record_id VARCHAR(64) NOT NULL,
    capture_id VARCHAR(64) NOT NULL, kind VARCHAR(16) NOT NULL,
    storage_key VARCHAR(80) NOT NULL, size INT NOT NULL,
    received_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL, deleted_at DATETIME(3) NULL,
    removed_at DATETIME(3) NULL, removed_by VARCHAR(64) NULL, removed_by_name VARCHAR(100) NULL,
    UNIQUE KEY uk_capture_retry (record_id, capture_id),
    KEY idx_capture_record_time (record_id, received_at), KEY idx_capture_expiry (deleted_at, expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS exam_camera_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY, record_id VARCHAR(64) NOT NULL,
    event_id VARCHAR(64) NOT NULL, status VARCHAR(24) NOT NULL, reason VARCHAR(255) NOT NULL,
    received_at DATETIME(3) NOT NULL, UNIQUE KEY uk_camera_event (record_id, event_id),
    KEY idx_camera_record_time (record_id, received_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
] as const;
