/**
 * 报表模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** 报表路径参数：examId 必填。 */
export const reportParamSchema = z.object({
  id: z.string().min(1, '请指定考试'),
});

/** 成绩导出查询参数：columns（逗号分隔的白名单 key，可选）、tzOffset（分钟，可选）。 */
export const reportExportQuerySchema = z.object({
  columns: z.string().trim().optional(),
  tzOffset: z.coerce
    .number()
    .int('时区偏移必须为整数')
    .min(-1440, '时区偏移超出范围')
    .max(1440, '时区偏移超出范围')
    .optional(),
});

/** 数据看板查询参数（v1.7②：科室下钻 + 时间范围）。 */
export const dashboardQuerySchema = z.object({
  /** 科室 id（下钻，含子科室） */
  departmentId: z.string().trim().optional().default(''),
  /** 起始日期/时刻（按考试开始时间，含） */
  from: z.string().trim().optional().default(''),
  /** 截止日期/时刻（含） */
  to: z.string().trim().optional().default(''),
});
