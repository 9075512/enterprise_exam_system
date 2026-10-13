/**
 * 练题 API（公网练题，§4.7）。
 *
 * 走**同一** axios 实例（`http.ts`）：统一解包 `{code,message,data}` 与错误提示；
 * 差异仅在：
 * - 练题请求传 `practiceAuth: true` → 注入练题 Token（`practice.token`），
 *   401 走练题专属流程（清练题 Token + 跳练题登录页），**不触发内网全局登出**；
 * - 登录 / 验证码请求传 `skipAuthRedirect: true`（其 401 为「账号或密码错误」而非会话失效）。
 */
import { del, get, post, put, type AppRequestConfig } from './http';
import type {
  ContentFeed,
  Page,
  PracticeBank,
  PracticeBankStat,
  PracticeCheckResult,
  PracticeCaptcha,
  PracticeConfig,
  PracticeDailyTask,
  PracticeFavoriteQuestion,
  PracticeLoginResult,
  PracticeMode,
  PracticeProgress,
  PracticeQuestion,
  PracticeReportSummary,
  PracticeSession,
  PracticeSubjectStat,
  PracticeTrendPoint,
  PracticeUser,
  PracticeWrongQuestion,
  QuestionType,
} from '@/types';

/** 练题已登录请求配置（注入练题 Token + 练题 401 流程）。 */
const AUTHED: AppRequestConfig = { practiceAuth: true };

/** 公开请求配置（登录/验证码：401 不触发任何全局流程，仅按后端文案提示）。 */
const PUBLIC: AppRequestConfig = { skipAuthRedirect: true };

/** 生成练习序列入参 */
export interface PracticeSessionPayload {
  bankId: string;
  /** 缺省时后端按「练题端设置 → 默认练题方式」兜底（v1.9⑤） */
  mode?: PracticeMode;
  count?: number;
  types?: QuestionType[];
}

/** 单题判分入参 */
export interface PracticeCheckPayload {
  sessionToken: string;
  questionId: string;
  answer: number[];
}

/** 保存进度入参（计数由服务端重算，仅上报题库与上次练到的题目） */
export interface PracticeProgressPayload {
  bankId: string;
  lastQuestionId?: string | null;
}

/** 下发验证码（失败达阈值后需要） */
export function getCaptcha(): Promise<PracticeCaptcha> {
  return get<PracticeCaptcha>('/practice/auth/captcha', undefined, PUBLIC);
}

/** 练题登录（复用内网账号） */
export function login(
  username: string,
  password: string,
  captchaId?: string,
  captcha?: string,
): Promise<PracticeLoginResult> {
  return post<PracticeLoginResult>(
    '/practice/auth/login',
    { username, password, captchaId, captcha },
    PUBLIC,
  );
}

/** 当前练题登录用户 */
export function fetchMe(): Promise<PracticeUser> {
  return get<PracticeUser>('/practice/auth/me', undefined, AUTHED);
}

/** 登出（无状态；显式携带练题 Token，静默失败） */
export function logout(token: string): Promise<null> {
  return post<null>('/practice/auth/logout', undefined, {
    headers: { Authorization: `Bearer ${token}` },
    skipAuthRedirect: true,
    suppressErrorToast: true,
  });
}

/** 对外开放练题的题库列表 */
export function listBanks(): Promise<PracticeBank[]> {
  return get<PracticeBank[]>('/practice/banks', undefined, AUTHED);
}

/** 题库题目（分页；不含答案/解析） */
export function questions(
  bankId: string,
  query: { type?: QuestionType; subject?: string; page?: number; pageSize?: number } = {},
): Promise<Page<PracticeQuestion>> {
  return get<Page<PracticeQuestion>>(
    `/practice/banks/${bankId}/questions`,
    {
      type: query.type || undefined,
      subject: query.subject || undefined,
      page: query.page,
      pageSize: query.pageSize,
    },
    AUTHED,
  );
}

/** 按 id 批量取题（不含答案/解析），用于按会话组装题目 */
export function questionsByIds(ids: string[]): Promise<PracticeQuestion[]> {
  return get<PracticeQuestion[]>('/practice/questions', { ids: ids.join(',') }, AUTHED);
}

/** 生成一次练习序列 */
export function createSession(payload: PracticeSessionPayload): Promise<PracticeSession> {
  return post<PracticeSession>('/practice/sessions', payload, AUTHED);
}
/** 练题端公开配置（默认模式 / 题量范围 / 答案可见性 / 页面入口开关，v1.9⑤） */
export function getConfig(): Promise<PracticeConfig> {
  return get<PracticeConfig>('/practice/config', {}, AUTHED);
}

/**
 * 练题端当前生效的公告 + 轮播图（v1.9⑥）。
 * 仅返回发布范围为 practice / both 且在生效时间窗内的内容；无内容时返回空数组。
 */
