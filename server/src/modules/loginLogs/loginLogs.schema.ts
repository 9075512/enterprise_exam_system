/**
 * 登录日志 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination.js';

/** 列表查询入参。 */
export const loginLogQuerySchema = z.object({
  username: z.string().optional().default(''),
  /** '1' = 仅成功，'0' = 仅失败，'' = 全部 */
  success: z
    .preprocess((v) => (v === '' || v === undefined ? undefined : v), z.enum(['0', '1']).optional()),
  source: z.string().optional().default(''),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  ...paginationQuery,
});

export type LoginLogQuery = z.infer<typeof loginLogQuerySchema>;
