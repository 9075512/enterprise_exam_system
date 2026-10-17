/**
 * 环境配置加载与校验。
 * 统一从 .env 读取（dotenv），导出类型化的 `env` 对象；
 * 缺失关键变量时立即抛错，杜绝运行期出现 undefined 硬编码回退。
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 以本文件为锚点定位 server 根目录下的 .env，保证 tsx / dist 两种运行方式均可用。
const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..', '..');
loadDotenv({ path: path.join(serverRoot, '.env') });

/** 读取必填环境变量，缺失或空串则抛错。 */
function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`缺少必需的环境变量：${key}，请在 server/.env 中配置`);
  }
  return value;
}

/** 读取可选环境变量，缺失时返回默认值。 */
function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

/** 解析为端口整数，非法时抛错。 */
function toPort(raw: string, key: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0 || n > 65535) {
    throw new Error(`环境变量 ${key} 不是合法端口：${raw}`);
  }
  return n;
}

/** 读取整数型环境变量，缺失/空串时返回默认值；非法值抛错。 */
function toInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`环境变量 ${key} 不是合法整数：${raw}`);
  }
  return n;
}

/** 读取布尔型环境变量（'true'/'1' → true，其余 → false），缺失/空串时返回默认值。 */
function toBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/** 类型化环境配置对象（进程级单例）。 */
export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: toPort(optional('PORT', '3001'), 'PORT'),

  DB_HOST: required('DB_HOST'),
  DB_PORT: toPort(required('DB_PORT'), 'DB_PORT'),
  DB_USER: required('DB_USER'),
  DB_PASSWORD: required('DB_PASSWORD'),
  DB_NAME: required('DB_NAME'),
  DB_NAME_TEST: optional('DB_NAME_TEST', 'enterprise_exam_system_test'),

  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '12h'),

  // —— 富文本附件对象存储（v1.8④ U4） ——
  /**
   * 附件落盘根目录（相对路径以 server 根目录为锚点）。
   * 默认 `storage/attachments`，按 `yyyy/MM/` 分目录存放。
   */
  STORAGE_DIR: optional('STORAGE_DIR', 'storage/attachments'),

  // —— 练题（增量，架构 §10-20） ——
  /** 内网实例是否注册练题路由（默认 true，便于联调） */
  ENABLE_PRACTICE: toBool('ENABLE_PRACTICE', true),
  /** true=仅装配练题路由（方案乙公网练题实例，考试域路由不注册、物理不可达） */
  PRACTICE_ONLY: toBool('PRACTICE_ONLY', false),
  /** 方案甲：Nginx 注入 X-Internal-Key 的共享密钥；空=不启用边界兜底 */
  PRACTICE_EDGE_SECRET: optional('PRACTICE_EDGE_SECRET', ''),
  /** 练题登录 JWT secret（与内网 JWT_SECRET 分离；缺省由内网密钥派生，生产务必显式设置） */
  PRACTICE_JWT_SECRET: optional('PRACTICE_JWT_SECRET', `${process.env.JWT_SECRET ?? 'practice-dev'}-practice`),
  /** 练题登录 JWT 有效期 */
  PRACTICE_JWT_EXPIRES_IN: optional('PRACTICE_JWT_EXPIRES_IN', '12h'),
  /** 无状态 sessionToken 签名密钥（缺省由内网密钥派生，生产务必显式设置） */
  PRACTICE_SESSION_SECRET: optional(
    'PRACTICE_SESSION_SECRET',
    `${process.env.JWT_SECRET ?? 'practice-dev'}-practice-session`,
  ),
  /** 会话有效期（秒） */
  PRACTICE_SESSION_TTL: toInt('PRACTICE_SESSION_TTL', 1800),
  /**
   * 业务时区偏移（二期：每日一练自然日边界、连续打卡、逐日报告）。
   * 格式 `±HH:MM`，默认 `+08:00`（中国标准时间）。
   * ⚠️ 禁止依赖容器系统时区：一律以该显式配置把自然日折算为 UTC 半开区间。
   */
  PRACTICE_TZ_OFFSET: optional('PRACTICE_TZ_OFFSET', '+08:00'),
  /** 登录失败锁定阈值（次数） */
  PRACTICE_LOGIN_MAX_FAILS: toInt('PRACTICE_LOGIN_MAX_FAILS', 5),
  /** 锁定时长（分钟） */
  PRACTICE_LOGIN_LOCK_MINUTES: toInt('PRACTICE_LOGIN_LOCK_MINUTES', 15),
  /** check 每设备每分钟上限 */
  PRACTICE_RATE_CHECK_PER_MIN: toInt('PRACTICE_RATE_CHECK_PER_MIN', 60),
  /** 题库列表/题目每设备每分钟上限 */
  PRACTICE_RATE_BANKS_PER_MIN: toInt('PRACTICE_RATE_BANKS_PER_MIN', 30),
  /** 登录每设备每分钟上限 */
  PRACTICE_RATE_LOGIN_PER_MIN: toInt('PRACTICE_RATE_LOGIN_PER_MIN', 10),
  /** 生成练习会话每设备每分钟上限（含 RAND() 且签发 token，重点限流） */
  PRACTICE_RATE_SESSION_PER_MIN: toInt('PRACTICE_RATE_SESSION_PER_MIN', 20),
  /** 进度读写每设备每分钟上限 */
  PRACTICE_RATE_PROGRESS_PER_MIN: toInt('PRACTICE_RATE_PROGRESS_PER_MIN', 60),
  /** 错题本读写每设备每分钟上限 */
  PRACTICE_RATE_WRONGBOOK_PER_MIN: toInt('PRACTICE_RATE_WRONGBOOK_PER_MIN', 60),
  // —— 二期增量分组 ——
  /** 收藏夹读写每设备每分钟上限 */
  PRACTICE_RATE_FAVORITES_PER_MIN: toInt('PRACTICE_RATE_FAVORITES_PER_MIN', 60),
  /** 学习报告查询每设备每分钟上限 */
  PRACTICE_RATE_REPORT_PER_MIN: toInt('PRACTICE_RATE_REPORT_PER_MIN', 60),
  /** 每日一练读写每设备每分钟上限 */
  PRACTICE_RATE_DAILY_PER_MIN: toInt('PRACTICE_RATE_DAILY_PER_MIN', 60),
} as const;

/** 是否生产环境。 */
export const isProduction = env.NODE_ENV === 'production';
