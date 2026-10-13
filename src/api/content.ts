/**
 * 内容运营 API（v1.9⑥ · 公告 + 轮播图）。
 *
 * - 管理端：公告 / 轮播图的分页、增删改（仅 admin）；
 * - 考生端：`fetchFeed('exam')` 取当前生效内容（考试端展示用）。
 */
import { del, get, post, put } from './http';
import type {
  Announcement,
  AnnouncementInput,
  Banner,
  BannerInput,
  ContentFeed,
  ContentTarget,
  Page,
} from '@/types';

/** 管理端列表过滤条件。 */
export interface ContentListQuery {
  target?: ContentTarget;
  enabled?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 拼装查询串参数（空值不下发）。 */
function toParams(query: ContentListQuery): Record<string, unknown> {
  return {
    target: query.target || undefined,
    enabled: query.enabled === undefined ? undefined : query.enabled,
    keyword: query.keyword || undefined,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/* ------------------------------ 公告 ------------------------------ */

/** 公告分页列表（管理端） */
export function listAnnouncements(query: ContentListQuery = {}): Promise<Page<Announcement>> {
  return get<Page<Announcement>>('/content/announcements', toParams(query));
}

/** 新建公告 */
export function createAnnouncement(payload: AnnouncementInput): Promise<Announcement> {
  return post<Announcement>('/content/announcements', payload);
}

/** 编辑公告 */
export function updateAnnouncement(id: string, payload: AnnouncementInput): Promise<Announcement> {
  return put<Announcement>(`/content/announcements/${encodeURIComponent(id)}`, payload);
}

/** 删除公告 */
export function deleteAnnouncement(id: string): Promise<null> {
  return del<null>(`/content/announcements/${encodeURIComponent(id)}`);
}

/* ------------------------------ 轮播图 ------------------------------ */

/** 轮播图分页列表（管理端） */
export function listBanners(query: ContentListQuery = {}): Promise<Page<Banner>> {
  return get<Page<Banner>>('/content/banners', toParams(query));
}

/** 新建轮播图 */
export function createBanner(payload: BannerInput): Promise<Banner> {
  return post<Banner>('/content/banners', payload);
}

/** 编辑轮播图 */
export function updateBanner(id: string, payload: BannerInput): Promise<Banner> {
  return put<Banner>(`/content/banners/${encodeURIComponent(id)}`, payload);
}

/** 删除轮播图 */
export function deleteBanner(id: string): Promise<null> {
  return del<null>(`/content/banners/${encodeURIComponent(id)}`);
}

/* ------------------------------ 考生端 ------------------------------ */

/** 考生端当前生效的公告 + 轮播图（考试端首页 / 我的考试页展示用） */
export function fetchFeed(scope: 'exam' | 'practice' = 'exam'): Promise<ContentFeed> {
  return get<ContentFeed>('/content/feed', { scope });
}
