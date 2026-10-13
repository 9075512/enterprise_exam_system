/**
 * 登录日志 —— 业务逻辑层（v1.7③ T2）。
 * 记录 fail-open：登录主流程绝不因日志写入失败而中断（与审计日志同策略）。
 */
import * as repo from './loginLogs.repo.js';
import { genId } from '../../utils/id.js';
import { nowDb, toDbDate, fromDbDateSafe } from '../../utils/datetime.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import type { LoginLogDto, Page } from '../../types/domain.js';

/** 记录入参（**绝不记录密码**）。 */
export interface LoginLogInput {
  username: string;
  userId?: string | null;
  role?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason?: string;
  /** 来源：admin（考试端）/ practice（练题端） */
  source?: string;
}

/** 写入一条登录日志（fail-open）。 */
export async function record(input: LoginLogInput): Promise<void> {
  try {
    await repo.insert({
      id: genId('login-'),
      username: input.username,
      userId: input.userId ?? null,
      role: input.role ?? '',
      ip: input.ip,
      userAgent: input.userAgent,
      success: input.success,
      reason: input.reason ?? '',
      source: input.source ?? 'admin',
      createdAt: nowDb(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[login-logs] 写入失败（已忽略）：', err);
  }
}

/** 日期归一化：纯日期按整天补齐（与审计日志同口径）。 */
function normalizeDateInput(value: string, isStart: boolean): Date {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T${isStart ? '00:00:00.000' : '23:59:59.999'}Z`);
  }
  return new Date(s);
}

/** 行 → DTO。 */
function mapRow(row: repo.LoginLogRow): LoginLogDto {
  return {
    id: row.id,
    username: row.username,
    userId: row.user_id ?? '',
    role: row.role,
    ip: row.ip,
    userAgent: row.user_agent,
    success: Number(row.success) === 1,
    reason: row.reason,
    source: row.source,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 登录日志列表（admin，分页 + 过滤）。 */
export async function list(
  filter: { username?: string; success?: boolean; source?: string; from?: string; to?: string },
  page?: number,
  pageSize?: number,
): Promise<Page<LoginLogDto>> {
  const paging = normalizePaging(page, pageSize);
  const dbFilter = {
    username: filter.username,
    success: filter.success,
    source: filter.source,
    from: filter.from ? toDbDate(normalizeDateInput(filter.from, true)) : undefined,
    to: filter.to ? toDbDate(normalizeDateInput(filter.to, false)) : undefined,
  };
  const [rows, total] = await Promise.all([
    repo.list(dbFilter, { limit: paging.pageSize, offset: (paging.page - 1) * paging.pageSize }),
    repo.count(dbFilter),
  ]);
  return buildPage(rows.map(mapRow), total, paging.page, paging.pageSize);
}
