/**
 * 系统全部实体类型与枚举（单一类型源）。
 * 所有页面与服务的类型只能从此文件导入，禁止在页面内重复定义。
 * 字段以后端 `server/src/types/domain.ts` 的 DTO 为准（保证前后端一致）。
 */

/** 用户角色 */
export type Role = 'admin' | 'author' | 'examinee';

/** 题型：单选 / 多选 / 判断 / 填空 / 简答 */
export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';

/** 考试状态（由时间窗实时推导，不落库） */
export type ExamStatus = 'not_started' | 'ongoing' | 'ended';

/** 考试记录状态（pending_review：含主观题待人工阅卷） */
export type RecordStatus = 'in_progress' | 'submitted' | 'pending_review';

/** 补考申请状态 */
export type RetakeStatus = 'pending' | 'approved' | 'rejected';

/** 账号状态 */
export type UserStatus = 'active' | 'disabled';

/** 通用分页响应（§4.4 / §9-5） */
export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 科室 */
export interface Department {
  id: string;
  name: string;
  description: string;
  /** 上级科室 id；顶级科室为 null */
  parentId: string | null;
  /** ISO 8601 */
  createdAt: string;
}

/** 用户（对外 DTO，不含密码哈希；后端 login/me 不返回 passwordHash） */
export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** 所属科室 id（管理员/出题人可为空字符串） */
  departmentId: string;
  /** 所属科室名称；无科室时为 ''（由后端 login / me / users 列表返回） */
  departmentName: string;
  /** 邮箱（邮件通知接收地址；可为空串） */
  email: string;
  status: UserStatus;
  /** 是否已开启两步验证（TOTP，v1.7③） */
  twoFactorEnabled: boolean;
  /** 密码最后修改时间（ISO 8601；无记录为空串） */
  passwordChangedAt: string;
  /** ISO 8601 */
  createdAt: string;
}

/** 登录结果 */
export interface LoginResult {
  token: string;
  user: User;
  /** 密码已超过有效期（v1.7③；仅提示，不阻断登录） */
  passwordExpired?: boolean;
}

/** 登录第二步：需要两步验证（v1.7③） */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** 一次性挑战令牌（5 分钟） */
  challengeToken: string;
}

/** 登录接口返回：直接登录成功，或要求继续两步验证 */
export type LoginOutcome = LoginResult | TwoFactorChallenge;

/** 账号安全策略（个人安全页展示；v1.7③ 密码策略 + v1.8② 两步验证状态） */
export interface AccountSecurityPolicy {
  /** 密码复杂度要求的中文描述 */
  text: string;
  /** 密码有效期（天；0 = 不过期） */
  expireDays: number;
  /** 本人的两步验证是否已开启 */
  twoFactorEnabled: boolean;
  /** 剩余可用的恢复码数量（未开启 2FA 时为 0） */
  recoveryCodesRemaining: number;
}

/** 启用 / 重新生成的恢复码（明文仅此一次下发，v1.8② U2） */
export interface RecoveryCodes {
  recoveryCodes: string[];
}

/** 登录会话 / 设备（v1.7③） */
export interface LoginSession {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  /** 是否为当前设备 */
  current: boolean;
}

/** 登录日志（v1.7③） */
export interface LoginLog {
  id: string;
  username: string;
  userId: string;
  role: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason: string;
  /** 来源：admin（考试端）/ practice（练题端） */
  source: string;
  createdAt: string;
}

/** 题库（列表项，含派生统计 questionCount） */
export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  /** 分类 / 科目域 */
  category: string;
  /** 是否对外开放练题（默认 false）；仅 true 的题库可在公网练题中被访问 */
  allowPractice: boolean;
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
  /** 派生统计：题库内题数 */
  questionCount: number;
  /** 授权出题人 id 列表（admin 可管理；author 仅能管理被授权题库） */
  authorIds: string[];
  /** 授权出题人姓名列表（与 authorIds 对应） */
  authorNames: string[];
}

/** 题库复制结果（v1.8⑤ U5；含内容去重复用计数） */
export interface BankCloneResult {
  /** 新建的题库 */
  bank: QuestionBank;
  /** 实际新建的题目数 */
  copied: number;
  /** 因内容完全相同而被去重复用的题目数（未新建行） */
  reused: number;
}

