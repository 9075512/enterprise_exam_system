/**
 * 后端领域类型（DTO）：字段名与前端 `src/types/index.ts` 完全一致，
 * 保证 Wave 2 前端零改动接入。
 */

/** 用户角色 */
export type Role = 'admin' | 'author' | 'examinee';

/** 题型：单选 / 多选 / 判断 */
export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';

/** 题目难度（v3.2；低/中/高，null = 未标注） */
export type QuestionDifficulty = 'low' | 'medium' | 'high';

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
  positionId: string;
  positionName: string;
  groupIds: string[];
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

/** 账号安全策略（个人安全页展示；v1.7③ + v1.8②） */
export interface AccountSecurityPolicyDto {
  /** 密码复杂度要求的中文描述 */
  text: string;
  /** 密码有效期（天；0 = 不过期） */
  expireDays: number;
  /** 本人的两步验证是否已开启 */
  twoFactorEnabled: boolean;
  /** 剩余可用的恢复码数量（未开启 2FA 时为 0） */
  recoveryCodesRemaining: number;
}

/** 启用 / 重新生成恢复码的返回（明文**仅此一次**下发，v1.8② U2） */
export interface RecoveryCodesDto {
  /** 新生成的恢复码明文（使用一次即作废） */
  recoveryCodes: string[];
}

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
  /** 是否对外开放练题（默认 false）；仅 true 的题库可在公网练题中被访问 */
  allowPractice: boolean;
  parentId: string | null;
  sortOrder: number;
  status: 'active' | 'disabled';
  isLeaf: boolean;
  effectiveStatus: 'active' | 'disabled';
  canView: boolean;
  canEdit: boolean;
  createdBy: string;
  createdAt: string;
  /** 派生统计：题库存题数（不落列） */
  questionCount: number;
  /** 授权出题人 id 列表（admin 可见/管理；author 仅能管理被授权题库） */
  authorIds: string[];
  /** 授权出题人姓名列表（与 authorIds 对应） */
  authorNames: string[];
}

/** 题库树节点；children 仅在树接口返回。 */
export interface BankTreeNode extends BankDto {
  children: BankTreeNode[];
}

/** 节点自身权限配置及当前生效配置。 */
export interface BankAccessConfig {
  bankId: string;
  permissionMode: 'inherit' | 'override';
  viewAll: boolean;
  includeChildDepartments: boolean;
  departmentIds: string[];
  userIds: string[];
  editorIds: string[];
  effectiveFromBankId: string | null;
  effectiveViewAll: boolean;
  effectiveIncludeChildDepartments: boolean;
  effectiveDepartmentIds: string[];
  effectiveUserIds: string[];
  effectiveEditorIds: string[];
}

/** 题库详情 DTO（含被引用统计） */
export interface BankDetailDto extends BankDto {
  /** 该题库中「被至少一份试卷引用」的试题数 */
  referencedQuestionCount: number;
  /** 该题库的试题已被多少份不重复试卷引用 */
  referencedPaperCount: number;
}

/** 题库复制结果（v1.8⑤ U5；含内容去重复用计数） */
export interface BankCloneResultDto {
  /** 新建的题库 */
  bank: BankDto;
  /** 实际新建的题目数 */
  copied: number;
  /** 因「题型+题干+选项+答案」完全相同而被去重复用的题目数（未新建行） */
  reused: number;
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
  subjectId: string | null;
  status: 'active' | 'disabled';
  /** 题目难度（v3.2；null = 未标注） */
  difficulty: QuestionDifficulty | null;
  /** 知识点标签（多标签，v1.7②；空数组 = 未打标签） */
  tags: string[];
  /** 评分细则（分档 rubric，v1.7③ S1；仅简答题可用，空数组 = 未设置） */
  rubric: RubricBand[];
  createdBy: string;
  createdAt: string;
  /**
   * 作答正确率百分比（0-100，保留 1 位小数，v3.3）——由 `practice_answers` 按题聚合。
   * `null` = 从未被练题作答（数据缺口如实表达，不造数）。
   */
  correctRate: number | null;
}

/**
 * 题库题目健康度统计（v3.3，题库详情页顶部统计卡数据源）。
 * 全部由题表 + 练题作答明细实时聚合，无缓存列。
 */
