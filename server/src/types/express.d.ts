/**
 * Express Request 类型扩展：挂载鉴权后的当前用户信息。
 */
import type { Role } from '../types/domain.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 由 authRequired 中间件注入的当前用户（未认证时为 undefined）。 */
      user?: AuthUser;
      /** 由 practiceAuthRequired 中间件注入的练题登录用户（未认证时为 undefined）。 */
      practiceUser?: PracticeAuthUser;
    }
  }
}

/** JWT 载荷解析后的当前用户上下文。 */
export interface AuthUser {
  /** 用户 id（JWT 的 sub） */
  id: string;
  /** 角色 */
  role: Role;
  /** 归属科室 id（无科室为 ''） */
  departmentId: string;
}

/** 练题登录用户上下文（由练题专属 JWT 解析得到；仅含练题所需最小信息）。 */
export interface PracticeAuthUser {
  /** 用户 id（练题 JWT 的 sub） */
  id: string;
  /** 角色 */
  role: Role;
}

export {};
