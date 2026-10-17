import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import ExamEditorPage from './ExamEditorPage.vue';

const api = vi.hoisted(() => ({
  role: 'admin', id: '', valid: true,
  create: vi.fn(), update: vi.fn(), saveQuestions: vi.fn(), detail: vi.fn(), questions: vi.fn(), departments: vi.fn(), push: vi.fn(), warning: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: api.id } }), useRouter: () => ({ push: api.push }) }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasRole: (role: string) => role === api.role }) }));
vi.mock('@/api/exams', () => ({ create: api.create, update: api.update, saveQuestions: api.saveQuestions, detail: api.detail, questions: api.questions }));
vi.mock('@/api/departments', () => ({ list: api.departments }));
vi.mock('element-plus', () => ({ ElMessage: { warning: api.warning, success: vi.fn() } }));
vi.mock('./ExamSettingsForm.vue', () => ({ default: defineComponent({
  setup(_, { expose }) {
    const form = reactive({ name: '测试考试' });
    expose({ form, validate: async () => api.valid, getPayload: () => ({ name: form.name, passScore: 60, authorIds: ['author-1'] }) });
    return { form };
  }, template: '<input class="exam-name" v-model="form.name" />',
}) }));
vi.mock('@/components/exams/ExamQuestionComposer.vue', () => ({ default: defineComponent({
  setup(_, { expose }) {
    const score = ref(100);
    expose({ getPayload: () => ({ bankIds: ['bank-1'], questions: [{ questionId: 'q-1', score: score.value }] }) });
    return { score };
  }, template: '<input class="question-score" type="number" v-model.number="score" />',
}) }));

const slots = { template: '<div><slot /><slot name="extra" /></div>' };
function render() {
  return mount(ExamEditorPage, { global: { stubs: {
    PageHeader: { template: '<header><slot name="actions" /></header>' }, LoadingSkeleton: true,
    ElTag: slots, ElCard: slots, ElSteps: slots, ElStep: true, ElAlert: slots, ElResult: { props: ['title'], template: '<div>{{ title }}<slot name="extra" /></div>' },
    ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  } } });
}
async function click(wrapper: ReturnType<typeof render>, text: string) {
  const button = wrapper.findAll('button').find(b => b.text() === text);
  expect(button, text).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks(); api.role = 'admin'; api.id = ''; api.valid = true;
  api.departments.mockResolvedValue([]); api.create.mockResolvedValue({ id: 'new' }); api.push.mockResolvedValue(undefined);
  api.detail.mockResolvedValue({ id: 'exam-1', name: '已有考试', canReadQuestions: true, canEditQuestions: true });
  api.questions.mockResolvedValue({ bankIds: ['bank-1'], questions: [] });
});

describe('考试两步创建', () => {
  it('切换步骤保留考试信息和题目，最终只发一次统一创建请求', async () => {
    const wrapper = render(); await flushPromises();
    await wrapper.get('.exam-name').setValue('安全月考');
    await click(wrapper, '下一步：题目配置');
    await wrapper.get('.question-score').setValue(80);
    await click(wrapper, '上一步');
    expect((wrapper.get('.exam-name').element as HTMLInputElement).value).toBe('安全月考');
    await click(wrapper, '下一步：题目配置');
    expect((wrapper.get('.question-score').element as HTMLInputElement).value).toBe('80');
    expect(api.create).not.toHaveBeenCalled();
    await click(wrapper, '创建考试');
    expect(api.create).toHaveBeenCalledWith({ name: '安全月考', passScore: 60, authorIds: ['author-1'], bankIds: ['bank-1'], questions: [{ questionId: 'q-1', score: 80 }] });
    expect(api.push).toHaveBeenCalledWith('/admin/exams');
  });

  it('校验失败、取消均不创建考试', async () => {
    api.valid = false;
    const wrapper = render(); await flushPromises();
    await click(wrapper, '下一步：题目配置');
    expect(wrapper.findAll('button').some(b => b.text() === '创建考试')).toBe(false);
    await click(wrapper, '取消');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('提交失败保留填写内容，可重试；总分低于及格线时不提交', async () => {
    api.create.mockRejectedValueOnce(new Error('offline'));
    const wrapper = render(); await flushPromises();
    await click(wrapper, '下一步：题目配置');
    await wrapper.get('.question-score').setValue(50);
    await click(wrapper, '创建考试');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.warning).toHaveBeenCalledWith('及格线不能超过考试总分');
    await wrapper.get('.question-score').setValue(90);
    await click(wrapper, '创建考试');
    expect(api.push).not.toHaveBeenCalled();
    expect((wrapper.get('.question-score').element as HTMLInputElement).value).toBe('90');
    await click(wrapper, '创建考试');
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.push).toHaveBeenCalledWith('/admin/exams');
  });

  it('出题人仅使用题目保存接口，不加载管理员人员配置', async () => {
    api.role = 'author'; api.id = 'exam-1';
    const wrapper = render(); await flushPromises();
    expect(wrapper.find('.exam-name').exists()).toBe(false);
    expect(api.departments).not.toHaveBeenCalled();
    await click(wrapper, '保存修改');
    expect(api.saveQuestions).toHaveBeenCalledWith('exam-1', { bankIds: ['bank-1'], questions: [{ questionId: 'q-1', score: 100 }] });
    expect(api.update).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('锁定或失去题库权限时不挂载出题组件', async () => {
    api.role = 'author'; api.id = 'exam-1';
    api.detail.mockResolvedValue({ canReadQuestions: false, canEditQuestions: false, questionEditReason: '缺少题库权限' });
    const wrapper = render(); await flushPromises();
    expect(wrapper.text()).toContain('缺少题库权限');
    expect(wrapper.find('.question-score').exists()).toBe(false);
    expect(api.questions).not.toHaveBeenCalled();
  });
});
