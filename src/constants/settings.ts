/**
 * 系统设置默认值（单一事实来源之一）。
 *
 * 默认值必须与「引入设置功能之前」的硬编码行为完全一致，
 * 这样后端不可用或设置未初始化时，系统表现不变。
 * 后端 `server/src/modules/settings/settings.defaults.ts` 保存同一份默认值（跨端约定）。
 */
import type { PublicSettings, SystemSettings } from '@/types';
import {
  CHEAT_COUNT_THRESHOLD,
  CHEAT_SECONDS_THRESHOLD,
  COUNTDOWN_WARNING_MINUTES,
  DEFAULT_PASSWORD,
  IMPORT_MAX_FILE_MB,
  IMPORT_MAX_ROWS,
  NOTIFY_TEMPLATES_DEFAULT,
  PAGE_SIZE_DEFAULT,
} from './index';

/** 全部设置的默认值（数值类直接复用既有常量，保证单一来源） */
export const SETTINGS_DEFAULTS: SystemSettings = {
  examDefaultDuration: 60,
  examDefaultPassScore: 60,
  examDefaultMaxAttempts: 1,
  cheatCountThreshold: CHEAT_COUNT_THRESHOLD,
  cheatSecondsThreshold: CHEAT_SECONDS_THRESHOLD,
  cheatAutoSubmitEnabled: false,
  cheatWatermarkEnabled: true,
  cheatCopyGuardEnabled: true,
  shuffleDefaultEnabled: false,
  shuffleOptionsDefault: true,
  loginLockEnabled: true,
  loginMaxFails: 5,
  loginLockMinutes: 15,
  loginCaptchaAfterFails: 3,
  countdownWarningMinutes: COUNTDOWN_WARNING_MINUTES,
  defaultPassword: DEFAULT_PASSWORD,
  minPasswordLength: 6,
  passwordRequireUpper: false,
  passwordRequireLower: false,
  passwordRequireDigit: false,
  passwordRequireSymbol: false,
  passwordExpireDays: 0,
  twoFactorAvailable: true,
  defaultPageSize: PAGE_SIZE_DEFAULT,
  importMaxRows: IMPORT_MAX_ROWS,
  importMaxFileMb: IMPORT_MAX_FILE_MB,
  systemName: '企业内部在线考试系统',
  systemShortName: '在线考试系统',
  loginSlogan: '让考核更简单，让能力看得见。',
  copyright: '© 2026 Enterprise Exam System',
  retakeDefaultEnabled: false,
  appealEnabled: true,
  appealWindowDays: 7,
  auditRetentionDays: 180,
  notifySiteEnabled: true,
  notifyEmailEnabled: false,
  notifyOnPublish: true,
  notifyOnResult: true,
  notifyOnRetake: true,
  archiveRetentionDays: 0,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  notifyTemplates: NOTIFY_TEMPLATES_DEFAULT,
};

/** 公开设置的默认值 */
export const PUBLIC_SETTINGS_DEFAULTS: PublicSettings = {
  systemName: SETTINGS_DEFAULTS.systemName,
  systemShortName: SETTINGS_DEFAULTS.systemShortName,
  loginSlogan: SETTINGS_DEFAULTS.loginSlogan,
  copyright: SETTINGS_DEFAULTS.copyright,
};

/** 从完整设置中摘出公开部分 */
export function pickPublicSettings(settings: SystemSettings): PublicSettings {
  return {
    systemName: settings.systemName,
    systemShortName: settings.systemShortName,
    loginSlogan: settings.loginSlogan,
    copyright: settings.copyright,
  };
}