/** 题库详情（含被引用统计） */
export interface BankDetail extends QuestionBank {
  /** 该题库的试题已被多少份不重复试卷引用 */
  referencedPaperCount: number;
  /**
   * 该题库中「被至少一份试卷引用」的试题数。
   * 说明：后端 `BankDetailDto` 当前仅返回 `referencedPaperCount`；此字段为前向兼容保留（可选），
   * 删除确认文案在有值时给出精确值，无值时退化为定性描述。
   */
  referencedQuestionCount?: number;
}

/** 简答题评分细则档位（v1.7③ S1；按分值降序） */
export interface RubricBand {
  /** 档位分值（0 ≤ score ≤ 题目分值） */
  score: number;
  /** 档位名称，如「完全正确」 */
  label: string;
  /** 档位说明（选填） */
  description: string;
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
  /** 操作后该题库的授权出题人姓名列表 */
  authorNames: string[];
}

/** 试题 */
export interface Question {
  id: string;
  /** 归属题库 id（1:N） */
  bankId: string;
  type: QuestionType;
  stem: string;
  /** 选项文本数组（判断题固定为 ['正确', '错误']；填空/简答为空数组） */
  options: string[];
  /**
   * 正确答案：
   * - 单选/多选/判断：选项索引数组（单选/判断恒长度 1；多选升序）
   * - 填空：逐空参考答案（文本数组，按空顺序）
   * - 简答：参考文本（长度 1 的文本数组）
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
  /** ISO 8601 */
  createdAt: string;
}

/** 试卷中的题目引用（题目内容 + 分值） */
export interface PaperQuestion {
  questionId: string;
  score: number;
}

/** 试卷（列表项，含来源题库） */
export interface Paper {
  id: string;
  name: string;
  description: string;
  questions: PaperQuestion[];
  totalScore: number;
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
  /** 来源题库 id 列表 */
  bankIds: string[];
  /** 来源题库名称列表（与 bankIds 对应） */
  bankNames: string[];
}

/** 试卷详情中的逐题项（含题目内容与来源题库） */
export interface PaperDetailQuestion {
  questionId: string;
  score: number;
  question: Question;
  /** 该题来源题库 id */
  bankId: string;
  /** 该题来源题库名称 */
  bankName: string;
}

/** 试卷详情 */
export interface PaperDetail extends Omit<Paper, 'questions'> {
  questions: PaperDetailQuestion[];
}

/** 考试 */
export interface Exam {
  id: string;
  name: string;
  paperId: string;
  /** 参与科室 id 列表（多选） */
  departmentIds: string[];
  /** 开始时间 ISO 8601 */
  startTime: string;
  /** 截止时间 ISO 8601 */
  endTime: string;
  /** 考试时长（分钟），从开考时刻起算 */
  durationMinutes: number;
  /** 及格分数线 */
  passScore: number;
  /** 允许每名考生最多作答次数（≥1，默认 1） */
  maxAttempts: number;
  /** 人手一卷开关；null=继承全局默认 */
  shuffleEnabled: boolean | null;
  /** 选项乱序开关；null=继承全局默认 */
  shuffleOptions: boolean | null;
  /** 补考申请开关；null=继承全局默认（仅 maxAttempts=1 时生效） */
  allowRetake: boolean | null;
  /** 成绩复核开关；null=继承全局默认 */
  allowAppeal: boolean | null;
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
}

/** 考生端考试（附带本人作答状态，无记录时为 null） */
export interface ExamMy extends Exam {
  /** 本人最近一条记录的状态（进行中优先于已交卷）；无记录时为 null */
  recordStatus: RecordStatus | null;
  /** 本人已交卷次数 */
  attemptsUsed: number;
  /** 本人补考申请状态；无申请时为 null */
  retakeStatus: RetakeStatus | null;
  /** 本人当前是否可发起补考申请 */
  canApplyRetake: boolean;
  /** 特殊安排：本人加时（分钟，0 = 无加时） */
  extraMinutes: number;
  /** 特殊安排：本人额外答题次数（0 = 无） */
  extraAttempts: number;
  /** 特殊安排：本人是否免考 */
  exempt: boolean;
}

