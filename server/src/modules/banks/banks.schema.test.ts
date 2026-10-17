import { describe, expect, it } from 'vitest';
import { bankCreateSchema, bankSchema } from './banks.schema.js';

describe('新增科目的练题默认值', () => {
  it('未指定开关时默认开放练题', () => {
    expect(bankCreateSchema.parse({ name: '新科目' }).allowPractice).toBe(true);
  });

  it('允许显式关闭练题，编辑请求沿用既有默认值', () => {
    expect(bankCreateSchema.parse({ name: '新科目', allowPractice: false }).allowPractice).toBe(false);
    expect(bankSchema.parse({ name: '原科目', allowPractice: false }).allowPractice).toBe(false);
    expect(bankSchema.parse({ name: '原科目' }).allowPractice).toBe(false);
  });
});
