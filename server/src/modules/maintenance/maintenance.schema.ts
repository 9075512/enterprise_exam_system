/**
 * 系统维护 —— zod 校验 schema（中文错误信息，v1.7④ T5）。
 */
import { z } from 'zod';

/** 手动归档入参：保留天数与单次上限均可选（缺省取系统设置 / 内置默认）。 */
export const archiveSchema = z.object({
  days: z.coerce
    .number({ invalid_type_error: '归档保留天数必须为 1~3650 天' })
    .int('归档保留天数必须为 1~3650 天')
    .min(1, '归档保留天数必须为 1~3650 天')
    .max(3650, '归档保留天数必须为 1~3650 天')
    .optional(),
  limit: z.coerce
    .number({ invalid_type_error: '单次归档上限必须为 1~5000' })
    .int('单次归档上限必须为 1~5000')
    .min(1, '单次归档上限必须为 1~5000')
    .max(5000, '单次归档上限必须为 1~5000')
    .optional(),
});

export type ArchiveInput = z.infer<typeof archiveSchema>;
