/**
 * 内容运营（公告 / 轮播图）—— 业务逻辑层（v1.9⑥）。
 *
 * 能力：
 * - 管理端：公告 / 轮播图的增删改查（含发布范围、启停、置顶、排序、生效时间窗）；
 * - 考生侧：`getFeed(scope)` 按端聚合「当前生效」的公告与轮播图，
 *   考试端（scope=exam）与练题端（scope=practice）共用同一实现；
 * - 所有写操作落审计日志（content.create / content.update / content.delete）。
 *
 * 「生效」判定（服务端统一口径，避免两端各算一遍）：
 *   enabled = 1 且 target ∈ {scope, 'both'} 且（start_at 为空或已到）且（end_at 为空或未过）。
 */
import * as repo from './content.repo.js';
import type { AnnouncementRow, BannerRow } from './content.repo.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { isRichTextEmpty, sanitizeRichText } from '../../utils/richText.js';
import { genId } from '../../utils/id.js';
import { nowDb, toDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import * as auditService from '../audit/audit.service.js';
import type {
  AnnouncementDto,
  AnnouncementLevel,
  BannerDto,
  ContentFeedDto,
  ContentTarget,
  Page,
} from '../../types/domain.js';
import type { AnnouncementBodyInput, BannerBodyInput, ContentListQueryInput } from './content.schema.js';

/** 考生侧单次下发的最大条数（防止一次性拉回全部历史内容）。 */
const FEED_ANNOUNCEMENT_LIMIT = 20;
const FEED_BANNER_LIMIT = 10;

/** 公告富文本净化上限（与 content.schema 的 20000 长度上限一致）。 */
const ANNOUNCEMENT_RICH = { maxLength: 20000, maxImages: 5, maxImageBytes: 1024 * 1024 };

/**
 * 公告正文净化（v2.0①）：
 * 采用与简答题作答相同的白名单策略（`utils/richText.sanitizeRichText`），
 * 仅保留安全标签 / 属性，图片仅接受内联 data URI 与站内附件签名 URL。
 * 净化后为空（如只提交 `<p><br></p>`）→ 1001。
 */
function sanitizeAnnouncementContent(raw: string): string {
  const html = sanitizeRichText(raw, ANNOUNCEMENT_RICH);
  if (isRichTextEmpty(html)) throw badRequest('公告内容不能为空');
  return html;
}

/** 是否处于「正在生效」状态（服务端口径）。 */
function isActive(row: { enabled: number | boolean; start_at: string | null; end_at: string | null }, now: string): boolean {
  if (!Number(row.enabled)) return false;
  if (row.start_at && row.start_at > now) return false;
  if (row.end_at && row.end_at < now) return false;
  return true;
}

/** 行 → 公告 DTO。 */
function mapAnnouncement(row: AnnouncementRow, now: string): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    target: row.target as ContentTarget,
    level: row.level as AnnouncementLevel,
    pinned: Number(row.pinned) === 1,
    enabled: Number(row.enabled) === 1,
    startAt: row.start_at ? fromDbDateSafe(row.start_at) : null,
    endAt: row.end_at ? fromDbDateSafe(row.end_at) : null,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? '',
    createdAt: fromDbDateSafe(row.created_at),
    updatedAt: fromDbDateSafe(row.updated_at),
    active: isActive(row, now),
  };
}

/** 行 → 轮播图 DTO。 */
function mapBanner(row: BannerRow, now: string): BannerDto {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    target: row.target as ContentTarget,
    sortOrder: Number(row.sort_order),
    enabled: Number(row.enabled) === 1,
    startAt: row.start_at ? fromDbDateSafe(row.start_at) : null,
    endAt: row.end_at ? fromDbDateSafe(row.end_at) : null,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? '',
    createdAt: fromDbDateSafe(row.created_at),
    updatedAt: fromDbDateSafe(row.updated_at),
    active: isActive(row, now),
  };
}

/** 归一化时间窗入参 → DB 可写格式（undefined → null）。 */
function toWindow(value?: string): string | null {
  return value ? toDbDate(value) : null;
}

/* ------------------------------ 管理端：公告 ------------------------------ */

/** 公告分页列表。 */
export async function listAnnouncements(query: ContentListQueryInput): Promise<Page<AnnouncementDto>> {
  const { page, pageSize, offset } = normalizePaging(query.page, query.pageSize);
  const filter = { target: query.target, enabled: query.enabled, keyword: query.keyword };
  const [rows, total] = await Promise.all([
    repo.listAnnouncements(filter, { pageSize, offset }),
    repo.countAnnouncements(filter),
  ]);
  const now = nowDb();
  return buildPage(rows.map((r) => mapAnnouncement(r, now)), total, page, pageSize);
}

