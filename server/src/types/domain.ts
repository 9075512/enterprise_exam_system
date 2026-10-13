/**
 * 后端领域类型（DTO）：字段名与前端 `src/types/index.ts` 完全一致，
 * 保证 Wave 2 前端零改动接入。
 */

/** 用户角色 */
export type Role = 'admin' | 'author' | 'examinee';

/** 题型：单选 / 多选 / 判断 */
export type QuestionType = 'single' | 'multiple' | 'judge';

/** 账号状态 */
export type UserStatus = 'active' | 'disabled';

/** 考试记录状态 */
export type RecordStatus = 'in_progress' | 'submitted';

/** 科室 DTO */
export interface DepartmentDto {
  id: string;
  name: string;
  description: string;
  /** ISO 8601（UTC） */
  createdAt: string;
}

/** 用户 DTO（不含 passwordHash） */
export interface UserDto {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** 所属科室 id；无科室时为 '' */
  departmentId: string;
  /** 所属科室名称；无科室时为 '' */
  departmentName: string;
  status: UserStatus;
  /** ISO 8601（UTC） */
  createdAt: string;
}

/** 登录结果 */
export interface LoginResult {
  token: string;
  user: UserDto;
}

/** 分页响应（§4.4） */
export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 题库 DTO（含派生统计 questionCount） */
export interface BankDto {
  id: string;
  name: string;
  description: string;
  /** 分类 / 科目域 */
  category: string;
  /** 是否对外开放练题（默认 false）；仅 true 的题库可在公网练题中被访问 */
  allowPractice: boolean;
  createdBy: string;
  createdAt: string;
  /** 派生统计：题库存题数（不落列） */
  questionCount: number;
}

/** 题库详情 DTO（含被引用统计） */
export interface BankDetailDto extends BankDto {
  /** 该题库中「被至少一份试卷引用」的试题数 */
  referencedQuestionCount: number;
  /** 该题库的试题已被多少份不重复试卷引用 */
  referencedPaperCount: number;
}

/** 试题 DTO（在原 Question 基础上新增 bankId） */
export interface QuestionDto {
  id: string;
  /** 归属题库 id（1:N） */
  bankId: string;
  type: QuestionType;
  stem: string;
  /** 选项文本数组（判断题固定 ['正确','错误']） */
  options: string[];
  /** 正确答案：选项索引数组；单选/判断恒长度 1；多选升序 */
  answer: number[];
  defaultScore: number;
  analysis: string;
  subject: string;
  createdBy: string;
  createdAt: string;
}

/** 试卷中的题目引用（题目内容 + 分值） */
export interface PaperQuestionDto {
  questionId: string;
  score: number;
}

/** 试卷 DTO（含来源题库 bankIds / bankNames） */
export interface PaperDto {
  id: string;
  name: string;
  description: string;
  questions: PaperQuestionDto[];
  totalScore: number;
  createdBy: string;
  createdAt: string;
  /** 来源题库 id 列表 */
  bankIds: string[];
  /** 来源题库名称列表（与 bankIds 对应） */
  bankNames: string[];
}

/** 试卷详情中的逐题项（含题目内容与来源题库） */
export interface PaperDetailQuestionDto {
  questionId: string;
  score: number;
  question: QuestionDto;
  /** 该题来源题库 id */
  bankId: string;
  /** 该题来源题库名称 */
  bankName: string;
}

/** 试卷详情 DTO */
export interface PaperDetailDto extends Omit<PaperDto, 'questions'> {
  questions: PaperDetailQuestionDto[];
}

/** 导入/预览的逐行问题明细（错误或警告） */
export interface RowIssue {
  /** Excel 行号（1-based） */
  row: number;
  /** 中文列名，如「正确答案」 */
  column: string;
  /** 原始值（字符串化） */
  value: string;
  /** 中文原因 */
  reason: string;
}

/** preview 返回、可原样回传 commit 的合法行 */
export interface ValidRow {
  row: number;
  type: QuestionType;
  stem: string;
  options: string[];
  answer: number[];
  defaultScore: number;
  analysis: string;
  subject: string;
}

/** Excel 预览结果 */
export interface PreviewResult {
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  validRows: ValidRow[];
}

/** Excel 提交结果 */
export interface CommitResult {
  batchId: string;
  successCount: number;
  failCount: number;
  totalRows: number;
}

/** 导入批次 DTO */
export interface BatchDto {
  id: string;
  bankId: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  operatorId: string;
  createdAt: string;
}