export interface BankQuestionStatsDto {
  /** 题库存题总数 */
  total: number;
  /** 按题型分布计数（五种题型恒有键，缺省 0） */
  byType: Record<QuestionType, number>;
  /** 有练题作答记录的题数 */
  answeredCount: number;
  /** 全库加权平均正确率百分比（0-100，保留 1 位小数）；无任何作答 → null */
  avgCorrectRate: number | null;
  /** 「待完善」题数 = 缺解析 或 未设置知识点（并集，去重） */
  incompleteCount: number;
  /** 缺解析题数（口径拆分） */
  missingAnalysisCount: number;
  /** 未设置知识点题数（口径拆分） */
  missingTagsCount: number;
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
  /** 因内容完全相同而跳过的题目数（v1.8⑤ U5；仅 `dedupe=true` 时可能大于 0） */
  reused: number;
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
  /** 题目难度（v3.2；null = 未标注） */
  difficulty: QuestionDifficulty | null;
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
  /** 人员范围：显式加入的用户。 */
  includeUserIds: string[];
  /** 人员范围：显式排除的用户（优先级最高）。 */
  excludeUserIds: string[];
  /** 应用的抽考模板；名单冻结后模板变化不反向影响考试。 */
  audienceTemplateId: string | null;
  /** dynamic 仅用于兼容旧考试；新建/重新保存后均为 frozen。 */
  audienceMode: 'dynamic' | 'frozen';
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
  /** 考试形式：开卷 / 闭卷（展示用） */
  examMode: 'open' | 'closed';
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

/**
 * 阅卷逐题备注（v3.3）：评语 / 评语是否对考生可见 / 是否标记存疑。
 * 仅人工阅卷的主观题会产生；未填写的字段省略（不写空串）。
 */
export interface ReviewNote {
  /** 给考生的评语（可选） */
  comment?: string;
  /** 评语是否同步展示给考生（未勾选则不展示） */
  commentVisible?: boolean;
  /** 标记存疑（阅卷内部标记，不对考生展示） */
  doubtful?: boolean;
}

/** 阅卷逐题备注集合：Record<questionId, ReviewNote>（未阅卷为空对象） */
export type ReviewNotes = Record<string, ReviewNote>;

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
  /** 阅卷逐题备注（评语 / 存疑）：Record<questionId, ReviewNote>（未阅卷为空对象） */
  reviewNotes: ReviewNotes;
  /** 开考时刻 ISO 8601 */
  startedAt: string;
  /** 交卷时刻 ISO 8601，未交卷为 null */
  submittedAt: string | null;
  /** 是否到时自动交卷 */
  autoSubmitted: boolean;
  score: number;
  /** 交卷/阅卷时按当时等级规则冻结。 */
  gradeLabel: string;
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

// ============================================================
// v1.7④ 域类型：通知模板（S3）/ 实时监控（T3）/ 归档与维护（T5）
// ============================================================

/** 通知事件 key（可配置模板的 8 个事件，v1.7④ S3） */
export type NotifyTemplateKey =
  | 'examPublish'
  | 'resultPending'
  | 'resultPublished'
  | 'reviewDone'
  | 'retakeApproved'
  | 'retakeRejected'
  | 'appealApproved'
  | 'appealRejected'
  /** 管理员重置某账号两步验证（v1.8② U2） */
  | 'twoFactorReset';

/** 单个通知模板（标题 + 正文，正文支持 `{变量}` 占位） */
export interface NotifyTemplate {
  title: string;
  content: string;
}

/** 全部通知模板（按事件 key 索引） */
export type NotifyTemplates = Record<NotifyTemplateKey, NotifyTemplate>;

/** 监考行状态（含「未开始」，用于花名册全员展示） */
export type MonitorStatus = 'not_started' | 'in_progress' | 'pending_review' | 'submitted';

/** 监考明细行（v1.7④ T3；每个应考考生一行，取最新一次作答） */
export interface ExamMonitorRowDto {
  userId: string;
  username: string;
  userName: string;
  departmentName: string;
  status: MonitorStatus;
  /** 已作答次数（未开始为 0） */
  attemptNo: number;
  /** ISO 8601；未开始为空串 */
  startedAt: string;
  /** ISO 8601；未交卷为空串 */
  submittedAt: string;
  /** 剩余秒数（仅 in_progress 有意义；未开始/已交卷为 0） */
  remainingSeconds: number;
  /** 该考生被授予的加时分钟数（v1.7① 特殊安排） */
  extraMinutes: number;
  cheatCount: number;
  cheatSeconds: number;
  score: number;
  autoSubmitted: boolean;
  /** 监控记录 id；未开始为空串 */
  recordId: string;
  /** 管理员恢复模式下，是否已放行下一次进入。 */
  resumeAllowed: boolean;
}

/** 监考汇总（v1.7④ T3） */
export interface ExamMonitorSummaryDto {
  /** 应考人数（花名册） */
  total: number;
  notStarted: number;
  inProgress: number;
  submitted: number;
  pendingReview: number;
  /** 切屏异常人数（次数或累计秒数达阈值） */
  cheatWarned: number;
  /** 已出成绩考生的平均分（无成绩为 0） */
  averageScore: number;
}

/** 监考大屏数据（v1.7④ T3） */
export interface ExamMonitorDto {
  exam: ExamDto;
  summary: ExamMonitorSummaryDto;
  rows: ExamMonitorRowDto[];
  /** 服务端生成时间（ISO 8601），供前端判断数据新鲜度 */
  generatedAt: string;
}

/** 监考 SSE 连接建立信息（v1.8① U1；连接建立后首帧 `ready` 事件） */
export interface MonitorStreamInfoDto {
  examId: string;
  /** 本次推送间隔（秒） */
  intervalSeconds: number;
  /** 该考试当前订阅数（含本连接） */
  examClients: number;
  /** 全局订阅数 */
  totalClients: number;
  /** 服务端时间（ISO 8601） */
  at: string;
}

/** 富文本附件（v1.8④ U4；图片作答对象存储元数据） */
export interface AttachmentDto {
  id: string;
  /** 访问地址（含签名，可直接用于 `<img src>`） */
  url: string;
  /** 附件类型，本期恒为 `image` */
  kind: string;
  mime: string;
  /** 字节数 */
  size: number;
  createdAt: string;
}

/** 归档结果（v1.7④ T5） */export interface ArchiveResultDto {
  /** 本次归档（搬入归档表并自业务表移除）的记录数 */
  archived: number;
  /** 因存在成绩复核申请而跳过的记录数 */
  skipped: number;
  /** 归档截止时间（该时间之前结束的考试才参与归档） */
  cutoff: string;
  /** 归档表当前总记录数 */
  archiveTotal: number;
}

/** 自动归档运行结果（v1.8③ U3；仅保留本进程内最近一次，持久记录见审计日志） */
export interface ArchiveAutoRunDto {
  /** 本次判定/执行时刻（ISO 8601） */
  at: string;
  /** 是否真正执行了归档 */
  triggered: boolean;
  /** 触发原因：scheduled 定时 / manual 立即执行 / disabled 开关关闭 / retention-disabled 保留天数为 0 / error 失败 */
  reason: 'scheduled' | 'manual' | 'disabled' | 'retention-disabled' | 'error';
  /** 本次使用的保留天数 */
  days: number;
  archived: number;
  skipped: number;
  archiveTotal: number;
  ok: boolean;
  error?: string;
}

/** 维护统计（v1.7④ T5 + v1.8③ U3） */
export interface MaintenanceStatsDto {
  tables: Array<{ name: string; label: string; rows: number }>;
  archiveTotal: number;
  /** 归档保留天数设置（0 = 未启用自动归档） */
  retentionDays: number;
  /** 自动归档开关 */
  autoEnabled: boolean;
  /** 自动归档执行时点（0~23 时） */
  autoHour: number;
  /** 本进程内最近一次自动归档结果（重启后为 null） */
  lastAutoArchive: ArchiveAutoRunDto | null;
  generatedAt: string;
}

/**
 * 系统设置（全局单例，仅 admin 可改，所有角色可读）。
 * 字段名与前端 `src/types/index.ts` 的 `SystemSettings` 完全一致。
 * 读库时若旧数据缺字段，统一回退到 `modules/settings/settings.defaults.ts`。
 */
export interface SystemSettings {
  /** 按百分比降序匹配的成绩等级；不替代考试及格线。 */
  gradeBands: Array<{ name: string; minPercent: number }>;
  reviewAnonymous: boolean;
  scoreDetailVisible: boolean;
  retakeScorePolicy: 'latest' | 'highest';
  abnormalExitResumePolicy: 'auto' | 'admin_required';
  /** 题库分类候选项，由管理员维护。 */
  bankCategories: string[];
  /** 新建考试默认时长（分钟） */
  examDefaultDuration: number;
  /** 新建考试默认及格线 */
  examDefaultPassScore: number;
  /** 新建考试默认答题次数上限（每人） */
  examDefaultMaxAttempts: number;
  /** 组卷页难度系数目标值（P 值，0~1，越高越易） */
  paperTargetDifficulty: number;
  /** 组织架构树根节点名称（默认「全公司」，科室管理页展示与编辑） */
  companyName: string;
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
  /** 历史成绩归档保留天数（0 = 未启用自动归档；手动归档可覆盖，v1.7④ T5） */
  archiveRetentionDays: number;
  /** 自动归档总开关（默认关闭 = 安全默认，v1.8③ U3） */
  archiveAutoEnabled: boolean;
  /** 自动归档执行时点（0~23 时；默认 3 = 凌晨 3 点，v1.8③ U3） */
  archiveAutoHour: number;
  /**
   * 监考大屏实时推送（SSE）总开关（v1.8① U1）。
   *
   * 默认 **开启**：推送为监考大屏的默认刷新路径（关闭后前端自动回退 15s 轮询，
   * 故开启推送不存在可用性风险）；本开关是给「反向代理不支持长连接」等环境的降级开关。
   */
  monitorPushEnabled: boolean;
  /** 监考推送间隔（秒，3~60；默认 5，v1.8① U1） */
  monitorPushIntervalSeconds: number;
  /** 简答题作图片：单张体积上限（MB，1~10；默认 2，v1.8④ U4） */
  richTextImageMaxMb: number;
  /** 简答题作图片：最多图片数（1~10；默认 3，v1.8④ U4） */
  richTextImageMaxCount: number;
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
  /** 可配置通知模板（站内信/邮件文案；正文支持 `{变量}` 占位，v1.7④ S3） */
  notifyTemplates: NotifyTemplates;
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
  description: string;
  /** 题库内题数 */
  questionCount: number;
}

/** 练题端可见科目树；目录节点仅用于导航。 */
export interface PracticeBankTreeNodeDto {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isLeaf: boolean;
  questionCount: number;
  description: string;
  children: PracticeBankTreeNodeDto[];
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
  id: string;
  sessionToken: string;
  questionIds: string[];
  total: number;
}

/** 单题判分结果（`POST /api/practice/check` 返回） */
export interface PracticeCheckResult {
  /** 是否正确（判分口径与考试完全一致，复用 utils/grading.isAnswerCorrect） */
  correct: boolean;
  /**
   * 正确答案：选项索引数组（单选/判断恒长度 1；多选升序）。
   * 当管理员关闭「展示正确答案」时恒为 `[]`，前端应据 `answerVisible` 判定而非空数组。
   */
  correctAnswer: number[];
  /** 解析（可能为 ''）。当管理员关闭「展示解析」时恒为 ''，前端应据 `analysisVisible` 判定。 */
  analysis: string;
  /** 题型 */
  type: QuestionType;
  /** 本次判分是否下发了正确答案（false = 管理员在练题端设置中关闭） */
  answerVisible: boolean;
  /** 本次判分是否下发了题目解析（false = 管理员在练题端设置中关闭） */
  analysisVisible: boolean;
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

