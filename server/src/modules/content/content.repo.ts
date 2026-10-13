/**
 * 内容运营（公告 / 轮播图）—— 数据访问层（v1.9⑥）。
 *
 * 隔离说明：本模块的**读**查询同时被内网实例（管理端 + 考试端）与
 * 公网练题实例（PRACTICE_ONLY，仅 `/api/practice/*`）使用；
 * 写操作只由内网实例的管理端调用（练题账号对新表仅授 SELECT）。
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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
  opts: { withContent?: boolean } = {},
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
    // banners 表无 content 列（仅公告有正文），必须按表区分，否则 SQL 会因未知列报错
    const cols = opts.withContent
      ? `(${alias}.title LIKE ? OR ${alias}.content LIKE ? OR ${alias}.id LIKE ?)`
      : `(${alias}.title LIKE ? OR ${alias}.id LIKE ?)`;
    conds.push(cols);
    const like = `%${filter.keyword}%`;
    params.push(...(opts.withContent ? [like, like, like] : [like, like]));
  }
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

/* ------------------------------ 公告 ------------------------------ */

/** 管理端公告分页列表（置顶优先、创建时间倒序）。 */
export async function listAnnouncements(
  filter: ContentListFilter,
  paging: { pageSize: number; offset: number },
): Promise<AnnouncementRow[]> {
  const f = buildFilter('a', filter, { withContent: true });
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
  const f = buildFilter('a', filter, { withContent: true });
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

/* ------------------------------ 批量操作（v2.0④） ------------------------------ */

/** 批量启停公告，返回受影响行数。 */
export async function setAnnouncementsEnabled(ids: string[], enabled: boolean, updatedAt: string): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await runQuery<ResultSetHeader>(
    undefined,
    `UPDATE announcements SET enabled = ?, updated_at = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, updatedAt, ...ids],
  );
  return Number(res.affectedRows ?? 0);
}

/** 批量删除公告，返回受影响行数。 */
export async function deleteAnnouncements(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await runQuery<ResultSetHeader>(
    undefined,
    `DELETE FROM announcements WHERE id IN (${placeholders})`,
    ids,
  );
  return Number(res.affectedRows ?? 0);
}

/** 批量启停轮播图，返回受影响行数。 */
export async function setBannersEnabled(ids: string[], enabled: boolean, updatedAt: string): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await runQuery<ResultSetHeader>(
    undefined,
    `UPDATE banners SET enabled = ?, updated_at = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, updatedAt, ...ids],
  );
  return Number(res.affectedRows ?? 0);
}

/** 批量删除轮播图，返回受影响行数。 */
export async function deleteBanners(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await runQuery<ResultSetHeader>(
    undefined,
    `DELETE FROM banners WHERE id IN (${placeholders})`,
    ids,
  );
  return Number(res.affectedRows ?? 0);
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

/* ------------------------------ 触达回执（v2.0③） ------------------------------ */

/** 已读人数统计（total = 去重人数；exam / practice 按端拆分）。 */
export interface TouchCount {
  total: number;
  exam: number;
  practice: number;
}

/**
 * 记录公告已读（同一用户同一端幂等）。
 * `INSERT IGNORE` 依赖唯一键 `uk_ann_read(announcement_id, user_id, scope)`。
 */
export async function insertAnnouncementRead(row: {
  id: string;
  announcementId: string;
  userId: string;
  scope: string;
  readAt: string;
}): Promise<void> {
  await runQuery(
    undefined,
    `INSERT IGNORE INTO announcement_reads (id, announcement_id, user_id, scope, read_at)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.announcementId, row.userId, row.scope, row.readAt],
  );
}

/** 记录轮播点击（同一用户同一端幂等）。 */
export async function insertBannerClick(row: {
  id: string;
  bannerId: string;
  userId: string;
  scope: string;
  clickedAt: string;
}): Promise<void> {
  await runQuery(
    undefined,
    `INSERT IGNORE INTO banner_clicks (id, banner_id, user_id, scope, clicked_at)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.bannerId, row.userId, row.scope, row.clickedAt],
  );
}

/** 批量统计公告已读人数（按端拆分）。 */
export async function countReadsForAnnouncements(ids: string[]): Promise<Map<string, TouchCount>> {
  const map = new Map<string, TouchCount>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query<RowDataPacket[]>(
    `SELECT announcement_id AS id,
            COUNT(DISTINCT user_id) AS total,
            COUNT(DISTINCT CASE WHEN scope = 'exam' THEN user_id END) AS exam,
            COUNT(DISTINCT CASE WHEN scope = 'practice' THEN user_id END) AS practice
       FROM announcement_reads
      WHERE announcement_id IN (${placeholders})
      GROUP BY announcement_id`,
    ids,
  );
  for (const r of rows) {
    map.set(String(r.id), { total: Number(r.total), exam: Number(r.exam), practice: Number(r.practice) });
  }
  return map;
}

/** 批量统计轮播点击人数（按端拆分）。 */
export async function countClicksForBanners(ids: string[]): Promise<Map<string, TouchCount>> {
  const map = new Map<string, TouchCount>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query<RowDataPacket[]>(
    `SELECT banner_id AS id,
            COUNT(DISTINCT user_id) AS total,
            COUNT(DISTINCT CASE WHEN scope = 'exam' THEN user_id END) AS exam,
            COUNT(DISTINCT CASE WHEN scope = 'practice' THEN user_id END) AS practice
       FROM banner_clicks
      WHERE banner_id IN (${placeholders})
      GROUP BY banner_id`,
    ids,
  );
  for (const r of rows) {
    map.set(String(r.id), { total: Number(r.total), exam: Number(r.exam), practice: Number(r.practice) });
  }
  return map;
}

/** 触达看板：最近公告 / 轮播及其触达数（管理端）。 */
export async function listAnnouncementsForStats(limit: number): Promise<Array<{ id: string; title: string; target: string }>> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, title, target FROM announcements ORDER BY created_at DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ id: String(r.id), title: String(r.title), target: String(r.target) }));
}

export async function listBannersForStats(limit: number): Promise<Array<{ id: string; title: string; target: string }>> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, title, target FROM banners ORDER BY created_at DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ id: String(r.id), title: String(r.title), target: String(r.target) }));
}

/** 统计受众人数（触达率分母）。 */
export async function countAudience(): Promise<{ exam: number; practice: number }> {
  const rows = await query<RowDataPacket[]>(
    `SELECT
        SUM(CASE WHEN role = 'examinee' THEN 1 ELSE 0 END) AS examinee,
        COUNT(*) AS all_users
       FROM users
      WHERE status = 'active'`,
  );
  return { exam: Number(rows[0]?.examinee ?? 0), practice: Number(rows[0]?.all_users ?? 0) };
}
