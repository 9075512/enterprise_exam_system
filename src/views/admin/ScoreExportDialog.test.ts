import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElCheckboxGroup, ElDialog, ElRadioGroup } from 'element-plus';
import ScoreExportDialog from './ScoreExportDialog.vue';
import { DEFAULT_SCORE_EXPORT_FIELDS, SCORE_EXPORT_FIELDS } from '@/constants';

const api = vi.hoisted(() => ({ excel: vi.fn(), pdf: vi.fn() }));
vi.mock('@/api/reports', () => ({ exportExamScores: api.excel, exportExamScoresPdf: api.pdf }));
let wrapper: VueWrapper;
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b => b.textContent?.trim() === text)!; }
async function open() {
  wrapper = mount(ScoreExportDialog, { attachTo: document.body, props: { modelValue: false, examId: 'e1', examName: '安全考试/含长名称ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, global: { plugins: [ElementPlus] } });
  await wrapper.setProps({ modelValue: true }); await flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks(); api.excel.mockResolvedValue(new Blob(['xlsx'])); api.pdf.mockResolvedValue(new Blob(['pdf']));
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:export-test'); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('成绩导出任务', () => {
  it('默认字段与当前考试完整展示，取消不产生导出请求', async () => {
    await open();
    expect(document.querySelector('.score-export__context')?.textContent).toContain('安全考试/含长名称ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual([...DEFAULT_SCORE_EXPORT_FIELDS]);
    expect(document.querySelector('.score-export__header-right .el-checkbox__input')?.classList.contains('is-indeterminate')).toBe(true);
    button('取消').click();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(api.excel).not.toHaveBeenCalled(); expect(api.pdf).not.toHaveBeenCalled();
  });

  it('全选和清空保留全部字段，空选择禁止导出', async () => {
    await open();
    const all = document.querySelector<HTMLInputElement>('.score-export__header-right input')!;
    all.click(); await flushPromises();
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(SCORE_EXPORT_FIELDS.map(field => field.key));
    all.click(); await flushPromises();
    expect(button('导出').disabled).toBe(true);
    expect(api.excel).not.toHaveBeenCalled();
  });

  it('PDF请求期间锁定选项和关闭，成功只下载一次且保留所选字段契约', async () => {
    await open();
    wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'pdf');
    wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['score', 'passScore']); await flushPromises();
    let finish!: (value: Blob) => void;
    api.pdf.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    button('导出').click(); button('导出').click(); await flushPromises();
    expect(api.pdf).toHaveBeenCalledTimes(1); expect(api.pdf).toHaveBeenCalledWith('e1', ['score', 'passScore']);
    expect(wrapper.getComponent(ElRadioGroup).props('disabled')).toBe(true);
    expect(wrapper.getComponent(ElCheckboxGroup).props('disabled')).toBe(true);
    wrapper.getComponent(ElDialog).vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    finish(new Blob(['pdf'])); await flushPromises();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('导出失败保留字段与格式，恢复后可以重试', async () => {
    api.excel.mockRejectedValueOnce(new Error('offline'));
    await open(); wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['name']); await flushPromises();
    button('导出').click(); await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['name']);
    expect(wrapper.getComponent(ElCheckboxGroup).props('disabled')).toBe(false);
    button('导出').click(); await flushPromises();
    expect(api.excel).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });
});
