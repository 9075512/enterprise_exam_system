/**
 * 科室模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** 新建 / 编辑科室入参（名称必填；parentId 空串/null = 顶级科室）。 */
export const departmentSchema = z.object({
  name: z.string().min(1, '科室名称不能为空'),
  description: z.string().optional().default(''),
  parentId: z.string().nullable().optional().default(''),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;
