/**
 * 全局常量：角色/题型/状态文案、业务阈值、分页与导入上限、Token key、题库/导入文案。
 * 说明：已移除旧版 localStorage 存储 key（数据改由后端 API 承载）。
 */
import type {
  AppealStatus,
  AuditAction,
  AuditTargetType,
  ExamStatus,
  NotifyTemplateKey,
  NotifyTemplates,
  QuestionType,
  Role,
} from '@/types';

/** 登录令牌存储 key（仅存 Token，其余会话信息由 /api/auth/me 恢复） */
export const TOKEN_KEY = 'exam_sys.token';

/** 账号状态 */
export const USER_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

/** 角色文案 */
export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  author: '出题人',
  examinee: '考生',
};

/** 题型文案 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  short: '简答题',
};

/** 题型下拉选项 */
export const QUESTION_TYPE_OPTIONS: ReadonlyArray<{ value: QuestionType; label: string }> = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill', label: '填空题' },
  { value: 'short', label: '简答题' },
];

/** 考试状态文案 */
export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  not_started: '未开始',
  ongoing: '进行中',
  ended: '已结束',
};

/** 新建账号/重置密码时的默认密码 */
export const DEFAULT_PASSWORD = '123456';

/** 倒计时最后 N 分钟变红提醒 */
export const COUNTDOWN_WARNING_MINUTES = 5;

/** 切屏异常判定阈值：切屏次数 ≥ 该值（可调） */
export const CHEAT_COUNT_THRESHOLD = 3;

/** 切屏异常判定阈值：累计离开秒数 ≥ 该值（可调） */
export const CHEAT_SECONDS_THRESHOLD = 120;

/** 选项数量上限/下限（判断题固定 2 项，不受上限约束） */
export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;

/** 判断题固定选项 */
export const JUDGE_OPTIONS = ['正确', '错误'] as const;

/** 分页：默认每页条数 / 上限（与后端 §4.4 一致） */
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** Excel 导入：单次最大数据行数 / 文件大小上限（MB）/ 允许扩展名 */
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_FILE_MB = 5;
export const IMPORT_ALLOWED_EXTENSION = '.xlsx';

/** Excel 模板表头（A~L，12 列，与后端 IMPORT_HEADERS 一致） */
export const IMPORT_HEADERS = [
  '题型',
  '题干',
  '选项A',
  '选项B',
  '选项C',
  '选项D',
  '选项E',
  '选项F',
  '正确答案',
  '分值',
  '解析',
  '科目',
] as const;

/** 题库默认分类（未填写时） */
export const BANK_CATEGORY_DEFAULT = '未分类';

/** 题库/导入相关文案 */
export const BANK_TEXT = {
  /** 删除有题题库的二次强确认标题 */
  CASCADE_CONFIRM_TITLE: '确认删除题库',
  /** 空题库列表空态文案 */
  EMPTY_LIST: '暂无题库，点击「新建题库」开始创建',
  /** 题库内暂无试题 */
  EMPTY_QUESTIONS: '该题库暂无试题，可手动新增或从 Excel 导入',
} as const;

/** 成绩导出字段（key 与后端 reports.columns.ts 白名单一一对应；数组顺序即导出列序） */
export const SCORE_EXPORT_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'name', label: '考生姓名' },
  { key: 'username', label: '登录账号' },
  { key: 'department', label: '科室' },
  { key: 'attemptNo', label: '作答次数' },
  { key: 'startedAt', label: '开考时间' },
  { key: 'submittedAt', label: '交卷时间' },
  { key: 'score', label: '得分' },
  { key: 'passed', label: '是否及格' },
  { key: 'passScore', label: '及格线' },
  { key: 'usedMinutes', label: '用时（分钟）' },
  { key: 'cheatCount', label: '切屏次数' },
  { key: 'cheatSeconds', label: '切屏时长（秒）' },
  { key: 'autoSubmitted', label: '交卷方式' },
];

/** 默认勾选的导出字段（与「成绩列表」页签展示的列一致） */
export const DEFAULT_SCORE_EXPORT_FIELDS: readonly string[] = [
  'name', 'department', 'attemptNo', 'submittedAt', 'score', 'passed', 'cheatCount', 'cheatSeconds',
];

/** 审计动作文案（与后端 audit.service AUDIT_ACTION_LABELS 一致） */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'user.create': '新建用户',
  'user.update': '编辑用户',
  'user.delete': '删除用户',
  'user.reset_password': '重置密码',
  'user.change_password': '修改本人密码',
  'user.two_factor_enable': '开启两步验证',
  'user.two_factor_disable': '关闭两步验证',
  'user.two_factor_reset': '重置两步验证',
  'user.force_logout': '强制下线设备',
  'exam.create': '新建考试',
  'exam.update': '编辑考试',
  'exam.delete': '删除考试',
  'bank.create': '新建题库',
  'bank.update': '编辑题库',
  'bank.delete': '删除题库',
  'bank.migrate': '迁移试题',
  'bank.author_grant': '批量授权出题人',
  'bank.author_revoke': '批量取消出题人授权',
  'bank.clone': '复制题库',
  'bank.practice_flag': '调整对外练题开放',
  'permission.update': '更新菜单权限',
  'appeal.approve': '复核通过（改分）',
  'appeal.reject': '复核驳回',
  'exam.exception_update': '设置特殊安排',
  'exam.extend_time': '监考加时',
  'record.force_submit': '监考强制交卷',
  'system.archive': '历史成绩归档',
  'audit.export': '导出审计日志',
  'audit.cleanup': '清理过期审计日志',
};

