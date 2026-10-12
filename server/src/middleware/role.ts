/**
 * 角色守卫：校验 req.user.role ∈ roles，越权 → 1003/403。
 * 需在 authRequired 之后使用。
 */
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/errors.js';
import type { Role } from '../types/domain.js';

/** 生成角色守卫中间件。 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