/** 切屏（离开考试页面）事件，只增不改 */
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
  question: Question;
}

/** 试卷快照：开考时从试卷冻结的副本，后续试卷/题目修改不影响已开考的记录 */
export interface PaperSnapshot {
  paperId: string;
  paperName: string;
  totalScore: number;
  questions: PaperSnapshotQuestion[];
}

/** 考试记录 */
export interface ExamRecord {
  id: string;
  examId: string;
  userId: string;
  departmentId: string;
  /** 第几次作答（从 1 开始，同一考试同一考生递增） */
  attemptNo: number;
  paperSnapshot: PaperSnapshot;
  status: RecordStatus;
  /** 答案：Record<questionId, number[] | string[]>（客观题为选项索引，填空/简答为文本数组） */
  answers: Record<string, number[] | string[]>;
  /** 主观题阅卷得分：Record<questionId, number>（未阅卷为空对象） */
  subjectiveScores: Record<string, number>;
  /** 开考时刻 ISO 8601（倒计时基准，刷新不重置） */
  startedAt: string;
  /** 交卷时刻 ISO 8601，未交卷为 null */
  submittedAt: string | null;
  /** 是否到时自动交卷 */
  autoSubmitted: boolean;
  score: number;
  cheatEvents: CheatEvent[];
  /**
   * 以下展示字段**仅「记录详情」接口 `GET /records/:id` 返回**（后端 JOIN 得出），
   * 列表接口（我的成绩 / 某场考试记录）不返回，使用前必须做兜底处理。
   */
  examName?: string;
  passScore?: number;
  userName?: string;
  departmentName?: string;
  /** 特殊安排：本人加时分钟数（详情接口 / 开考接口返回） */
  extraMinutes?: number;
  /** 本人成绩复核申请状态（详情接口返回；无申请为 null） */
  appealStatus?: AppealStatus | null;
}

/** 导入 / 预览的逐行问题明细（错误或警告） */
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

/** 预览返回、可原样回传 commit 的合法行 */
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

/** Excel 导入提交结果 */
export interface CommitResult {
  batchId: string;
  successCount: number;
  failCount: number;
  totalRows: number;
  /** 因内容完全相同而跳过的题目数（v1.8⑤ U5；仅开启「跳过重复题目」时可能大于 0） */
  reused: number;
}

/** 导入批次（历史） */
export interface ImportBatch {
  id: string;
  bankId: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  operatorId: string;
  /** ISO 8601 */
  createdAt: string;
}

/** 抽题规则（单题型） */
export interface DrawRule {
  count: number;
  score: number;
}

