/**
 * 练题配置 —— 数据访问层（单行表 `practice_settings`，应用层永远使用 id = 1）。
 *
 * ⚠️ 隔离说明：
 * - **练题实例（PRACTICE_ONLY）只读本表**（最小权限账号 `practice_app` 仅授 SELECT）；
 * - 写入由**内网实例**经 `/api/settings/practice` 完成（`settingsRouter` 在 PRACTICE_ONLY 下不注册）；
 * - 本表为练题域自有表，**不涉及**内网 `system_settings`（一期约定：practice_app 对其零授权）。
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import { nowDb } from '../../utils/datetime.js';

/** `practice_settings` 表原始行。 */
export interface PracticeSettingsRow extends RowDataPacket {
  id: number;
  settings: unknown;
  updated_by: string;
  updated_at: string;
}

/** 读取单行配置（id = 1）。不存在时返回 null。 */
export async function findRaw(): Promise<PracticeSettingsRow | null> {
  const rows = await query<PracticeSettingsRow[]>(
    'SELECT id, settings, updated_by, updated_at FROM practice_settings WHERE id = 1 LIMIT 1',
  );
  return rows[0] ?? null;
}

/**
 * 写回单行配置（UPSERT，id 恒为 1）。
 * 仅内网实例（管理端）调用；练题实例的 DB 账号无 UPDATE/INSERT 权限。
 */
export async function saveRaw(settingsJson: string, updatedBy: string): Promise<void> {
  await query<ResultSetHeader>(
    `INSERT INTO practice_settings (id, settings, updated_by, updated_at)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
    [settingsJson, updatedBy, nowDb()],
  );
}
