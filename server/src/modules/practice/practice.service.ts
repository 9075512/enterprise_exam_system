/**
 * 练题模块 —— 业务逻辑层。
 *
 * 职责：登录（复用内网账号 bcrypt 校验）、开放题库过滤、无状态会话签发/验签、
 * 单题判分（复用 `utils/grading.isAnswerCorrect`）、进度/错题本落库。
 *
 * ⚠️ 隔离：仅依赖 `practice.repo`（题域只读 + practice_* 读写）、`auth.verifyCredentials`
 * （`users` 只读校验）与 `utils/grading`（纯函数）；**无任何考试域依赖**。
 */
import * as repo from './practice.repo.js';
import type {
  PracticeQuestionRow,
  PracticeProgressRow,
  PracticeUserRow,
  PracticeWrongRow,
  PracticeFavoriteRow,
  PracticeDailyTaskRow,
  OpenBankRow,
} from './practice.repo.js';
import * as practiceSettingsService from './practiceSettings.service.js';
import { verifyCredentials } from '../auth/auth.service.js';
import { signPracticeToken } from '../../middleware/practiceAuth.js';
import { isAnswerCorrect } from '../../utils/grading.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn, toJsonColumn } from '../../utils/json.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { withTransaction } from '../../db/pool.js';
import {
  practiceBankUnavailable,
  practiceDailyDisabled,
  practiceFavoriteLimit,
  unauthorized,
} from '../../utils/errors.js';
import { signSessionToken, verifySessionToken } from './practice.session.js';
import {
  addDays,
  bizDayRangeUtc,
  bizToday,
  practiceTzOffsetMinutes,
} from './practice.time.js';
import type {
  Page,
  PracticeBankDto,
  PracticeBankStatDto,
  PracticeCheckResult,
  PracticeDailyTaskDto,
  PracticeFavoriteQuestionDto,
  PracticeLoginResult,
  PracticeProgressDto,
  PracticeQuestionDto,
  PracticeReportSummaryDto,
  PracticeSession,
  PracticeSubjectStatDto,
  PracticeTrendPointDto,
  PracticeUserDto,
  PracticeWrongQuestionDto,
  QuestionType,
} from '../../types/domain.js';
import type {
  PracticeCheckInput,
  PracticeProgressPutInput,
  PracticeSessionInput,
} from './practice.schema.js';

/* ------------------------------ 映射 ------------------------------ */

function mapBank(row: OpenBankRow): PracticeBankDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    questionCount: Number(row.question_count ?? 0),
  };
}

/** 题目行 → DTO（**不含** answer/analysis）。 */
function mapQuestion(row: PracticeQuestionRow): PracticeQuestionDto {
  return {
    id: row.id,
    type: row.type,
    stem: row.stem,
    options: parseJsonColumn<string[]>(row.options, []),
    subject: row.subject,
    bankId: row.bank_id,
  };
}

function mapProgress(row: PracticeProgressRow): PracticeProgressDto {
  return {
    id: row.id,
    userId: row.user_id,
    bankId: row.bank_id,
    lastQuestionId: row.last_question_id ?? null,
    doneCount: Number(row.done_count ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    updatedAt: fromDbDateSafe(row.updated_at),
  };
}

/** 错题本行 → DTO（题目内容 **不含** answer/analysis + 累计答错次数）。 */
function mapWrong(row: PracticeWrongRow): PracticeWrongQuestionDto {
  return {
    id: row.question_id,
    type: row.type,
    stem: row.stem,
    options: parseJsonColumn<string[]>(row.options, []),
    subject: row.subject,
    bankId: row.bank_id,
    wrongCount: Number(row.wrong_count ?? 0),
    lastWrongAt: fromDbDateSafe(row.last_wrong_at),
  };
}

/** 空进度 DTO（无记录时的零值）。 */
function emptyProgress(userId: string, bankId: string): PracticeProgressDto {
  return { id: '', userId, bankId, lastQuestionId: null, doneCount: 0, correctCount: 0, updatedAt: '' };
}

/* ------------------------------ 登录（复用内网账号） ------------------------------ */

/** 练题用户行 → DTO（含本人科室，供「我的」页展示）。 */
function mapPracticeUser(row: PracticeUserRow): PracticeUserDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? '',
    departmentName: row.department_name ?? '',
  };
}

