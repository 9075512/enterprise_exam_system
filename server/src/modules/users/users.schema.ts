/**
 * 用户模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

const roleEnum = z.enum(['admin', 'author', 'examinee'], {
  errorMap: () => ({ message: '角色不合法' }),
});
const statusEnum = z.enum(['active', 'disabled'], {
  errorMap: () => ({ message: '账号状态不合法' }),
});

/** 新建用户入参（password 缺省时使用默认密码）。 */
export const createUserSchema = z.object({
  username: z.string().min(1, '登录账号不能为空'),
  name: z.string().min(1, '姓名不能为空'),
  role: roleEnum,
  departmentId: z.string().optional().default(''),
  status: statusEnum.optional(),
  password: z.string().optional(),
});

/** 编辑用户入参。 */
export const updateUserSchema = z.object({
  username: z.string().min(1, '登录账号不能为空'),
  name: z.string().min(1, '姓名不能为空'),
  role: roleEnum,
  departmentId: z.string().optional().default(''),
  status: statusEnum.optional(),
  password: z.string().optional(),
});

/** 列表查询入参。 */
export const listQuerySchema = z.object({
  role: roleEnum.optional(),
  keyword: z.string().optional().default(''),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