/** 抽题规则集合 */
export interface DrawRules {
  single?: DrawRule;
  multiple?: DrawRule;
  judge?: DrawRule;
  fill?: DrawRule;
  short?: DrawRule;
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

/** 按知识点（标签）抽题规则（v1.7②） */
export interface DrawTagRule {
  tag: string;
  count: number;
  score: number;
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
  /** 按标签抽题的缺口（未配置 tagRules 时为空数组） */
  tagShortages: DrawTagShortage[];
}

/** 题库筛选条件 */
export interface QuestionFilter {
  /** '' 表示不限 */
  type: QuestionType | '';
  subject: string;
  /** 知识点标签（'' 表示不限，v1.7②） */
  tag: string;
  keyword: string;
}

/** 试题批量编辑输入（v1.7②；仅提交需要修改的字段） */
export interface QuestionBatchEditInput {
  ids: string[];
  subject?: string;
  tags?: string[];
  /** append（追加，默认）/ replace（覆盖） */
  tagsMode?: 'append' | 'replace';
  defaultScore?: number;
}

/** 用户保存输入（新建/编辑共用） */
export interface UserSaveInput {
  id?: string;
  username: string;
  name: string;
  role: Role;
  departmentId: string;
  email?: string;
  status?: UserStatus;
  /** 新建时未提供则使用默认密码；编辑时留空表示不修改密码 */
  password?: string;
}

/** 试题保存输入（新建/编辑共用） */
export interface QuestionSaveInput {
  id?: string;
  /** 归属题库 id（新建必填；编辑可改） */
  bankId: string;
  type: QuestionType;
  stem: string;
  options: string[];
  /** 客观题为选项索引数组；填空为逐空参考答案文本数组；简答为参考文本数组 */
  answer: number[] | string[];
  defaultScore: number;
  analysis?: string;
  subject?: string;
  /** 知识点标签（v1.7②；最多 10 个，单个 ≤32 字） */
  tags?: string[];
  /** 评分细则（v1.7③ S1；仅简答题生效，最多 10 档） */
  rubric?: RubricBand[];
}

/** 试卷保存输入（新建/编辑共用） */
export interface PaperSaveInput {
  id?: string;
  name: string;
  description?: string;
  /** 来源题库 id 列表 */
  bankIds: string[];
  questions: PaperQuestion[];
}

/** 考试保存输入（新建/编辑共用） */
export interface ExamSaveInput {
  id?: string;
  name: string;
  paperId: string;
  departmentIds: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  passScore: number;
  /** 允许每名考生最多作答次数 */
  maxAttempts: number;
  /** 人手一卷开关；null=继承全局默认 */
  shuffleEnabled?: boolean | null;
  /** 选项乱序开关；null=继承全局默认 */
  shuffleOptions?: boolean | null;
  /** 补考申请开关；null=继承全局默认 */
  allowRetake?: boolean | null;
  /** 成绩复核开关；null=继承全局默认 */
  allowAppeal?: boolean | null;
}

/** 单场考试统计摘要（passRate 为 0~1 小数） */
export interface ExamSummary {
  examId: string;
  /** 已交卷人数 */
  total: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  /** 及格率 0~1 */
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
  /** 及格率 0~1 */
  passRate: number;
}

/** 错题率排行项 */
export interface WrongItem {
  questionId: string;
  stem: string;
  wrongCount: number;
  totalAnswered: number;
  /** 错误率 0~1 */
  wrongRate: number;
}

/** 报表聚合结果（四段） */
export interface Report {
  summary: ExamSummary;
  bands: BandItem[];
  departments: DeptItem[];
  wrongRate: WrongItem[];
}

/** 审计动作（与后端 domain.ts AuditAction 一致） */
export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.reset_password'
  /** 修改本人密码（v1.7③） */
  | 'user.change_password'
  /** 开启两步验证（v1.7③） */
  | 'user.two_factor_enable'
  /** 关闭两步验证（v1.7③） */
  | 'user.two_factor_disable'
  /** 重置两步验证（管理员强制重置 / 本人重新生成恢复码，v1.8②） */
  | 'user.two_factor_reset'
  /** 强制下线设备（v1.7③） */
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
  /** 复制题库（v1.7④ S4） */
  | 'bank.clone'
  | 'bank.practice_flag'
  | 'permission.update'
  | 'appeal.approve'
  | 'appeal.reject'
  | 'exam.exception_update'
  /** 延长某考生作答时间（v1.7④ T3） */
  | 'exam.extend_time'
  /** 监考强制交卷（v1.7④ T3） */
  | 'record.force_submit'
  /** 历史成绩归档（v1.7④ T5） */
  | 'system.archive'
  /** 导出审计日志（v1.7②） */
  | 'audit.export'
  /** 清理过期审计日志（v1.7②） */
  | 'audit.cleanup'
  /** 新建内容（公告 / 轮播图，v1.9⑥） */
  | 'content.create'
  /** 编辑内容（公告 / 轮播图，v1.9⑥） */
  | 'content.update'
  /** 删除内容（公告 / 轮播图，v1.9⑥） */
  | 'content.delete';

/** 审计目标类型 */
export type AuditTargetType =
  | 'user'
  | 'exam'
  | 'bank'
  | 'permission'
  | 'appeal'
  | 'audit'
  /** 考试记录（监考强制交卷，v1.7④ T3） */
  | 'record'
  /** 系统维护（数据归档，v1.7④ T5） */
  | 'system'
  /** 公告（v1.9⑥） */
  | 'announcement'
  /** 轮播图（v1.9⑥） */
  | 'banner';

/** 操作审计日志 */
export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetName: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** 及格率时间趋势点 */
export interface ExamTrendPoint {
  examId: string;
  examName: string;
  startTime: string;
  total: number;
  avgScore: number;
  /** 及格率 0~1 */
  passRate: number;
}

/** 科目（知识点）错题归因项 */
export interface SubjectWrongItem {
  subject: string;
  wrongCount: number;
  totalAnswered: number;
  /** 错题率 0~1 */
  wrongRate: number;
}

/** 数据看板聚合 */
export interface DashboardReport {
  examTrend: ExamTrendPoint[];
  subjectWrong: SubjectWrongItem[];
  /** 按知识点（标签）归因（v1.7②；简答排除，未打标签的题目不计入） */
  tagWrong: SubjectWrongItem[];
}

/** 数据看板筛选条件（v1.7②：科室下钻 + 时间范围） */
export interface DashboardFilter {
  /** 按科室下钻（含子树） */
  departmentId?: string;
  /** 起始日期/时刻（按考试开始时间，含） */
  from?: string;
  /** 截止日期/时刻（含） */
  to?: string;
}

// ============================================================
// v1.7① 增量类型：成绩复核 / 特殊考试安排
// ============================================================

/** 成绩复核申请状态 */
export type AppealStatus = 'pending' | 'approved' | 'rejected';

/** 成绩复核申请 */
export interface ScoreAppeal {
  id: string;
  recordId: string;
  examId: string;
  examName: string;
  userId: string;
  userName: string;
  username: string;
  departmentName: string;
  status: AppealStatus;
  reason: string;
  originalScore: number;
  newScore: number | null;
  reviewComment: string;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/* ============================ v1.7④ T3：实时考试监控 ============================ */

/** 监考行状态（含「未开始」，用于花名册全员展示） */
export type MonitorStatus = 'not_started' | 'in_progress' | 'pending_review' | 'submitted';

/** 监考明细行（每人一行，取最新一次作答） */
export interface ExamMonitorRow {
  userId: string;
  username: string;
  userName: string;
  departmentName: string;
  status: MonitorStatus;
  attemptNo: number;
  startedAt: string;
  submittedAt: string;
  /** 剩余秒数（仅进行中有意义） */
  remainingSeconds: number;
  /** 该考生被授予的加时分钟数 */
  extraMinutes: number;
  cheatCount: number;
  cheatSeconds: number;
  score: number;
  autoSubmitted: boolean;
  /** 监控记录 id；未开始为空串 */
  recordId: string;
}

/** 监考汇总 */
export interface ExamMonitorSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  submitted: number;
  pendingReview: number;
  cheatWarned: number;
  averageScore: number;
}

/** 监考大屏数据 */
export interface ExamMonitor {
  exam: Exam;
  summary: ExamMonitorSummary;
  rows: ExamMonitorRow[];
  generatedAt: string;
}

/** 监考 SSE 连接建立信息（v1.8① U1；连接成功后的首个 `ready` 事件载荷） */
export interface MonitorStreamInfo {
  examId: string;
  /** 服务端推送间隔（秒） */
  intervalSeconds: number;
  /** 该考试当前订阅数（含本连接） */
  examClients: number;
  /** 全局订阅数 */
  totalClients: number;
  at: string;
}

/** 富文本附件（v1.8④ U4；图片作答对象存储） */
export interface Attachment {
  id: string;
  /** 访问地址（含签名，可直接用于 `<img src>`） */
  url: string;
  kind: string;
  mime: string;
  /** 字节数 */
  size: number;
  createdAt: string;
}

/* ============================ v1.7④ T5：归档与维护 ============================ */

/** 归档结果 */
export interface ArchiveResult {
  archived: number;
  skipped: number;
  cutoff: string;
  archiveTotal: number;
}

/** 自动归档运行结果（v1.8③ U3；仅保留服务端进程内最近一次） */
export interface ArchiveAutoRun {
  at: string;
  triggered: boolean;
  reason: 'scheduled' | 'manual' | 'disabled' | 'retention-disabled' | 'error';
  days: number;
  archived: number;
  skipped: number;
  archiveTotal: number;
  ok: boolean;
  error?: string;
}

/** 维护统计 */
export interface MaintenanceStats {
  tables: Array<{ name: string; label: string; rows: number }>;
  archiveTotal: number;
  retentionDays: number;
  /** 自动归档开关（v1.8③） */
  autoEnabled: boolean;
  /** 自动归档执行时点（0~23 时，v1.8③） */
  autoHour: number;
  /** 服务端进程内最近一次自动归档结果（重启后为 null，v1.8③） */
  lastAutoArchive: ArchiveAutoRun | null;
  generatedAt: string;
}

/* ============================ v1.7④ S3：通知模板 ============================ */

/** 通知事件 key（可配置模板的事件） */
export type NotifyTemplateKey =
  | 'examPublish'
  | 'resultPending'
  | 'resultPublished'
  | 'reviewDone'
  | 'retakeApproved'
  | 'retakeRejected'
  | 'appealApproved'
  | 'appealRejected'
  /** 管理员重置两步验证（v1.8② U2） */
  | 'twoFactorReset';

/** 单个通知模板（正文支持 `{变量}` 占位） */
export interface NotifyTemplate {
  title: string;
  content: string;
}

/** 全部通知模板 */
export type NotifyTemplates = Record<NotifyTemplateKey, NotifyTemplate>;

/** 特殊考试安排（考试 × 考生） */
export interface ExamException {
  id: string;
  examId: string;
  userId: string;
  userName: string;
  username: string;
  departmentName: string;
  /** 加时（分钟） */
  extraMinutes: number;
  /** 额外答题次数 */
  extraAttempts: number;
  /** 是否免考 */
  exempt: boolean;
  note: string;
  createdAt: string;
}

/**
 * 系统设置（全局单例，仅 admin 可改，所有角色可读）。
 * 后端缺失字段时一律回退到 `src/constants/settings.ts` 的 SETTINGS_DEFAULTS，
 * 因此新增字段不会导致旧数据不可用。
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
  /** 同一账号连续登录失败达到该次数后，登录需填写图形验证码（v1.7③） */
  loginCaptchaAfterFails: number;
  /** 倒计时剩余不足该分钟数时进入提醒态 */
  countdownWarningMinutes: number;
  /** 新建账号/重置密码使用的默认密码 */
  defaultPassword: string;
  /** 密码最小长度 */
  minPasswordLength: number;
  /** 密码策略：要求包含大写字母（v1.7③） */
  passwordRequireUpper: boolean;
  /** 密码策略：要求包含小写字母 */
  passwordRequireLower: boolean;
  /** 密码策略：要求包含数字 */
  passwordRequireDigit: boolean;
  /** 密码策略：要求包含符号 */
  passwordRequireSymbol: boolean;
  /** 密码有效期（天，0 = 不启用） */
  passwordExpireDays: number;
  /** 是否允许用户自助开启两步验证（TOTP，v1.7③） */
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
  /** 补考申请全局默认开关（单场可覆盖；仅 maxAttempts=1 可补考） */
  retakeDefaultEnabled: boolean;
  /** 成绩复核全局默认开关（单场可覆盖） */
  appealEnabled: boolean;
  /** 成绩复核申请时限（天；自交卷起算，0 = 不限） */
  appealWindowDays: number;
  /** 审计日志保留天数（0 = 永久保留；v1.7② ） */
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
  /** 历史成绩归档保留天数（0 = 未启用自动归档，v1.7④ T5） */
  archiveRetentionDays: number;
  /** 自动归档总开关（默认关闭 = 安全默认，v1.8③ U3） */
  archiveAutoEnabled: boolean;
  /** 自动归档执行时点（0~23 时，v1.8③ U3） */
  archiveAutoHour: number;
  /** 监考大屏实时推送（SSE）总开关（关闭后前端自动回退 15s 轮询，v1.8① U1） */
  monitorPushEnabled: boolean;
  /** 监考推送间隔（秒，3~60；默认 5，v1.8① U1） */
  monitorPushIntervalSeconds: number;
  /** 简答题作图片单张体积上限（MB，默认 2，v1.8④ U4） */
  richTextImageMaxMb: number;
  /** 简答题作图片数量上限（默认 3，v1.8④ U4） */
  richTextImageMaxCount: number;
  /** SMTP 服务器地址（空 = 未配置） */
  smtpHost: string;
  /** SMTP 端口 */
  smtpPort: number;
  /** SMTP 是否使用 SSL */
  smtpSecure: boolean;
  /** SMTP 账号 */
  smtpUser: string;
  /** SMTP 密码/授权码（敏感） */
  smtpPass: string;
  /** 发件人地址 */
  smtpFrom: string;
  /** 可配置通知模板（站内信/邮件文案，v1.7④ S3） */
  notifyTemplates: NotifyTemplates;
}

