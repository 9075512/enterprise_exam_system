import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElSwitch, ElUpload } from 'element-plus';
import QuestionImportDialog from './QuestionImportDialog.vue';

const api = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn() }));
vi.mock('@/api/imports', () => ({ preview: api.preview, commit: api.commit }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ load: vi.fn(), settings: { importMaxFileMb: 10, importMaxRows: 1000 } }) }));
let wrapper: VueWrapper;
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')].find(b => b.textContent?.trim() === text)!; }
async function open() {
  wrapper = mount(QuestionImportDialog, { attachTo: document.body, props: { visible: false, bankId: 'b1', bankName: '安全长题库ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, global: { plugins: [ElementPlus] } });
  await wrapper.setProps({ visible: true }); await flushPromises();
  button('下一步：上传').click(); await flushPromises();
}
function select(name = '试题长文件名ABCDEFGHIJKLMNOPQRSTUVWXYZ.xlsx') { const raw = Object.assign(new File(['sample'], name), { uid: Date.now() }); wrapper.getComponent(ElUpload).vm.handleStart(raw); return raw; }
beforeEach(() => { vi.resetAllMocks(); api.preview.mockResolvedValue({ successCount: 1, failCount: 0, totalRows: 1, validRows: [], errors: [], warnings: [] }); api.commit.mockResolvedValue({ batchId: 'sample', successCount: 1, failCount: 0, totalRows: 1, reused: 0 }); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('试题导入文件与提交保护', () => {
  it('保留扩展名校验，长文件名移除后禁用解析', async () => {
    await open(); select('invalid.csv'); await flushPromises();
    expect(button('解析预览').disabled).toBe(true); expect(api.preview).not.toHaveBeenCalled();
    select(); await flushPromises(); expect(document.querySelector('.selected-import-file')?.textContent).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ.xlsx');
    document.querySelector<HTMLButtonElement>('button[aria-label="移除已选文件"]')!.click(); await flushPromises();
    expect(button('解析预览').disabled).toBe(true); expect(document.querySelector('.selected-import-file')).toBeNull();
  });

  it('解析中锁定文件，原题库、文件名和内容去重配置提交一次', async () => {
    let finish!: (value: unknown) => void;
    api.preview.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await open(); const raw = select(); await flushPromises();
    button('解析预览').click(); button('解析预览').click(); await flushPromises();
    expect(api.preview).toHaveBeenCalledTimes(1); expect(api.preview).toHaveBeenCalledWith(raw, 'b1');
    expect(wrapper.getComponent(ElUpload).props('disabled')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="移除已选文件"]')!.disabled).toBe(true);
    finish({ successCount: 1, failCount: 0, totalRows: 1, validRows: [], errors: [], warnings: [] }); await flushPromises();
    await wrapper.getComponent(ElSwitch).setValue(false);
    let complete!: (value: unknown) => void; api.commit.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    button('确认导入').click(); button('确认导入').click(); await flushPromises();
    expect(api.commit).toHaveBeenCalledTimes(1);
    expect(api.commit).toHaveBeenCalledWith({ bankId: 'b1', fileName: '试题长文件名ABCDEFGHIJKLMNOPQRSTUVWXYZ.xlsx', validRows: [], errors: [], dedupe: false });
    expect(wrapper.getComponent(ElSwitch).props('disabled')).toBe(true); expect(button('取消').disabled).toBe(true);
    complete({ batchId: 'sample', successCount: 1, failCount: 0, totalRows: 1, reused: 0 }); await flushPromises();
    expect(wrapper.emitted('imported')).toHaveLength(1);
    expect(document.body.textContent).toContain('导入完成');
  });
});
