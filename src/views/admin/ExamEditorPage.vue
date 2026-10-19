<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import * as examsApi from '@/api/exams';
import * as departmentsApi from '@/api/departments';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import ExamQuestionComposer from '@/components/exams/ExamQuestionComposer.vue';
import ExamSettingsForm from './ExamSettingsForm.vue';
import type { Department, Exam, PaperDetail } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => auth.hasRole('admin'));
const examId = String(route.params.id ?? '');
const exam = ref<Exam | null>(null);
const initial = ref<PaperDetail | null>(null);
const departments = ref<Department[]>([]);
const loading = ref(true);
const failed = ref(false);
const step = ref(isAdmin.value ? 0 : 1);
const saving = ref(false);
const editorRef = ref<HTMLElement>();
const settingsForm = ref<InstanceType<typeof ExamSettingsForm>>();
const composer = ref<InstanceType<typeof ExamQuestionComposer>>();
const title = computed(() => examId ? (isAdmin.value ? '编辑考试' : '维护考试题目') : '新建考试');
const examName = computed(() => settingsForm.value?.form.name ?? exam.value?.name ?? '');
const overview = computed(() => settingsForm.value?.form);
const questionSummary = computed(() => composer.value?.summary ?? { questionCount: exam.value?.questionCount ?? 0, totalScore: exam.value?.totalScore ?? 0 });
const summaryTime = (value?: string) => value ? value.slice(0, 16).replace('T', ' ') : '尚未设置';

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    if (examId) {
      exam.value = await examsApi.detail(examId);
      if (exam.value.canReadQuestions) initial.value = await examsApi.questions(examId);
    }
    if (isAdmin.value) departments.value = await departmentsApi.list();
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
onMounted(load);

async function next(): Promise<void> {
  if (saving.value) return;
  if (await settingsForm.value?.validate()) showStep(1);
}

function showStep(value: number): void {
  if (saving.value) return;
  step.value = value;
  void nextTick(() => editorRef.value?.scrollIntoView?.({ block: 'start', behavior: 'auto' }));
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    if (isAdmin.value && !(await settingsForm.value?.validate())) { step.value = 0; return; }
    const content = exam.value?.questionsLocked
      ? initial.value && { bankIds: initial.value.bankIds, questions: initial.value.questions.map(q => ({ questionId: q.questionId, score: q.score })) }
      : composer.value?.getPayload();
    if (!content) return;
    const settings = isAdmin.value ? settingsForm.value!.getPayload() : null;
    if (settings && settings.passScore > Math.round(content.questions.reduce((n, q) => n + q.score, 0) * 10) / 10) {
      ElMessage.warning('及格线不能超过考试总分');
      return;
    }
    if (settings) {
      const payload = { ...settings, ...content };
      if (examId) await examsApi.update(examId, payload);
      else await examsApi.create(payload);
    } else await examsApi.saveQuestions(examId, content);
    ElMessage.success(examId ? '考试已更新' : '考试已创建');
    await router.push('/admin/exams');
  } catch {
    // HTTP 拦截器提示错误；保留两步表单内容供修改或重试。
  } finally { saving.value = false; }
}
</script>

