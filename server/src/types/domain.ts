/**
 * 后端领域类型（DTO）：字段名与前端 `src/types/index.ts` 完全一致，
 * 保证 Wave 2 前端零改动接入。
 */

/** 用户角色 */
export type Role = 'admin' | 'author' | 'examinee';

/** 题型：单选 / 多选 / 判断 */
export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';

/** 账号状态 */
export type UserStatus = 'active' | 'disabled';

/** 考试记录状态（pending_review：含主观题待人工阅卷） */
export type RecordStatus = 'in_progress' | 'submitted' | 'pending_review';

/** 科室 DTO */
export interface DepartmentDto {
  id: string;
  name: string;
  description: string;
  /** 上级科室 id；顶级科室为 null */
  parentId: string | null;
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
  /** 邮箱（邮件通知接收地址；可为空串） */
  email: string;
  status: UserStatus;
  /** 是否已开启两步验证（v1.7③；密钥本身不外泄） */
  twoFactorEnabled: boolean;
  /** 密码最后修改时间（ISO 8601，UTC；无记录为空串） */
  passwordChangedAt: string;
  /** ISO 8601（UTC） */
  createdAt: string;
}

/** 登录结果 */
export interface LoginResult {
  token: string;
  user: UserDto;
  /** 密码已超过有效期（v1.7③；仅提示，不阻断登录） */
  passwordExpired?: boolean;
}

/** 登录第二步：需要两步验证（v1.7③） */
export interface TwoFactorChallenge {
  /** 需要继续校验两步验证码 */
  twoFactorRequired: true;
  /** 一次性挑战令牌（5 分钟；仅可用于 /auth/2fa/verify） */
  challengeToken: string;
}

/** 登录接口返回：直接登录成功，或要求继续两步验证（v1.7③） */
export type LoginOutcome = LoginResult | TwoFactorChallenge;

/** 登录会话 / 设备（v1.7③） */
export interface SessionDto {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  /** 是否为当前请求所用会话 */
  current: boolean;
}

/** 登录日志（v1.7③） */
export interface LoginLogDto {
  id: string;
  username: string;
  userId: string;
  role: string;
  ip: string;
  userAgent: string;
  success: boolean;
  /** 失败原因（成功时为空串） */
  reason: string;
  /** 来源：admin（考试端）/ practice（练题端） */
  source: string;
  createdAt: string;
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
  /** 授权出题人 id 列表（admin 可见/管理；author 仅能管理被授权题库） */
  authorIds: string[];
  /** 授权出题人姓名列表（与 authorIds 对应） */
  authorNames: string[];
}

/** 题库详情 DTO（含被引用统计） */
export interface BankDetailDto extends BankDto {
  /** 该题库中「被至少一份试卷引用」的试题数 */
  referencedQuestionCount: number;
  /** 该题库的试题已被多少份不重复试卷引用 */
  referencedPaperCount: number;
}

/** 题库授权批量维护结果（v1.7③ S2） */
export interface BankAuthorBatchResult {
  /** 本次实际新增（授权）或移除（取消授权）的人数 */
  changed: number;
  /** 已授权（或本未授权）而跳过的人数 */
  skipped: number;
  /** 命中但角色不是出题人、被跳过的人数 */
  nonAuthor: number;
  /** 命中但账号不存在、被跳过的人数 */
  missing: number;
  /** 操作后该题库的授权出题人 id 列表 */
  authorIds: string[];
  /** 操作后该题库的授权出题人姓名列表（与 authorIds 对应） */
  authorNames: string[];
}

/** 简答题评分细则档位（v1.7③ S1；按分值降序，score 为该档得分） */
export interface RubricBand {
  /** 档位分值（0 ≤ score ≤ 题目分值） */
  score: number;
  /** 档位名称，如「完全正确」 */
  label: string;
  /** 档位说明（选填） */
  description: string;
}

