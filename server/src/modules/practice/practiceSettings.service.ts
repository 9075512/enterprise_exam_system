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
import type { PracticeConfigDto, PracticeSettings, QuestionType } from '../../types/domain.js';

/** 合法题型白名单（防止库中脏数据透出）。 */
const VALID_TYPES: readonly QuestionType[] = ['single', 'multiple', 'judge'];

/** 取布尔值（非布尔回退默认）。 */
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 取区间内整数（非整数 / 越界回退默认）。 */
function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** 归一化：补齐缺失字段、清洗越界/脏值，保证返回对象恒合法。 */
function normalize(raw: Partial<PracticeSettings>): PracticeSettings {
  const types = Array.isArray(raw.dailyTypes)
    ? [...new Set(raw.dailyTypes.filter((t): t is QuestionType => VALID_TYPES.includes(t)))]
    : DEFAULT_PRACTICE_SETTINGS.dailyTypes;

  const D = DEFAULT_PRACTICE_SETTINGS;

  // 单次题量上下限：各自校验后若次序颠倒，整体回退默认（避免出现 min>max 的非法组合）
  let sessionMinCount = intInRange(raw.sessionMinCount, 1, 100, D.sessionMinCount);
  let sessionMaxCount = intInRange(raw.sessionMaxCount, 1, 100, D.sessionMaxCount);
  if (sessionMinCount > sessionMaxCount) {
    sessionMinCount = D.sessionMinCount;
    sessionMaxCount = D.sessionMaxCount;
  }

  return {
    dailyEnabled: boolOr(raw.dailyEnabled, D.dailyEnabled),
    dailyQuestionCount: intInRange(raw.dailyQuestionCount, 1, 50, D.dailyQuestionCount),
    dailyTypes: types,
    dailyBankScope:
      raw.dailyBankScope === 'all' || raw.dailyBankScope === 'practiced'
        ? raw.dailyBankScope
        : D.dailyBankScope,
    favoriteLimit: intInRange(raw.favoriteLimit, 1, 2000, D.favoriteLimit),

    /* ---------------- v1.9⑤ ---------------- */
    defaultPracticeMode:
      raw.defaultPracticeMode === 'random' || raw.defaultPracticeMode === 'sequence'
        ? raw.defaultPracticeMode
        : D.defaultPracticeMode,
    sessionMinCount,
    sessionMaxCount,
    showAnswer: boolOr(raw.showAnswer, D.showAnswer),
    showAnalysis: boolOr(raw.showAnalysis, D.showAnalysis),
    dailyResetHour: intInRange(raw.dailyResetHour, 0, 23, D.dailyResetHour),
    dailyMinQuestionCount: intInRange(raw.dailyMinQuestionCount, 1, 50, D.dailyMinQuestionCount),
    wrongAutoRemoveStreak: intInRange(raw.wrongAutoRemoveStreak, 0, 20, D.wrongAutoRemoveStreak),
    reportEnabled: boolOr(raw.reportEnabled, D.reportEnabled),
    wrongBookEnabled: boolOr(raw.wrongBookEnabled, D.wrongBookEnabled),
    favoriteEnabled: boolOr(raw.favoriteEnabled, D.favoriteEnabled),

    /* ---------------- v2.0⑤ ---------------- */
    achievementEnabled: boolOr(raw.achievementEnabled, D.achievementEnabled),
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

/**
 * 读取**练题端公开配置**（`GET /api/practice/config`）：
 * 由完整 `PracticeSettings` 投影，仅暴露练题端 UI 需要的字段。
 * 练题实例（PRACTICE_ONLY）只读 `practice_settings`，因此本函数可在公网实例安全调用。
 */
export async function getPracticeConfig(): Promise<PracticeConfigDto> {
  const s = await getPracticeSettings();
  return {
    defaultPracticeMode: s.defaultPracticeMode,
    sessionMinCount: s.sessionMinCount,
    sessionMaxCount: s.sessionMaxCount,
    showAnswer: s.showAnswer,
    showAnalysis: s.showAnalysis,
    reportEnabled: s.reportEnabled,
    wrongBookEnabled: s.wrongBookEnabled,
    favoriteEnabled: s.favoriteEnabled,
    dailyEnabled: s.dailyEnabled,
    achievementEnabled: s.achievementEnabled,
  };
}
