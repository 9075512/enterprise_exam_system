/**
 * 考试端首页聚合 —— 业务逻辑层（v2.0②）。
 *
 * 把原先前端「三次并发拉取 + 本地即时计算」的口径收敛到服务端一次算清：
 *   - 统计：待考 / 进行中 / 已交卷 / 平均分 及**及格率**（新增）；
 *   - 趋势：最近 10 次已交卷成绩（考试名 + 分数 + 是否及格）；
 *   - 待办：待考 / 未交卷 / 可申请补考 / 未读消息；
 *   - 快捷入口使用内置默认值。
 *
 * 口径说明：
 *   - 已交卷 = status='submitted'（已出成绩），与「我的成绩」完全一致；
 *   - 及格线优先取考试自身 pass_score，缺省回退系统设置 examDefaultPassScore；
 *   - 待考排除免考（exempt）与已有记录的考试。
 */
import * as repo from './home.repo.js';
import * as examsService from '../exams/exams.service.js';
import * as notificationsService from '../notifications/notifications.service.js';
import { getSettings } from '../settings/settings.service.js';
import { getExamStatus } from '../../utils/examStatus.js';
import { fromDbDateSafe } from '../../utils/datetime.js';
import { defaultShortcuts } from './homeProfile.service.js';
import type {
  HomeStatBundleDto,
  HomeSummaryDto,
  HomeTodoDto,
  HomeTrendPointDto,
} from '../../types/domain.js';

/** 最近成绩趋势条数上限。 */
const TREND_LIMIT = 10;

/** 保留一位小数。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 考生首页聚合。 */
export async function getSummary(user: { id: string; departmentId: string }): Promise<HomeSummaryDto> {
  const [exams, agg, trendRows, unreadData, settings] = await Promise.all([
    examsService.listForExaminee(user.id, user.departmentId),
    repo.aggregateSubmitted(user.id),
    repo.listRecentScores(user.id, TREND_LIMIT),
    notificationsService.unreadCount(user.id),
    getSettings(),
  ]);

  const passLine = settings.examDefaultPassScore;

  const pending = exams.filter((e) => !e.exempt && getExamStatus(e) === 'ongoing' && !e.recordStatus).length;
  const ongoing = exams.filter((e) => e.recordStatus === 'in_progress').length;
  const submitted = Number(agg.submitted ?? 0);
  const passed = Number(agg.passed ?? 0);
  const avgRaw = agg.avg_score == null ? 0 : Number(agg.avg_score);

  const trend: HomeTrendPointDto[] = trendRows.map((r) => {
    const passScore = r.pass_score == null ? passLine : Number(r.pass_score);
    const score = Number(r.score ?? 0);
    return {
      recordId: String(r.id),
      examId: String(r.exam_id),
      examName: r.exam_name ?? '',
      score,
      passScore,
      passed: score >= passScore,
      submittedAt: r.submitted_at ? fromDbDateSafe(r.submitted_at) : null,
    };
  });

  const stats: HomeStatBundleDto = {
    pending,
    ongoing,
    submitted,
    avgScore: round1(avgRaw),
    passRate: submitted > 0 ? Math.round((passed / submitted) * 100) : 0,
    passLine,
  };

  const retakeApplicable = exams.filter((e) => e.canApplyRetake).length;
  const todos: HomeTodoDto[] = [];
  if (pending > 0) {
    todos.push({ key: 'pending-exam', text: `有 ${pending} 场考试待参加`, count: pending, path: '/exam/my' });
  }
  if (ongoing > 0) {
    todos.push({ key: 'ongoing-exam', text: `有 ${ongoing} 场考试未交卷`, count: ongoing, path: '/exam/my' });
  }
  if (retakeApplicable > 0) {
    todos.push({
      key: 'retake',
      text: `有 ${retakeApplicable} 场考试可申请补考`,
      count: retakeApplicable,
      path: '/exam/retakes',
    });
  }
  if (unreadData.unreadCount > 0) {
    todos.push({
      key: 'message',
      text: `有 ${unreadData.unreadCount} 条未读消息`,
      count: unreadData.unreadCount,
      path: '/notifications',
    });
  }

  return {
    stats,
    trend,
    todos,
    unreadCount: unreadData.unreadCount,
    shortcuts: defaultShortcuts(),
    recommendedBanks: [],
    generatedAt: new Date().toISOString(),
  };
}
