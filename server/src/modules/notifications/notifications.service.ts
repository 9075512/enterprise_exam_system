/**
 * 站内信 —— 业务逻辑层。
 * 除查询/已读接口外，提供 `enqueue()` 供 notify 服务（考试发布/成绩/补考审批）批量写入。
 */
import * as repo from './notifications.repo.js';
import type { NotificationRow } from './notifications.repo.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import type { NotificationDto, NotificationUnreadDto, Page } from '../../types/domain.js';

function mapRow(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    isRead: row.is_read === 1 || row.is_read === true,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 站内信列表（分页）。 */
export async function list(userId: string, page?: number, pageSize?: number): Promise<Page<NotificationDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([
    repo.listByUser(userId, paging),
    repo.countByUser(userId),
  ]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}

/** 未读数。 */
export async function unreadCount(userId: string): Promise<NotificationUnreadDto> {
  return { unreadCount: await repo.countUnread(userId) };
}

/** 标记单条已读。 */
export async function markRead(id: string, userId: string): Promise<void> {
  await repo.markRead(id, userId);
}

/** 全部已读。 */
export async function markAllRead(userId: string): Promise<void> {
  await repo.markAllRead(userId);
}

/** 批量写入站内信（供通知服务调用；空列表直接返回）。 */
export async function enqueue(
  userIds: string[],
  type: string,
  title: string,
  content: string,
): Promise<void> {
  if (userIds.length === 0) return;
  const createdAt = nowDb();
  await repo.insertMany(
    userIds.map((userId) => ({ id: genId('notif-'), userId, type, title, content, createdAt })),
  );
}
