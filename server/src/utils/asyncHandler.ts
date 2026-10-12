/**
 * 异步路由处理器包装：捕获 Promise 拒绝并转交 Express 错误中间件。
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 包裹 async handler，异常自动 `next(err)`。 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