/** 练题登录：复用内网账号校验（**只读** users），签发练题专属 JWT。 */
export async function login(username: string, password: string): Promise<PracticeLoginResult> {
  const row = await verifyCredentials(username, password);
  // 校验通过后取一次本人档案（含科室名，仅列级只读 users / departments）用于回显。
  const profile = await repo.findPracticeUserById(row.id);
  if (!profile) throw unauthorized('账号或密码不正确');
  const user = mapPracticeUser(profile);
  const token = signPracticeToken({ sub: row.id, role: row.role });
  return { token, user };
}

/** 获取当前练题登录用户（练题登录态回显，含本人科室）。 */
export async function me(userId: string): Promise<PracticeUserDto> {
  const row = await repo.findPracticeUserById(userId);
  if (!row) throw unauthorized('登录状态已失效，请重新登录');
  return mapPracticeUser(row);
}

/* ------------------------------ 题库 / 题目 ------------------------------ */

/** 对外开放练题的题库列表。 */
export async function listBanks(): Promise<PracticeBankDto[]> {
  const rows = await repo.listOpenBanks();
  return rows.map(mapBank);
}

/** 题库题目分页（仅开放题库；DTO **不含**答案/解析）。 */
export async function listQuestions(
  bankId: string,
  filter: { type?: QuestionType; subject?: string; page?: number; pageSize?: number },
): Promise<Page<PracticeQuestionDto>> {
  const bank = await repo.findOpenBankById(bankId);
  if (!bank) throw practiceBankUnavailable();
  const paging = normalizePaging(filter.page, filter.pageSize);
  const [rows, total] = await Promise.all([
    repo.listBankQuestions({
      bankId,
      type: filter.type,
      subject: filter.subject,
      page: paging.page,
      pageSize: paging.pageSize,
    }),
    repo.countBankQuestions({ bankId, type: filter.type, subject: filter.subject }),
  ]);
  return buildPage(rows.map(mapQuestion), total, paging.page, paging.pageSize);
}

/** 按 id 批量取题（仅开放题库；DTO **不含**答案/解析），用于本地按会话组装题目。 */
export async function getQuestionsByIds(ids: string[]): Promise<PracticeQuestionDto[]> {
  const rows = await repo.listQuestionsByIds(ids);
  const map = new Map(rows.map((r) => [r.id, mapQuestion(r)]));
  // 保持入参顺序（即会话内的题目顺序）
  return ids
    .map((id) => map.get(id))
    .filter((x): x is PracticeQuestionDto => Boolean(x));
}

/* ------------------------------ 练习会话（无状态签名） ------------------------------ */

/** 生成一次练习序列（顺序 / 随机、题量、题型筛选）。 */
export async function createSession(userId: string, input: PracticeSessionInput): Promise<PracticeSession> {
  const bank = await repo.findOpenBankById(input.bankId);
  if (!bank) throw practiceBankUnavailable();
  const types = input.types && input.types.length > 0 ? input.types : undefined;
  const limit = input.count && input.count > 0 ? input.count : undefined;
  const qids = await repo.listQuestionIds({
    bankId: input.bankId,
    types,
    random: input.mode === 'random',
    limit,
  });
  const sessionToken = signSessionToken({
    sub: userId,
    bankId: input.bankId,
    qids,
    mode: input.mode,
  });
  return { sessionToken, questionIds: qids, total: qids.length };
}

/** 从错题本生成练习序列（可按题库过滤；跨库时 bankId 为空串）。 */
export async function createWrongReansSession(userId: string, bankId?: string): Promise<PracticeSession> {
  const scopedBankId = bankId?.trim() ?? '';
  if (scopedBankId !== '') {
    const bank = await repo.findOpenBankById(scopedBankId);
    if (!bank) throw practiceBankUnavailable();
  }
  const qids = await repo.listWrongQuestionIds(userId, scopedBankId);
  const sessionToken = signSessionToken({
    sub: userId,
    bankId: scopedBankId,
    qids,
    mode: 'sequence',
  });
  return { sessionToken, questionIds: qids, total: qids.length };
}

