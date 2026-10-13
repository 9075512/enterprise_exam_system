/** 站内信 API（v1.5） */
import { get, put } from './http';
import type { Notification, NotificationUnread, Page } from '@/types';

/** 站内信列表（分页） */
export function listNotifications(page?: number, pageSize?: number): Promise<Page<Notification>> {
  return get<Page<Notification>>('/notifications', { page, pageSize });
}

/** 未读数 */
export function getUnreadCount(): Promise<NotificationUnread> {
  return get<NotificationUnread>('/notifications/unread-count');
}

/** 标记单条已读 */
export function markRead(id: string): Promise<null> {
  return put<null>(`/notifications/${id}/read`);
}

/** 全部标记已读 */
export function markAllRead(): Promise<null> {
  return put<null>('/notifications/read-all');
}