/** 公开设置：无需登录即可读取，仅含登录页品牌展示所需字段 */
export type PublicSettings = Pick<SystemSettings, 'systemName' | 'systemShortName' | 'loginSlogan' | 'copyright'>;

// ============================================================
// 练题配置类型（公网练题；字段以后端 `server/src/types/domain.ts` 为准）
// 仅保留内网管理端「系统设置 → 公网练题」配置所需类型；
// 练题端业务类型已随前端迁至独立工程 practice-web。
// ============================================================

/** 每日一练抽题范围 */
export type PracticeDailyBankScope = 'practiced' | 'all';

/**
 * 练题配置（公网练题；内网管理端「系统设置 → 公网练题」可改）。
 * 字段与后端 `server/src/types/domain.ts` 的 `PracticeSettings` 完全一致。
 */
export interface PracticeSettings {
  /** 每日一练总开关 */
  dailyEnabled: boolean;
  /** 每日一练题量（1~50） */
  dailyQuestionCount: number;
  /** 每日一练题型范围；空数组 = 全部题型 */
  dailyTypes: QuestionType[];
  /** 抽题范围：practiced = 优先已练题库；all = 全部开放题库 */
  dailyBankScope: PracticeDailyBankScope;
  /** 收藏夹上限（1~2000） */
  favoriteLimit: number;

