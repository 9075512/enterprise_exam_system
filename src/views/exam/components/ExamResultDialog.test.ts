import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ExamResultDialog from './ExamResultDialog.vue';
import type { ExamRecord } from '@/types';

let wrapper: ReturnType<typeof mount>;
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('考试结果弹窗', () => {
  it.each([
    ['submitted', 80, '及格'],
    ['submitted', 0, '未及格'],
    ['pending_review', 20, '待阅卷'],
  ] as const)('%s / %s 分展示 %s', async (status, score, label) => {
    wrapper = mount(ExamResultDialog, {
      props: { modelValue: true, examName: '示例考试', passScore: 60,
        result: { status, score, autoSubmitted: true, paperSnapshot: { totalScore: 100 } } as ExamRecord },
      attachTo: document.body, global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    const dialog = document.querySelector('.exam-result')!;
    expect(dialog.querySelector('.el-tag')?.textContent).toBe(label);
    expect(dialog.textContent).toContain('系统已自动交卷');
    expect(dialog.textContent).not.toContain('考试时间到'); // 自动交卷也可能来自切屏规则。
    expect(dialog.textContent).toContain('及格线 60 分');
    if (status === 'pending_review') expect(dialog.textContent).toContain('不是最终成绩');
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button')];
    buttons[0].click(); buttons[1].click();
    expect(wrapper.emitted('back')).toHaveLength(1);
    expect(wrapper.emitted('detail')).toHaveLength(1);
  });
});