/* ------------------------------ 单题判分（即时） ------------------------------ */

/**
 * 提交单题作答 → 即时判分，返回正误 + 正确答案 + 解析；并持久化作答/进度/错题本。
 * 判分口径复用 `utils/grading.isAnswerCorrect`（与考试**逐字一致**）。
 */
export async function check(userId: string, input: PracticeCheckInput): Promise<PracticeCheckResult> {
  const session = verifySessionToken(input.sessionToken);
  if (!session || session.sub !== userId || !session.qids.includes(input.questionId)) {
    // 会话非本人 / 题目不在会话内 / 过期 → 视为会话失效（防遍历 questionId 暴力取答案）
    throw practiceBankUnavailable('练习会话已失效，请重新开始练习');
  }

  const row = await repo.findQuestionForCheck(input.questionId);
  if (!row) throw practiceBankUnavailable();
  // 双保险：题目必须属于会话指定的题库（跨库复习会话 bankId 为空时跳过）
  if (session.bankId && row.bank_id !== session.bankId) throw practiceBankUnavailable();

  const correctAnswer = parseJsonColumn<number[]>(row.answer, []);
  const analysis = row.analysis ?? '';
  const correct = isAnswerCorrect({ type: row.type, answer: correctAnswer }, input.answer);
  const normalized = [...new Set(input.answer)].sort((a, b) => a - b);

  await withTransaction(async (conn) => {
    // 统计口径：以「首次作答」为准（重做不覆盖首次）
    const existing = await repo.findAnswer(userId, input.questionId, conn);
    if (!existing) {
      await repo.insertAnswer(
        {
          id: genId('pa-'),
          userId,
          questionId: input.questionId,
          answer: normalized,
          isCorrect: correct,
          answeredAt: nowDb(),
        },
        conn,
      );
      if (session.bankId) {
        await repo.incrementProgress(
          {
            id: genId('pp-'),
            userId,
            bankId: session.bankId,
            lastQuestionId: input.questionId,
            doneDelta: 1,
            correctDelta: correct ? 1 : 0,
            updatedAt: nowDb(),
          },
          conn,
        );
      }
    }
    if (!correct) {
      await repo.upsertWrongBook(
        { id: genId('pw-'), userId, questionId: input.questionId, wrongAt: nowDb() },
        conn,
      );
    }
  });

  return { correct, correctAnswer, analysis, type: row.type };
}

/* ------------------------------ 进度 / 错题本 ------------------------------ */

/** 查询我的练题进度（无记录返回零值 DTO）。 */
export async function getProgress(userId: string, bankId: string): Promise<PracticeProgressDto> {
  const bank = await repo.findOpenBankById(bankId);
  if (!bank) throw practiceBankUnavailable();
  const row = await repo.findProgress(userId, bankId);
  return row ? mapProgress(row) : emptyProgress(userId, bankId);
}

/** 保存练题进度（按 user×bank；**计数服务端重算**，忽略任何客户端计数）。 */
export async function saveProgress(
  userId: string,
  input: PracticeProgressPutInput,
): Promise<PracticeProgressDto> {
  const bank = await repo.findOpenBankById(input.bankId);
  if (!bank) throw practiceBankUnavailable();
  // 服务端权威：以 practice_answers 首答聚合重算，杜绝客户端伪造累加
  const { done, correct } = await repo.countAnswersByBank(userId, input.bankId);
  await repo.setProgressCounts({
    id: genId('pp-'),
    userId,
    bankId: input.bankId,
    lastQuestionId: input.lastQuestionId ?? null,
    doneCount: done,
    correctCount: correct,
    updatedAt: nowDb(),
  });
  const row = await repo.findProgress(userId, input.bankId);
  return row ? mapProgress(row) : emptyProgress(userId, input.bankId);
}

