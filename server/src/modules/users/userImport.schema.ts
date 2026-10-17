/**
 * 用户导入 —— zod 校验 schema。
 */
import { z } from 'zod';

const userValidRowSchema = z.object({
  row: z.number().int().min(1),
  username: z.string().min(1, '登录账号不能为空'),
  name: z.string().min(1, '姓名不能为空'),
  groupName: z.string().min(1, '用户组不能为空'),
  groupId: z.string().min(1, '用户组不能为空').max(64),
  role: z.enum(['admin', 'author', 'examinee'], { errorMap: () => ({ message: '角色不合法' }) }),
  departmentName: z.string(),
  departmentId: z.string(),
  email: z.string(),
  password: z.string(),
});

const rowIssueSchema = z.object({
  row: z.number().int().min(1),
  column: z.string(),
  value: z.string(),
  reason: z.string(),
});

/** 确认导入入参。 */
export const userCommitSchema = z.object({
  fileName: z.string().max(255),
  validRows: z.array(userValidRowSchema),
  errors: z.array(rowIssueSchema),
});

export type UserCommitInput = z.infer<typeof userCommitSchema>;