/** 试题 DTO（在原 Question 基础上新增 bankId） */
export interface QuestionDto {
  id: string;
  /** 归属题库 id（1:N） */
  bankId: string;
  type: QuestionType;
  stem: string;
  /** 选项文本数组（判断题固定 ['正确','错误']；填空/简答为空数组） */
  options: string[];
  /**
   * 正确答案：
   * - 单选/多选/判断：选项索引数组（单选/判断恒长度 1；多选升序）
   * - 填空：逐空参考答案（文本数组，按空顺序，逐空 trim+忽略大小写匹配）
   * - 简答：参考文本（长度 1 的文本数组，仅作阅卷参考，不自动判分）
   */
  answer: number[] | string[];
  defaultScore: number;
  analysis: string;
  subject: string;
  /** 知识点标签（多标签，v1.7②；空数组 = 未打标签） */
  tags: string[];
  /** 评分细则（分档 rubric，v1.7③ S1；仅简答题可用，空数组 = 未设置） */
  rubric: RubricBand[];
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

/** 按知识点（标签）抽题的缺口项（v1.7②） */
export interface DrawTagShortage {
  tag: string;
  required: number;
  available: number;
}

/** 抽题结果 */
export interface DrawResult {
  questions: DrawQuestionItem[];
  shortages: DrawShortage[];
  /** 按标签抽题的缺口（tagRules 未配置时为空数组） */
  tagShortages: DrawTagShortage[];
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
  /** 补考申请开关；null=继承全局默认 retakeDefaultEnabled（仅 maxAttempts=1 时生效） */
  allowRetake: boolean | null;
  /** 成绩复核开关；null=继承全局默认 appealEnabled */
  allowAppeal: boolean | null;
  createdBy: string;
  createdAt: string;
}

/** 考生端考试 DTO（附带本人作答状态） */
export interface ExamMyDto extends ExamDto {
  /** 无记录时为 null；存在进行中记录时恒为 in_progress */
  recordStatus: RecordStatus | null;
  /** 本人已交卷次数（用于展示剩余次数） */
  attemptsUsed: number;
  /** 本人补考申请状态；无申请时为 null */
  retakeStatus: RetakeStatus | null;
  /** 本人当前是否可发起补考申请 */
  canApplyRetake: boolean;
  /** 特殊安排：本人考试加时（分钟，0 = 无加时） */
  extraMinutes: number;
  /** 特殊安排：本人额外答题次数（0 = 无额外次数） */
  extraAttempts: number;
  /** 特殊安排：本人是否免考（免考不可进入答题，不计入统计） */
  exempt: boolean;
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
  /**
   * 答案：Record<questionId, number[] | string[]>。
   * 客观题为选项索引数组（多选升序）；填空/简答为文本数组（按空顺序 / 单元素文本）。
   */
  answers: Record<string, number[] | string[]>;
  /** 主观题阅卷得分：Record<questionId, number>（未阅卷为空对象） */
  subjectiveScores: Record<string, number>;
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
  /** 特殊安排：本人加时分钟数（详情接口 / startExam 返回，0 或省略 = 无加时） */
  extraMinutes?: number;
  /** 本人成绩复核申请状态（详情接口返回；无申请为 null） */
  appealStatus?: AppealStatus | null;
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
  /** 答题页考生信息浮水印开关（防截屏泄题） */
  cheatWatermarkEnabled: boolean;
  /** 答题页复制/粘贴限制开关（禁用复制/右键/长按选择） */
  cheatCopyGuardEnabled: boolean;
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
  /** 同一账号连续登录失败达到该次数后，登录需填写图形验证码（v1.7③ T1） */
  loginCaptchaAfterFails: number;
  /** 倒计时剩余不足该分钟数时进入提醒态 */
  countdownWarningMinutes: number;
  /** 新建账号/重置密码使用的默认密码 */
  defaultPassword: string;
  /** 密码最小长度 */
  minPasswordLength: number;
  /** 密码策略：是否要求包含大写字母（v1.7③ T2） */
  passwordRequireUpper: boolean;
  /** 密码策略：是否要求包含小写字母 */
  passwordRequireLower: boolean;
  /** 密码策略：是否要求包含数字 */
  passwordRequireDigit: boolean;
  /** 密码策略：是否要求包含符号 */
  passwordRequireSymbol: boolean;
  /** 密码有效期（天，0 = 不启用；超期登录时提示修改密码） */
  passwordExpireDays: number;
  /** 是否允许用户自助开启两步验证（TOTP，v1.7③ T2） */
  twoFactorAvailable: boolean;
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
  /** 补考申请全局默认开关（单场考试可覆盖；仅 maxAttempts=1 的考试可补考） */
  retakeDefaultEnabled: boolean;
  /** 成绩复核全局默认开关（单场考试可覆盖） */
  appealEnabled: boolean;
  /** 成绩复核申请时限（天；自交卷起算，0 = 不限时限） */
  appealWindowDays: number;
  /** 审计日志保留天数（0 = 永久保留；超出可手动清理，v1.7②） */
  auditRetentionDays: number;
  /** 站内信通知总开关 */
  notifySiteEnabled: boolean;
  /** 邮件通知总开关 */
  notifyEmailEnabled: boolean;
  /** 考试发布通知开关 */
  notifyOnPublish: boolean;
  /** 成绩通知开关 */
  notifyOnResult: boolean;
  /** 补考审批结果通知开关 */
  notifyOnRetake: boolean;
  /** SMTP 服务器地址（空 = 未配置） */
  smtpHost: string;
  /** SMTP 端口 */
  smtpPort: number;
  /** SMTP 是否使用 SSL */
  smtpSecure: boolean;
  /** SMTP 账号 */
  smtpUser: string;
  /** SMTP 密码/授权码（敏感：仅管理员可写，接口不回传明文） */
  smtpPass: string;
  /** 发件人地址 */
  smtpFrom: string;
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

// ============================================================
// v1.5 增量 DTO：补考 / 消息通知 / 菜单权限 / 用户导入
// ============================================================

/** 补考申请状态 */
export type RetakeStatus = 'pending' | 'approved' | 'rejected';

/** 补考申请 DTO */
export interface RetakeDto {
  id: string;
  examId: string;
  /** 考试名称（列表回显用） */
  examName: string;
  userId: string;
  /** 考生姓名 */
  userName: string;
  /** 考生登录账号 */
  username: string;
  /** 科室名称 */
  departmentName: string;
  status: RetakeStatus;
  /** 申请说明（考生填写，可能为空） */
  reason: string;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** 补考申请 DTO（考生本人视角，含申请资格说明） */
export interface RetakeMyDto extends RetakeDto {
  /** 该考试是否开放补考申请（maxAttempts=1 且 allowRetake 生效） */
  retakeEnabled: boolean;
  /** 本人是否已有待审批/已通过的补考 */
  hasActive: boolean;
  /** 本人是否可发起新申请 */
  canApply: boolean;
}

/** 站内信 DTO */
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  /** ISO 8601（UTC） */
  createdAt: string;
}

/** 站内信未读数 */
export interface NotificationUnreadDto {
  unreadCount: number;
}

/** 菜单目录项（后端用于校验 + 管理端回显） */
export interface MenuCatalogItemDto {
  key: string;
  name: string;
  /** 内置默认可见角色 */
  defaultRoles: Role[];
  /** 是否管理员不可关闭（防自锁） */
  adminRequired: boolean;
}

/** 菜单权限：角色 → 可见菜单 key 列表 */
export type MenuGrantsDto = Record<Role, string[]>;

/** 菜单权限完整视图（管理端用） */
export interface MenuPermissionDto {
  catalog: MenuCatalogItemDto[];
  grants: MenuGrantsDto;
}

/** 当前用户可见菜单 key 列表（前端菜单渲染用） */
export interface MyMenusDto {
  menus: string[];
}

/** 用户导入的合法行 */
export interface UserValidRow {
  row: number;
  username: string;
  name: string;
  role: Role;
  /** 科室名称（考生必填） */
  departmentName: string;
  /** 科室 id（服务端按名称解析；考生必填，其余角色为空串） */
  departmentId: string;
  /** 邮箱；空串 = 无 */
  email: string;
  /** 初始密码；空 = 使用系统默认密码 */
  password: string;
}

/** 用户导入预览结果 */
export interface UserPreviewResult {
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  validRows: UserValidRow[];
}

/** 用户导入提交结果 */
export interface UserCommitResult {
  batchId: string;
  successCount: number;
  failCount: number;
  totalRows: number;
}

/** 用户导入批次 DTO */
export interface UserBatchDto {
  id: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  operatorId: string;
  createdAt: string;
}

// ============================================================
// v1.6④ 增量 DTO：操作审计日志 / 数据看板（趋势 + 归因）
// ============================================================

/** 审计动作（机器可读稳定 key，前端映射中文文案） */
export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.reset_password'
  | 'user.change_password'
  | 'user.two_factor_enable'
  | 'user.two_factor_disable'
  | 'user.force_logout'
  | 'exam.create'
  | 'exam.update'
  | 'exam.delete'
  | 'bank.create'
  | 'bank.update'
  | 'bank.delete'
  | 'bank.migrate'
  /** 批量授权出题人（v1.7③ S2） */
  | 'bank.author_grant'
  /** 批量取消出题人授权（v1.7③ S2） */
  | 'bank.author_revoke'
  | 'permission.update'
  | 'appeal.approve'
  | 'appeal.reject'
  | 'exam.exception_update'
  /** 导出审计日志（v1.7②） */
  | 'audit.export'
  /** 清理过期审计日志（v1.7②） */
  | 'audit.cleanup';

/** 审计目标类型 */
export type AuditTargetType = 'user' | 'exam' | 'bank' | 'permission' | 'appeal' | 'audit';

/** 操作审计日志 DTO（自包含，actor 删除后仍可读） */
export interface AuditLogDto {
  id: string;
  actorId: string;
  actorName: string;
  /** 审计动作 key（如 'user.create'） */
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetName: string;
  /** 附加明细（JSON 对象，如被改字段摘要） */
  detail: Record<string, unknown>;
  /** ISO 8601（UTC） */
  createdAt: string;
}

/** 及格率时间趋势点（一场考试一个点，按开始时间升序） */
export interface ExamTrendPointDto {
  examId: string;
  examName: string;
  /** 考试开始时刻 ISO 8601（UTC） */
  startTime: string;
  /** 参考人数（每人取最新一次已交卷） */
  total: number;
  avgScore: number;
  /** 及格率 0~1 小数 */
  passRate: number;
}

/** 按科目（知识点）的错题归因项 */
export interface SubjectWrongItemDto {
  subject: string;
  wrongCount: number;
  totalAnswered: number;
  /** 错题率 0~1 小数 */
  wrongRate: number;
}

/** 数据看板聚合（及格率趋势 + 科目/知识点错题归因） */
export interface DashboardReportDto {
  examTrend: ExamTrendPointDto[];
  subjectWrong: SubjectWrongItemDto[];
  /** 按知识点（标签）归因（v1.7②；简答排除） */
  tagWrong: SubjectWrongItemDto[];
}

/** 数据看板筛选条件（v1.7②：科室下钻 + 时间范围） */
export interface DashboardFilter {
  /** 按科室下钻（含子树） */
  departmentId?: string;
  /** 起始时刻（ISO；含） */
  from?: string;
  /** 截止时刻（ISO；含） */
  to?: string;
}

// ============================================================
// v1.7 增量 DTO：成绩复核 / 特殊考试安排 / 试卷导出
// ============================================================

/** 成绩复核申请状态 */
export type AppealStatus = 'pending' | 'approved' | 'rejected';

/** 成绩复核申请 DTO */
export interface ScoreAppealDto {
  id: string;
  recordId: string;
  examId: string;
  /** 考试名称（列表回显用） */
  examName: string;
  userId: string;
  /** 考生姓名 */
  userName: string;
  /** 考生登录账号 */
  username: string;
  /** 科室名称 */
  departmentName: string;
  status: AppealStatus;
  /** 申请说明 */
  reason: string;
  /** 申请时的成绩 */
  originalScore: number;
  /** 复核后成绩（未通过为 null） */
  newScore: number | null;
  /** 复核意见 */
  reviewComment: string;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** 特殊考试安排 DTO（考试 × 考生） */
export interface ExamExceptionDto {
  id: string;
  examId: string;
  userId: string;
  /** 考生姓名 */
  userName: string;
  /** 考生登录账号 */
  username: string;
  /** 科室名称 */
  departmentName: string;
  /** 加时（分钟） */
  extraMinutes: number;
  /** 额外答题次数 */
  extraAttempts: number;
  /** 是否免考 */
  exempt: boolean;
  /** 备注 */
  note: string;
  createdAt: string;
}

/** 试卷 PDF 导出选项 */
export interface PaperPdfOptions {
  /** 是否输出答案版（含参考答案与解析） */
  withAnswer: boolean;
}
