-- ============================================================
-- 公网练题实例 —— 最小权限数据库账号授权（可复跑，幂等）
-- 文档：docs/06-architecture-practice-increment.md §1.3 / §3.7 / T05
--
-- 约定：
--   * 仅作用于本库 enterprise_exam_system；
--   * 严禁对同实例 exam_system 库做任何 DDL/DML（本脚本亦不涉及）；
--   * practice_app 对 users 仅「列级 SELECT」；对考试域表零权限。
--
-- 执行：以具备 GRANT 权限的账号（如 root）执行本脚本（db:init 不执行授权）。
--   mysql -u root -p < deploy/db-grants-practice.sql
--
-- ⚠️ 请先替换 <PRACTICE_DB_PASSWORD> 为强口令（或在执行前用变量替换）。
-- ============================================================

SET NAMES utf8mb4;

-- 1. 创建账号（幂等）
CREATE USER IF NOT EXISTS 'practice_app'@'%' IDENTIFIED BY '<PRACTICE_DB_PASSWORD>';

-- 2. 先回收该账号在本库的全部权限，保证「可复跑」后权限收敛为最小集
REVOKE ALL PRIVILEGES, GRANT OPTION ON `enterprise_exam_system`.* FROM 'practice_app'@'%';

-- 3. 登录校验 / 登录态回显：users 仅列级 SELECT（绝不 INSERT/UPDATE/DELETE）
--    含 department_id，用于「我的」页回显本人所属科室
GRANT SELECT (id, username, password_hash, name, role, department_id, status)
  ON `enterprise_exam_system`.`users` TO 'practice_app'@'%';

-- 3.1 科室名（仅回显本人科室）：departments 仅列级 SELECT id/name，绝不写入
GRANT SELECT (id, name)
  ON `enterprise_exam_system`.`departments` TO 'practice_app'@'%';

-- 4. 题域只读（仅允许读取；题目内容由应用层按 allow_practice=1 过滤）
GRANT SELECT ON `enterprise_exam_system`.`questions`        TO 'practice_app'@'%';
GRANT SELECT ON `enterprise_exam_system`.`question_banks`   TO 'practice_app'@'%';

-- 5. 练题自身数据：读写
GRANT SELECT, INSERT, UPDATE, DELETE ON `enterprise_exam_system`.`practice_progress`   TO 'practice_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `enterprise_exam_system`.`practice_answers`    TO 'practice_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `enterprise_exam_system`.`practice_wrong_book` TO 'practice_app'@'%';

-- 5.1 二期新增：收藏夹 / 每日一练任务（练题实例读写）
GRANT SELECT, INSERT, UPDATE, DELETE ON `enterprise_exam_system`.`practice_favorites`   TO 'practice_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `enterprise_exam_system`.`practice_daily_tasks` TO 'practice_app'@'%';

-- 5.2 二期新增：练题配置（**只读**）
--     写入由内网实例（管理端「系统设置 → 公网练题」）完成，练题实例绝不写配置。
GRANT SELECT ON `enterprise_exam_system`.`practice_settings` TO 'practice_app'@'%';

-- 6. 说明：以下考试域表**不授予任何权限**（物理隔离）：
--    papers / paper_questions / paper_bank_refs /
--    exams / exam_records / import_batches / system_settings
--    注：system_settings 保持零授权不变——练题配置存于独立表 practice_settings（仅 SELECT）。

FLUSH PRIVILEGES;

-- 7. 校验：应仅看到上述授权（人工复核用）
-- SHOW GRANTS FOR 'practice_app'@'%';