/** 审计动作下拉选项 */
export const AUDIT_ACTION_OPTIONS: ReadonlyArray<{ value: AuditAction; label: string }> = (
  Object.entries(AUDIT_ACTION_LABELS) as Array<[AuditAction, string]>
).map(([value, label]) => ({ value, label }));

/** 审计目标类型文案 */
export const AUDIT_TARGET_TYPE_LABELS: Record<AuditTargetType, string> = {
  user: '用户',
  exam: '考试',
  bank: '题库',
  permission: '菜单权限',
  appeal: '成绩复核',
  audit: '审计日志',
  record: '考试记录',
  system: '系统维护',
};

/** 审计目标类型下拉选项 */
export const AUDIT_TARGET_TYPE_OPTIONS: ReadonlyArray<{ value: AuditTargetType; label: string }> = [
  { value: 'user', label: '用户' },
  { value: 'exam', label: '考试' },
  { value: 'bank', label: '题库' },
  { value: 'permission', label: '菜单权限' },
  { value: 'appeal', label: '成绩复核' },
  { value: 'audit', label: '审计日志' },
  { value: 'record', label: '考试记录' },
  { value: 'system', label: '系统维护' },
];

/** 审计日志导出列（与后端 modules/audit/audit.columns.ts 白名单一致，v1.7②） */
export const AUDIT_EXPORT_COLUMNS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'createdAt', label: '操作时间' },
  { key: 'actorName', label: '操作者' },
  { key: 'action', label: '操作类型' },
  { key: 'targetType', label: '对象类型' },
  { key: 'targetName', label: '对象名称' },
  { key: 'targetId', label: '对象 ID' },
  { key: 'detail', label: '明细' },
];

/** 审计日志默认导出列 */
export const DEFAULT_AUDIT_EXPORT_KEYS: readonly string[] = [
  'createdAt',
  'actorName',
  'action',
  'targetType',
  'targetName',
  'detail',
];

/** 成绩复核状态文案（v1.7①） */
export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  pending: '待复核',
  approved: '已通过',
  rejected: '已驳回',
};

/** 成绩复核状态标签色 */
export const APPEAL_STATUS_TAG_TYPES: Record<AppealStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

/** 成绩复核状态下拉选项 */
export const APPEAL_STATUS_OPTIONS: ReadonlyArray<{ value: AppealStatus; label: string }> = (
  Object.entries(APPEAL_STATUS_LABELS) as Array<[AppealStatus, string]>
).map(([value, label]) => ({ value, label }));

/* ============================ 通知模板（v1.7④ S3） ============================ */

/**
 * 通知模板默认值（与后端 `server/src/utils/notifyTemplate.ts` 的
 * NOTIFY_TEMPLATES_DEFAULT 逐字一致；正文支持 `{变量}` 占位）。
 */
export const NOTIFY_TEMPLATES_DEFAULT: NotifyTemplates = {
  examPublish: {
    title: '新考试发布：{examName}',
    content: '你有一个新的考试「{examName}」，请留意考试时间并准时参加。',
  },
  resultPending: {
    title: '答卷已提交，待阅卷：{examName}',
    content: '你已提交「{examName}」的答卷，含主观题，待人工阅卷后公布最终成绩。',
  },
  resultPublished: {
    title: '考试成绩已发布：{examName}',
    content: '你的考试成绩为 {score} 分，{passedText}。',
  },
  reviewDone: {
    title: '阅卷完成：{examName}',
    content: '你「{examName}」的答卷已完成阅卷，最终成绩 {score} 分，{passedText}。',
  },
  retakeApproved: {
    title: '补考申请已通过',
    content: '你申请的「{examName}」补考已通过，请重新进入考试完成补考。',
  },
  retakeRejected: {
    title: '补考申请被驳回',
    content: '你申请的「{examName}」补考被驳回，原因：{reason}',
  },
  appealApproved: {
    title: '成绩复核已通过：{examName}',
    content: '你的成绩复核已通过，成绩由 {originalScore} 分调整为 {newScore} 分，{passedText}。{comment}',
  },
  appealRejected: {
    title: '成绩复核未通过：{examName}',
    content: '你的成绩复核申请未通过，原成绩保持不变。复核意见：{comment}',
  },
  twoFactorReset: {
    title: '两步验证已被重置',
    content: '你的账号（{username}）的两步验证已由管理员重置，请使用登录密码重新登录，并尽快在「账号安全」中重新开启两步验证。',
  },
};

/** 模板键 → 展示名与可用变量（与后端 NOTIFY_TEMPLATE_META 一致）。 */
export const NOTIFY_TEMPLATE_META: ReadonlyArray<{
  key: NotifyTemplateKey;
  label: string;
  vars: string[];
}> = [
  { key: 'examPublish', label: '考试发布通知', vars: ['examName'] },
  { key: 'resultPending', label: '交卷待阅卷通知', vars: ['examName'] },
  { key: 'resultPublished', label: '成绩发布通知', vars: ['examName', 'score', 'passedText'] },
  { key: 'reviewDone', label: '阅卷完成通知', vars: ['examName', 'score', 'passedText'] },
  { key: 'retakeApproved', label: '补考通过通知', vars: ['examName'] },
  { key: 'retakeRejected', label: '补考驳回通知', vars: ['examName', 'reason'] },
  {
    key: 'appealApproved',
    label: '复核通过通知',
    vars: ['examName', 'originalScore', 'newScore', 'passedText', 'comment'],
  },
  { key: 'appealRejected', label: '复核驳回通知', vars: ['examName', 'comment'] },
  { key: 'twoFactorReset', label: '两步验证重置通知', vars: ['username'] },
];
