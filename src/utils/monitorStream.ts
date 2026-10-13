/**
 * 监考大屏实时推送客户端（v1.8① U1）—— 基于 fetch + ReadableStream 的 SSE 解析。
 *
 * 为什么不用原生 `EventSource`：本项目鉴权仅支持 `Authorization: Bearer`（header），
 * 而 `EventSource` 无法自定义请求头（服务端也不提供 `?token=` 兜底，避免令牌进访问日志）。
 * 因此这里用 `fetch` 拿到 `Response.body` 流，自行按 SSE 帧格式解析。
 *
 * 能力：
 * - 自动重连 + **指数退避**（1s → 2s → 4s … 上限 30s），连接成功后退避复位；
 * - **永久不可用判定**：服务端返回「推送已关闭 / 连接数超限」（code 1016）或 401，
 *   不再无限重连，改为通知调用方**降级为轮询**；
 * - 主动 `close()` 后不再重连。
 */
import { TOKEN_KEY } from '@/api/http';
import type { ExamMonitor, MonitorStreamInfo } from '@/types';

/** 连接状态 */
export type MonitorStreamState = 'connecting' | 'open' | 'retrying' | 'stopped';

/** 事件回调 */
export interface MonitorStreamHandlers {
  /** 状态变化（连接中 / 已连接 / 重连中 / 已停止） */
  onState?: (state: MonitorStreamState, detail?: string) => void;
  /** 连接建立（服务端 `ready` 事件） */
  onInfo?: (info: MonitorStreamInfo) => void;
  /** 收到一份监考数据快照（`monitor` 事件） */
  onMonitor?: (data: ExamMonitor) => void;
  /** 服务端在推送循环中报错（`error` 事件，非致命，下一轮自动重试） */
  onServerError?: (message: string) => void;
  /** 永久不可用：应回退为轮询（推送开关关闭 / 连接数超限 / 鉴权失效） */
  onUnavailable?: (message: string) => void;
}

/** 推送句柄 */
export interface MonitorStreamHandle {
  /** 主动关闭（不再重连） */
  close: () => void;
  /** 是否已被判定为永久不可用（调用方据此决定是否启用轮询降级） */
  readonly degraded: boolean;
}

/** 重连退避参数 */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** 推送关闭 / 连接超限的业务码（与后端 ERROR_CODES 对应） */
const CODE_PUSH_DISABLED = 1016;

interface SseFrame {
  event: string;
  data: string;
}

/** 解析一个 SSE 帧（忽略注释行与未知字段）。 */
function parseFrame(raw: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * 建立监考推送连接。
 *
 * @param examId 考试 id（拼接到 `/api/exams/:id/monitor/stream`）
 */
export function openMonitorStream(examId: string, handlers: MonitorStreamHandlers): MonitorStreamHandle {
  let closed = false;
  let degraded = false;
  let attempt = 0;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function setState(state: MonitorStreamState, detail?: string): void {
    if (closed && state !== 'stopped') return;
    handlers.onState?.(state, detail);
  }

  function stop(state: MonitorStreamState, detail?: string): void {
    if (closed) return;
    closed = true;
    controller?.abort();
    controller = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    handlers.onState?.(state, detail);
  }

  /** 调度一次重连（指数退避）。 */
  function scheduleRetry(detail: string): void {
    if (closed) return;
    attempt += 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
    setState('retrying', detail);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  }

  /** 处理非 2xx 响应：区分「永久不可用」与「可重试」。 */
  async function handleHttpError(res: Response): Promise<void> {
    let code = 0;
    let message = `推送连接失败（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { code?: number; message?: string };
      if (typeof body.code === 'number') code = body.code;
      if (typeof body.message === 'string' && body.message) message = body.message;
    } catch {
      /* 非 JSON 响应，沿用默认文案 */
    }
    if (code === CODE_PUSH_DISABLED) {
      degraded = true;
      handlers.onUnavailable?.(message);
      stop('stopped', message);
      return;
    }
    if (res.status === 401 || res.status === 403) {
      degraded = true;
      handlers.onUnavailable?.(message);
      stop('stopped', message);
      return;
    }
    scheduleRetry(message);
  }

  /** 读取并分发流中的 SSE 帧。 */
  async function pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 帧以空行分隔（兼容 \r\n）；最后一段可能不完整，留在缓冲区等下一片
      const sep = /\r?\n\r?\n/g;
      let match: RegExpExecArray | null = sep.exec(buffer);
      let cursor = 0;
      while (match !== null) {
        const frame = parseFrame(buffer.slice(cursor, match.index));
        cursor = match.index + match[0].length;
        if (frame) dispatch(frame);
        match = sep.exec(buffer);
      }
      if (cursor > 0) buffer = buffer.slice(cursor);
    }
  }

  function dispatch(frame: SseFrame): void {
    let payload: unknown = null;
    try {
      payload = JSON.parse(frame.data) as unknown;
    } catch {
      return;
    }
    if (frame.event === 'ready') {
      attempt = 0;
      setState('open');
      handlers.onInfo?.(payload as MonitorStreamInfo);
    } else if (frame.event === 'monitor') {
      handlers.onMonitor?.(payload as ExamMonitor);
    } else if (frame.event === 'error') {
      const detail = (payload as { message?: string })?.message ?? '推送数据获取失败';
      handlers.onServerError?.(detail);
    }
  }

  /** 单次连接（失败时按退避重连）。 */
  async function connect(): Promise<void> {
    if (closed) return;
    setState(attempt === 0 ? 'connecting' : 'retrying');
    controller = new AbortController();
    const token = localStorage.getItem(TOKEN_KEY);
    let res: Response;
    try {
      res = await fetch(`/api/exams/${examId}/monitor/stream`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (err) {
      // 主动 close() 触发的 abort 无需重连
      if (closed) return;
      scheduleRetry(err instanceof Error ? err.message : '网络异常');
      return;
    }
    if (!res.ok) {
      await handleHttpError(res);
      return;
    }
    if (!res.body) {
      scheduleRetry('当前环境不支持流式响应');
      return;
    }
    try {
      await pump(res.body);
      // 服务端正常结束（如考试被删除后会断开）：视为可重试
      if (!closed) scheduleRetry('推送连接已断开');
    } catch (err) {
      if (closed) return;
      scheduleRetry(err instanceof Error ? err.message : '推送连接中断');
    }
  }

  setState('connecting');
  void connect();

  return {
    close: () => stop('stopped', '已关闭'),
    get degraded() {
      return degraded;
    },
  };
}
