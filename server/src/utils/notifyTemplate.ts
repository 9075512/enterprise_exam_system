/**
 * 通知模板（v1.7④ S3）—— 事件文案的默认值与渲染。
 *
 * 设计：
 *  - 每个通知事件对应一个 `NotifyTemplateKey`，模板含 `title` / `content`；
 *  - 正文支持 `{变量}` 占位，渲染时用实际值替换，未提供的变量替换为空串；
 *  - 默认值与「引入模板功能之前」的硬编码文案逐字一致（行为不变）；
 *  - 前端 `src/constants/index.ts` 保存同名的 `NOTIFY_TEMPLATES_DEFAULT` 与
 *    `NOTIFY_TEMPLATE_META`（跨端约定，双份同步）。
 */
import type { NotifyTemplate, NotifyTemplateKey, NotifyTemplates } from '../types/domain.js';

/** 模板标题长度上限。 */
export const NOTIFY_TITLE_MAX = 120;
/** 模板正文长度上限。 */
export const NOTIFY_CONTENT_MAX = 500;

/** 全部模板默认值（键序即前端编辑区展示顺序）。 */
export const NOTIFY_TEMPLATES_DEFAULT: NotifyTemplates = {
  examPublish: {
    title: '新考试发布：{examName}',
    content: '你有一个新的考试「{examName}」，请留意考试时间并准时参加。',
  },
  resultPending: {
    title: '答卷已提交，待阅卷：{examName}',
    content: '你已提交「{examName}」的答卷，含主观题，待人工阅卷后公布最终成绩。',
  },
  resultPublished: {
    title: '考试成绩已发布：{examName}',
    content: '你的考试成绩为 {score} 分，{passedText}。',
  },
  reviewDone: {
    title: '阅卷完成：{examName}',
    content: '你「{examName}」的答卷已完成阅卷，最终成绩 {score} 分，{passedText}。',
  },
  retakeApproved: {
    title: '补考申请已通过',
    content: '你申请的「{examName}」补考已通过，请重新进入考试完成补考。',
  },
  retakeRejected: {
    title: '补考申请被驳回',
    content: '你申请的「{examName}」补考被驳回，原因：{reason}',
  },
  appealApproved: {
    title: '成绩复核已通过：{examName}',
    content: '你的成绩复核已通过，成绩由 {originalScore} 分调整为 {newScore} 分，{passedText}。{comment}',
  },
  appealRejected: {
    title: '成绩复核未通过：{examName}',
    content: '你的成绩复核申请未通过，原成绩保持不变。复核意见：{comment}',
  },
  twoFactorReset: {
    title: '两步验证已被重置',
    content: '你的账号（{username}）的两步验证已由管理员重置，请使用登录密码重新登录，并尽快在「账号安全」中重新开启两步验证。',
  },
};

/**
 * 模板键 → 可用变量说明（供前端展示；与渲染调用方传入的变量保持一致）。
 * `label` 用于前端「变量」提示，`vars` 为该事件支持的变量名列表。
 */
export const NOTIFY_TEMPLATE_META: Array<{
  key: NotifyTemplateKey;
  label: string;
  vars: string[];
}> = [
  { key: 'examPublish', label: '考试发布通知', vars: ['examName'] },
  { key: 'resultPending', label: '交卷待阅卷通知', vars: ['examName'] },
  { key: 'resultPublished', label: '成绩发布通知', vars: ['examName', 'score', 'passedText'] },
  { key: 'reviewDone', label: '阅卷完成通知', vars: ['examName', 'score', 'passedText'] },
  { key: 'retakeApproved', label: '补考通过通知', vars: ['examName'] },
  { key: 'retakeRejected', label: '补考驳回通知', vars: ['examName', 'reason'] },
  {
    key: 'appealApproved',
    label: '复核通过通知',
    vars: ['examName', 'originalScore', 'newScore', 'passedText', 'comment'],
  },
  { key: 'appealRejected', label: '复核驳回通知', vars: ['examName', 'comment'] },
  { key: 'twoFactorReset', label: '两步验证重置通知', vars: ['username'] },
];

/** 全部模板键（按展示顺序）。 */
export const NOTIFY_TEMPLATE_KEYS: readonly NotifyTemplateKey[] = NOTIFY_TEMPLATE_META.map((m) => m.key);

/**
 * 渲染模板：`{var}` → 实际值。
 * 未提供的变量替换为空串；变量值中的 `$` 等特殊字符不会被二次解释（纯字符串替换）。
 */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** 取某事件的模板（缺失字段时回退默认值）。 */
export function pickTemplate(templates: Partial<NotifyTemplates> | undefined, key: NotifyTemplateKey): NotifyTemplate {
  const tpl = templates?.[key];
  const def = NOTIFY_TEMPLATES_DEFAULT[key];
  return {
    title: typeof tpl?.title === 'string' && tpl.title !== '' ? tpl.title : def.title,
    content: typeof tpl?.content === 'string' && tpl.content !== '' ? tpl.content : def.content,
  };
}

/** 渲染某事件的标题与正文（模板缺失时回退默认值）。 */
export function renderEvent(
  templates: Partial<NotifyTemplates> | undefined,
  key: NotifyTemplateKey,
  vars: Record<string, string | number>,
): { title: string; content: string } {
  const tpl = pickTemplate(templates, key);
  return {
    title: renderTemplate(tpl.title, vars).slice(0, NOTIFY_TITLE_MAX),
    content: renderTemplate(tpl.content, vars).slice(0, NOTIFY_CONTENT_MAX),
  };
}
