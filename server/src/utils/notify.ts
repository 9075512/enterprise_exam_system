/**
 * 通知服务（站内信 + 邮件）—— 事件触发统一入口。
 *
 * 各事件（考试发布 / 成绩 / 补考审批）调用 `notifyUsers()`，内部按系统设置分派：
 *  - `notifySiteEnabled` → 写站内信（notifications 表）
 *  - `notifyEmailEnabled` 且 SMTP 已配置 → 异步发邮件（nodemailer，失败静默降级）
 *
 * 原则：通知失败绝不阻断主流程（fail-open）。
 */
import { getSettings } from '../modules/settings/settings.service.js';
import * as notificationsService from '../modules/notifications/notifications.service.js';
import * as usersRepo from '../modules/users/users.repo.js';
import { renderEvent } from './notifyTemplate.js';
import type { NotifyTemplateKey, SystemSettings } from '../types/domain.js';

export interface NotifyPayload {
  type: string;
  title: string;
  content: string;
}

/** 事件 key → 站内信 type 分类（与前端图标/筛选口径一致）。 */
const EVENT_TYPE: Record<NotifyTemplateKey, string> = {
  examPublish: 'publish',
  resultPending: 'result',
  resultPublished: 'result',
  reviewDone: 'result',
  retakeApproved: 'retake',
  retakeRejected: 'retake',
  appealApproved: 'appeal',
  appealRejected: 'appeal',
};

/** 事件 key → 对应的系统设置开关（null = 无独立开关，恒发送）。 */
const EVENT_GATE: Record<NotifyTemplateKey, keyof SystemSettings | null> = {
  examPublish: 'notifyOnPublish',
  resultPending: 'notifyOnResult',
  resultPublished: 'notifyOnResult',
  reviewDone: 'notifyOnResult',
  retakeApproved: 'notifyOnRetake',
  retakeRejected: 'notifyOnRetake',
  appealApproved: null,
  appealRejected: null,
};

/** 邮件传输器缓存（按 SMTP 配置生成；配置变更后下次调用重建）。 */
let cachedKey = '';
let cachedTransporter: { sendMail(mail: unknown): Promise<unknown> } | null = null;

async function getTransporter(
  settings: SystemSettings,
): Promise<{ sendMail(mail: unknown): Promise<unknown> } | null> {
  const key = `${settings.smtpHost}:${settings.smtpPort}:${settings.smtpSecure}:${settings.smtpUser}`;
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  cachedTransporter = null;
  cachedKey = key;
  try {
    const nodemailer = (await import('nodemailer')).default;
    cachedTransporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth:
        settings.smtpUser || settings.smtpPass
          ? { user: settings.smtpUser, pass: settings.smtpPass }
          : undefined,
    });
  } catch (err) {
    console.warn('[notify] nodemailer 加载失败，邮件通知降级为仅站内信：', err);
  }
  return cachedTransporter;
}

/** 发送邮件（失败静默降级，不抛错）。 */
async function sendEmails(
  settings: SystemSettings,
  recipients: Array<{ email: string | null }>,
  subject: string,
  text: string,
): Promise<void> {
  const targets = recipients.filter((r) => r.email && r.email.includes('@'));
  if (targets.length === 0) return;
  const transporter = await getTransporter(settings);
  if (!transporter || !settings.smtpFrom) return;
  try {
    await transporter.sendMail({
      from: settings.smtpFrom,
      to: targets.map((t) => t.email as string).join(','),
      subject,
      text,
    });
  } catch (err) {
    console.warn('[notify] 邮件发送失败（已降级，不影响主流程）：', err instanceof Error ? err.message : err);
  }
}

/** 向一组用户发送通知（站内信 + 可选邮件）。fail-open：任何失败都不上抛。 */
export async function notifyUsers(userIds: string[], payload: NotifyPayload): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const settings = await getSettings();

    if (settings.notifySiteEnabled) {
      await notificationsService.enqueue(userIds, payload.type, payload.title, payload.content);
    }

    if (settings.notifyEmailEnabled && settings.smtpHost) {
      const rows = await usersRepo.findEmailsByIds(userIds);
      await sendEmails(settings, rows, payload.title, payload.content);
    }
  } catch (err) {
    console.warn('[notify] 通知发送失败（已降级，不影响主流程）：', err instanceof Error ? err.message : err);
  }
}

/**
 * 按事件发送通知（v1.7④ S3）：读取可配置模板 → 渲染 → 交由 `notifyUsers` 分派。
 *
 * - 事件开关（notifyOnPublish / notifyOnResult / notifyOnRetake）关闭时直接跳过；
 * - 模板文案由系统设置 `notifyTemplates` 提供，缺失/空串回退内置默认文案；
 * - fail-open：任何异常仅打印日志，绝不上抛。
 */
export async function notifyEvent(
  key: NotifyTemplateKey,
  userIds: string[],
  vars: Record<string, string | number>,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const settings = await getSettings();
    const gate = EVENT_GATE[key];
    if (gate && settings[gate] === false) return;
    const { title, content } = renderEvent(settings.notifyTemplates, key, vars);
    await notifyUsers(userIds, { type: EVENT_TYPE[key], title, content });
  } catch (err) {
    console.warn('[notify] 事件通知失败（已降级，不影响主流程）：', err instanceof Error ? err.message : err);
  }
}
