import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElUpload, type UploadFile } from 'element-plus';
import UserImportDialog from './UserImportDialog.vue';
import * as userImportApi from '@/api/userImport';
import type { UserPreviewResult, UserCommitResult } from '@/types';

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ load: vi.fn(), settings: { importMaxFileMb: 10, importMaxRows: 1000 } }),
}));
vi.mock('@/api/userImport', () => ({
  userBatches: vi.fn().mockResolvedValue({ list: [], total: 0 }),
  previewUsers: vi.fn(),
  commitUsers: vi.fn(),
}));

let wrapper: ReturnType<typeof mount>;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

async function openDialog() {
  wrapper = mount(UserImportDialog, {
    props: { visible: false },
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
}

function footerButton(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')]
    .find(item => item.textContent?.trim() === text);
  expect(button, `弹窗底部应包含「${text}」按钮`).toBeDefined();
  return button!;
}

describe('账号导入弹窗', () => {
  it('底部按钮可以进入上传、返回模板并取消，未选文件时禁止解析', async () => {
    await openDialog();
    footerButton('下一步：上传').click();
    await flushPromises();
    expect(document.querySelector('.el-upload')).not.toBeNull();
    expect(footerButton('解析预览').disabled).toBe(true);
    footerButton('上一步').click();
    await flushPromises();
    expect(footerButton('下一步：上传').disabled).toBe(false);
    footerButton('取消').click();
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });

  it('历史页签只显示关闭操作，切回导入时保留当前步骤', async () => {
    await openDialog();
    footerButton('下一步：上传').click();
    await flushPromises();
    document.querySelector<HTMLElement>('#tab-history')!.click();
    await flushPromises();
    expect(document.querySelector('.el-dialog__footer')?.textContent?.trim()).toBe('关闭');
    document.querySelector<HTMLElement>('#tab-wizard')!.click();
    await flushPromises();
    expect(footerButton('解析预览').disabled).toBe(true);
  });

  it('解析和导入期间禁用返回及关闭，完成后可正常关闭', async () => {
    await openDialog();
    footerButton('下一步：上传').click();
    await flushPromises();
    let finishPreview!: (value: UserPreviewResult) => void;
    let finishCommit!: (value: UserCommitResult) => void;
    vi.mocked(userImportApi.previewUsers).mockReturnValue(new Promise(resolve => { finishPreview = resolve; }));
    vi.mocked(userImportApi.commitUsers).mockReturnValue(new Promise(resolve => { finishCommit = resolve; }));
    wrapper.findComponent(ElUpload).props('onChange')!({ raw: new File(['test'], 'users.xlsx') } as UploadFile, []);
    await flushPromises();
    footerButton('解析预览').click();
    await flushPromises();
    expect(footerButton('上一步').disabled).toBe(true);
    expect(footerButton('取消').disabled).toBe(true);
    expect(document.querySelector('.el-dialog__headerbtn')).toBeNull();
    finishPreview({ successCount: 1, failCount: 0, totalRows: 1, validRows: [], errors: [], warnings: [] });
    await flushPromises();
    footerButton('确认导入').click();
    await flushPromises();
    expect(footerButton('取消').disabled).toBe(true);
    document.querySelector<HTMLElement>('#tab-history')!.click();
    await flushPromises();
    expect(document.querySelector('#tab-wizard')?.getAttribute('aria-selected')).toBe('true');
    finishCommit({ batchId: 'test-batch', successCount: 1, failCount: 0, totalRows: 1 });
    await flushPromises();
    expect(wrapper.emitted('imported')).toHaveLength(1);
    footerButton('完成').click();
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });
});