  /* ------------------------- v1.9⑤ 新增（练题端设置扩展） ------------------------- */

  /** 默认练题方式：sequence = 顺序；random = 随机（练题端发起练习未显式指定时兜底） */
  defaultPracticeMode: 'sequence' | 'random';
  /** 单次练习题量下限（1~100；练题端步进器最小值 + 后端校验） */
  sessionMinCount: number;
  /** 单次练习题量上限（1~100；须 >= sessionMinCount） */
  sessionMaxCount: number;
  /** 判分后是否下发正确答案（false = 练题端作答后不显示答案） */
  showAnswer: boolean;
  /** 判分后是否下发题目解析（false = 练题端作答后不显示解析） */
  showAnalysis: boolean;
  /** 每日一练重置时点（0~23 时；0 = 按自然日 00:00 切分，与历史行为一致） */
  dailyResetHour: number;
  /** 每日一练最少抽题数（1~50；实际抽到题量低于该值时视为「今日无题可练」） */
  dailyMinQuestionCount: number;
  /** 错题本自动移除阈值：连续答对 N 次后自动移出错题本；0 = 不自动移除 */
  wrongAutoRemoveStreak: number;
  /** 学习报告页开关（false = 练题端隐藏报告入口，接口一并拒绝） */
  reportEnabled: boolean;
  /** 错题本页开关（false = 练题端隐藏错题本入口，接口一并拒绝） */
  wrongBookEnabled: boolean;
  /** 收藏夹功能开关（false = 练题端隐藏收藏入口 / 按钮，接口一并拒绝） */
  favoriteEnabled: boolean;

