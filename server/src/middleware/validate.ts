/**
 * 参数校验中间件：zod 校验 body/query/params，失败 → 1001/400（取首条中文错误）。
 * 校验通过后将解析结果写回 `req[source]`（带类型与默认值）。
 *
 * 注意：Express 将 `req.query` 定义为「仅 getter」的访问器属性，
 * 严格模式下直接赋值会抛 TypeError，因此改用 Object.defineProperty 定义自有数据属性。
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

/** 生成校验中间件。 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // 覆盖为解析后的值（含默认值与类型转换）
      Object.defineProperty(req, source, {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        next(badRequest(first?.message ?? '请求参数不合法'));
        return;
      }
      next(err);
    }
  };
}
