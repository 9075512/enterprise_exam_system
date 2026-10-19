/** 考生首页内置快捷入口。 */
import type { HomeShortcutDto } from '../../types/domain.js';

/** 快捷入口目录（key / 默认文案 / 默认图标名 / 路由）。 */
export const HOME_SHORTCUT_CATALOG: ReadonlyArray<{
  key: string;
  text: string;
  desc: string;
  path: string;
  icon: string;
}> = [
  { key: 'my-exams', text: '我的考试', desc: '查看并参加本科室考试', path: '/exam/my', icon: 'AlarmClock' },
  { key: 'my-scores', text: '我的成绩', desc: '成绩明细与作答回顾', path: '/exam/scores', icon: 'TrendCharts' },
  { key: 'my-retakes', text: '我的补考', desc: '补考申请与审批进度', path: '/exam/retakes', icon: 'Refresh' },
  { key: 'notifications', text: '消息中心', desc: '系统通知与考试提醒', path: '/notifications', icon: 'Bell' },
];

/** 默认快捷入口（全部启用）。 */
export function defaultShortcuts(): HomeShortcutDto[] {
  return HOME_SHORTCUT_CATALOG.map((s) => ({ ...s, enabled: true }));
}
