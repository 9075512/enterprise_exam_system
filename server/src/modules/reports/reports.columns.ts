/**
 * 成绩导出 —— 可选列定义（唯一事实来源）。
 *
 * 后端据此做白名单校验（`SCORE_EXPORT_KEYS`）与渲染；**列顺序固定等于本数组顺序**，
 * 与前端勾选顺序无关，保证同一勾选集合输出稳定。
 */
import type { ExportColumn } from '../../utils/excelExport.js';

/** 导出行（业务字段，渲染前的规范化结构）。 */
export interface ScoreExportRow {
  userName: string;
  username: string;
  departmentName: string;
  attemptNo: number;
  /** 已按 tzOffset 格式化为 'YYYY-MM-DD HH:mm' 的本地墙钟 */
  startedAt: string;
  /** 同上（未交卷为 ''） */
  submittedAt: string;
  score: number;
  passScore: number;
  passed: boolean;
  /** 用时（分钟），无法计算为 null */
  usedMinutes: number | null;
  cheatCount: number;
  cheatSeconds: number;
  autoSubmitted: boolean;
}

/** 13 个可选列（顺序即导出列序）。 */
export const SCORE_EXPORT_COLUMNS: Array<ExportColumn<ScoreExportRow>> = [
  { key: 'name', header: '考生姓名', width: 14, value: (r) => r.userName },
  { key: 'username', header: '登录账号', width: 16, value: (r) => r.username },
  { key: 'department', header: '科室', width: 18, value: (r) => r.departmentName || '—' },
  { key: 'attemptNo', header: '作答次数', width: 12, value: (r) => `第 ${r.attemptNo} 次` },
  { key: 'startedAt', header: '开考时间', width: 20, value: (r) => r.startedAt },
  { key: 'submittedAt', header: '交卷时间', width: 20, value: (r) => r.submittedAt },
  { key: 'score', header: '得分', width: 10, value: (r) => r.score },
  { key: 'passed', header: '是否及格', width: 12, value: (r) => (r.passed ? '及格' : '不及格') },
  { key: 'passScore', header: '及格线', width: 10, value: (r) => r.passScore },
  {
    key: 'usedMinutes',
    header: '用时（分钟）',
    width: 14,
    value: (r) => (r.usedMinutes === null ? '' : r.usedMinutes),
  },
  { key: 'cheatCount', header: '切屏次数', width: 12, value: (r) => r.cheatCount },
  { key: 'cheatSeconds', header: '切屏时长（秒）', width: 14, value: (r) => r.cheatSeconds },
  {
    key: 'autoSubmitted',
    header: '交卷方式',
    width: 12,
    value: (r) => (r.autoSubmitted ? '自动交卷' : '手动交卷'),
  },
];

/** 合法 key 白名单（校验用）。 */
export const SCORE_EXPORT_KEYS: ReadonlySet<string> = new Set(SCORE_EXPORT_COLUMNS.map((c) => c.key));

/** 默认导出列（与「成绩列表」页签展示的列一致）。 */
export const DEFAULT_SCORE_EXPORT_KEYS: readonly string[] = [
  'name',
  'department',
  'attemptNo',
  'submittedAt',
  'score',
  'passed',
  'cheatCount',
  'cheatSeconds',
];
