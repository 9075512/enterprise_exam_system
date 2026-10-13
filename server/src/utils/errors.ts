/**
 * 业务错误码与统一错误类型（§4.2）。
 * 所有 service / middleware 通过 `throw new AppError(...)` 或便捷构造抛出，
 * 由 errorHandler 统一映射为 `{ code, message, data:null }` 响应。
 */

/** 业务错误码常量表（语义与 HTTP 状态映射严格按架构文档 §4.2）。 */
export const ERROR_CODES = {
  OK: 0,
  BAD_REQUEST: 1001, // 参数校验失败（zod）
  UNAUTHORIZED: 1002, // 未认证 / Token 缺失或失效
  FORBIDDEN: 1003, // 无权限（角色越权）
  NOT_FOUND: 1004, // 资源不存在
  CONFLICT: 1005, // 业务规则冲突（唯一性/引用）
  FILE_INVALID: 1006, // 文件/导入校验失败
  IMPORT_INVALID: 1007, // 导入数据校验失败（业务，返回明细）
  ATTEMPTS_EXHAUSTED: 1008, // 答题次数已用完（业务，409）
  // —— 练题增量（架构 §4.1）——
  PRACTICE_BANK_UNAVAILABLE: 1009, // 练题题库不可用（未开放/不存在，404，不暴露存在性）
  PRACTICE_RATE_LIMITED: 1010, // 请求过于频繁（限流，429）
  PRACTICE_LOGIN_LOCKED: 1011, // 登录失败次数过多，账号/IP 临时锁定（429）
  PRACTICE_CAPTCHA_REQUIRED: 1012, // 需要/校验验证码（400）
  // —— 练题增量 · 二期（收藏夹 / 每日一练）——
  PRACTICE_FAVORITE_LIMIT: 1013, // 收藏夹已达上限（409）
  PRACTICE_DAILY_DISABLED: 1014, // 每日一练未开放（404）
  // —— v1.7③ 账号安全加固 ——
  CAPTCHA_REQUIRED: 1015, // 需要/校验图形验证码（400）
  // —— v1.8① 实时监控推送 ——
  MONITOR_PUSH_DISABLED: 1016, // 实时推送已关闭（503，前端应回退轮询）
  INTERNAL: 5000, // 服务器内部错误
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 错误码 → 默认 HTTP 状态码映射。 */
export const ERROR_HTTP_STATUS: Record<number, number> = {
  [ERROR_CODES.OK]: 200,
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.FILE_INVALID]: 400,
  [ERROR_CODES.IMPORT_INVALID]: 400,
  [ERROR_CODES.ATTEMPTS_EXHAUSTED]: 409,
  [ERROR_CODES.PRACTICE_BANK_UNAVAILABLE]: 404,
  [ERROR_CODES.PRACTICE_RATE_LIMITED]: 429,
  [ERROR_CODES.PRACTICE_LOGIN_LOCKED]: 429,
  [ERROR_CODES.PRACTICE_CAPTCHA_REQUIRED]: 400,
  [ERROR_CODES.PRACTICE_FAVORITE_LIMIT]: 409,
  [ERROR_CODES.PRACTICE_DAILY_DISABLED]: 404,
  [ERROR_CODES.CAPTCHA_REQUIRED]: 400,
  [ERROR_CODES.MONITOR_PUSH_DISABLED]: 503,
  [ERROR_CODES.INTERNAL]: 500,
};

/**
 * 应用级错误：携带业务错误码与 HTTP 状态码。
 */
export class AppError extends Error {
  /** 业务错误码 */
  public readonly code: number;
  /** HTTP 状态码 */
  public readonly httpStatus: number;
  /** 附加数据（如导入错误明细），默认 null */
  public readonly data: unknown;

  constructor(code: number, message: string, httpStatus?: number, data: unknown = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus ?? ERROR_HTTP_STATUS[code] ?? 500;
    this.data = data;
  }
}

/** 便捷构造：参数校验失败 1001/400。 */
export function badRequest(message = '请求参数不合法', data: unknown = null): AppError {
  return new AppError(ERROR_CODES.BAD_REQUEST, message, 400, data);
}

/** 便捷构造：未认证 1002/401。 */
export function unauthorized(message = '登录状态已失效，请重新登录'): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
}

/** 便捷构造：无权限 1003/403。 */
export function forbidden(message = '无权执行该操作'): AppError {
  return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
}

/** 便捷构造：资源不存在 1004/404。 */
export function notFound(message = '资源不存在'): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
}

/** 便捷构造：业务冲突 1005/409。 */
export function conflict(message = '操作与现有数据冲突'): AppError {
  return new AppError(ERROR_CODES.CONFLICT, message, 409);
}

/** 便捷构造：文件校验失败 1006/400。 */
export function fileInvalid(message = '文件不合法'): AppError {
  return new AppError(ERROR_CODES.FILE_INVALID, message, 400);
}

/** 便捷构造：导入数据校验失败 1007/400。 */
export function importInvalid(message = '导入数据不合法', data: unknown = null): AppError {
  return new AppError(ERROR_CODES.IMPORT_INVALID, message, 400, data);
}

/** 便捷构造：答题次数已用完 1008/409。 */
export function attemptsExhausted(message = '答题次数已用完'): AppError {
  return new AppError(ERROR_CODES.ATTEMPTS_EXHAUSTED, message, 409);
}

/** 便捷构造：练题题库不可用（未开放/不存在）1009/404，**不暴露存在性**。 */
export function practiceBankUnavailable(message = '该题库暂未开放练题'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_BANK_UNAVAILABLE, message, 404);
}

/** 便捷构造：请求过于频繁（限流）1010/429。 */
export function practiceRateLimited(message = '操作过于频繁，请稍后再试'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_RATE_LIMITED, message, 429);
}

/** 便捷构造：登录失败次数过多，账号/IP 临时锁定 1011/429。 */
export function practiceLoginLocked(message = '登录失败次数过多，请稍后再试'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_LOGIN_LOCKED, message, 429);
}

/** 便捷构造：需要/校验验证码 1012/400。 */
export function practiceCaptchaRequired(message = '请输入验证码'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_CAPTCHA_REQUIRED, message, 400);
}

/** 便捷构造：收藏夹已达上限 1013/409。 */
export function practiceFavoriteLimit(message = '收藏已达上限，请先清理后再收藏'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_FAVORITE_LIMIT, message, 409);
}

/** 便捷构造：每日一练未开放 1014/404（后台关闭时）。 */
export function practiceDailyDisabled(message = '每日一练暂未开放'): AppError {
  return new AppError(ERROR_CODES.PRACTICE_DAILY_DISABLED, message, 404);
}

/** 便捷构造：需要/校验图形验证码 1015/400（v1.7③）。 */
export function captchaRequired(message = '请输入图形验证码'): AppError {
  return new AppError(ERROR_CODES.CAPTCHA_REQUIRED, message, 400);
}

/** 便捷构造：实时推送已关闭 1016/503（v1.8①，前端应回退轮询）。 */
export function monitorPushDisabled(message = '实时推送已关闭，请使用轮询模式'): AppError {
  return new AppError(ERROR_CODES.MONITOR_PUSH_DISABLED, message, 503);
}