<template>
  <div data-ui-layout="steps" data-ui-page="ExamEditorPage" ref="editorRef" class="exam-editor">
    <PageHeader :title="title" :description="exam?.name || '填写考试设置并直接配置题目，完成后统一保存'">
      <template #actions><el-button :disabled="saving" @click="router.push('/admin/exams')">返回考试管理</el-button></template>
    </PageHeader>
    <LoadingSkeleton v-if="loading" :rows="6" />
    <RequestError v-else-if="failed" text="考试信息加载失败" @retry="load" />
    <el-result v-else-if="!isAdmin && (!exam?.canReadQuestions || !exam?.canEditQuestions)" icon="warning" :title="exam?.questionEditReason || '当前无法维护题目'">
      <template #extra><el-button v-if="exam?.canReadQuestions" @click="router.push('/admin/exams/' + examId + '/preview')">查看题目</el-button></template>
    </el-result>
    <template v-else>
      <nav v-if="isAdmin" class="exam-editor__steps" aria-label="创建考试步骤">
        <button type="button" class="exam-editor__step" :class="{ 'is-active': step === 0, 'is-complete': step > 0 }" :aria-current="step === 0 ? 'step' : undefined" :disabled="saving" @click="showStep(0)">
          <span class="exam-editor__step-number">01</span><span><strong>考试设置</strong><small>基本信息、时间与人员</small></span>
        </button>
        <span class="exam-editor__step-line" aria-hidden="true" />
        <button type="button" class="exam-editor__step" :class="{ 'is-active': step === 1 }" :aria-current="step === 1 ? 'step' : undefined" :disabled="saving" @click="next">
          <span class="exam-editor__step-number">02</span><span><strong>题目配置</strong><small>选择题目、设置分值</small></span>
        </button>
        <span class="exam-editor__step-tip">完成两步后统一保存</span>
      </nav>
      <div v-if="isAdmin" v-show="step === 0" class="exam-editor__settings-layout">
        <ExamSettingsForm ref="settingsForm" :exam="exam" :departments="departments" :disabled="saving" />
        <details class="exam-editor__overview" open>
          <summary class="exam-editor__overview-heading"><span>考试摘要</span><el-tag size="small" effect="plain">{{ examId ? '编辑中' : '待创建' }}</el-tag><span class="exam-editor__overview-toggle" aria-hidden="true">⌄</span></summary>
          <h3>{{ examName || '尚未填写考试名称' }}</h3>
          <div class="exam-editor__metrics"><div><strong>{{ overview?.durationMinutes ?? 60 }}<small>分钟</small></strong><span>考试时长</span></div><div><strong>{{ overview?.passScore ?? 60 }}<small>分</small></strong><span>及格分数</span></div></div>
          <dl class="exam-editor__facts">
            <div><dt>考试形式</dt><dd>{{ overview?.examMode === 'open' ? '开卷' : '闭卷' }}</dd></div>
            <div><dt>答题次数</dt><dd>每人 {{ overview?.maxAttempts ?? 1 }} 次</dd></div>
            <div><dt>参与科室</dt><dd>{{ overview?.departmentIds?.length ?? 0 }} 个</dd></div>
            <div><dt>指定加入</dt><dd>{{ overview?.includeUserIds?.length ?? 0 }} 人</dd></div>
            <div><dt>指定排除</dt><dd>{{ overview?.excludeUserIds?.length ?? 0 }} 人</dd></div>
            <div><dt>出题人</dt><dd>{{ overview?.authorIds?.length ?? 0 }} 人</dd></div>
          </dl>
          <div class="exam-editor__schedule"><span>开始时间</span><strong>{{ summaryTime(overview?.startTime) }}</strong><span>截止时间</span><strong>{{ summaryTime(overview?.endTime) }}</strong></div>
          <div class="exam-editor__guide"><strong>下一步：配置考试题目</strong><p>从题库手动选题或按规则抽题，设置每题分值后即可创建考试。</p></div>
        </details>
      </div>
      <div v-show="step === 1">
        <el-alert v-if="exam?.questionsLocked" type="info" :closable="false" :title="exam.questionEditReason">
          <p>共 {{ exam.questionCount }} 题，总分 {{ exam.totalScore }} 分。仍可修改其他考试设置。</p>
          <el-button link type="primary" @click="router.push('/admin/exams/' + examId + '/preview')">预览题目</el-button>
        </el-alert>
        <ExamQuestionComposer v-else ref="composer" :exam-name="examName" :initial="initial" :disabled="saving" />
      </div>
      <div class="exam-editor__footer">
        <div class="exam-editor__footer-note"><template v-if="step === 0"><strong>第 1 步 / 共 2 步</strong><span>确认考试设置后，继续选择题目</span></template><template v-else><a v-if="!exam?.questionsLocked" href="#exam-selected-questions">已选 {{ questionSummary.questionCount }} 题 · {{ questionSummary.totalScore }} 分</a><strong v-else>已选 {{ questionSummary.questionCount }} 题 · {{ questionSummary.totalScore }} 分</strong><span>{{ examName || '当前考试' }}</span></template></div>
        <div class="exam-editor__footer-actions">
        <el-button :disabled="saving" @click="router.push('/admin/exams')">取消</el-button>
        <el-button v-if="isAdmin && step === 1" :disabled="saving" @click="showStep(0)">上一步</el-button>
        <el-button v-if="step === 0" type="primary" :disabled="saving" @click="next">下一步：题目配置</el-button>
        <el-button v-else type="primary" :loading="saving" :disabled="composer?.busy" @click="save">{{ examId ? '保存修改' : '创建考试' }}</el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.exam-editor {
  max-width: 1480px; margin: 0 auto;
  &__steps { display: flex; align-items: center; gap: 24px; padding: 12px 20px; margin-bottom: 20px; background: $bg-paper; border: 1px solid $border-color; border-radius: $radius-lg; }
  &__step { display: flex; gap: 12px; align-items: center; padding: 0; border: 0; background: transparent; color: $text-secondary; text-align: left; cursor: pointer; font: inherit;
    strong, small { display: block; } strong { font-size: 14px; font-weight: 600; } small { margin-top: 4px; font-size: 12px; }
    &:disabled { cursor: wait; } &.is-active strong { color: $color-primary-dark; }
    &.is-active .exam-editor__step-number { color: $bg-paper; background: $color-primary; border-color: $color-primary; }
    &.is-complete .exam-editor__step-number { color: $color-primary-dark; background: $color-primary-soft; border-color: $color-primary-border; }
  }
  &__step-number { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; border: 1px solid $line-strong; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  &__step-line { width: 52px; height: 1px; background: $border-color; }
  &__step-tip { margin-left: auto; font-size: 12px; color: $text-secondary; }
  &__settings-layout { display: grid; grid-template-columns: minmax(0, 1fr) 264px; gap: 24px; align-items: start; }
  &__overview { position: sticky; top: 20px; padding: 22px; background: $bg-paper; border: 1px solid $border-color; border-radius: $radius-lg; min-width: 0;
    h3 { margin: 20px 0; font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; color: $text-primary; }
  }
  &__overview-heading { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: $text-body; cursor: pointer; list-style: none; &::-webkit-details-marker { display: none; } .el-tag { margin-left: auto; } }
  &__overview-toggle { font-size: 18px; color: $text-secondary; }
  &__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 16px 0; border-top: 1px solid $border-color; border-bottom: 1px solid $border-color;
    div { display: grid; gap: 8px; } strong { color: $text-primary; font-size: 24px; font-variant-numeric: tabular-nums; } small { margin-left: 4px; font-size: 12px; font-weight: 400; } span { font-size: 12px; color: $text-secondary; }
  }
  &__facts { display: grid; gap: 14px; margin: 20px 0; font-size: 12px;
    div { display: flex; justify-content: space-between; gap: 12px; } dt { color: $text-secondary; } dd { margin: 0; color: $text-body; font-weight: 500; }
  }
  &__schedule { display: grid; gap: 6px; border-top: 1px solid $border-color; padding-top: 16px;
    span { color: $text-secondary; font-size: 12px; } strong { color: $text-body; font-size: 12px; font-weight: 500; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
  }
  &__guide { margin: 14px -6px -6px; padding: 14px; border-radius: $radius-sm; background: $color-primary-soft;
    strong { font-size: 12px; color: $color-primary-dark; } p { margin: 6px 0 0; color: $text-body; font-size: 12px; line-height: 1.7; }
  }
  &__footer { position: sticky; bottom: 12px; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; margin-top: 24px; background: $bg-paper; border: 1px solid $line-strong; border-radius: $radius-lg; }
  &__footer-note { display: grid; gap: 4px; min-width: 0; strong, a { font-size: 13px; font-weight: 600; color: $text-primary; } a { text-underline-offset: 3px; } span { font-size: 12px; color: $text-secondary; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 440px; } }
  &__footer-actions { display: flex; gap: 8px; flex-shrink: 0; :deep(.el-button + .el-button) { margin-left: 0; } }
}
@media (max-width: 1050px) { .exam-editor__settings-layout { grid-template-columns: minmax(0, 1fr); } .exam-editor__overview { position: static; } }
@media (max-width: 900px) { .exam-editor__step, .exam-editor__overview-heading { min-height: 44px; } .exam-editor__footer-actions { flex-wrap: wrap; } }
@media (max-width: 700px) { .exam-editor__steps { gap: 12px; padding: 16px; } .exam-editor__step-line { width: 20px; } .exam-editor__step-tip, .exam-editor__step small { display: none; } .exam-editor__footer { bottom: 0; flex-wrap: wrap; padding: 12px; } .exam-editor__footer-note { flex: 1 1 100%; } .exam-editor__footer-note span { display: none; } .exam-editor__footer-actions { width: 100%; justify-content: flex-end; } }
</style>
