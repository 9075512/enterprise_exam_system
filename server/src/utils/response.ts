/**
 * 统一响应包装（§4.1）：成功 `{code:0,message:'ok',data}`，失败由 errorHandler 处理。
 */
import type { Response } from 'express';
import { ERROR_CODES } from './errors.js';

/** 成功响应结构。 */
export interface ApiOk<T> {
  code: 0;
  message: 'ok';
  data: T;
}

/** 失败响应结构。 */
export interface ApiErr {
  code: number;
  message: string;
  data: null;
}

/** 发送成功响应（HTTP 200，code:0）。 */
export function ok<T>(res: Response, data: T): Response<ApiOk<T>> {
  return res.status(200).json({ code: ERROR_CODES.OK, message: 'ok', data });
}

/** 发送失败响应（指定业务错误码与 HTTP 状态码）。 */
export function fail(
  res: Response,
  code: number,
  message: string,
  httpStatus: number,
): Response<ApiErr> {
  return res.status(httpStatus).json({ code, message, data: null });
}