export function feed(): Promise<ContentFeed> {
  return get<ContentFeed>('/practice/feed', undefined, AUTHED);
}

/** 记录公告已读（练题端 scope='practice'，幂等，v2.0③） */
export function markAnnouncementRead(id: string): Promise<null> {
  return post<null>(`/practice/feed/announcements/${encodeURIComponent(id)}/read`, undefined, AUTHED);
}

/** 记录轮播点击（练题端 scope='practice'，幂等，v2.0③） */
export function markBannerClick(id: string): Promise<null> {
  return post<null>(`/practice/feed/banners/${encodeURIComponent(id)}/click`, undefined, AUTHED);
}

/** 提交单题作答 → 即时判分 */
export function check(payload: PracticeCheckPayload): Promise<PracticeCheckResult> {
  return post<PracticeCheckResult>('/practice/check', payload, AUTHED);
}

/** 查询我的练题进度 */
export function getProgress(bankId: string): Promise<PracticeProgress> {
  return get<PracticeProgress>('/practice/progress', { bankId }, AUTHED);
}

/** 保存练题进度 */
export function saveProgress(payload: PracticeProgressPayload): Promise<PracticeProgress> {
  return put<PracticeProgress>('/practice/progress', payload, AUTHED);
}

/** 错题本列表（分页） */
export function wrongBook(query: { page?: number; pageSize?: number } = {}): Promise<Page<PracticeWrongQuestion>> {
  return get<Page<PracticeWrongQuestion>>(
    '/practice/wrong-book',
    { page: query.page, pageSize: query.pageSize },
    AUTHED,
  );
}

/** 从错题本生成练习序列（可选按题库过滤） */
export function wrongReans(bankId?: string): Promise<PracticeSession> {
  return post<PracticeSession>('/practice/wrong-book/reans', { bankId }, AUTHED);
}

/* ------------------------------ 收藏夹（二期） ------------------------------ */

/** 我的收藏（分页，可按题库筛选） */
export function favorites(
  query: { bankId?: string; page?: number; pageSize?: number } = {},
): Promise<Page<PracticeFavoriteQuestion>> {
  return get<Page<PracticeFavoriteQuestion>>(
    '/practice/favorites',
    { bankId: query.bankId || undefined, page: query.page, pageSize: query.pageSize },
    AUTHED,
  );
}

/** 我收藏的题目 id 列表（作答页批量回显收藏态） */
export function favoriteIds(bankId?: string): Promise<string[]> {
  return get<string[]>('/practice/favorites/ids', { bankId: bankId || undefined }, AUTHED);
}

/** 收藏一题（幂等；超上限时后端返回 1013） */
export function addFavorite(questionId: string): Promise<{ favorited: boolean; favoriteTotal: number }> {
  return post<{ favorited: boolean; favoriteTotal: number }>(
    '/practice/favorites',
    { questionId },
    AUTHED,
  );
}

/** 取消收藏（幂等） */
export function removeFavorite(questionId: string): Promise<{ favorited: boolean; favoriteTotal: number }> {
  return del<{ favorited: boolean; favoriteTotal: number }>(
    `/practice/favorites/${encodeURIComponent(questionId)}`,
    undefined,
    AUTHED,
  );
}

/** 从收藏夹生成练习序列（可选按题库过滤） */
export function favoritesReans(bankId?: string): Promise<PracticeSession> {
  return post<PracticeSession>('/practice/favorites/reans', { bankId }, AUTHED);
}

/* ------------------------------ 每日一练（二期） ------------------------------ */

/** 今日任务（每日一练关闭时 `enabled=false`，其余字段为降级值） */
export function daily(): Promise<PracticeDailyTask> {
  return get<PracticeDailyTask>('/practice/daily', undefined, AUTHED);
}

/** 生成今日任务练习会话（关闭时后端返回 1014） */
export function dailySession(): Promise<PracticeSession> {
  return post<PracticeSession>('/practice/daily/session', undefined, AUTHED);
}

/* ------------------------------ 学习报告（二期） ------------------------------ */

/** 报告总览 */
export function reportSummary(): Promise<PracticeReportSummary> {
  return get<PracticeReportSummary>('/practice/report/summary', undefined, AUTHED);
}

/** 逐日趋势（days 仅支持 7 / 30；无记录日补 0） */
export function reportTrend(days: 7 | 30 = 7): Promise<PracticeTrendPoint[]> {
  return get<PracticeTrendPoint[]>('/practice/report/trend', { days }, AUTHED);
}

/** 科目掌握度（正确率升序，含 weak 标记） */
export function reportSubjects(): Promise<PracticeSubjectStat[]> {
  return get<PracticeSubjectStat[]>('/practice/report/subjects', undefined, AUTHED);
}

/** 开放题库概览 */
export function reportBanks(): Promise<PracticeBankStat[]> {
  return get<PracticeBankStat[]>('/practice/report/banks', undefined, AUTHED);
}
