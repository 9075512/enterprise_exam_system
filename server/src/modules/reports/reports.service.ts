/**
 * 报表模块 —— 业务逻辑层。
 * 数据源 = 该场 status='submitted' 的记录；聚合逻辑照搬 v1.0 statisticsService。
 */
import * as repo from './reports.repo.js';
import { mapRecordRow, mapRecordDetailRow } from '../records/records.mapper.js';
import { isAnswerCorrect } from '../records/records.service.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { buildExportBuffer } from '../../utils/excelExport.js';
import type { ExportColumn } from '../../utils/excelExport.js';
import {
  DEFAULT_SCORE_EXPORT_KEYS,
  SCORE_EXPORT_COLUMNS,
  SCORE_EXPORT_KEYS,
} from './reports.columns.js';
import type { ScoreExportRow } from './reports.columns.js';
import type { ScoreExportRawRow } from './reports.repo.js';
import type { BandItem, DeptItem, ExamRecordDto, ExamSummary, ReportDto, WrongItem } from '../../types/domain.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 单场考试摘要：人数/平均分/最高/最低/及格率。 */
function buildSummary(examId: string, records: ExamRecordDto[], passScore: number): ExamSummary {
  if (records.length === 0) {
    return { examId, total: 0, avgScore: 0, maxScore: 0, minScore: 0, passRate: 0 };
  }
  const scores = records.map((r) => r.score);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const passCount = scores.filter((s) => s >= passScore).length;
  return {
    examId,
    total: records.length,
    avgScore: round1(avg),
    maxScore: round1(Math.max(...scores)),
    minScore: round1(Math.min(...scores)),
    passRate: round1(passCount / records.length),
  };
}

/** 分数段分布（固定五段：<60 / 60~69 / 70~79 / 80~89 / ≥90）。 */
function buildBands(records: ExamRecordDto[]): BandItem[] {
  const bands: BandItem[] = [
    { label: '不及格（<60）', count: 0 },
    { label: '60~69 分', count: 0 },
    { label: '70~79 分', count: 0 },
    { label: '80~89 分', count: 0 },
    { label: '90 分及以上', count: 0 },
  ];
  for (const r of records) {
    const s = r.score;
    if (s < 60) bands[0].count += 1;
    else if (s < 70) bands[1].count += 1;
    else if (s < 80) bands[2].count += 1;
    else if (s < 90) bands[3].count += 1;
    else bands[4].count += 1;
  }
  return bands;
}

/** 科室对比：各科室人数/平均分/及格率，按平均分降序。 */
async function buildDepartments(records: ExamRecordDto[], passScore: number): Promise<DeptItem[]> {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    const arr = groups.get(r.departmentId) ?? [];
    arr.push(r.score);
    groups.set(r.departmentId, arr);
  }
  const items: DeptItem[] = [];
  for (const [departmentId, scores] of groups) {
    const dept = departmentId ? await repo.findDepartment(departmentId) : null;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const passCount = scores.filter((s) => s >= passScore).length;
    items.push({
      departmentId,
      departmentName: dept?.name ?? '未知科室',
      count: scores.length,
      avgScore: round1(avg),
      passRate: round1(passCount / scores.length),
    });
  }
  return items.sort((a, b) => b.avgScore - a.avgScore);
}

/** 错题率排行（按错误率降序、同率按错误人数降序）：基于快照题目逐题统计。 */
function buildWrongRate(records: ExamRecordDto[]): WrongItem[] {
  if (records.length === 0) return [];
  const snapshot = records[0].paperSnapshot;
  const totalAnswered = records.length;
  const items: WrongItem[] = snapshot.questions.map((sq) => {
    const wrongCount = records.filter((r) => !isAnswerCorrect(sq.question, r.answers[sq.questionId])).length;
    return {
      questionId: sq.questionId,
      stem: sq.question.stem,
      wrongCount,
      totalAnswered,
      wrongRate: round1(wrongCount / totalAnswered),
    };
  });
  return items.sort((a, b) => b.wrongRate - a.wrongRate || b.wrongCount - a.wrongCount);
}

/** 报表聚合（四段）。 */
export async function getReport(examId: string): Promise<ReportDto> {
  const examRow = await repo.findExam(examId);
  if (!examRow) throw notFound('考试不存在或已被删除');
  const passScore = Number(examRow.pass_score);

  const records = (await repo.listLatestSubmittedByExam(examId)).map(mapRecordRow);

  const summary = buildSummary(examId, records, passScore);
  const bands = buildBands(records);
  const departments = await buildDepartments(records, passScore);
  const wrongRate = buildWrongRate(records);

  return { summary, bands, departments, wrongRate };
}

