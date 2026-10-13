/**
 * 监考大屏实时推送（v1.8① U1）—— 零依赖 SSE 连接中心。
 *
 * 设计要点：
 * - **按考试聚合推送**：同一场考试的全部订阅者共享一个 ticker，每轮**只查库一次**再广播，
 *   从根本上降低「N 个监考页 × 每 15s 一次 GET /monitor」带来的数据库压力。
 * - **零依赖**：仅用 Node 原生定时器与 `res.write`，不引入 socket.io / ws（沿用项目零新增依赖原则）。
 * - **可测**：连接集合与广播逻辑与 Express 解耦（只依赖 `{ write }` 形状），单测可用假 sink 验证。
 * - **容量保护**：单考试与全局连接数双上限，超限拒绝，避免单机连接被耗尽。
 * - **心跳**：每 15s 发送一行注释帧（`: ping`），防止反向代理/负载均衡因空闲而断连。
 */

/** 最小 SSE 写入接口（Express `Response` 满足该形状）。 */
export interface SseSink {
  write(chunk: string): unknown;
}

/** 心跳间隔（毫秒）。 */
export const SSE_HEARTBEAT_MS = 15_000;
/** 单场考试最大并发订阅数。 */
export const MAX_CLIENTS_PER_EXAM = 20;
/** 全局最大并发订阅数。 */
export const MAX_CLIENTS_TOTAL = 200;

/** examId → 订阅者集合 */
const clients = new Map<string, Set<SseSink>>();
/** examId → 该考试的推送定时器（共享，惰性启停） */
const tickers = new Map<string, ReturnType<typeof setInterval>>();
/** 全局心跳定时器 */
let heartbeat: ReturnType<typeof setInterval> | null = null;

/** 构造一条 SSE 帧（`event` + `data`，数据为 JSON）。 */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 构造一条 SSE 注释帧（心跳；不会触发前端 `onmessage`）。 */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

/** 写入失败（连接已断）时静默忽略，交由 `close` 事件做清理。 */
function safeWrite(sink: SseSink, chunk: string): void {
  try {
    sink.write(chunk);
  } catch {
    /* 忽略：连接断开后 write 会抛错，此处无需处理 */
  }
}

/** 加入订阅的结果。 */
export type AddClientResult =
  | { ok: true; examClients: number; totalClients: number }
  | { ok: false; reason: 'exam-limit' | 'total-limit' };

/** 注册一个订阅者（超限时返回失败原因）。 */
export function addClient(examId: string, sink: SseSink): AddClientResult {
  if (totalClientCount() >= MAX_CLIENTS_TOTAL) return { ok: false, reason: 'total-limit' };
  let set = clients.get(examId);
  if (!set) {
    set = new Set<SseSink>();
    clients.set(examId, set);
  }
  if (set.size >= MAX_CLIENTS_PER_EXAM) return { ok: false, reason: 'exam-limit' };
  set.add(sink);
  ensureHeartbeat();
  return { ok: true, examClients: set.size, totalClients: totalClientCount() };
}

/** 注销订阅者；该考试无订阅者时停止其 ticker，全局无订阅者时停止心跳。 */
export function removeClient(examId: string, sink: SseSink): void {
  const set = clients.get(examId);
  if (!set) return;
  set.delete(sink);
  if (set.size === 0) {
    clients.delete(examId);
    stopExamTicker(examId);
  }
  if (totalClientCount() === 0) stopHeartbeat();
}

/** 某场考试当前订阅数。 */
export function clientCount(examId: string): number {
  return clients.get(examId)?.size ?? 0;
}

/** 全局当前订阅数。 */
export function totalClientCount(): number {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

/** 当前存在订阅者的考试数（用于统计展示）。 */
export function activeExamCount(): number {
  return clients.size;
}

/** 向某场考试的全部订阅者广播一帧，返回送达数。 */
export function broadcast(examId: string, event: string, data: unknown): number {
  const set = clients.get(examId);
  if (!set || set.size === 0) return 0;
  const chunk = sseFrame(event, data);
  for (const sink of set) safeWrite(sink, chunk);
  return set.size;
}

/** 向全部订阅者发送一次心跳。 */
export function heartbeatAll(): void {
  const chunk = sseComment('ping');
  for (const set of clients.values()) {
    for (const sink of set) safeWrite(sink, chunk);
  }
}

function ensureHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => heartbeatAll(), SSE_HEARTBEAT_MS);
  heartbeat.unref?.();
}

function stopHeartbeat(): void {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

/**
 * 启动某场考试的推送循环（已存在则不重复启动）。
 *
 * @param produce 拉取一次监考数据；抛错时向订阅者下发 `error` 事件且**不清除连接**（下一轮重试）。
 */
export function startExamTicker(
  examId: string,
  intervalMs: number,
  produce: () => Promise<unknown>,
): void {
  if (tickers.has(examId)) return;
  const timer = setInterval(() => {
    void produce()
      .then((data) => {
        broadcast(examId, 'monitor', data);
      })
      .catch((err: unknown) => {
        broadcast(examId, 'error', { message: err instanceof Error ? err.message : String(err) });
      });
  }, intervalMs);
  timer.unref?.();
  tickers.set(examId, timer);
}

/** 停止某场考试的推送循环。 */
export function stopExamTicker(examId: string): void {
  const timer = tickers.get(examId);
  if (!timer) return;
  clearInterval(timer);
  tickers.delete(examId);
}

/** 该考试是否已有推送循环。 */
export function hasExamTicker(examId: string): boolean {
  return tickers.has(examId);
}

/** 清空全部订阅与定时器（仅测试使用）。 */
export function resetMonitorStream(): void {
  for (const examId of [...tickers.keys()]) stopExamTicker(examId);
  clients.clear();
  stopHeartbeat();
}