/** 抽题结果项 */
export interface DrawQuestionItem {
  questionId: string;
  score: number;
  type: QuestionType;
  stem: string;
}

/** 抽题缺口项 */
export interface DrawShortage {
  type: QuestionType;
  required: number;
  available: number;
}

/** 抽题结果 */
export interface DrawResult {
  questions: DrawQuestionItem[];
  shortages: DrawShortage[];
}

/** 考试状态（由时间窗实时推导，不落库） */
export type ExamStatus = 'not_started' | 'ongoing' | 'ended';

/** 考试 DTO */
export interface ExamDto {
  id: string;
  name: string;
  paperId: string;
  /** 参与科室 id 列表（多选） */
  departmentIds: string[];
  /** ISO 8601 */
  startTime: string;
  /** ISO 8601 */
  endTime: string;
  /** 考试时长（分钟） */
  durationMinutes: number;
  passScore: number;
  /** 每名考生对该考试可作答的次数上限 */
  maxAttempts: number;
  /** 人手一卷开关；null=继承全局默认 shuffleDefaultEnabled */
  shuffleEnabled: boolean | null;
  /** 选项乱序开关；null=继承全局默认 shuffleOptionsDefault */
  shuffleOptions: boolean | null;
  createdBy: string;
  createdAt: string;
}

/** 考生端考试 DTO（附带本人作答状态） */
export interface ExamMyDto extends ExamDto {
  /** 无记录时为 null；存在进行中记录时恒为 in_progress */
  recordStatus: RecordStatus | null;
  /** 本人已交卷次数（用于展示剩余次数） */
  attemptsUsed: number;
}

/** 切屏事件（只增不改） */
export interface CheatEvent {
  /** 事件发生时刻（切回时记录）ISO 8601 */
  at: string;
  /** 离开时长（秒） */
  awaySeconds: number;
}

/** 试卷快照中的题目：题目内容冻结副本 + 分值 */
export interface PaperSnapshotQuestion {
  questionId: string;
  score: number;
  question: QuestionDto;
}

/** 试卷快照：开考时从试卷冻结的副本 */
export interface PaperSnapshot {
  paperId: string;
  paperName: string;
  totalScore: number;
  questions: PaperSnapshotQuestion[];
  /** 人手一卷乱序种子（可复现 / 审计）；未乱序时为空 */
  seed?: string;
  /** 是否已做题目顺序乱序 */
  shuffled?: boolean;
}

/** 考试记录 DTO */
export interface ExamRecordDto {
  id: string;
  examId: string;
  userId: string;
  /** 第几次作答（从 1 开始递增） */
  attemptNo: number;
  departmentId: string;
  paperSnapshot: PaperSnapshot;
  status: RecordStatus;
  /** 答案：Record<questionId, number[]>（多选升序） */
  answers: Record<string, number[]>;
  /** 开考时刻 ISO 8601 */
  startedAt: string;
  /** 交卷时刻 ISO 8601，未交卷为 null */
  submittedAt: string | null;
  /** 是否到时自动交卷 */
  autoSubmitted: boolean;
  score: number;
  cheatEvents: CheatEvent[];
  /** 考试名称（仅详情接口 GET /records/:id 返回） */
  examName?: string;
  /** 及格线（仅详情接口 GET /records/:id 返回） */
  passScore?: number;
  /** 考生姓名（仅详情接口 GET /records/:id 返回） */
  userName?: string;
  /** 科室名称（仅详情接口 GET /records/:id 返回） */
  departmentName?: string;
}

/** 单场考试统计摘要（passRate 为 0~1 小数） */
export interface ExamSummary {
  examId: string;
  total: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  passRate: number;
}

/** 分数段统计项 */
export interface BandItem {
  label: string;
  count: number;
}

/** 科室对比统计项 */
export interface DeptItem {
  departmentId: string;
  departmentName: string;
  count: number;
  avgScore: number;
  passRate: number;
}

/** 错题率排行项 */
export interface WrongItem {
  questionId: string;
  stem: string;
  wrongCount: number;
  totalAnswered: number;
  wrongRate: number;
}

/** 报表聚合结果（四段） */
export interface ReportDto {
  summary: ExamSummary;
  bands: BandItem[];
  departments: DeptItem[];
  wrongRate: WrongItem[];
}

/**
 * 系统设置（全局单例，仅 admin 可改，所有角色可读）。
 * 字段名与前端 `src/types/index.ts` 的 `SystemSettings` 完全一致。
 * 读库时若旧数据缺字段，统一回退到 `modules/settings/settings.defaults.ts`。
 */
