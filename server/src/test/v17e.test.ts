/**
 * v1.7④ 工程化与稳定性 集成测试。
 *
 * 1) T3 实时考试监控：花名册全员（含未开始）+ 汇总、剩余时长、监考加时、强制交卷、仅 admin。
 * 2) S4 题库复制：连同试题复制（新 id）、不复制试题、出题人越权 1003。
 * 3) T5 数据归档与索引：归档仅处理已出成绩记录、有复核申请的跳过、归档后报表查询不受影响、
 *    关键复合索引就位。
 * 4) S3 通知模板：模板渲染（占位替换/缺失变量）+ 自定义文案生效于站内信。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { app } from '../app.js';
import { prepareTestDb } from './db.js';
import { closePool, query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { renderTemplate, renderEvent, NOTIFY_TEMPLATES_DEFAULT } from '../utils/notifyTemplate.js';
import type {
  ExamMonitorDto,
  MaintenanceStatsDto,
  NotifyTemplates,
  Page,
  NotificationDto,
} from '../types/domain.js';

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const author = signToken({ sub: 'user-author', role: 'author', departmentId: '' });
const zs = signToken({ sub: 'user-zhangsan', role: 'examinee', departmentId: 'dept-rd' });

/** 直连测试库改数据（模拟「考试早已结束」）。 */
async function expireExam(examId: string, daysAgo = 400): Promise<void> {
  const when = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().slice(0, 23).replace('T', ' ');
  await query(`UPDATE exams SET end_time = ? WHERE id = ?`, [when, examId]);
}

async function getSettings(): Promise<Record<string, unknown>> {
  const res = await request(app).get('/api/settings').set(bearer(admin));
  expect(res.body.code).toBe(0);
  return res.body.data as Record<string, unknown>;
}

async function putSettings(payload: Record<string, unknown>): Promise<void> {
  const res = await request(app).put('/api/settings').set(bearer(admin)).send(payload);
  expect(res.body.code).toBe(0);
}

/* ============================ 0. 纯函数：通知模板渲染（S3） ============================ */

describe('S3 通知模板渲染（纯函数）', () => {
  it('renderTemplate 替换占位，未提供的变量替换为空串', () => {
    expect(renderTemplate('考试：{examName}-{score}', { examName: '期中考', score: 88 })).toBe('考试：期中考-88');
    expect(renderTemplate('未知变量[{nope}]', {})).toBe('未知变量[]');
  });

  it('renderEvent 在模板缺失/空串时回退默认文案', () => {
    const rendered = renderEvent(undefined, 'examPublish', { examName: 'X 考试' });
    expect(rendered.title).toBe('新考试发布：X 考试');
    expect(rendered.content).toContain('X 考试');

    const blank = renderEvent({ examPublish: { title: '', content: '' } } as Partial<NotifyTemplates>, 'examPublish', {
      examName: 'Y 考试',
    });
    expect(blank.title).toBe('新考试发布：Y 考试');
  });

  it('默认模板覆盖全部 8 个事件且与历史硬编码文案一致', () => {
    expect(Object.keys(NOTIFY_TEMPLATES_DEFAULT)).toHaveLength(8);
    expect(NOTIFY_TEMPLATES_DEFAULT.resultPublished.content).toBe('你的考试成绩为 {score} 分，{passedText}。');
    expect(NOTIFY_TEMPLATES_DEFAULT.retakeRejected.content).toBe('你申请的「{examName}」补考被驳回，原因：{reason}');
  });
});

/* ============================ 集成用例 ============================ */

let liveExamId = '';
const demoExamId = 'exam-demo';
let archivedRecordId = '';

beforeAll(async () => {
  await prepareTestDb();

  // 监考/归档用的进行中考试（仅 dept-rd，花名册 = 张三、王五）
  const exam = await request(app)
    .post('/api/exams')
    .set(bearer(admin))
    .send({
      name: 'v17e 监考考试',
      paperId: 'paper-demo',
      departmentIds: ['dept-rd'],
      startTime: new Date(Date.now() - 3600_000).toISOString(),
      endTime: new Date(Date.now() + 3 * 3600_000).toISOString(),
      durationMinutes: 30,
      passScore: 60,
      maxAttempts: 1,
    });
  expect(exam.body.code).toBe(0);
  liveExamId = exam.body.data.id as string;
});

