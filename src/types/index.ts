/**
 * 系统全部实体类型与枚举（单一类型源）。
 * 所有页面与服务的类型只能从此文件导入，禁止在页面内重复定义。
 * 字段以后端 `server/src/types/domain.ts` 的 DTO 为准（保证前后端一致）。
 */

/** 用户角色 */
export type Role = 'admin' | 'author' | 'examinee';

/** 题型：单选 / 多选 / 判断 */
export type QuestionType = 'single' | 'multiple' | 'judge';

/** 考试状态（由时间窗实时推导，不落库） */
export type ExamStatus = 'not_started' | 'ongoing' | 'ended';

/** 考试记录状态 */
export type RecordStatus = 'in_progress' | 'submitted';

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
  status: UserStatus;
  /** ISO 8601 */
  createdAt: string;
}

/** 登录结果 */
export interface LoginResult {
  token: string;
  user: User;
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

/** 试题 */
export interface Question {
  id: string;
  /** 归属题库 id（1:N） */
  bankId: string;
  type: QuestionType;
  stem: string;
  /** 选项文本数组（判断题固定为 ['正确', '错误']） */
  options: string[];
  /** 正确答案：选项索引数组；单选/判断恒为长度 1；多选升序 */
  answer: number[];
  defaultScore: number;
  analysis: string;
  subject: string;
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
  /** 答案：Record<questionId, number[]>（多选升序） */
  answers: Record<string, number[]>;
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

/** 题库筛选条件 */
export interface QuestionFilter {
  /** '' 表示不限 */
  type: QuestionType | '';
  subject: string;
  keyword: string;
}

/** 用户保存输入（新建/编辑共用） */
export interface UserSaveInput {
  id?: string;
  username: string;
  name: string;
  role: Role;
  departmentId: string;
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
  answer: number[];
  defaultScore: number;
  analysis?: string;
  subject?: string;
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
}
