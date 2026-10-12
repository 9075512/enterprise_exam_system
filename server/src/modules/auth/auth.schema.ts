/**
 * 鉴权模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** 登录入参。 */
export const loginSchema = z.object({
  username: z.string().min(1, '账号不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

/** 修改密码入参（新密码 ≥6 位）。 */
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: z.string().min(6, '新密码长度不能少于 6 位'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
