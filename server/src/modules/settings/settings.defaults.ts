/**
 * 系统设置默认值（单一事实来源之一）。
 *
 * 与前端 `src/constants/settings.ts` 的 `SETTINGS_DEFAULTS` 保持一致（跨端约定），
 * 默认值与「引入设置功能之前」的硬编码行为完全一致，
 * 保证后端不可用或设置未初始化时系统表现不变。
 */
import type { SystemSettings } from '../../types/domain.js';
import { NOTIFY_TEMPLATES_DEFAULT } from '../../utils/notifyTemplate.js';

/** 全部设置的默认值。 */
export const DEFAULT_SETTINGS: SystemSettings = {
  examDefaultDuration: 60,
  examDefaultPassScore: 60,
  examDefaultMaxAttempts: 1,
  cheatCountThreshold: 3,
  cheatSecondsThreshold: 120,
  cheatAutoSubmitEnabled: false,
  cheatWatermarkEnabled: true,
  cheatCopyGuardEnabled: true,
  shuffleDefaultEnabled: false,
  shuffleOptionsDefault: true,
  loginLockEnabled: true,
  loginMaxFails: 5,
  loginLockMinutes: 15,
  loginCaptchaAfterFails: 3,
  countdownWarningMinutes: 5,
  defaultPassword: '123456',
  minPasswordLength: 6,
  passwordRequireUpper: false,
  passwordRequireLower: false,
  passwordRequireDigit: false,
  passwordRequireSymbol: false,
  passwordExpireDays: 0,
  twoFactorAvailable: true,
  defaultPageSize: 20,
  importMaxRows: 2000,
  importMaxFileMb: 5,
  systemName: '企业内部在线考试系统',
  systemShortName: '在线考试系统',
  loginSlogan: '让考核更简单，让能力看得见。',
  copyright: '© 2026 Enterprise Exam System',
  retakeDefaultEnabled: false,
  appealEnabled: true,
  appealWindowDays: 7,
  auditRetentionDays: 180,
  archiveRetentionDays: 0,
  archiveAutoEnabled: false,
  archiveAutoHour: 3,
  monitorPushEnabled: true,
  monitorPushIntervalSeconds: 5,
  richTextImageMaxMb: 2,
  richTextImageMaxCount: 3,
  notifySiteEnabled: true,
  notifyEmailEnabled: false,
  notifyOnPublish: true,
  notifyOnResult: true,
  notifyOnRetake: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  notifyTemplates: NOTIFY_TEMPLATES_DEFAULT,
};
