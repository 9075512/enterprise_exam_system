/**
 * 练题配置 —— 业务逻辑层（全局单例）。
 *
 * 读取：一律 `{ ...DEFAULT, ...库中 JSON }` 做默认值合并 + 归一化，
 *       保证旧数据缺字段（或整行缺失）时接口恒返回完整对象、练题端表现不变。
 * 写入：**仅内网实例（管理端）调用**；zod 校验失败 → 1001 中文文案。
 *
 * ⚠️ 隔离：本模块只读写练题域自有表 `practice_settings`，不依赖任何考试域表。
 */
import { ZodError } from 'zod';
import * as repo from './practiceSettings.repo.js';
import { DEFAULT_PRACTICE_SETTINGS } from './practiceSettings.defaults.js';
import { practiceSettingsSchema } from './practiceSettings.schema.js';
import { badRequest } from '../../utils/errors.js';
import { parseJsonColumn, toJsonColumn } from '../../utils/json.js';
import type { PracticeSettings, QuestionType } from '../../types/domain.js';

/** 合法题型白名单（防止库中脏数据透出）。 */
const VALID_TYPES: readonly QuestionType[] = ['single', 'multiple', 'judge'];

/** 归一化：补齐缺失字段、清洗越界/脏值，保证返回对象恒合法。 */
function normalize(raw: Partial<PracticeSettings>): PracticeSettings {
  const types = Array.isArray(raw.dailyTypes)
    ? [...new Set(raw.dailyTypes.filter((t): t is QuestionType => VALID_TYPES.includes(t)))]
    : DEFAULT_PRACTICE_SETTINGS.dailyTypes;

  const count = Number(raw.dailyQuestionCount);
  const limit = Number(raw.favoriteLimit);

  return {
    dailyEnabled:
      typeof raw.dailyEnabled === 'boolean' ? raw.dailyEnabled : DEFAULT_PRACTICE_SETTINGS.dailyEnabled,
    dailyQuestionCount:
      Number.isInteger(count) && count >= 1 && count <= 50 ? count : DEFAULT_PRACTICE_SETTINGS.dailyQuestionCount,
    dailyTypes: types,
    dailyBankScope:
      raw.dailyBankScope === 'all' || raw.dailyBankScope === 'practiced'
        ? raw.dailyBankScope
        : DEFAULT_PRACTICE_SETTINGS.dailyBankScope,
    favoriteLimit:
      Number.isInteger(limit) && limit >= 1 && limit <= 2000 ? limit : DEFAULT_PRACTICE_SETTINGS.favoriteLimit,
  };
}

/** 读取练题配置（缺字段自动补默认值 + 归一化）。 */
export async function getPracticeSettings(): Promise<PracticeSettings> {
  const row = await repo.findRaw();
  const stored = parseJsonColumn<Partial<PracticeSettings>>(row?.settings, {});
  return normalize({ ...DEFAULT_PRACTICE_SETTINGS, ...stored });
}

/**
 * 更新练题配置：zod 校验（失败 → 1001 中文文案）→ 写库 → 返回保存后的配置。
 * 采用整体替换语义（PUT），入参须为完整对象。
 * @param operatorId 操作人（内网 admin 用户 id，落 `updated_by` 便于审计）
 */
export async function updatePracticeSettings(
  input: unknown,
  operatorId: string,
): Promise<PracticeSettings> {
  let parsed: PracticeSettings;
  try {
    parsed = practiceSettingsSchema.parse(input) as PracticeSettings;
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest(err.issues[0]?.message ?? '请求参数不合法');
    }
    throw err;
  }
  const normalized = normalize(parsed);
  await repo.saveRaw(toJsonColumn(normalized), operatorId);
  return normalized;
}
