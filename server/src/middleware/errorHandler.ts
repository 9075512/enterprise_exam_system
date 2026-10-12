/**
 * 兜底错误处理中间件 + 404 兜底。
 * - AppError → 对应 code / httpStatus；
 * - ZodError → 1001 + 首条中文错误；
 * - 其余未捕获异常 → 5000/500（仅非生产环境打印栈）。
 */
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES, ERROR_HTTP_STATUS } from '../utils/errors.js';
import { isProduction } from '../config/env.js';

/** 404 兜底：未匹配到任何路由。 */
export const notFoundHandler: RequestHandler = (_req: Request, res: Response) => {
  res.status(404).json({
    code: ERROR_CODES.NOT_FOUND,
    message: '接口不存在',
    data: null,
  });
};

/** 统一错误处理（必须最后注册）。 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ code: err.code, message: err.message, data: err.data });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      code: ERROR_CODES.BAD_REQUEST,
      message: first?.message ?? '请求参数不合法',
      data: null,
    });
    return;
  }

  if (!isProduction) {
    // 开发环境打印栈便于定位；生产环境不泄露内部细节
    console.error('[UnhandledError]', err);
  }
  res.status(ERROR_HTTP_STATUS[ERROR_CODES.INTERNAL]).json({
    code: ERROR_CODES.INTERNAL,
    message: '服务器开小差了，请稍后重试',
    data: null,
  });
};