afterAll(async () => {
  await closePool();
});

/* ============================ 1. T3 实时考试监控 ============================ */

describe('T3 实时考试监控（轮询）', () => {
  it('仅 admin 可访问（出题人 → 1003）', async () => {
    const res = await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(author));
    expect(res.body.code).toBe(1003);
  });

  it('花名册含未开始考生，汇总口径正确', async () => {
    const res = await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(admin));
    expect(res.body.code).toBe(0);
    const data = res.body.data as ExamMonitorDto;
    expect(data.exam.id).toBe(liveExamId);
    // dept-rd 的 examinee：张三、王五
    expect(data.rows.map((r) => r.userName).sort()).toEqual(['张三', '王五']);
    expect(data.summary.total).toBe(2);
    expect(data.summary.notStarted).toBe(2);
    expect(data.summary.inProgress).toBe(0);
  });

  it('开考后进行中 + 剩余时长有值；加时后剩余时长增加', async () => {
    const start = await request(app).post(`/api/exams/${liveExamId}/start`).set(bearer(zs));
    expect(start.body.code).toBe(0);

    const before = await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(admin));
    const rowBefore = (before.body.data as ExamMonitorDto).rows.find((r) => r.userName === '张三')!;
    expect(rowBefore.status).toBe('in_progress');
    expect(rowBefore.remainingSeconds).toBeGreaterThan(25 * 60);
    expect(rowBefore.remainingSeconds).toBeLessThanOrEqual(30 * 60);

    const extend = await request(app)
      .post(`/api/exams/${liveExamId}/monitor/${rowBefore.userId}/extend`)
      .set(bearer(admin))
      .send({ minutes: 10 });
    expect(extend.body.code).toBe(0);

    const after = await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(admin));
    const rowAfter = (after.body.data as ExamMonitorDto).rows.find((r) => r.userName === '张三')!;
    expect(rowAfter.extraMinutes).toBe(10);
    expect(rowAfter.remainingSeconds).toBeGreaterThanOrEqual(rowBefore.remainingSeconds + 590);
  });

  it('加时入参越界 → 1001', async () => {
    const rows = (await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(admin))).body.data
      .rows as ExamMonitorDto['rows'];
    const userId = rows.find((r) => r.userName === '张三')!.userId;
    const res = await request(app)
      .post(`/api/exams/${liveExamId}/monitor/${userId}/extend`)
      .set(bearer(admin))
      .send({ minutes: 0 });
    expect(res.body.code).toBe(1001);
  });

  it('强制交卷：状态转已交卷并写入审计；重复强制 → 1004', async () => {
    const monitor = await request(app).get(`/api/exams/${liveExamId}/monitor`).set(bearer(admin));
    const row = (monitor.body.data as ExamMonitorDto).rows.find((r) => r.userName === '张三')!;

    const force = await request(app)
      .post(`/api/exams/${liveExamId}/monitor/${row.userId}/force-submit`)
      .set(bearer(admin));
    expect(force.body.code).toBe(0);
    expect(force.body.data.status).toBe('submitted');
    expect(force.body.data.autoSubmitted).toBe(true);

    const again = await request(app)
      .post(`/api/exams/${liveExamId}/monitor/${row.userId}/force-submit`)
      .set(bearer(admin));
    expect(again.body.code).toBe(1004);

    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'record.force_submit', pageSize: 10 })
      .set(bearer(admin));
    expect(logs.body.code).toBe(0);
    expect(logs.body.data.total).toBeGreaterThanOrEqual(1);
  });
});

/* ============================ 2. S4 题库复制 ============================ */