/** 错题本分页。 */
export async function listWrongBook(
  userId: string,
  page?: number,
  pageSize?: number,
): Promise<Page<PracticeWrongQuestionDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([
    repo.listWrongBook(userId, paging.page, paging.pageSize),
    repo.countWrongBook(userId),
  ]);
  return buildPage(rows.map(mapWrong), total, paging.page, paging.pageSize);
}

/* ============================================================
 * 二期增量 · 收藏夹
 * ============================================================ */

/** 收藏条目行 → DTO（题目内容 **不含** answer/analysis + 收藏时间）。 */
function mapFavorite(row: PracticeFavoriteRow): PracticeFavoriteQuestionDto {
  return {
    id: row.question_id,
    type: row.type,
    stem: row.stem,
    options: parseJsonColumn<string[]>(row.options, []),
    subject: row.subject,
    bankId: row.bank_id,
    favoritedAt: fromDbDateSafe(row.created_at),
  };
}

/** 收藏夹配置上限（读取后台配置）。 */
async function favoriteLimit(): Promise<number> {
  const settings = await practiceSettingsService.getPracticeSettings();
  return settings.favoriteLimit;
}

/** 收藏夹分页（可按题库筛选；仅开放题库的题）。 */
export async function listFavorites(
  userId: string,
  filter: { bankId?: string; page?: number; pageSize?: number },
): Promise<Page<PracticeFavoriteQuestionDto>> {
  const bankId = filter.bankId?.trim() ?? '';
  const paging = normalizePaging(filter.page, filter.pageSize);
  const [rows, total] = await Promise.all([
    repo.listFavorites(userId, bankId, paging.page, paging.pageSize),
    repo.countFavorites(userId, bankId),
  ]);
  return buildPage(rows.map(mapFavorite), total, paging.page, paging.pageSize);
}

/** 我收藏的题目 id 列表（作答页批量回显收藏态用；可按题库过滤）。 */
export async function listFavoriteIds(userId: string, bankId?: string): Promise<string[]> {
  return repo.listFavoriteQuestionIds(userId, bankId);
}

/**
 * 收藏一题（幂等）。题目必须属于开放题库；超出配置上限时拒绝（1013/409）。
 * 上限只限制**新增**，不回溯删除已有收藏。
 */
export async function addFavorite(
  userId: string,
  questionId: string,
): Promise<{ favorited: boolean; favoriteTotal: number }> {
  const question = await repo.findQuestionForCheck(questionId);
  if (!question) throw practiceBankUnavailable();

  const existing = await repo.findFavorite(userId, questionId);
  if (!existing) {
    const [limit, current] = await Promise.all([favoriteLimit(), repo.countFavorites(userId)]);
    if (current >= limit) throw practiceFavoriteLimit();
    await repo.insertFavorite({
      id: genId('pf-'),
      userId,
      questionId,
      createdAt: nowDb(),
    });
  }
  const total = await repo.countFavorites(userId);
  return { favorited: true, favoriteTotal: total };
}

/** 取消收藏（幂等）。 */
export async function removeFavorite(
  userId: string,
  questionId: string,
): Promise<{ favorited: boolean; favoriteTotal: number }> {
  await repo.deleteFavorite(userId, questionId);
  const total = await repo.countFavorites(userId);
  return { favorited: false, favoriteTotal: total };
}

/** 从收藏夹生成练习序列（可按题库过滤；跨库时 bankId 为空串）。 */
export async function createFavoriteReansSession(
  userId: string,
  bankId?: string,
): Promise<PracticeSession> {
  const scopedBankId = bankId?.trim() ?? '';
  if (scopedBankId !== '') {
    const bank = await repo.findOpenBankById(scopedBankId);
    if (!bank) throw practiceBankUnavailable();
  }
  const qids = await repo.listFavoriteQuestionIds(userId, scopedBankId);
  const sessionToken = signSessionToken({
    sub: userId,
    bankId: scopedBankId,
    qids,
    mode: 'sequence',
  });
  return { sessionToken, questionIds: qids, total: qids.length };
}

/* ============================================================
 * 二期增量 · 每日一练
 * ============================================================ */