  /* ------------------------- v1.9⑤ 新增 ------------------------- */
  /** 默认练题方式：sequence = 顺序；random = 随机 */
  defaultPracticeMode: 'sequence' | 'random';
  /** 单次练习题量下限（1~100） */
  sessionMinCount: number;
  /** 单次练习题量上限（1~100，且 >= 下限） */
  sessionMaxCount: number;
  /** 判分后是否展示正确答案 */
  showAnswer: boolean;
  /** 判分后是否展示解析 */
  showAnalysis: boolean;
  /** 每日一练重置时点（0~23 时；0 = 自然日） */
  dailyResetHour: number;
  /** 每日一练最少抽题数（1~50） */
  dailyMinQuestionCount: number;
  /** 错题本自动移除阈值：连续答对 N 次自动移出；0 = 不自动移除 */
  wrongAutoRemoveStreak: number;
  /** 学习报告页开关 */
  reportEnabled: boolean;
  /** 错题本页开关 */
  wrongBookEnabled: boolean;
  /** 收藏夹功能开关 */
  favoriteEnabled: boolean;
}

// ============================================================
// v1.5 增量类型：补考 / 消息通知 / 菜单权限 / 用户导入
// ============================================================

/** 站内信 */
export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  /** ISO 8601 */
  createdAt: string;
}

