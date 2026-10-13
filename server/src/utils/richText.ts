/**
 * 简答题富文本净化（**零依赖**，白名单重建）。
 *
 * 背景（v1.7③ S1）：简答题由「纯文本」升级为「富文本 + 图片作答」。作答内容
 * 可能在前端以 `v-html` 渲染（阅卷页 / 成绩明细），因此必须**在服务端**完成净化，
 * 前端渲染不得作为安全边界（见 PRD §9.3）。
 *
 * 策略（白名单而非黑名单）：
 * 1. 删除注释与「危险标签」整段内容（script/style/iframe/svg/... ）；
 * 2. 逐个标签重建：标签名不在白名单 → 丢弃标签、保留内部文本；
 * 3. 属性同样按白名单过滤（`on*` 事件属性因此天然被剔除）；
 * 4. `a[href]` 仅允许 http/https/mailto/tel 与站内相对地址，杜绝 `javascript:`；
 * 5. `img[src]` 仅允许 `data:image/*;base64,` 内联图片，并限制单图体积与图片数量；
 * 6. 输出长度上限，超限截断（未闭合标签由浏览器自动补全，无脚本风险）。
 */

/** 输出长度上限（字符） */
const DEFAULT_MAX_LENGTH = 20000;

/** 单次作答最多内联图片数 */
const DEFAULT_MAX_IMAGES = 3;

/** 单张内联图片体积上限（解码后字节） */
const DEFAULT_MAX_IMAGE_BYTES = 512 * 1024;

/** 允许保留的标签（其余标签丢弃、保留内部文本）。 */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'sub',
  'sup',
  'ol',
  'ul',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'code',
  'pre',
  'a',
  'img',
  'hr',
]);

/** 空元素（无闭合标签）。 */
const VOID_TAGS = new Set(['br', 'img', 'hr']);

/** 允许保留的属性（按标签）。 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'width', 'height']),
};

/** 需连同内容一并删除的危险标签（含成对标签）。 */
const DANGEROUS_PAIR =
  /<\s*(script|style|iframe|object|embed|svg|math|template|noscript|form|textarea|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

/** 需单独删除的危险标签（无内容 / 自闭合）。 */
const DANGEROUS_SINGLE =
  /<\s*\/?\s*(script|style|iframe|object|embed|svg|math|template|noscript|link|meta|base|form|input|button|textarea|select)\b[^>]*>/gi;

/** 标签匹配（属性区允许引号内出现 `>`）。 */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/** 属性匹配（`name` / `name="v"` / `name='v'` / `name=v`）。 */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** 净化参数。 */
export interface RichTextOptions {
  maxLength?: number;
  maxImages?: number;
  maxImageBytes?: number;
}

/** 数据 URI 图片：`data:image/<type>;base64,<payload>`。 */
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,([a-z0-9+/=\s]+)$/i;

/** `a[href]` 允许的地址形态。 */
const SAFE_LINK_RE = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/**
 * 解析并过滤 `img[src]`：非法 → 返回 ''（整张图片被丢弃）。
 * 体积按 base64 解码后估算（len * 3 / 4）。
 */
function sanitizeImageSrc(raw: string, maxImageBytes: number): string {
  const value = raw.trim();
  const match = DATA_IMAGE_RE.exec(value);
  if (!match) return '';
  const payload = match[2].replace(/\s+/g, '');
  const bytes = Math.floor((payload.length * 3) / 4);
  // base64 补位向上取整会略大于原始字节数，留 64 字节容差避免边界误杀
  if (bytes > maxImageBytes + 64) return '';
  return `data:image/${match[1].toLowerCase()};base64,${payload}`;
}

/** 解析并过滤 `a[href]`：非法 → 返回 ''。 */
function sanitizeLinkHref(raw: string): string {
  const value = raw.trim();
  if (!value || !SAFE_LINK_RE.test(value)) return '';
  return value;
}

/** 像素尺寸归一（仅接受 1~2000 的整数）。 */
function sanitizeDimension(raw: string): string {
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 2000) return '';
  return String(n);
}

/** 构造单个标签的属性串（按白名单过滤）。 */
function buildAttrs(tag: string, rawAttrs: string, opts: Required<RichTextOptions>): string | null {
  const allowed = ALLOWED_ATTRS[tag];
  const out: string[] = [];
  let src = '';
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase();
    if (!allowed || !allowed.has(name)) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (name === 'src') {
      src = sanitizeImageSrc(value, opts.maxImageBytes);
      if (!src) return null; // 图片来源非法 → 丢弃整张图片
      continue;
    }
    if (name === 'href') {
      const href = sanitizeLinkHref(value);
      if (href) out.push(`href="${escapeAttr(href)}"`);
      continue;
    }
    if (name === 'width' || name === 'height') {
      const dim = sanitizeDimension(value);
      if (dim) out.push(`${name}="${dim}"`);
      continue;
    }
    out.push(`${name}="${escapeAttr(value)}"`);
  }
  if (tag === 'img') {
    if (!src) return null;
    return ` src="${escapeAttr(src)}"${out.length > 0 ? ` ${out.join(' ')}` : ''}`;
  }
  return out.length > 0 ? ` ${out.join(' ')}` : '';
}

/** 属性值转义（防属性注入）。 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 净化富文本（幂等：重复调用结果稳定）。
 *
 * @param input 原始 HTML（编辑器 innerHTML / 用户提交内容）
 * @param options 长度与图片限制
 * @returns 仅含白名单标签与属性的安全 HTML
 */
export function sanitizeRichText(input: unknown, options: RichTextOptions = {}): string {
  const opts: Required<RichTextOptions> = {
    maxLength: options.maxLength ?? DEFAULT_MAX_LENGTH,
    maxImages: options.maxImages ?? DEFAULT_MAX_IMAGES,
    maxImageBytes: options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
  };

  let html = String(input ?? '');
  if (html === '') return '';
  // 原始输入先做长度兜底，避免超长 payload 参与后续正则
  if (html.length > opts.maxLength * 4) html = html.slice(0, opts.maxLength * 4);

  // 1. 注释与危险标签
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(DANGEROUS_PAIR, '');
  html = html.replace(DANGEROUS_SINGLE, '');

  // 2. 逐标签重建（白名单）
  let imageCount = 0;
  html = html.replace(TAG_RE, (_full, closing: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    if (tag === 'img') {
      if (imageCount >= opts.maxImages) return '';
      const attrs = buildAttrs(tag, rawAttrs, opts);
      if (attrs === null) return '';
      imageCount += 1;
      return `<img${attrs}>`;
    }
    const attrs = buildAttrs(tag, rawAttrs, opts);
    if (attrs === null) return '';
    return `<${tag}${attrs}>`;
  });

  // 3. 长度上限（未闭合标签由浏览器容错补全）
  if (html.length > opts.maxLength) html = html.slice(0, opts.maxLength);

  return html;
}

/** 富文本是否为空（含仅 `<br>`/空白/`&nbsp;` 的情况；仅含图片视为非空）。 */
export function isRichTextEmpty(input: unknown): boolean {
  const html = String(input ?? '');
  if (html.trim() === '') return true;
  if (/<img\b/i.test(html)) return false;
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z#0-9]+;/gi, '')
    .trim();
  return text === '';
}

export const RICH_TEXT_LIMITS = {
  maxLength: DEFAULT_MAX_LENGTH,
  maxImages: DEFAULT_MAX_IMAGES,
  maxImageBytes: DEFAULT_MAX_IMAGE_BYTES,
};