export interface SystemSettings {
  /** 新建考试默认时长（分钟） */
  examDefaultDuration: number;
  /** 新建考试默认及格线 */
  examDefaultPassScore: number;
  /** 新建考试默认答题次数上限（每人） */
  examDefaultMaxAttempts: number;
  /** 切屏异常判定：次数阈值（≥ 该值判为异常） */
  cheatCountThreshold: number;
  /** 切屏异常判定：累计离开秒数阈值（≥ 该值判为异常） */
  cheatSecondsThreshold: number;
  /** 切屏超阈值是否自动强制交卷（开关） */
  cheatAutoSubmitEnabled: boolean;
  /** 人手一卷全局默认开关（单场考试可覆盖） */
  shuffleDefaultEnabled: boolean;
  /** 选项乱序全局默认开关（单场考试可覆盖） */
  shuffleOptionsDefault: boolean;
  /** 登录失败锁定开关 */
  loginLockEnabled: boolean;
  /** 连续登录失败锁定阈值（次数） */
  loginMaxFails: number;
  /** 登录失败锁定时长（分钟） */
  loginLockMinutes: number;
  /** 倒计时剩余不足该分钟数时进入提醒态 */
  countdownWarningMinutes: number;
  /** 新建账号/重置密码使用的默认密码 */
  defaultPassword: string;
  /** 密码最小长度 */
  minPasswordLength: number;
  /** 列表默认每页条数 */
  defaultPageSize: number;
  /** Excel 单次导入最大数据行数 */
  importMaxRows: number;
  /** Excel 导入文件大小上限（MB） */
  importMaxFileMb: number;
  /** 系统全称（登录页品牌名） */
  systemName: string;
  /** 系统简称（侧边栏名称） */
  systemShortName: string;
  /** 登录页标语 */
  loginSlogan: string;
  /** 登录页版权/页脚文案 */
  copyright: string;
}

/** 公开设置：无需登录即可读取，仅含登录页品牌展示所需字段。 */
export type PublicSettings = Pick<
  SystemSettings,
  'systemName' | 'systemShortName' | 'loginSlogan' | 'copyright'
>;

// ============================================================
// 练题域 DTO（公网练题，增量；字段名与前端 `src/types/index.ts` 保持一致）
// ============================================================

/** 练题登录用户 DTO（仅含练题所需最小字段，**不含**任何考试域敏感字段） */
export interface PracticeUserDto {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** 所属科室 id；无科室时为 '' */
  departmentId: string;
  /** 所属科室名称；无科室时为 '' */
  departmentName: string;
}

/** 练题登录结果 */
export interface PracticeLoginResult {
  token: string;
  user: PracticeUserDto;
}

/** 对外开放练题的题库 DTO（列表项，含派生统计 questionCount） */
export interface PracticeBankDto {
  id: string;
  name: string;
  category: string;
  description: string;
  /** 题库内题数 */
  questionCount: number;
}

/** 练题题目 DTO（**不含** answer / analysis，答案与解析仅经 check 接口逐题下发） */
export interface PracticeQuestionDto {
  id: string;
  type: QuestionType;
  stem: string;
  /** 选项文本数组（判断题固定 ['正确','错误']） */
  options: string[];
  subject: string;
  /** 归属题库 id（错题本等场景回显用） */
  bankId: string;
}

/**
 * 练习会话（无状态签名，零新表）。
 * sessionToken 载荷 `{sub, bankId, qids, mode}`，check 时校验 `sub` 与登录态一致、`questionId ∈ qids`、未过期。
 */
export interface PracticeSession {
  sessionToken: string;
  questionIds: string[];
  total: number;
}

/** 单题判分结果（`POST /api/practice/check` 返回） */
export interface PracticeCheckResult {
  /** 是否正确（判分口径与考试完全一致，复用 utils/grading.isAnswerCorrect） */
  correct: boolean;
  /** 正确答案：选项索引数组（单选/判断恒长度 1；多选升序） */
  correctAnswer: number[];
  /** 解析（可能为 ''） */
  analysis: string;
  /** 题型 */
  type: QuestionType;
}

/** 练题进度 DTO（按 用户×题库 唯一） */
export interface PracticeProgressDto {
  id: string;
  userId: string;
  bankId: string;
  /** 上次练到的题目 id；无则 null */
  lastQuestionId: string | null;
  /** 已练题数（按首次作答的题目去重计数） */
  doneCount: number;
  /** 答对题数（按首次作答结果计数） */
  correctCount: number;
  /** ISO 8601（UTC） */
  updatedAt: string;
}