/** 站内信未读数 */
export interface NotificationUnread {
  unreadCount: number;
}

/** 补考申请 */
export interface Retake {
  id: string;
  examId: string;
  examName: string;
  userId: string;
  userName: string;
  username: string;
  departmentName: string;
  status: RetakeStatus;
  reason: string;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** 菜单目录项 */
export interface MenuCatalogItem {
  key: string;
  name: string;
  defaultRoles: Role[];
  /** 是否管理员不可关闭（防自锁） */
  adminRequired: boolean;
}

/** 菜单权限：角色 → 可见菜单 key 列表 */
export type MenuGrants = Record<Role, string[]>;

/** 菜单权限完整视图（管理端用） */
export interface MenuPermission {
  catalog: MenuCatalogItem[];
  grants: MenuGrants;
}

/** 当前用户可见菜单 key 列表 */
export interface MyMenus {
  menus: string[];
}

/** 用户导入的合法行 */
export interface UserValidRow {
  row: number;
  username: string;
  name: string;
  role: Role;
  departmentName: string;
  departmentId: string;
  email: string;
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

/** 用户导入批次 */
export interface UserImportBatch {
  id: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failCount: number;
  errors: RowIssue[];
  operatorId: string;
  createdAt: string;
}

/* ============================================================
 * 内容运营（v1.9⑥ · 公告 + 轮播图）
 * 字段以后端 server/src/types/domain.ts 的 DTO 为准。
 * ============================================================ */

/** 内容发布范围：exam=仅考试端 / practice=仅练题端 / both=两端 */
export type ContentTarget = 'exam' | 'practice' | 'both';

/** 公告级别（important 在两端以醒目样式呈现） */
export type AnnouncementLevel = 'normal' | 'important';

/** 公告 */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: ContentTarget;
  level: AnnouncementLevel;
  /** 置顶（列表优先展示） */
  pinned: boolean;
  /** 启停开关（关闭后两端均不可见） */
  enabled: boolean;
  /** 生效开始（ISO 8601 UTC；null = 不限制） */
  startAt: string | null;
  /** 生效结束（ISO 8601 UTC；null = 不限制） */
  endAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** 服务端判定的「正在生效」（enabled 且在时间窗内） */
  active: boolean;
  /** 已读人数（仅管理端列表返回，v2.0③） */
  readCount?: number;
}

/** 轮播图 */
export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  target: ContentTarget;
  sortOrder: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  /** 点击人数（仅管理端列表返回，v2.0③） */
  clickCount?: number;
}