describe('S4 题库复制', () => {
  it('连同试题复制：新题库独立、题目数一致且题目 id 全新', async () => {
    const res = await request(app)
      .post('/api/banks/bank-security/clone')
      .set(bearer(admin))
      .send({ name: '安全知识题库（复制）', copyQuestions: true });
    expect(res.body.code).toBe(0);
    const cloneId = res.body.data.id as string;
    expect(cloneId).toBeTruthy();
    expect(res.body.data.name).toBe('安全知识题库（复制）');

    const [src, dst] = await Promise.all([
      request(app).get('/api/banks/bank-security/questions').query({ pageSize: 50 }).set(bearer(admin)),
      request(app).get(`/api/banks/${cloneId}/questions`).query({ pageSize: 50 }).set(bearer(admin)),
    ]);
    expect(dst.body.data.total).toBe(src.body.data.total);
    expect(dst.body.data.total).toBe(6);

    const srcIds = new Set((src.body.data.list as Array<{ id: string }>).map((q) => q.id));
    const dstIds = (dst.body.data.list as Array<{ id: string }>).map((q) => q.id);
    expect(dstIds.some((id) => srcIds.has(id))).toBe(false);

    // 审计留痕
    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ action: 'bank.clone', pageSize: 10 })
      .set(bearer(admin));
    expect(logs.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('不复制试题：新题库为空；副本命名自动追加「（副本）」', async () => {
    const res = await request(app)
      .post('/api/banks/bank-culture/clone')
      .set(bearer(admin))
      .send({ copyQuestions: false });
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('企业文化题库（副本）');
    expect(res.body.data.questionCount).toBe(0);
  });

  it('出题人复制未授权题库 → 1003', async () => {
    const created = await request(app).post('/api/banks').set(bearer(admin)).send({
      name: 'v17e 未授权题库',
      description: '',
      category: '测试',
      allowPractice: false,
      authorIds: [],
    });
    expect(created.body.code).toBe(0);
    const res = await request(app).post(`/api/banks/${created.body.data.id}/clone`).set(bearer(author)).send({});
    expect(res.body.code).toBe(1003);
  });
});

/* ============================ 3. T5 归档与索引 ============================ */

describe('T5 数据归档与性能', () => {
  it('关键复合索引已就位', async () => {
    const rows = await query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND INDEX_NAME IN ('idx_records_exam_status','idx_records_status_submitted','idx_login_logs_source_created')`,
    );
    const found = new Set(rows.map((r) => String(r.i)));
    expect(found.has('idx_records_exam_status')).toBe(true);
    expect(found.has('idx_records_status_submitted')).toBe(true);
    expect(found.has('idx_login_logs_source_created')).toBe(true);
  });

  it('仅 admin 可执行归档（出题人 → 1003）', async () => {
    const res = await request(app).post('/api/maintenance/archive').set(bearer(author)).send({ days: 365 });
    expect(res.body.code).toBe(1003);
  });

  it('归档已结束考试的成绩；有复核申请的记录被跳过；归档后报表仍可查到', async () => {
    // 1) 张三在「监考考试」已强制交卷（前序用例）→ 把考试结束时间改到 400 天前
    await expireExam(liveExamId, 400);

    // 2) 另一条记录：张三在示例考试作答并交卷，挂一条成绩复核申请（应被跳过）
    const startDemo = await request(app).post(`/api/exams/${demoExamId}/start`).set(bearer(zs));
    expect(startDemo.body.code).toBe(0);
    const demoRecordId = startDemo.body.data.id as string;
    const submitDemo = await request(app)
      .post(`/api/records/${demoRecordId}/submit`)
      .set(bearer(zs))
      .send({ auto: false });
    expect(submitDemo.body.code).toBe(0);

    // 发起成绩复核申请（该记录因此必须留在业务表，归档时跳过）
    const appeal = await request(app)
      .post('/api/appeals/apply')
      .set(bearer(zs))
      .send({ recordId: demoRecordId, reason: '测试复核' });
    expect(appeal.body.code).toBe(0);

    await expireExam(demoExamId, 400);

    // 3) 归档前先取一次报表口径（考试记录列表总数）
    const beforeCount = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?`,
      [liveExamId],
    );

    // 4) 执行归档（保留 365 天）
    const res = await request(app).post('/api/maintenance/archive').set(bearer(admin)).send({ days: 365, limit: 500 });
    expect(res.body.code).toBe(0);
    const result = res.body.data as { archived: number; skipped: number; archiveTotal: number };
    expect(result.archived).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.archiveTotal).toBeGreaterThanOrEqual(result.archived);

    // 5) 业务表已移除、归档表已存在；被跳过的记录仍在业务表
    const liveLeft = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?`,
      [liveExamId],
    );
    expect(Number(liveLeft[0].c)).toBe(Number(beforeCount[0].c) - result.archived);

    const archived = await query<RowDataPacket[]>(`SELECT id FROM exam_records_archive WHERE exam_id = ?`, [
      liveExamId,
    ]);
    expect(archived.length).toBe(result.archived);
    archivedRecordId = String(archived[0].id);

    const stillThere = await query<RowDataPacket[]>(`SELECT id FROM exam_records WHERE id = ?`, [demoRecordId]);
    expect(stillThere.length).toBe(1);

    // 6) 归档后成绩报表仍能读到（读路径 union 归档表）
    const report = await request(app).get(`/api/reports/exams/${liveExamId}`).set(bearer(admin));
    expect(report.body.code).toBe(0);
    expect(report.body.data.summary.total).toBe(1);

    // 7) 考生「我的成绩」仍可读到归档记录
    const myScores = await request(app).get('/api/records/my').set(bearer(zs));
    expect(myScores.body.code).toBe(0);
    const ids = (myScores.body.data.list as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(archivedRecordId);
  });

  it('归档统计返回表行数与归档量', async () => {
    const res = await request(app).get('/api/maintenance/stats').set(bearer(admin));
    expect(res.body.code).toBe(0);
    const stats = res.body.data as MaintenanceStatsDto;
    const names = stats.tables.map((t) => t.name);
    expect(names).toContain('exam_records');
    expect(names).toContain('exam_records_archive');
    expect(stats.archiveTotal).toBeGreaterThanOrEqual(1);
    expect(typeof stats.retentionDays).toBe('number');
  });

  it('归档保留天数越界 → 1001', async () => {
    const res = await request(app).post('/api/maintenance/archive').set(bearer(admin)).send({ days: 0 });
    expect(res.body.code).toBe(1001);
  });
});

/* ============================ 4. S3 通知模板生效 ============================ */

describe('S3 通知模板可配置', () => {
  it('自定义「考试发布」模板后，站内信按模板渲染（未提供变量替换为空）', async () => {
    const base = await getSettings();
    const templates = { ...(base.notifyTemplates as NotifyTemplates) };
    templates.examPublish = {
      title: '【考试通知】{examName}{unknownVar}',
      content: '请于规定时间参加「{examName}」，逾期不候。',
    };
    await putSettings({ ...base, notifyTemplates: templates });

    try {
      const created = await request(app)
        .post('/api/exams')
        .set(bearer(admin))
        .send({
          name: 'v17e 模板通知考试',
          paperId: 'paper-demo',
          departmentIds: ['dept-rd'],
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          endTime: new Date(Date.now() + 7200_000).toISOString(),
          durationMinutes: 30,
          passScore: 60,
          maxAttempts: 1,
        });
      expect(created.body.code).toBe(0);

      const list = await request(app).get('/api/notifications').set(bearer(zs));
      expect(list.body.code).toBe(0);
      const page = list.body.data as Page<NotificationDto>;
      const hit = page.list.find((n) => n.title.includes('v17e 模板通知考试'));
      expect(hit).toBeTruthy();
      expect(hit!.title).toBe('【考试通知】v17e 模板通知考试');
      expect(hit!.content).toBe('请于规定时间参加「v17e 模板通知考试」，逾期不候。');
      expect(hit!.type).toBe('publish');
    } finally {
      await putSettings(base);
    }
  });

  it('恢复默认设置后模板回退内置文案', async () => {
    const settings = await getSettings();
    const templates = settings.notifyTemplates as NotifyTemplates;
    expect(templates.examPublish.title).toBe(NOTIFY_TEMPLATES_DEFAULT.examPublish.title);
  });
});
