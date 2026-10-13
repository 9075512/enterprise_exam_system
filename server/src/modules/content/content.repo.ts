/**
 * 内容运营（公告 / 轮播图）—— 数据访问层（v1.9⑥）。
 *
 * 隔离说明：本模块的**读**查询同时被内网实例（管理端 + 考试端）与
 * 公网练题实例（PRACTICE_ONLY，仅 `/api/practice/*`）使用；
 * 写操作只由内网实例的管理端调用（练题账号对新表仅授 SELECT）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `announcements` 表原始行（含 JOIN users 得到的创建人姓名）。 */
export interface AnnouncementRow extends RowDataPacket {
  id: string;
  title: string;
  content: string;
  target: string;
  level: string;
  pinned: number | boolean;
  enabled: number | boolean;
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** `banners` 表原始行（含 JOIN users 得到的创建人姓名）。 */
export interface BannerRow extends RowDataPacket {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  target: string;
  sort_order: number;
  enabled: number | boolean;
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const ANN_COLUMNS = `a.id, a.title, a.content, a.target, a.level, a.pinned, a.enabled,
  a.start_at, a.end_at, a.created_by, u.name AS created_by_name, a.created_at, a.updated_at`;

const BANNER_COLUMNS = `b.id, b.title, b.image_url, b.link_url, b.target, b.sort_order, b.enabled,
  b.start_at, b.end_at, b.created_by, u.name AS created_by_name, b.created_at, b.updated_at`;

/** 管理端列表过滤条件。 */
export interface ContentListFilter {
  target?: string;
  enabled?: boolean;
  keyword?: string;
}

/** 拼装管理端过滤 SQL 片段与参数（列表 / 计数同口径）。 */
function buildFilter(
  alias: string,
  filter: ContentListFilter,
): { sql: string; params: Array<string | number | boolean | Date | null> } {
  const conds: string[] = [];
  const params: Array<string | number | boolean | Date | null> = [];
  if (filter.target) {
    conds.push(`${alias}.target = ?`);
    params.push(filter.target);
  }
  if (filter.enabled !== undefined) {
    conds.push(`${alias}.enabled = ?`);
    params.push(filter.enabled ? 1 : 0);
  }
  if (filter.keyword) {
    conds.push(`(${alias}.title LIKE ? OR ${alias}.content LIKE ? OR ${alias}.id LIKE ?)`);
    const like = `%${filter.keyword}%`;
    params.push(like, like, like);
  }
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

/* ------------------------------ 公告 ------------------------------ */

/** 管理端公告分页列表（置顶优先、创建时间倒序）。 */
export async function listAnnouncements(
  filter: ContentListFilter,
  paging: { pageSize: number; offset: number },
): Promise<AnnouncementRow[]> {
  const f = buildFilter('a', filter);
  return query<AnnouncementRow[]>(
    `SELECT ${ANN_COLUMNS} FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ${f.sql}
       ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    [...f.params, paging.pageSize, paging.offset],
  );
}

/** 管理端公告总数（与列表同口径）。 */
export async function countAnnouncements(filter: ContentListFilter): Promise<number> {
  const f = buildFilter('a', filter);
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM announcements a ${f.sql}`, f.params);
  return Number(rows[0]?.c ?? 0);
}

/** 按 id 查公告。 */
export async function findAnnouncementById(id: string): Promise<AnnouncementRow | null> {
  const rows = await query<AnnouncementRow[]>(
    `SELECT ${ANN_COLUMNS} FROM announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 两端可见公告（enabled=1 且在生效时间窗内；置顶优先）。 */
export async function listVisibleAnnouncements(
  scope: 'exam' | 'practice',
  now: string,
  limit: number,
): Promise<AnnouncementRow[]> {
  return query<AnnouncementRow[]>(
    `SELECT ${ANN_COLUMNS} FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.enabled = 1
        AND a.target IN (?, 'both')
        AND (a.start_at IS NULL OR a.start_at <= ?)
        AND (a.end_at IS NULL OR a.end_at >= ?)
      ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC
      LIMIT ?`,
    [scope, now, now, limit],
  );
}

/** 新建公告。 */
export async function insertAnnouncement(row: {
  id: string;
  title: string;
  content: string;
  target: string;
  level: string;
  pinned: boolean;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}, exec?: SqlExecutor): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO announcements
       (id, title, content, target, level, pinned, enabled, start_at, end_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.title,
      row.content,
      row.target,
      row.level,
      row.pinned ? 1 : 0,
      row.enabled ? 1 : 0,
      row.startAt,
      row.endAt,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
    ],
  );
}

/** 全量更新公告（编辑表单为整对象提交）。 */
export async function updateAnnouncement(
  id: string,
  row: {
    title: string;
    content: string;
    target: string;
    level: string;
    pinned: boolean;
    enabled: boolean;
    startAt: string | null;
    endAt: string | null;
    updatedAt: string;
  },
): Promise<void> {
  await runQuery(
    undefined,
    `UPDATE announcements
        SET title = ?, content = ?, target = ?, level = ?, pinned = ?, enabled = ?,
            start_at = ?, end_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      row.title,
      row.content,
      row.target,
      row.level,
      row.pinned ? 1 : 0,
      row.enabled ? 1 : 0,
      row.startAt,
      row.endAt,
      row.updatedAt,
      id,
    ],
  );
}

/** 删除公告。 */
export async function deleteAnnouncement(id: string): Promise<void> {
  await runQuery(undefined, `DELETE FROM announcements WHERE id = ?`, [id]);
}

/* ------------------------------ 轮播图 ------------------------------ */

/** 管理端轮播图分页列表（排序值升序）。 */
export async function listBanners(
  filter: ContentListFilter,
  paging: { pageSize: number; offset: number },
): Promise<BannerRow[]> {
  const f = buildFilter('b', filter);
  return query<BannerRow[]>(
    `SELECT ${BANNER_COLUMNS} FROM banners b
       LEFT JOIN users u ON u.id = b.created_by
       ${f.sql}
       ORDER BY b.sort_order ASC, b.created_at DESC, b.id DESC
       LIMIT ? OFFSET ?`,
    [...f.params, paging.pageSize, paging.offset],
  );
}

/** 管理端轮播图总数。 */
export async function countBanners(filter: ContentListFilter): Promise<number> {
  const f = buildFilter('b', filter);
  const rows = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM banners b ${f.sql}`, f.params);
  return Number(rows[0]?.c ?? 0);
}

/** 按 id 查轮播图。 */
export async function findBannerById(id: string): Promise<BannerRow | null> {
  const rows = await query<BannerRow[]>(
    `SELECT ${BANNER_COLUMNS} FROM banners b LEFT JOIN users u ON u.id = b.created_by WHERE b.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** 两端可见轮播图（enabled=1 且在生效时间窗内；排序值升序）。 */
export async function listVisibleBanners(
  scope: 'exam' | 'practice',
  now: string,
  limit: number,
): Promise<BannerRow[]> {
  return query<BannerRow[]>(
    `SELECT ${BANNER_COLUMNS} FROM banners b
       LEFT JOIN users u ON u.id = b.created_by
      WHERE b.enabled = 1
        AND b.target IN (?, 'both')
        AND (b.start_at IS NULL OR b.start_at <= ?)
        AND (b.end_at IS NULL OR b.end_at >= ?)
      ORDER BY b.sort_order ASC, b.created_at DESC, b.id DESC
      LIMIT ?`,
    [scope, now, now, limit],
  );
}

/** 新建轮播图。 */
export async function insertBanner(row: {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  target: string;
  sortOrder: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}, exec?: SqlExecutor): Promise<void> {
  await runQuery(
    exec,
    `INSERT INTO banners
       (id, title, image_url, link_url, target, sort_order, enabled, start_at, end_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.title,
      row.imageUrl,
      row.linkUrl,
      row.target,
      row.sortOrder,
      row.enabled ? 1 : 0,
      row.startAt,
      row.endAt,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
    ],
  );
}

/** 全量更新轮播图。 */
export async function updateBanner(
  id: string,
  row: {
    title: string;
    imageUrl: string;
    linkUrl: string;
    target: string;
    sortOrder: number;
    enabled: boolean;
    startAt: string | null;
    endAt: string | null;
    updatedAt: string;
  },
): Promise<void> {
  await runQuery(
    undefined,
    `UPDATE banners
        SET title = ?, image_url = ?, link_url = ?, target = ?, sort_order = ?, enabled = ?,
            start_at = ?, end_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      row.title,
      row.imageUrl,
      row.linkUrl,
      row.target,
      row.sortOrder,
      row.enabled ? 1 : 0,
      row.startAt,
      row.endAt,
      row.updatedAt,
      id,
    ],
  );
}

/** 删除轮播图。 */
export async function deleteBanner(id: string): Promise<void> {
  await runQuery(undefined, `DELETE FROM banners WHERE id = ?`, [id]);
}
