/**
 * 系统设置 —— zod 校验 schema（完整对象，所有字段必填，中文文案）。
 *
 * 范围与文案与前端 `src/constants/settings.ts` 的校验口径保持一致；
 * 范围口径（越界 → 1001）：
 *   examDefaultDuration 1~600 / examDefaultPassScore 1~1000 / examDefaultMaxAttempts 1~10
 *   cheatCountThreshold 1~99 / cheatSecondsThreshold 5~3600 / countdownWarningMinutes 1~60
 *   defaultPassword 6~64 / minPasswordLength 6~32 / defaultPageSize 1~100
 *   importMaxRows 1~50000 / importMaxFileMb 1~50
 *   systemName 1~40 / systemShortName 1~40 / loginSlogan 0~80 / copyright 0~120
 */
import { z } from 'zod';

/** 完整系统设置校验（PUT /settings 入参，所有字段必填）。 */
export const settingsSchema = z.object({
  examDefaultDuration: z
    .number({ invalid_type_error: '考试默认时长必须为 1~600 分钟' })
    .int('考试默认时长必须为 1~600 分钟')
    .min(1, '考试默认时长必须为 1~600 分钟')
    .max(600, '考试默认时长必须为 1~600 分钟'),

  examDefaultPassScore: z
    .number({ invalid_type_error: '考试默认及格线必须为 1~1000' })
    .min(1, '考试默认及格线必须为 1~1000')
    .max(1000, '考试默认及格线必须为 1~1000'),

  examDefaultMaxAttempts: z
    .number({ invalid_type_error: '考试默认答题次数必须为 1~10' })
    .int('考试默认答题次数必须为 1~10')
    .min(1, '考试默认答题次数必须为 1~10')
    .max(10, '考试默认答题次数必须为 1~10'),

  cheatCountThreshold: z
    .number({ invalid_type_error: '切屏次数阈值必须为 1~99' })
    .int('切屏次数阈值必须为 1~99')
    .min(1, '切屏次数阈值必须为 1~99')
    .max(99, '切屏次数阈值必须为 1~99'),

  cheatSecondsThreshold: z
    .number({ invalid_type_error: '切屏累计秒数阈值必须为 5~3600' })
    .int('切屏累计秒数阈值必须为 5~3600')
    .min(5, '切屏累计秒数阈值必须为 5~3600')
    .max(3600, '切屏累计秒数阈值必须为 5~3600'),

  cheatAutoSubmitEnabled: z.boolean({ invalid_type_error: '切屏自动交卷开关必须为布尔值' }),

  cheatWatermarkEnabled: z.boolean({ invalid_type_error: '答题页浮水印开关必须为布尔值' }),

  cheatCopyGuardEnabled: z.boolean({ invalid_type_error: '答题页复制限制开关必须为布尔值' }),

  shuffleDefaultEnabled: z.boolean({ invalid_type_error: '人手一卷默认开关必须为布尔值' }),

  shuffleOptionsDefault: z.boolean({ invalid_type_error: '选项乱序默认开关必须为布尔值' }),

  loginLockEnabled: z.boolean({ invalid_type_error: '登录失败锁定开关必须为布尔值' }),

  loginMaxFails: z
    .number({ invalid_type_error: '登录失败锁定阈值必须为 1~20' })
    .int('登录失败锁定阈值必须为 1~20')
    .min(1, '登录失败锁定阈值必须为 1~20')
    .max(20, '登录失败锁定阈值必须为 1~20'),

  loginLockMinutes: z
    .number({ invalid_type_error: '登录锁定时长必须为 1~1440 分钟' })
    .int('登录锁定时长必须为 1~1440 分钟')
    .min(1, '登录锁定时长必须为 1~1440 分钟')
    .max(1440, '登录锁定时长必须为 1~1440 分钟'),

  countdownWarningMinutes: z
    .number({ invalid_type_error: '倒计时提醒分钟数必须为 1~60' })
    .int('倒计时提醒分钟数必须为 1~60')
    .min(1, '倒计时提醒分钟数必须为 1~60')
    .max(60, '倒计时提醒分钟数必须为 1~60'),

  defaultPassword: z
    .string({ invalid_type_error: '默认密码长度不能少于 6 位' })
    .min(6, '默认密码长度不能少于 6 位')
    .max(64, '默认密码长度不能超过 64 位'),

  minPasswordLength: z
    .number({ invalid_type_error: '密码最小长度必须为 6~32' })
    .int('密码最小长度必须为 6~32')
    .min(6, '密码最小长度必须为 6~32')
    .max(32, '密码最小长度必须为 6~32'),

  defaultPageSize: z
    .number({ invalid_type_error: '默认每页条数必须为 1~100' })
    .int('默认每页条数必须为 1~100')
    .min(1, '默认每页条数必须为 1~100')
    .max(100, '默认每页条数必须为 1~100'),

  importMaxRows: z
    .number({ invalid_type_error: '导入最大行数必须为 1~50000' })
    .int('导入最大行数必须为 1~50000')
    .min(1, '导入最大行数必须为 1~50000')
    .max(50000, '导入最大行数必须为 1~50000'),

  importMaxFileMb: z
    .number({ invalid_type_error: '导入文件大小上限必须为 1~50MB' })
    .int('导入文件大小上限必须为 1~50MB')
    .min(1, '导入文件大小上限必须为 1~50MB')
    .max(50, '导入文件大小上限必须为 1~50MB'),

  systemName: z
    .string({ invalid_type_error: '系统名称不能为空' })
    .min(1, '系统名称不能为空')
    .max(40, '系统名称长度不能超过 40 个字符'),

  systemShortName: z
    .string({ invalid_type_error: '系统简称不能为空' })
    .min(1, '系统简称不能为空')
    .max(40, '系统简称长度不能超过 40 个字符'),

  loginSlogan: z
    .string({ invalid_type_error: '登录页标语不能超过 80 个字符' })
    .max(80, '登录页标语不能超过 80 个字符'),

  copyright: z
    .string({ invalid_type_error: '版权信息不能超过 120 个字符' })
    .max(120, '版权信息不能超过 120 个字符'),

  retakeDefaultEnabled: z.boolean({ invalid_type_error: '补考申请默认开关必须为布尔值' }),

  appealEnabled: z.boolean({ invalid_type_error: '成绩复核默认开关必须为布尔值' }),

  appealWindowDays: z
    .number({ invalid_type_error: '成绩复核时限必须为 0~365 天' })
    .int('成绩复核时限必须为 0~365 天')
    .min(0, '成绩复核时限必须为 0~365 天')
    .max(365, '成绩复核时限必须为 0~365 天'),

  notifySiteEnabled: z.boolean({ invalid_type_error: '站内信通知开关必须为布尔值' }),
  notifyEmailEnabled: z.boolean({ invalid_type_error: '邮件通知开关必须为布尔值' }),
  notifyOnPublish: z.boolean({ invalid_type_error: '考试发布通知开关必须为布尔值' }),
  notifyOnResult: z.boolean({ invalid_type_error: '成绩通知开关必须为布尔值' }),
  notifyOnRetake: z.boolean({ invalid_type_error: '补考审批通知开关必须为布尔值' }),

  smtpHost: z
    .string({ invalid_type_error: 'SMTP 服务器地址不能超过 120 个字符' })
    .max(120, 'SMTP 服务器地址不能超过 120 个字符'),
  smtpPort: z
    .number({ invalid_type_error: 'SMTP 端口必须为 1~65535' })
    .int('SMTP 端口必须为 1~65535')
    .min(1, 'SMTP 端口必须为 1~65535')
    .max(65535, 'SMTP 端口必须为 1~65535'),
  smtpSecure: z.boolean({ invalid_type_error: 'SMTP 加密开关必须为布尔值' }),
  smtpUser: z
    .string({ invalid_type_error: 'SMTP 账号不能超过 120 个字符' })
    .max(120, 'SMTP 账号不能超过 120 个字符'),
  smtpPass: z
    .string({ invalid_type_error: 'SMTP 授权码不能超过 200 个字符' })
    .max(200, 'SMTP 授权码不能超过 200 个字符'),
  smtpFrom: z
    .string({ invalid_type_error: '发件人地址不能超过 120 个字符' })
    .max(120, '发件人地址不能超过 120 个字符'),
});

/** PUT /settings 入参类型（完整设置对象）。 */
export type SettingsInput = z.infer<typeof settingsSchema>;