  /* ------------------------- v2.0⑤ 新增（打卡与激励） ------------------------- */

  /** 打卡与成就模块开关（false = 练题端隐藏打卡 / 徽章，接口返回 1017） */
  achievementEnabled: boolean;
}

/**
 * 练题端公开配置（`GET /api/practice/config` 返回）。
 *
 * 只暴露练题端 UI 需要的字段（不含 favoriteLimit / wrongAutoRemoveStreak 等管理侧口径），
 * 由 `PracticeSettings` 投影而来；练题端按此渲染默认模式、题量范围、答案可见性与页面入口。
 */
export interface PracticeConfigDto {
  /** 默认练题方式 */
  defaultPracticeMode: 'sequence' | 'random';
  /** 单次练习题量可选范围 */
  sessionMinCount: number;
  sessionMaxCount: number;
  /** 判分后是否展示正确答案 / 解析 */
  showAnswer: boolean;
  showAnalysis: boolean;
  /** 页面入口开关 */
  reportEnabled: boolean;
  wrongBookEnabled: boolean;
  favoriteEnabled: boolean;
  /** 每日一练是否开启（练题端首页入口判定） */
  dailyEnabled: boolean;
  /** 打卡与成就模块是否开启（v2.0⑤） */
  achievementEnabled: boolean;
}

/* ============================================================
 * v2.0⑤ 练题端打卡与激励
 * ============================================================ */

/** 成就徽章 */
export interface PracticeBadgeDto {
  key: string;
  name: string;
  /** 达成条件描述 */
  desc: string;
  /** 目标值 */
  target: number;
  /** 当前进度值 */
  current: number;
  /** 是否已解锁 */
  unlocked: boolean;
}

/** 打卡与成就总览（GET /api/practice/achievements） */
export interface PracticeAchievementsDto {
  enabled: boolean;
  /** 当前连续打卡天数（今日未练则从昨日回溯） */
  streakDays: number;
  /** 历史最长连续打卡天数 */
  bestStreak: number;
  /** 累计作答题数 / 正确题数 */
  answeredTotal: number;
  correctTotal: number;
  /** 累计正确率（0~100 整数） */
  accuracy: number;
  /** 错题本题数 / 收藏题数 */
  wrongTotal: number;
  favoriteTotal: number;
  /** 已完成的每日一练次数 */
  dailyCompleted: number;
  badges: PracticeBadgeDto[];
  /** 已解锁徽章数 */
  unlockedCount: number;
  generatedAt: string;
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
  /** 管理员重置某账号的两步验证（v1.8② U2） */
  | 'user.two_factor_reset'
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
  | 'record.resume_allow'
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
  | 'content.delete'
  | 'practice.settings_update'
  | 'question-feedback.update';

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
  | 'banner'
  | 'question_feedback';

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

/* ============================================================
 * 内容运营域（v1.9⑥ · 公告 + 轮播图）
 * ============================================================ */

/** 内容发布范围：exam=仅考试端 / practice=仅练题端 / both=两端同时发布 */
export type ContentTarget = 'exam' | 'practice' | 'both';

/** 公告级别（important 在两端以醒目样式呈现） */
export type AnnouncementLevel = 'normal' | 'important';

/** 公告 DTO */
export interface AnnouncementDto {
  id: string;
  title: string;
  content: string;
  target: ContentTarget;
  level: AnnouncementLevel;
  /** 置顶（列表优先展示） */
  pinned: boolean;
  /** 启停开关（关闭后两端均不可见，即使仍在时间窗内） */
  enabled: boolean;
  /** 生效开始时刻（ISO 8601 UTC；null = 不限制） */
  startAt: string | null;
  /** 生效结束时刻（ISO 8601 UTC；null = 不限制） */
  endAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** 服务端按当前时刻判定的「正在生效」（enabled 且落在时间窗内） */
  active: boolean;
  /** 已读人数（仅管理端列表返回；去重人数，v2.0③） */
  readCount?: number;
}

/** 轮播图 DTO */
export interface BannerDto {
  id: string;
  title: string;
  /** 图片地址（站内附件签名 URL 或外链） */
  imageUrl: string;
  /** 点击跳转地址（空 = 不可点击） */
  linkUrl: string;
  target: ContentTarget;
  /** 展示顺序（升序） */
  sortOrder: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  /** 点击人数（仅管理端列表返回；去重人数，v2.0③） */
  clickCount?: number;
}

/** 考生侧内容聚合（考试端与练题端首页共用结构） */
export interface ContentFeedDto {
  announcements: AnnouncementDto[];
  banners: BannerDto[];
}

/* ============================================================
 * v2.0③ 内容触达看板（GET /api/content/stats）
 * ============================================================ */

/** 公告触达条目 */
export interface AnnouncementTouchDto {
  id: string;
  title: string;
  target: ContentTarget;
  readCount: number;
  /** 阅读率（0~100 整数；分母按发布范围取对应端受众） */
  readRate: number;
}

/** 轮播触达条目 */
export interface BannerTouchDto {
  id: string;
  title: string;
  target: ContentTarget;
  clickCount: number;
  /** 点击率（0~100 整数） */
  clickRate: number;
}

/** 内容触达看板 */
export interface ContentTouchStatsDto {
  /** 受众规模（触达率分母）：exam = 在职考生数，practice = 在职账号数 */
  audience: { exam: number; practice: number };
  announcements: AnnouncementTouchDto[];
  banners: BannerTouchDto[];
  generatedAt: string;
}

/* ============================================================
 * v2.0② 考试端首页聚合（GET /api/home/summary）
 * ============================================================ */

/** 首页统计四项 + 及格率 / 及格线 */
export interface HomeStatBundleDto {
  /** 待考：正在进行中且本人尚无记录的考试数 */
  pending: number;
  /** 进行中：本人存在未交卷记录的考试数 */
  ongoing: number;
  /** 已交卷次数（含历史归档） */
  submitted: number;
  /** 平均分（已交卷成绩，保留一位小数） */
  avgScore: number;
  /** 及格率（0~100 整数） */
  passRate: number;
  /** 及格线（考试未单独设置时的默认值，供前端展示） */
  passLine: number;
}

/** 首页最近成绩趋势点 */
export interface HomeTrendPointDto {
  recordId: string;
  examId: string;
  examName: string;
  score: number;
  passScore: number;
  passed: boolean;
  submittedAt: string | null;
}

/** 首页待办提醒 */
export interface HomeTodoDto {
  /** 待办类型：pending-exam / ongoing-exam / retake / message / announcement */
  key: string;
  text: string;
  count: number;
  /** 点击跳转的前端路由 */
  path: string;
}

/** 考生首页个性化快捷入口（v2.0⑥ 起按科室可配置） */
export interface HomeShortcutDto {
  key: string;
  text: string;
  desc: string;
  path: string;
  /** Element Plus 图标名（前端映射） */
  icon: string;
  enabled: boolean;
}

/** 考生首页推荐练题题库 */
export interface HomeRecommendedBankDto {
  bankId: string;
  bankName: string;
  questionCount: number;
  /** 推荐理由（如：本科室关注 / 与本专业相关） */
  reason: string;
}

/** 考试端首页聚合数据 */
export interface HomeSummaryDto {
  stats: HomeStatBundleDto;
  trend: HomeTrendPointDto[];
  todos: HomeTodoDto[];
  unreadCount: number;
  /** 个性化快捷入口（未配置走全局默认） */
  shortcuts: HomeShortcutDto[];
  /** 推荐练题题库（未配置为空数组） */
  recommendedBanks: HomeRecommendedBankDto[];
  generatedAt: string;
}


/* ============================================================
 * v2.0⑥ 考生首页个性化（科室级可配置）
 * ============================================================ */

/** 快捷入口目录项（管理端「首页配置」勾选列表用；key 为固定目录，不可增删） */
export interface HomeShortcutCatalogItemDto {
  key: string;
  /** 目录默认文案（未覆盖时生效） */
  text: string;
  desc: string;
  path: string;
  icon: string;
}

/** 单条快捷入口配置（保存用；text 为空表示沿用目录默认文案） */
export interface HomeShortcutConfigItemDto {
  key: string;
  enabled: boolean;
  /** 文案覆盖（可选；空 = 用目录默认） */
  text?: string;
}

/** 某科室的首页配置（未落库的科室不出现在 configs 中） */
export interface HomeDeptConfigDto {
  /** 科室 id；哨兵值 '*' 表示全局默认 */
  departmentId: string;
  /** 科室名（'*' 为「全局默认」；科室已删除时为「已删除科室」） */
  departmentName: string;
  /** 是否全局默认行 */
  isGlobal: boolean;
  shortcuts: HomeShortcutConfigItemDto[];
  recommendedBankIds: string[];
  /** 推荐题库详情（含题库名与题量，便于管理端直接回显） */
  recommendedBanks: HomeRecommendedBankDto[];
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

/** 管理端「首页配置」总览（GET /api/home/configs） */
export interface HomeConfigOverviewDto {
  /** 快捷入口固定目录 */
  catalog: HomeShortcutCatalogItemDto[];
  /** 可选科室（树扁平化后的列表，含层级路径名） */
  departments: Array<{ id: string; name: string }>;
  /** 已配置项（含全局默认行，若已配置） */
  configs: HomeDeptConfigDto[];
  /** 当前全局默认生效值（未配置全局行时为内置默认） */
  globalShortcuts: HomeShortcutDto[];
  globalRecommendedBanks: HomeRecommendedBankDto[];
}

/* ============================================================
 * 核心功能补齐：科目 / 组织 / 模板 / 考试人员 / 题目质量 / 练题监控
 * ============================================================ */

export interface SubjectDto { id: string; name: string; parentId: string | null; sortOrder: number; status: 'active' | 'disabled'; createdAt: string; updatedAt: string }
export interface PositionDto { id: string; name: string; description: string; createdAt: string; updatedAt: string }
export interface UserGroupDto { id: string; name: string; description: string; userIds: string[]; createdAt: string; updatedAt: string }
export type GrantPrincipalType = 'role' | 'group' | 'position' | 'user';
export interface SubjectGrantDto { id: string; subjectId: string; principalType: GrantPrincipalType; principalId: string; effect: 'allow' | 'deny'; canView: boolean; canEdit: boolean }
export interface MenuOverrideDto { userId: string; menuKey: string; effect: 'allow' | 'deny' }
export interface PaperTemplateDto { id: string; name: string; description: string; config: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }
export interface AudienceTemplateRulesDto { departmentIds: string[]; groupIds: string[]; positionIds: string[]; includeUserIds: string[]; excludeUserIds: string[]; includeSubDepartments: boolean; randomCount: number | null }
export interface AudienceTemplateDto { id: string; name: string; description: string; rules: AudienceTemplateRulesDto; createdBy: string; createdAt: string; updatedAt: string }
export interface ExamParticipantDto { examId: string; userId: string; username: string; userName: string; departmentId: string | null; departmentName: string; source: 'department' | 'template' | 'include' | 'legacy'; admissionNo: string; createdAt: string }
export interface AdmissionTicketDto { admissionNo: string; examId: string; examName: string; userId: string; username: string; userName: string; departmentName: string; startTime: string; endTime: string; durationMinutes: number; examMode: 'open' | 'closed' }
export type QuestionFeedbackStatus = 'pending' | 'processing' | 'resolved' | 'closed';
export interface QuestionFeedbackDto { id: string; questionId: string; userId: string; userName: string; source: 'exam' | 'practice'; sourceRefId: string | null; category: string; content: string; status: QuestionFeedbackStatus; reply: string; handledBy: string | null; handledAt: string | null; createdAt: string; updatedAt: string }
export interface DuplicateQuestionGroupDto { fingerprint: string; count: number; questions: Array<{ id: string; bankId: string; bankName: string; type: QuestionType; stem: string; subject: string; status: 'active' | 'disabled'; createdAt: string }> }
export type PracticeSessionStatus = 'active' | 'completed' | 'exited' | 'offline';
export interface PracticeSessionDto { id: string; userId: string; userName: string; departmentName: string; bankId: string; bankName: string; mode: string; questionCount: number; answeredCount: number; correctCount: number; status: PracticeSessionStatus; startedAt: string; lastSeenAt: string; endedAt: string | null }
export interface PracticeMonitorSummaryDto { activeUsers: number; sessionTotal: number; dailyActiveUsers: number; answerTotal: number; averageCorrectRate: number; wrongConsolidationRate: number; generatedAt: string }
