-- ============================================================
-- 悬垂练题数据清理（弱关联 user_id）
-- 文档：docs/06-architecture-practice-increment.md §3.4 / T05
--
-- 背景：practice_*.user_id 为「弱关联」（数据库层无外键）。内网删除用户后，
--       其练题数据可能残留（悬垂 user_id）。本脚本清理「user_id 不在 users 中」的行。
--
-- 前提：本操作仅作用于本库 enterprise_exam_system；对 users 只读（JOIN 过滤）。
-- 执行：mysql -u root -p enterprise_exam_system < deploy/cleanup-orphan-practice.sql
-- 建议：先执行「第 1 步预览」，确认数量后再执行「第 2 步清理」。
-- ============================================================

SET NAMES utf8mb4;

-- 1. 预览：各表悬垂行数
SELECT 'practice_progress' AS table_name, COUNT(*) AS orphan_rows
  FROM practice_progress pp
  LEFT JOIN users u ON u.id = pp.user_id
  WHERE u.id IS NULL
UNION ALL
SELECT 'practice_answers', COUNT(*)
  FROM practice_answers pa
  LEFT JOIN users u ON u.id = pa.user_id
  WHERE u.id IS NULL
UNION ALL
SELECT 'practice_wrong_book', COUNT(*)
  FROM practice_wrong_book wb
  LEFT JOIN users u ON u.id = wb.user_id
  WHERE u.id IS NULL;

-- 2. 清理悬垂练题数据（按需取消注释执行）
-- DELETE pp FROM practice_progress pp
--   LEFT JOIN users u ON u.id = pp.user_id
--   WHERE u.id IS NULL;

-- DELETE pa FROM practice_answers pa
--   LEFT JOIN users u ON u.id = pa.user_id
--   WHERE u.id IS NULL;

-- DELETE wb FROM practice_wrong_book wb
--   LEFT JOIN users u ON u.id = wb.user_id
--   WHERE u.id IS NULL;
