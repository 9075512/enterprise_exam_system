/**
 * 富文本附件 —— 数据访问层（v1.8④ U4）。
 *
 * 仅存**元数据**（归属、类型、体积、存储键）；文件本体由 `utils/attachmentStore` 负责。
 * 表 `attachments` **无外键**：账号删除后附件记录自包含，便于独立清理。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import { toDbDate } from '../../utils/datetime.js';

/** 附件元数据行。 */
export interface AttachmentRow extends RowDataPacket {
  id: string;
  owner_id: string;
  kind: string;
  mime: string;
  size: number;
  storage_key: string;
  created_at: string;
}

/** 新建附件记录。 */
export async function insert(row: {
  id: string;
  ownerId: string;
  kind: string;
  mime: string;
  size: number;
  storageKey: string;
}): Promise<void> {
  await query(
    `INSERT INTO attachments (id, owner_id, kind, mime, size, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.ownerId, row.kind, row.mime, row.size, row.storageKey, toDbDate(new Date())],
  );
}

/** 按 id 查附件元数据。 */
export async function findById(id: string): Promise<AttachmentRow | null> {
  const rows = await query<AttachmentRow[]>(
    `SELECT id, owner_id, kind, mime, size, storage_key, created_at
       FROM attachments WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 统计某用户的附件数量（供配额/展示）。 */
export async function countByOwner(ownerId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM attachments WHERE owner_id = ?',
    [ownerId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 删除附件记录（文件本体由调用方按存储键清理）。 */
export async function remove(id: string): Promise<void> {
  await query('DELETE FROM attachments WHERE id = ?', [id]);
}
