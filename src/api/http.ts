/**
 * 唯一 axios 实例 + 请求/响应拦截器（架构 §5.4）。
 * - baseURL = '/api'（开发经 Vite 代理到 :3001，生产同源）
 * - 请求：注入 `Authorization: Bearer <token>`（token 从 localStorage 读取，避免循环依赖 store）
 * - 响应：解包 `{ code, message, data }`；401 触发全局回调（由 main.ts 注册）
 *
 * 约定：任何组件不得直接 import axios，只能通过本文件导出的 helper 或各 api 模块。
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

/** 登录令牌存储 key（与 src/constants 保持一致；此处内联以避免循环依赖） */
export const TOKEN_KEY = 'exam_sys.token';

/** 401 回调：由 main.ts 注册（清会话 + 跳登录），避免此处直接 import store/router 造成循环依赖 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

/**
 * 401 去重闸门。
 * 场景：Token 失效时往往有多个并发请求同时返回 401（或登出流程本身触发 401），
 * 若每个都弹一次 Toast、都回调一次全局登出，就会出现「无限弹窗」。
 * 因此同一轮「会话失效」只处理一次，直到重新登录成功才由 resetUnauthorizedGuard() 复位。
 */
let unauthorizedHandled = false;

/** 重新武装 401 处理（登录成功后必须调用，否则下次会话失效不会提示）。 */
export function resetUnauthorizedGuard(): void {
  unauthorizedHandled = false;
}

/**
 * 本项目的请求配置扩展。
 *
 * - `skipAuthRedirect`：该请求的 401 **不参与全局「会话失效」流程**（不弹「登录已失效」、
 *   不清 Token、不回调登出），由调用方自行处理。
 *   典型场景：登录接口（401 = 账号密码错误，而非会话失效）、登出接口（Token 可能已失效）。
 * - `suppressErrorToast`：该请求失败时**不弹统一错误提示**（调用方自己展示，或本就无需提示）。
 *
 * 二者正交：登录 = 仅 `skipAuthRedirect`（仍弹后端文案）。
 */
export interface AppRequestConfig extends AxiosRequestConfig {
  skipAuthRedirect?: boolean;
  suppressErrorToast?: boolean;
}

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截：注入 Token。
// 注意：若调用方已显式设置 Authorization（如登出时携带旧 Token），不得覆盖。
http.interceptors.request.use((config) => {
  if (!config.headers.get('Authorization')) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// 响应拦截：解包 {code,message,data}；统一错误处理
http.interceptors.response.use(
  (response) => {
    const body = response.data as { code: number; message: string; data: unknown };
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data as never;
      if (!(response.config as AppRequestConfig).suppressErrorToast) {
        ElMessage.error(body.message || '请求失败');
      }
      return Promise.reject(buildApiError(body.message || '请求失败', response.status, body.code)) as never;
    }
    return response.data as never;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    const status = error?.response?.status as number | undefined;
    const body = error?.response?.data as { code?: number; message?: string } | undefined;
    const message: string = body?.message || error?.message || '网络异常，请稍后重试';
    const config = error?.config as AppRequestConfig | undefined;
    const skipAuthRedirect = config?.skipAuthRedirect === true;
    const suppressErrorToast = config?.suppressErrorToast === true;

    if (status === 401 && !skipAuthRedirect) {
      // 全局「会话失效」流程：只在「首次」发现会话失效时提示并登出；并发 401 与后续 401 一律静默，
      // 避免 Toast 堆叠，更避免与 onUnauthorized → logout() 形成递归。
      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        localStorage.removeItem(TOKEN_KEY);
        ElMessage.error('登录状态已失效，请重新登录');
        onUnauthorized?.();
      }
    } else if (!suppressErrorToast) {
      // 其余错误一律提示**后端返回的原始文案**，包括登录失败的 401（账号或密码不正确）。
      ElMessage.error(message);
    }
    return Promise.reject(buildApiError(message, status, body?.code));
  },
);

/** 业务错误对象：保留 code / status 供调用方按错误码分流。 */
export interface ApiError extends Error {
  code?: number;
  status?: number;
}

/** 构造带 code / status 的错误对象。 */
function buildApiError(message: string, status?: number, code?: number): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  return err;
}

/** GET（返回值即后端 data） */
export function get<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AppRequestConfig,
): Promise<T> {
  return http.get(url, { params, ...config }) as unknown as Promise<T>;
}

/** POST（返回值即后端 data） */
export function post<T>(url: string, data?: unknown, config?: AppRequestConfig): Promise<T> {
  return http.post(url, data, config) as unknown as Promise<T>;
}

/** PUT（返回值即后端 data） */
export function put<T>(url: string, data?: unknown, config?: AppRequestConfig): Promise<T> {
  return http.put(url, data, config) as unknown as Promise<T>;
}

/** DELETE（返回值即后端 data） */
export function del<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AppRequestConfig,
): Promise<T> {
  return http.delete(url, { params, ...config }) as unknown as Promise<T>;
}

/** 上传（不手动设置 Content-Type，交给浏览器带 boundary） */
export function upload<T>(url: string, formData: FormData): Promise<T> {
  return http.post(url, formData) as unknown as Promise<T>;
}

export default http;