/** 错题本条目 DTO（题目内容 + 累计答错次数） */
export interface PracticeWrongQuestionDto extends PracticeQuestionDto {
  /** 该题历史累计答错次数 */
  wrongCount: number;
  /** 最近一次答错时刻 ISO 8601（UTC） */
  lastWrongAt: string;
}

/** 验证码下发结果（自研轻量算术验证码，零依赖） */
export interface PracticeCaptchaDto {
  captchaId: string;
  /** 供用户作答的算式题干，如 '3 + 5 = ?' */
  question: string;
}

// ============================================================
// 练题域 DTO · 二期（收藏夹 / 每日一练 / 学习报告 / 练题配置）
// ============================================================

/**
 * 练题配置（独立单行表 practice_settings，id 恒为 1）。
 * 写入方 = 内网实例（管理端 `/api/settings/practice`）；练题实例**只读**。
 * 读库时缺字段统一回退 `modules/practice/practiceSettings.defaults.ts`。
 * 字段名与前端 `src/types/index.ts` 的 `PracticeSettings` 完全一致。
 */
export interface PracticeSettings {
  /** 每日一练总开关（false = 练题端不提供每日一练） */
  dailyEnabled: boolean;
  /** 每日一练题量（1~50） */
  dailyQuestionCount: number;
  /** 每日一练抽取的题型范围；空数组 = 全部题型 */
  dailyTypes: QuestionType[];
  /** 每日一练抽题范围：practiced = 优先已练题库；all = 全部开放题库 */
  dailyBankScope: 'practiced' | 'all';
  /** 收藏夹上限（1~2000；超出仅限制新增，不回溯删除） */
  favoriteLimit: number;
}

/** 收藏夹条目 DTO（题目内容 **不含** answer/analysis + 收藏时间） */
export interface PracticeFavoriteQuestionDto extends PracticeQuestionDto {
  /** 收藏时刻 ISO 8601（UTC） */
  favoritedAt: string;
}

/** 每日一练任务 DTO（GET /api/practice/daily） */
export interface PracticeDailyTaskDto {
  /** 每日一练是否开启（后台配置）；false 时其余字段为降级值 */
  enabled: boolean;
  /** 自然日（服务端按 PRACTICE_TZ_OFFSET 折算），格式 YYYY-MM-DD */
  date: string;
  /** 当日固定题序 */
  questionIds: string[];
  /** 当日题量（= questionIds.length） */
  total: number;
  /** 当日已作答数（服务端按 practice_answers 当日聚合） */
  doneCount: number;
  /** 当日答对数 */
  correctCount: number;
  /** 是否已完成（doneCount >= total） */
  completed: boolean;
  /** 连续打卡天数（含今日，若今日有作答） */
  streakDays: number;
}

/** 学习报告 · 总览 DTO */
export interface PracticeReportSummaryDto {
  /** 累计练题数（首答去重） */
  doneTotal: number;
  /** 累计答对数 */
  correctTotal: number;
  /** 正确率（0~100 整数） */
  accuracy: number;
  /** 错题本当前题数 */
  wrongTotal: number;
  /** 收藏数 */
  favoriteTotal: number;
  /** 连续打卡天数 */
  streakDays: number;
  /** 今日已作答数 */
  todayDone: number;
  /** 今日任务总量（每日一练关闭时为 0） */
  todayTotal: number;
  /** 每日一练是否开启 */
  dailyEnabled: boolean;
}

/** 学习报告 · 逐日趋势点 */
export interface PracticeTrendPointDto {
  /** YYYY-MM-DD */
  date: string;
  doneCount: number;
  correctCount: number;
  /** 该日正确率（0~100 整数；无作答为 0） */
  accuracy: number;
}

/** 学习报告 · 科目掌握度 */
export interface PracticeSubjectStatDto {
  subject: string;
  doneCount: number;
  correctCount: number;
  /** 正确率（0~100 整数） */
  accuracy: number;
  /** 是否标记为薄弱（正确率 < 70 且作答数 >= 5） */
  weak: boolean;
}

/** 学习报告 · 题库概览 */
export interface PracticeBankStatDto {
  bankId: string;
  bankName: string;
  /** 已练题数（首答去重） */
  doneCount: number;
  /** 题库总题数 */
  totalCount: number;
  /** 正确率（0~100 整数） */
  accuracy: number;
}
