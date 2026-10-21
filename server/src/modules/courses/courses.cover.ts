import type { CourseCoverInput } from './courses.schema.js';

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const units = (value: string) => Array.from(value).reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? 2 : /[MW@%#]/.test(char) ? 2 : /[A-Z]/.test(char) ? 1.5 : 1), 0);

function lines(value: string, limit: number, count: number): string[] {
  const total = units(value);
  if (count === 2 && total > limit && total <= limit * 2) {
    const chars = Array.from(value); let split = 0; let first = '';
    while (split < chars.length && units(first) < total / 2 && units(first + chars[split]) <= limit) first += chars[split++];
    const second = chars.slice(split).join('');
    if (units(second) <= limit) return [first.trimEnd(), second.trimStart()];
  }
  const result = [''];
  for (const char of Array.from(value)) {
    if (units(result.at(-1)! + char) > limit) {
      if (result.length === count) {
        let last = result.at(-1)!;
        while (units(last + '…') > limit) last = Array.from(last).slice(0, -1).join('');
        result[result.length - 1] = last.trimEnd() + '…';
        return result;
      }
      result.push('');
    }
    result[result.length - 1] += char;
  }
  return result;
}

/** Only escaped text and fixed template markup enter the SVG; no URLs, HTML or user styles. */
export function renderCourseCover(input: CourseCoverInput): string {
  const title = clean(input.title);
  const category = clean(input.category) || '在线课程';
  const instructor = clean(input.instructor);
  const accent = /瓦斯|燃气|爆炸/.test(category) ? '#fbbf24' : /水|通风/.test(category) ? '#38bdf8' : /煤仓|运输|机电/.test(category) ? '#fb923c' : '#34d399';
  const size = units(title) <= 24 ? 88 : units(title) <= 40 ? 76 : 64;
  const titleLines = lines(title, Math.floor(1100 / (size / 2)), 2);
  const firstY = titleLines.length === 1 ? 326 : 280;
  const subtitle = lines(category + ' · 专题学习', 64, 1)[0];
  const footer = lines(instructor ? '讲师 / 来源：' + instructor : '学有所获 · 每天进步一点', 76, 1)[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-labelledby="cover-title">
<title id="cover-title">${escapeXml(title)}</title>
<defs>
  <radialGradient id="glow" cx="95%" cy="20%" r="90%"><stop stop-color="${accent}" stop-opacity=".2"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="#ffffff" stroke-opacity=".06"/></pattern>
</defs>
<rect width="1280" height="720" fill="#0b1e32"/>
<rect width="1280" height="720" fill="url(#glow)"/>
<rect width="1280" height="720" fill="url(#grid)"/>
<g font-family="'Noto Sans SC','Microsoft YaHei','PingFang SC',sans-serif">
  <text x="72" y="100" fill="${accent}" font-size="25" letter-spacing="4">课程学习 · 学习中心</text>
  <text fill="#ffffff" font-size="${size}" font-weight="700">${titleLines.map((line, index) => `<tspan x="72" y="${firstY + index * (size + 24)}" textLength="${Math.min(1100, units(line) * size / 2)}" lengthAdjust="spacingAndGlyphs">${escapeXml(line)}</tspan>`).join('')}</text>
  <text x="72" y="474" fill="#c5d5e2" font-size="30">${escapeXml(subtitle)}</text>
  <path d="M72 522 H180" stroke="${accent}" stroke-width="5"/>
  <text x="72" y="642" fill="#a8bfce" font-size="23">${escapeXml(footer)}</text>
  <text x="1208" y="642" text-anchor="end" fill="${accent}" fill-opacity=".75" font-size="32" font-weight="700">COURSE</text>
</g>
</svg>`;
}