/* ============================ 成绩明细导出 ============================ */

/** 默认时区偏移（东八区，分钟）；前端每次都会显式传 tzOffset，仅作兜底。 */
const DEFAULT_TZ_OFFSET = 480;

/** 导出结果：文件内容 + 建议文件名 + 数据行数。 */
export interface ScoreExportResult {
  buffer: Buffer;
  filename: string;
  rowCount: number;
}

/** 数字补零到 2 位。 */
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 把 ISO(UTC) 时间按给定时区偏移格式化为 'YYYY-MM-DD HH:mm'。
 *
 * 库里存的是 UTC 墙钟；偏移后必须用 `getUTC*` 系列读「本地墙钟」，
 * 否则会被服务器进程时区二次污染。空值/非法值返回 ''。
 */
export function formatLocal(iso: string | null, tzOffsetMinutes: number): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms + tzOffsetMinutes * 60000);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    ` ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  );
}

/** 文件名安全化：替换 Windows / URL 非法字符。 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * 解析导出列：
 * - `raw === undefined` → 默认列集（按定义顺序）；
 * - 否则逗号分隔 → trim → 过滤空串 → Set 去重（保留首次出现）；
 *   出现非白名单 key → 1001；去重后为空 → 1001。
 * 输出顺序恒等于 `SCORE_EXPORT_COLUMNS` 顺序（与勾选顺序无关）。
 */
function resolveExportColumns(raw?: string): Array<ExportColumn<ScoreExportRow>> {
  if (raw === undefined) {
    const defaults = new Set(DEFAULT_SCORE_EXPORT_KEYS);
    return SCORE_EXPORT_COLUMNS.filter((c) => defaults.has(c.key));
  }
  const picked = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key) picked.add(key);
  }
  if (picked.size === 0) throw badRequest('请至少选择一个导出字段');
  const unknown = [...picked].filter((k) => !SCORE_EXPORT_KEYS.has(k));
  if (unknown.length > 0) throw badRequest(`导出字段不合法：${unknown.join('、')}`);
  return SCORE_EXPORT_COLUMNS.filter((c) => picked.has(c.key));
}

/** 由原始行构造导出行（时间用本地偏移格式化；用时用原始 ISO 计算，不用格式化后的字符串）。 */
function buildExportRows(raws: ScoreExportRawRow[], tzOffsetMinutes: number): ScoreExportRow[] {
  return raws.map((row) => {
    const dto = mapRecordDetailRow(row);
    const passScore = dto.passScore ?? 0;
    const usedMinutes =
      dto.submittedAt && dto.startedAt
        ? Math.max(
            0,
            Math.round((new Date(dto.submittedAt).getTime() - new Date(dto.startedAt).getTime()) / 60000),
          )
        : null;
    const cheatSeconds = Math.round(
      dto.cheatEvents.reduce((sum, e) => sum + (e.awaySeconds ?? 0), 0),
    );
    return {
      userName: dto.userName ?? '',
      username: row.username ?? '',
      departmentName: dto.departmentName ?? '',
      attemptNo: dto.attemptNo,
      startedAt: formatLocal(dto.startedAt, tzOffsetMinutes),
      submittedAt: formatLocal(dto.submittedAt, tzOffsetMinutes),
      score: dto.score,
      passScore,
      passed: dto.score >= passScore,
      usedMinutes,
      cheatCount: dto.cheatEvents.length,
      cheatSeconds,
      autoSubmitted: dto.autoSubmitted,
    };
  });
}

/**
 * 导出某场考试的成绩明细为 .xlsx。
 * 人员范围：每位考生只取 attempt_no 最大的已交卷记录（一人一行）。
 * @param examId 考试 id
 * @param columns 逗号分隔的勾选列 key（省略 → 默认列集）
 * @param tzOffset 客户端时区偏移（分钟，东八区 = 480），省略 → 东八区兜底
 */
export async function exportScores(
  examId: string,
  columns?: string,
  tzOffset?: number,
): Promise<ScoreExportResult> {
  const tz = tzOffset ?? DEFAULT_TZ_OFFSET;
  const examRow = await repo.findExam(examId);
  if (!examRow) throw notFound('考试不存在或已被删除');

  const picked = resolveExportColumns(columns);
  const raws = await repo.listLatestSubmittedWithUser(examId);
  const rows = buildExportRows(raws, tz);

  const buffer = await buildExportBuffer([{ name: '成绩明细', columns: picked, rows }]);
  const stamp = formatLocal(new Date().toISOString(), tz).replace(/[-: ]/g, '');
  const filename = `${sanitizeFilename(examRow.name)}-成绩-${stamp}.xlsx`;
  return { buffer, filename, rowCount: rows.length };
}
