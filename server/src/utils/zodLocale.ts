/**
 * 全局 zod 校验中文文案（errorMap）。
 *
 * 背景：zod 默认 errorMap 输出英文（如 "Expected number, received nan"）。
 * 本服务口径为「取首条中文错误」并直接透出给前端 `ElMessage`，因此必须保证
 * **任意类型** 的校验失败都落到中文，绝不能回落到 zod 英文默认值。
 *
 * 生效范围与优先级（zod 3.x 的 errorMap 链）：
 *   contextualErrorMap > schemaErrorMap（如 `z.enum(..., { errorMap })`、
 *   `z.number({ invalid_type_error })`）> 本全局 map > zod 内置英文 map。
 * 因此：字段级显式 message（如 `.min(1, 'xxx')`）与已有的 enum errorMap **优先级更高**，
 * 本文件只负责「兜底」，不会覆盖它们。
 *
 * 注册方式：本模块被 import 时立即调用 `z.setErrorMap(...)`；须在任何 `.parse()` 之前
 * 完成加载（见 `src/app.ts` 第 1 行 import）。请求期才 parse，模块加载期注册即可。
 */
import { z } from 'zod';

/** 无法识别的校验失败统一兜底文案（保证永远中文，绝不回落英文）。 */
const FALLBACK_MESSAGE = '参数不合法';

/** zod 类型标识 → 中文名称。 */
const TYPE_LABELS: Record<string, string> = {
  string: '字符串',
  number: '数字',
  nan: '数字',
  integer: '整数',
  float: '整数',
  boolean: '布尔值',
  bigint: '大整数',
  date: '日期',
  symbol: 'Symbol',
  function: '函数',
  undefined: '未定义',
  null: '空值',
  array: '数组',
  object: '对象',
  unknown: '未知类型',
  promise: 'Promise',
  void: '空',
  never: 'never',
  map: 'Map',
  set: 'Set',
};

/** 将 zod 类型标识转为中文名称（未知时原样返回）。 */
function typeLabel(type: unknown): string {
  const key = String(type);
  return TYPE_LABELS[key] ?? key;
}

/** 将数值/大整数统一转字符串（避免 TS 联合类型比较问题）。 */
function numText(value: unknown): string {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

z.setErrorMap((issue) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      const received = String(issue.received);
      if (received === 'nan') {
        return { message: '请输入数字' };
      }
      if (received === 'undefined' || received === 'null') {
        return { message: '该字段为必填项' };
      }
      return { message: `参数类型不正确，应为${typeLabel(issue.expected)}` };
    }

    case z.ZodIssueCode.too_small: {
      const type = String(issue.type);
      if (type === 'number' || type === 'bigint' || type === 'date') {
        return { message: `数值不能小于 ${numText(issue.minimum)}` };
      }
      if (type === 'array' || type === 'set') {
        return { message: `至少需要 ${numText(issue.minimum)} 项` };
      }
      return { message: `长度不能少于 ${numText(issue.minimum)}` };
    }

    case z.ZodIssueCode.too_big: {
      const type = String(issue.type);
      if (type === 'number' || type === 'bigint' || type === 'date') {
        return { message: `数值不能大于 ${numText(issue.maximum)}` };
      }
      if (type === 'array' || type === 'set') {
        return { message: `最多允许 ${numText(issue.maximum)} 项` };
      }
      return { message: `长度不能超过 ${numText(issue.maximum)}` };
    }

    case z.ZodIssueCode.invalid_enum_value:
      return { message: `取值不合法，仅支持：${issue.options.join('、')}` };

    case z.ZodIssueCode.invalid_string:
      return { message: '字符串格式不正确' };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `数值必须是 ${numText(issue.multipleOf)} 的整数倍` };

    case z.ZodIssueCode.not_finite:
      return { message: '数值必须为有限数' };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `存在未知字段：${issue.keys.join('、')}` };

    case z.ZodIssueCode.invalid_literal:
      return { message: `取值必须为 ${JSON.stringify(issue.expected)}` };

    case z.ZodIssueCode.invalid_date:
      return { message: '日期格式不正确' };

    case z.ZodIssueCode.invalid_union:
      return { message: '参数类型不匹配' };

    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: `可辨识联合类型取值不合法，仅支持：${issue.options.join('、')}` };

    case z.ZodIssueCode.invalid_intersection_types:
      return { message: '交叉类型校验失败' };

    default:
      return { message: FALLBACK_MESSAGE };
  }
});

/** 标记全局中文 errorMap 已注册（供测试断言加载顺序）。 */
export const ZOD_LOCALE_REGISTERED = true;
