/**
 * 鉴权模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** 登录入参（失败达阈值后需附带图形验证码）。 */
export const loginSchema = z.object({
  username: z.string().min(1, '账号不能为空'),
  password: z.string().min(1, '密码不能为空'),
  captchaId: z.string().optional(),
  captcha: z.string().optional(),
});

/** 修改密码入参（新密码下限由后端密码策略统一校验，此处仅做基础非空校验）。 */
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: z.string().min(1, '请输入新密码'),
});

/** 两步验证 —— 登录第二步。 */
export const twoFactorVerifySchema = z.object({
  challengeToken: z.string().min(1, '登录会话已失效，请重新登录'),
  code: z.string().min(1, '请输入两步验证码'),
});

/** 两步验证 —— 开启确认。 */
export const twoFactorEnableSchema = z.object({
  code: z.string().min(1, '请输入验证器中的 6 位验证码'),
});

/** 两步验证 —— 关闭（需密码 + 验证码）。 */
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, '请输入登录密码'),
  code: z.string().min(1, '请输入验证器中的 6 位验证码'),
});

/** 两步验证 —— 重新生成恢复码（需密码 + 验证码，v1.8② U2）。 */
export const twoFactorRecoveryRegenerateSchema = z.object({
  password: z.string().min(1, '请输入登录密码'),
  code: z.string().min(1, '请输入验证器中的 6 位验证码'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
