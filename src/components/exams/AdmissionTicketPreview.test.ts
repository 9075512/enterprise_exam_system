import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import AdmissionTicketPreview from './AdmissionTicketPreview.vue';
import type { AdmissionTicket } from '@/types';

const api = vi.hoisted(() => ({ tickets: vi.fn(), pdf: vi.fn() }));
vi.mock('@/api/coreFeatures', () => ({ participantsApi: { tickets: api.tickets, ticketsPdf: api.pdf } }));
const ticket = (userId = 'u1', examId = 'e1'): AdmissionTicket => ({
  userId, examId, userName: `考生${userId}`, examName: `安全考试${examId}`, username: `account-${userId}`,
  admissionNo: `NO-${examId}-${userId}`, departmentName: '安全生产技术科',
  startTime: '2026-10-25T01:00:00Z', endTime: '2026-10-25T03:00:00Z', durationMinutes: 60, examMode: 'closed',
});
let wrapper: VueWrapper;
function render(batch = false) {
  wrapper = mount(AdmissionTicketPreview, { props: { modelValue: true, exam: { id: 'e1', name: '安全/考试' }, batch }, attachTo: document.body, global: { plugins: [ElementPlus] } });
}
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('.admission-preview button')].find(b => b.textContent?.trim() === text)!; }
beforeEach(() => { vi.resetAllMocks(); api.tickets.mockResolvedValue([ticket()]); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('准考证先预览再下载', () => {
  it('先显示当前考生、稳定编号和考试时间，不自动请求 PDF', async () => {
    render(); await flushPromises();
    expect(api.tickets).toHaveBeenCalledWith('e1'); expect(api.pdf).not.toHaveBeenCalled();
    const card = document.querySelector('.admission-ticket')!;
    for (const content of ['安全考试e1', '考生u1', 'account-u1', 'NO-e1-u1', '安全生产技术科', '2026-10-25', '60 分钟', '闭卷考试']) expect(card.textContent).toContain(content);
    expect(document.querySelector('.admission-preview__toolbar')).toBeNull();
    expect(button('下载准考证 PDF').disabled).toBe(false);
  });
  it('加载中、失败和空数据均禁止下载，失败可重试', async () => {
    let reject!: (error: Error) => void;
    api.tickets.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce([]);
    render(); await flushPromises(); expect(button('下载准考证 PDF').disabled).toBe(true);
    expect(document.body.textContent).toContain('正在加载准考证');
    reject(new Error('offline')); await flushPromises();
    expect(document.body.textContent).toContain('准考证加载失败'); expect(document.body.textContent).not.toContain('暂无可用准考证');
    expect(button('下载准考证 PDF').disabled).toBe(true);
    button('重新加载').click(); await flushPromises();
    expect(document.body.textContent).toContain('暂无可用准考证'); expect(button('下载准考证 PDF').disabled).toBe(true);
    expect(api.pdf).not.toHaveBeenCalled();
  });
  it('批量预览可翻页和选择考生，下载范围明确为本场全部人员', async () => {
    api.tickets.mockResolvedValue([ticket(), ticket('u2')]);
    render(true); await flushPromises();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="上一张准考证"]')!.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('[aria-label="下一张准考证"]')!.click(); await flushPromises();
    expect(document.querySelector('.admission-ticket')?.textContent).toContain('考生u2');
    expect(document.querySelector<HTMLButtonElement>('[aria-label="下一张准考证"]')!.disabled).toBe(true);
    expect(document.querySelector('.admission-preview__footer')?.textContent).toContain('本场全部 2 位考生');
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'u1'); await flushPromises();
    expect(document.querySelector('.admission-ticket')?.textContent).toContain('考生u1');
    expect(api.pdf).not.toHaveBeenCalled();
  });
  it('切换考试或关闭重开时隔离旧响应，不串用上一场准考证', async () => {
    let old!: (value: AdmissionTicket[]) => void;
    api.tickets.mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockResolvedValueOnce([ticket('u2', 'e2')]);
    render(); await flushPromises();
    await wrapper.setProps({ modelValue: false }); await flushPromises();
    await wrapper.setProps({ modelValue: true, exam: { id: 'e2', name: '第二场' } }); await flushPromises();
    old([ticket()]); await flushPromises();
    expect(document.querySelector('.admission-ticket')?.textContent).toContain('NO-e2-u2');
    expect(document.querySelector('.admission-ticket')?.textContent).not.toContain('NO-e1-u1');
  });
  it('下载期间防重复和关闭，失败保留预览；重试保存 PDF 并延迟释放 Blob', async () => {
    let reject!: (error: Error) => void;
    api.pdf.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce(new Blob(['%PDF-1.7']));
    const create = vi.fn(() => 'blob:ticket'), revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    let filename = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    render(); await flushPromises();
    button('下载准考证 PDF').click(); button('下载准考证 PDF').click(); await flushPromises();
    expect(api.pdf).toHaveBeenCalledTimes(1); expect(button('关闭').disabled).toBe(true);
    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false); await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    reject(new Error('offline')); await flushPromises();
    expect(document.body.textContent).toContain('准考证下载失败'); expect(document.querySelector('.admission-ticket')).not.toBeNull();
    vi.useFakeTimers(); button('下载准考证 PDF').click(); await flushPromises();
    expect(api.pdf).toHaveBeenCalledTimes(2); expect(api.pdf).toHaveBeenLastCalledWith('e1');
    expect(click).toHaveBeenCalledTimes(1); expect(filename).toBe('安全_考试-准考证.pdf');
    expect(create).toHaveBeenCalledTimes(1); expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(revoke).toHaveBeenCalledWith('blob:ticket');
  });
});
