/**
 * 考生首页个性化配置 —— 业务逻辑层（v2.0② 提供默认；v2.0⑥ 起支持按科室配置）。
 *
 * 快捷入口为**固定目录**（key 决定图标与跳转），科室配置只控制「启停 + 文案覆盖」；
 * 未配置的科室走全局默认（全部启用）。推荐练题题库由科室配置显式指定，未配置为空。
 */
import type { HomeRecommendedBankDto, HomeShortcutDto } from '../../types/domain.js';

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

/** 科室首页配置解析结果。 */
export interface ResolvedHomeProfile {
  shortcuts: HomeShortcutDto[];
  recommendedBanks: HomeRecommendedBankDto[];
}

/**
 * 解析某科室的首页配置（v2.0② 仅返回全局默认）。
 * v2.0⑥ 将在此处读取 `home_dept_configs` 表，按科室覆盖启停 / 文案 / 推荐题库。
 */
export async function resolveHomeProfile(_departmentId: string): Promise<ResolvedHomeProfile> {
  return { shortcuts: defaultShortcuts(), recommendedBanks: [] };
}
