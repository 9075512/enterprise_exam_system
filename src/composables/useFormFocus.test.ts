/**
 * 表单错误聚焦护栏测试（对应 src/composables/useFormFocus.ts）
 *
 * 设计规范 §9.3：校验失败需「聚焦第一个错误项」。
 * 这里覆盖三个易错点：取第一个、跳过隐藏标签页里的、无错误项时不抛错。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { focusFirstFormError } from './useFormFocus';

function buildForm(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('useFormFocus · 表单错误聚焦', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('聚焦第一个错误项内的可交互控件', async () => {
    const root = buildForm(`
      <div class="el-form-item is-error"><input id="a" /></div>
      <div class="el-form-item is-error"><input id="b" /></div>
    `);
    const ok = await focusFirstFormError(root);
    expect(ok).toBe(true);
    expect(document.activeElement?.id).toBe('a');
  });

  it('跳过隐藏（display:none）标签页里的错误项，聚焦到可见项', async () => {
    const root = buildForm(`
      <div class="el-form-item is-error" style="display: none"><input id="hidden" /></div>
      <div class="el-form-item is-error"><input id="visible" /></div>
    `);
    const ok = await focusFirstFormError(root);
    expect(ok).toBe(true);
    expect(document.activeElement?.id).toBe('visible');
  });

  it('错误项内是 textarea 时也能聚焦', async () => {
    const root = buildForm(`<div class="el-form-item is-error"><textarea id="t"></textarea></div>`);
    await focusFirstFormError(root);
    expect(document.activeElement?.id).toBe('t');
  });

  it('没有错误项时返回 false 且不抛错', async () => {
    const root = buildForm('<div class="el-form-item"></div>');
    await expect(focusFirstFormError(root)).resolves.toBe(false);
  });

  it('错误项内无表单控件时返回 true 但不抛错', async () => {
    const root = buildForm('<div class="el-form-item is-error"><span>必填</span></div>');
    await expect(focusFirstFormError(root)).resolves.toBe(true);
  });
});