/** 新建公告。 */
export async function createAnnouncement(actorId: string, input: AnnouncementBodyInput): Promise<AnnouncementDto> {
  const id = genId('ann-');
  const now = nowDb();
  const content = sanitizeAnnouncementContent(input.content);
  await repo.insertAnnouncement({
    id,
    title: input.title,
    content,
    target: input.target,
    level: input.level,
    pinned: input.pinned,
    enabled: input.enabled,
    startAt: toWindow(input.startAt),
    endAt: toWindow(input.endAt),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  void auditService.record({
    actorId,
    action: 'content.create',
    targetType: 'announcement',
    targetId: id,
    targetName: input.title,
    detail: { target: input.target, level: input.level, enabled: input.enabled, pinned: input.pinned },
  });
  const row = await repo.findAnnouncementById(id);
  return mapAnnouncement(row!, now);
}

/** 编辑公告（整对象覆盖）。 */
export async function updateAnnouncement(
  actorId: string,
  id: string,
  input: AnnouncementBodyInput,
): Promise<AnnouncementDto> {
  const existing = await repo.findAnnouncementById(id);
  if (!existing) throw notFound('公告不存在或已被删除');
  const now = nowDb();
  const content = sanitizeAnnouncementContent(input.content);
  await repo.updateAnnouncement(id, {
    title: input.title,
    content,
    target: input.target,
    level: input.level,
    pinned: input.pinned,
    enabled: input.enabled,
    startAt: toWindow(input.startAt),
    endAt: toWindow(input.endAt),
    updatedAt: now,
  });
  void auditService.record({
    actorId,
    action: 'content.update',
    targetType: 'announcement',
    targetId: id,
    targetName: input.title,
    detail: { target: input.target, level: input.level, enabled: input.enabled, pinned: input.pinned },
  });
  const row = await repo.findAnnouncementById(id);
  return mapAnnouncement(row!, now);
}

/** 删除公告。 */
export async function deleteAnnouncement(actorId: string, id: string): Promise<void> {
  const existing = await repo.findAnnouncementById(id);
  if (!existing) throw notFound('公告不存在或已被删除');
  await repo.deleteAnnouncement(id);
  void auditService.record({
    actorId,
    action: 'content.delete',
    targetType: 'announcement',
    targetId: id,
    targetName: existing.title,
    detail: { target: existing.target },
  });
}

/* ------------------------------ 管理端：轮播图 ------------------------------ */

/** 轮播图分页列表。 */
export async function listBanners(query: ContentListQueryInput): Promise<Page<BannerDto>> {
  const { page, pageSize, offset } = normalizePaging(query.page, query.pageSize);
  const filter = { target: query.target, enabled: query.enabled, keyword: query.keyword };
  const [rows, total] = await Promise.all([
    repo.listBanners(filter, { pageSize, offset }),
    repo.countBanners(filter),
  ]);
  const now = nowDb();
  return buildPage(rows.map((r) => mapBanner(r, now)), total, page, pageSize);
}

/** 新建轮播图。 */
export async function createBanner(actorId: string, input: BannerBodyInput): Promise<BannerDto> {
  const id = genId('bn-');
  const now = nowDb();
  await repo.insertBanner({
    id,
    title: input.title,
    imageUrl: input.imageUrl,
    linkUrl: input.linkUrl,
    target: input.target,
    sortOrder: input.sortOrder,
    enabled: input.enabled,
    startAt: toWindow(input.startAt),
    endAt: toWindow(input.endAt),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  void auditService.record({
    actorId,
    action: 'content.create',
    targetType: 'banner',
    targetId: id,
    targetName: input.title,
    detail: { target: input.target, sortOrder: input.sortOrder, enabled: input.enabled },
  });
  const row = await repo.findBannerById(id);
  return mapBanner(row!, now);
}

/** 编辑轮播图（整对象覆盖）。 */
export async function updateBanner(actorId: string, id: string, input: BannerBodyInput): Promise<BannerDto> {
  const existing = await repo.findBannerById(id);
  if (!existing) throw notFound('轮播图不存在或已被删除');
  const now = nowDb();
  await repo.updateBanner(id, {
    title: input.title,
    imageUrl: input.imageUrl,
    linkUrl: input.linkUrl,
    target: input.target,
    sortOrder: input.sortOrder,
    enabled: input.enabled,
    startAt: toWindow(input.startAt),
    endAt: toWindow(input.endAt),
    updatedAt: now,
  });
  void auditService.record({
    actorId,
    action: 'content.update',
    targetType: 'banner',
    targetId: id,
    targetName: input.title,
    detail: { target: input.target, sortOrder: input.sortOrder, enabled: input.enabled },
  });
  const row = await repo.findBannerById(id);
  return mapBanner(row!, now);
}

/** 删除轮播图。 */
export async function deleteBanner(actorId: string, id: string): Promise<void> {
  const existing = await repo.findBannerById(id);
  if (!existing) throw notFound('轮播图不存在或已被删除');
  await repo.deleteBanner(id);
  void auditService.record({
    actorId,
    action: 'content.delete',
    targetType: 'banner',
    targetId: id,
    targetName: existing.title,
    detail: { target: existing.target },
  });
}

/* ------------------------------ 考生侧聚合 ------------------------------ */

/**
 * 按端取得当前生效的公告与轮播图。
 * @param scope 'exam' = 考试端（含 both）；'practice' = 练题端（含 both）
 */
export async function getFeed(scope: 'exam' | 'practice'): Promise<ContentFeedDto> {
  const now = nowDb();
  const [annRows, bannerRows] = await Promise.all([
    repo.listVisibleAnnouncements(scope, now, FEED_ANNOUNCEMENT_LIMIT),
    repo.listVisibleBanners(scope, now, FEED_BANNER_LIMIT),
  ]);
  return {
    announcements: annRows.map((r) => mapAnnouncement(r, now)),
    banners: bannerRows.map((r) => mapBanner(r, now)),
  };
}