/** 考生侧内容聚合（考试端与练题端共用结构） */
export interface ContentFeed {
  announcements: Announcement[];
  banners: Banner[];
}

/* ============================================================
 * v2.0③ 内容触达看板（GET /api/content/stats）
 * ============================================================ */

/** 公告触达条目 */
export interface AnnouncementTouch {
  id: string;
  title: string;
  target: ContentTarget;
  readCount: number;
  readRate: number;
}

/** 轮播触达条目 */
export interface BannerTouch {
  id: string;
  title: string;
  target: ContentTarget;
  clickCount: number;
  clickRate: number;
}

/** 内容触达看板 */
export interface ContentTouchStats {
  audience: { exam: number; practice: number };
  announcements: AnnouncementTouch[];
  banners: BannerTouch[];
  generatedAt: string;
}

/** 公告新建 / 编辑入参 */
export interface AnnouncementInput {
  title: string;
  content: string;
  target: ContentTarget;
  level: AnnouncementLevel;
  pinned: boolean;
  enabled: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

/** 轮播图新建 / 编辑入参 */
export interface BannerInput {
  title: string;
  imageUrl: string;
  linkUrl: string;
  target: ContentTarget;
  sortOrder: number;
  enabled: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

/* ============================================================
 * v2.0② 考试端首页聚合（GET /api/home/summary）
 * ============================================================ */

/** 首页统计四项 + 及格率 / 及格线 */
export interface HomeStatBundle {
  pending: number;
  ongoing: number;
  submitted: number;
  avgScore: number;
  passRate: number;
  passLine: number;
}

/** 最近成绩趋势点 */
export interface HomeTrendPoint {
  recordId: string;
  examId: string;
  examName: string;
  score: number;
  passScore: number;
  passed: boolean;
  submittedAt: string | null;
}

/** 首页待办提醒 */
export interface HomeTodo {
  key: string;
  text: string;
  count: number;
  path: string;
}

/** 首页个性化快捷入口（v2.0⑥ 起按科室可配置） */
export interface HomeShortcut {
  key: string;
  text: string;
  desc: string;
  path: string;
  icon: string;
  enabled: boolean;
}

/** 首页推荐练题题库 */
export interface HomeRecommendedBank {
  bankId: string;
  bankName: string;
  questionCount: number;
  reason: string;
}

/** 考试端首页聚合数据 */
export interface HomeSummary {
  stats: HomeStatBundle;
  trend: HomeTrendPoint[];
  todos: HomeTodo[];
  unreadCount: number;
  shortcuts: HomeShortcut[];
  recommendedBanks: HomeRecommendedBank[];
  generatedAt: string;
}
