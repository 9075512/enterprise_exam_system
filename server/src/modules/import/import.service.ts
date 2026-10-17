/**
 * 导入模块 —— 业务逻辑层。
 * preview：解析 + 逐行校验；commit：单事务写入成功行 + 写 import_batches（P1）。
 */
import * as repo from './import.repo.js';
import type { BatchRow } from './import.repo.js';
import * as banksRepo from '../banks/banks.repo.js';
import * as bankAuth from '../banks/bankAuth.js';
import type { Operator } from '../banks/bankAuth.js';
import * as questionsRepo from '../questions/questions.repo.js';
import { normalizeQuestion } from '../questions/questions.service.js';
import { withTransaction } from '../../db/pool.js';
import { fileInvalid, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { questionFingerprint } from '../../utils/questionFingerprint.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { parseQuestionWorkbook } from '../../utils/excel.js';
import { getSettings } from '../settings/settings.service.js';
import type { BatchDto, CommitResult, Page, PreviewResult, RowIssue } from '../../types/domain.js';

/** 行 → 批次 DTO。 */
function mapBatchRow(row: BatchRow): BatchDto {
  return {
    id: row.id,
    bankId: row.bank_id,
    fileName: row.file_name,
    totalRows: Number(row.total_rows),
    successCount: Number(row.success_count),
    failCount: Number(row.fail_count),
    errors: parseJsonColumn<RowIssue[]>(row.errors_json, []),
    operatorId: row.operator_id,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 解析预览：使用目标题库名称作为科目默认值，逐行校验（author 需授权）。 */
export async function preview(buffer: Buffer, bankId: string, operator: Operator): Promise<PreviewResult> {
  const bank = await banksRepo.findById(bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(bankId, operator);

  const result = await parseQuestionWorkbook(buffer, bank.name);
  const settings = await getSettings();
  if (result.totalRows > settings.importMaxRows) {
    throw fileInvalid(`单次导入不得超过 ${settings.importMaxRows} 行（当前共 ${result.totalRows} 行）`);
  }
  return result;
}

/**
 * 确认导入：单事务写入成功行 + 写导入批次。
 * 信任 preview 回传的 validRows，但服务端再校验一遍关键字段以防篡改。
 *
 * `dedupe=true`（v1.8⑤ U5）时按内容指纹去重：目标题库已存在「题型+题干+选项+答案」完全相同的题目
 * → **跳过建行**（复用既有题目），计入 `reused`；同批内重复同样只建一行。默认关闭（行为不变）。
 */
export async function commit(
  input: {
    bankId: string;
    fileName: string;
    validRows: Array<{
      row: number;
      type: 'single' | 'multiple' | 'judge';
      stem: string;
      options: string[];
      answer: number[];
      defaultScore: number;
      analysis: string;
      subject: string;
    }>;
    errors: RowIssue[];
    dedupe?: boolean;
  },
  operator: Operator,
): Promise<CommitResult> {
  const bank = await banksRepo.findById(input.bankId);
  if (!bank) throw notFound('题库不存在或已被删除');
  await bankAuth.assertBankAccess(input.bankId, operator);

  const batchId = genId('batch-');
  const totalRows = input.validRows.length + input.errors.length;
  const failIssues: RowIssue[] = [...input.errors];
  const dedupe = input.dedupe === true;
  let successCount = 0;
  let reusedCount = 0;
  let failCount = input.errors.length;

  await withTransaction(async (conn) => {
    // 去重基准：目标题库既有题目的内容指纹（含本批已新建的）
    const fingerprints = new Set<string>();
    if (dedupe) {
      const existing = await questionsRepo.listAllByBank(input.bankId, conn);
      for (const r of existing) {
        fingerprints.add(
          questionFingerprint({
            type: r.type,
            stem: r.stem,
            options: parseJsonColumn<string[]>(r.options, []),
            answer: parseJsonColumn<number[] | string[]>(r.answer, []),
          }),
        );
      }
    }

    for (const vr of input.validRows) {
      try {
        // 服务端二次校验（防篡改）
        const normalized = normalizeQuestion(vr);
        if (dedupe) {
          const fingerprint = questionFingerprint({
            type: normalized.type,
            stem: normalized.stem,
            options: normalized.options,
            answer: normalized.answer,
          });
          if (fingerprints.has(fingerprint)) {
            reusedCount += 1;
            continue;
          }
          fingerprints.add(fingerprint);
        }
        await questionsRepo.insert(
          {
            id: genId('q-'),
            bankId: input.bankId,
            ...normalized,
            subject: bank.name,
            subjectId: bank.id,
            createdBy: operator.id,
            createdAt: nowDb(),
          },
          conn,
        );
        successCount += 1;
      } catch (err) {
        failCount += 1;
        failIssues.push({
          row: vr.row,
          column: '',
          value: '',
          reason: err instanceof Error ? err.message : '该行数据不合法',
        });
      }
    }

    await repo.insertBatch(
      {
        id: batchId,
        bankId: input.bankId,
        fileName: input.fileName || '',
        totalRows,
        successCount,
        failCount,
        errors: failIssues,
        operatorId: operator.id,
        createdAt: nowDb(),
      },
      conn,
    );
  });

  return { batchId, successCount, failCount, totalRows, reused: reusedCount };
}

/** 导入批次历史（分页）。 */
export async function listBatches(
  filter: { bankId?: string },
  page?: number,
  pageSize?: number,
): Promise<Page<BatchDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([
    repo.listBatches(filter, paging),
    repo.countBatches(filter),
  ]);
  return buildPage(rows.map(mapBatchRow), total, paging.page, paging.pageSize);
}