/** 连续打卡天数（含今日；今日未作答时以昨日为端点不视为中断）。 */
async function computeStreakDays(userId: string): Promise<number> {
  const offset = practiceTzOffsetMinutes();
  const today = bizToday(offset);
  // 只回溯最近 400 天，避免全表扫描
  const fromUtc = bizDayRangeUtc(addDays(today, -400), offset).startUtc;
  const dates = await repo.listAnsweredBizDates(userId, offset, fromUtc);
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * 确保当日任务存在（首次请求时生成并落库，题序此后**固定不变**）。
 * 抽题策略：先按 `dailyBankScope` 取范围，再按 `dailyTypes` 过滤题型，随机抽取 `dailyQuestionCount` 题；
 * 已练题库不足时用全部开放题库补足（去重）。
 */
async function ensureDailyTask(userId: string, date: string): Promise<PracticeDailyTaskRow> {
  const existing = await repo.findDailyTask(userId, date);
  if (existing) return existing;

  const settings = await practiceSettingsService.getPracticeSettings();
  const types = settings.dailyTypes;
  const want = settings.dailyQuestionCount;

  let bankIds: string[] = [];
  if (settings.dailyBankScope === 'practiced') {
    bankIds = await repo.listPracticedBankIds(userId);
  }

  const picked = await repo.listRandomQuestionIdsInBanks({ bankIds, types, limit: want });

  if (picked.length < want && bankIds.length > 0) {
    const pickedSet = new Set(picked);
    const more = await repo.listRandomQuestionIdsInBanks({
      bankIds: [],
      types,
      limit: want * 2,
    });
    for (const id of more) {
      if (picked.length >= want) break;
      if (pickedSet.has(id)) continue;
      pickedSet.add(id);
      picked.push(id);
    }
  }

  await repo.insertDailyTask({
    id: genId('pdt-'),
    userId,
    practiceDate: date,
    questionIdsJson: toJsonColumn(picked),
    total: picked.length,
    createdAt: nowDb(),
  });

  const row = await repo.findDailyTask(userId, date);
  if (!row) throw practiceBankUnavailable('每日一练任务创建失败，请稍后重试');
  return row;
}

/** 依据 practice_answers 重算当日任务完成度并落库（服务端权威口径）。 */
async function refreshDailyProgress(
  userId: string,
  row: PracticeDailyTaskRow,
): Promise<{ done: number; correct: number; completed: boolean }> {
  const date = String(row.practice_date).slice(0, 10);
  const qids = parseJsonColumn<string[]>(row.question_ids, []);
  const { startUtc, endUtc } = bizDayRangeUtc(date);
  const { done, correct } = await repo.countAnswersOfQuestionsBetween(userId, qids, startUtc, endUtc);
  const total = qids.length;
  const completed = total > 0 && done >= total;
  const prevDone = Number(row.done_count ?? 0);

  if (done !== prevDone || Number(row.correct_count ?? 0) !== correct || (completed && !row.completed_at)) {
    await repo.setDailyTaskProgress({
      userId,
      practiceDate: date,
      doneCount: done,
      correctCount: correct,
      completedAt: completed ? (row.completed_at ?? nowDb()) : null,
      updatedAt: nowDb(),
    });
  }
  return { done, correct, completed };
}

/** 今日任务降级 DTO（每日一练关闭 / 无题可练时）。 */
function dailyDisabledDto(enabled: boolean, date: string, streakDays: number): PracticeDailyTaskDto {
  return {
    enabled,
    date,
    questionIds: [],
    total: 0,
    doneCount: 0,
    correctCount: 0,
    completed: false,
    streakDays,
  };
}

/** 查询今日任务（关闭时返回 enabled=false 的降级结构，不生成任务）。 */
export async function getDaily(userId: string): Promise<PracticeDailyTaskDto> {
  const settings = await practiceSettingsService.getPracticeSettings();
  const date = bizToday();
  const streakDays = await computeStreakDays(userId);

  if (!settings.dailyEnabled) return dailyDisabledDto(false, date, streakDays);

  const row = await ensureDailyTask(userId, date);
  const qids = parseJsonColumn<string[]>(row.question_ids, []);
  if (qids.length === 0) return dailyDisabledDto(true, date, streakDays);

  const { done, correct, completed } = await refreshDailyProgress(userId, row);
  return {
    enabled: true,
    date,
    questionIds: qids,
    total: qids.length,
    doneCount: done,
    correctCount: correct,
    completed,
    streakDays,
  };
}

/** 生成今日任务练习会话（关闭时拒绝：1014/404）。 */
export async function createDailySession(userId: string): Promise<PracticeSession> {
  const settings = await practiceSettingsService.getPracticeSettings();
  if (!settings.dailyEnabled) throw practiceDailyDisabled();

  const date = bizToday();
  const row = await ensureDailyTask(userId, date);
  const qids = parseJsonColumn<string[]>(row.question_ids, []);
  const sessionToken = signSessionToken({
    sub: userId,
    // 每日任务可能跨题库 → bankId 置空串，check 时跳过题库归属校验
    bankId: '',
    qids,
    mode: 'sequence',
  });
  return { sessionToken, questionIds: qids, total: qids.length };
}

/* ============================================================
 * 二期增量 · 学习报告
 * ============================================================ */

/** 报告总览。 */
export async function getReportSummary(userId: string): Promise<PracticeReportSummaryDto> {
  const settings = await practiceSettingsService.getPracticeSettings();
  const date = bizToday();
  const { startUtc, endUtc } = bizDayRangeUtc(date);

  const [total, today, wrongTotal, favoriteTotal, streakDays] = await Promise.all([
    repo.countAnswersTotal(userId),
    repo.countAnswersBetween(userId, startUtc, endUtc),
    repo.countWrongBook(userId),
    repo.countFavorites(userId),
    computeStreakDays(userId),
  ]);

  let todayTotal = 0;
  if (settings.dailyEnabled) {
    const row = await repo.findDailyTask(userId, date);
    if (row) todayTotal = parseJsonColumn<string[]>(row.question_ids, []).length;
  }

  return {
    doneTotal: total.done,
    correctTotal: total.correct,
    accuracy: percent(total.correct, total.done),
    wrongTotal,
    favoriteTotal,
    streakDays,
    todayDone: today.done,
    todayTotal,
    dailyEnabled: settings.dailyEnabled,
  };
}

/** 正确率（0~100 整数；分母为 0 时返回 0）。 */
function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** 近 N 日逐日趋势（无记录的自然日补 0）。 */
export async function getReportTrend(
  userId: string,
  days: 7 | 30,
): Promise<PracticeTrendPointDto[]> {
  const offset = practiceTzOffsetMinutes();
  const today = bizToday(offset);
  const firstDate = addDays(today, -(days - 1));
  const startUtc = bizDayRangeUtc(firstDate, offset).startUtc;
  const endUtc = bizDayRangeUtc(today, offset).endUtc;

  const rows = await repo.listAnswersByDay(userId, offset, startUtc, endUtc);
  const map = new Map(rows.map((r) => [r.date, r]));

  const points: PracticeTrendPointDto[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(firstDate, i);
    const hit = map.get(date);
    const done = hit?.done ?? 0;
    const correct = hit?.correct ?? 0;
    points.push({ date, doneCount: done, correctCount: correct, accuracy: percent(correct, done) });
  }
  return points;
}

/** 科目掌握度（正确率升序；正确率 < 70 且作答数 >= 5 标记薄弱）。 */
export async function getReportSubjects(userId: string): Promise<PracticeSubjectStatDto[]> {
  const rows = await repo.listSubjectStats(userId);
  return rows.map((r) => {
    const accuracy = percent(r.correct, r.done);
    return {
      subject: r.subject,
      doneCount: r.done,
      correctCount: r.correct,
      accuracy,
      weak: r.done >= 5 && accuracy < 70,
    };
  });
}

/** 开放题库概览。 */
export async function getReportBanks(userId: string): Promise<PracticeBankStatDto[]> {
  const rows = await repo.listBankStats(userId);
  return rows.map((r) => ({
    bankId: r.bankId,
    bankName: r.bankName,
    doneCount: r.done,
    totalCount: r.totalCount,
    accuracy: percent(r.correct, r.done),
  }));
}
