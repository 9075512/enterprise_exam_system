/**
 * 系统设置模块 —— 业务逻辑层（全局单例）。
 *
 * 关键兼容性：读取时一律 `{ ...DEFAULT_SETTINGS, ...库中 JSON }` 做默认值合并，
 * 保证旧数据缺字段（或整行缺失）时自动补齐默认值，接口恒返回完整对象。
 */
import { ZodError } from 'zod';
import * as repo from './settings.repo.js';
import { DEFAULT_SETTINGS } from './settings.defaults.js';
import { settingsSchema, type SettingsInput } from './settings.schema.js';
import { badRequest } from '../../utils/errors.js';
import { parseJsonColumn, toJsonColumn } from '../../utils/json.js';
import { NOTIFY_TEMPLATE_KEYS, NOTIFY_TEMPLATES_DEFAULT } from '../../utils/notifyTemplate.js';
import type { NotifyTemplates, PublicSettings, SystemSettings } from '../../types/domain.js';

/**
 * 通知模板归一化（v1.7④ S3）：逐键合并默认值，空串不覆盖默认文案，
 * 保证旧数据缺字段、前端提交部分模板时行为与默认一致。
 */
function mergeTemplates(stored: unknown): NotifyTemplates {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const out: NotifyTemplates = { ...NOTIFY_TEMPLATES_DEFAULT };
  for (const key of NOTIFY_TEMPLATE_KEYS) {
    const item = src[key];
    if (!item || typeof item !== 'object') continue;
    const { title, content } = item as { title?: unknown; content?: unknown };
    const next = { ...out[key] };
    if (typeof title === 'string' && title.trim() !== '') next.title = title;
    if (typeof content === 'string' && content.trim() !== '') next.content = content;
    out[key] = next;
  }
  return out;
}

/** 读取完整设置（缺字段自动补默认值）。 */
export async function getSettings(): Promise<SystemSettings> {
  const row = await repo.findRaw();
  const stored = parseJsonColumn<Partial<SystemSettings>>(row?.settings, {});
  return { ...DEFAULT_SETTINGS, ...stored, notifyTemplates: mergeTemplates(stored.notifyTemplates) };
}

/** 公开设置：从完整设置中摘出登录页品牌所需 4 项。 */
export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  return {
    systemName: settings.systemName,
    systemShortName: settings.systemShortName,
    loginSlogan: settings.loginSlogan,
    copyright: settings.copyright,
  };
}

/**
 * 更新设置：zod 校验（失败 → 1001 中文文案）→ 写库 → 返回保存后的完整设置。
 * 采用整体替换语义（PUT），入参须为完整对象。
 */
export async function updateSettings(input: unknown, operatorId: string): Promise<SystemSettings> {
  let parsed: SettingsInput;
  try {
    parsed = settingsSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest(err.issues[0]?.message ?? '请求参数不合法');
    }
    throw err;
  }
  const normalized: SystemSettings = {
    ...parsed,
    bankCategories: parsed.bankCategories ?? (await getSettings()).bankCategories,
    notifyTemplates: mergeTemplates(parsed.notifyTemplates),
  };
  await repo.saveRaw(toJsonColumn(normalized), operatorId);
  return normalized;
}
