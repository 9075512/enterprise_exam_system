/**
 * 全局常量：角色/题型/状态文案、业务阈值、分页与导入上限、Token key、题库/导入文案。
 * 说明：已移除旧版 localStorage 存储 key（数据改由后端 API 承载）。
 */
import type { ExamStatus, QuestionType, Role } from '@/types';

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
};

/** 题型下拉选项 */
export const QUESTION_TYPE_OPTIONS: ReadonlyArray<{ value: QuestionType; label: string }> = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
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
