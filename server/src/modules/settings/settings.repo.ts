/**
 * 系统设置模块 —— 数据访问层（单行表，应用层永远使用 id = 1）。
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import { nowDb } from '../../utils/datetime.js';

/** `system_settings` 表原始行。 */
export interface SystemSettingsRow extends RowDataPacket {
  id: number;
  settings: unknown;
  updated_by: string;
  updated_at: string;
}

/** 读取单行设置（id = 1）。不存在时返回 null。 */
export async function findRaw(): Promise<SystemSettingsRow | null> {
  const rows = await query<SystemSettingsRow[]>(
    'SELECT id, settings, updated_by, updated_at FROM system_settings WHERE id = 1 LIMIT 1',
  );
  return rows[0] ?? null;
}

/** 写回单行设置（UPSERT，id 恒为 1）。 */
export async function saveRaw(settingsJson: string, updatedBy: string): Promise<void> {
  await query<ResultSetHeader>(
    `INSERT INTO system_settings (id, settings, updated_by, updated_at)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
    [settingsJson, updatedBy, nowDb()],
  );
}
