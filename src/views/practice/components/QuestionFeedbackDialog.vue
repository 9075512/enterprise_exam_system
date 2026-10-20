<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as practiceApi from '@/api/practice';
import { feedbackApi } from '@/api/coreFeatures';
import { focusFirstFormError } from '@/composables/useFormFocus';

const props = withDefaults(defineProps<{
  visible: boolean;
  questionId: string;
  sessionId?: string;
  source?: 'practice' | 'exam';
  sourceRefId?: string;
  questionNumber: number;
  stem: string;
}>(), { sessionId: '', source: 'practice', sourceRefId: '' });
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'busy', value: boolean): void;
}>();
const submitting = ref(false);
const content = ref('');
const contentError = ref('');
const submitError = ref('');
const formScope = ref<HTMLElement>();
const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => { if (!submitting.value) emit('update:visible', value); },
});
watch(() => props.visible, (open) => {
  if (!open) return;
  content.value = '';
  contentError.value = '';
  submitError.value = '';
}, { immediate: true });

async function submit(): Promise<void> {
  if (submitting.value || !props.questionId || !(props.source === 'exam' ? props.sourceRefId : props.sessionId)) return;
  const value = content.value.trim();
  contentError.value = !value ? '请输入问题描述' : value.length > 1000 ? '问题描述不能超过 1000 字' : '';
  if (contentError.value) {
    await focusFirstFormError(formScope.value);
    return;
  }
  submitting.value = true;
  submitError.value = '';
  emit('busy', true);
  try {
    if (props.source === 'exam') {
      await feedbackApi.create({ questionId: props.questionId, source: 'exam', sourceRefId: props.sourceRefId, category: '题目纠错', content: value });
    } else {
      await practiceApi.submitQuestionFeedback({ questionId: props.questionId, sessionId: props.sessionId, category: '题目纠错', content: value });
    }
    ElMessage.success('反馈已提交');
    emit('update:visible', false);
  } catch {
    submitError.value = '反馈提交失败，已保留问题描述，请重试。';
    await nextTick();
    formScope.value?.closest<HTMLElement>('.el-dialog__body')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  } finally {
    submitting.value = false;
    emit('busy', false);
  }
}
</script>

<template>
  <el-dialog v-model="dialogVisible" class="practice-feedback-dialog" title="题目纠错反馈" width="600px" append-to-body destroy-on-close
    :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
    <div class="feedback-context">
      <strong>第 {{ questionNumber }} 题</strong>
      <p>{{ stem }}</p>
    </div>
    <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" class="feedback-error" />
    <div ref="formScope">
      <el-form label-position="top" :disabled="submitting">
        <el-form-item label="问题描述" required :error="contentError">
          <el-input v-model="content" type="textarea" :rows="5" maxlength="1000" show-word-limit
            placeholder="请说明题干、选项、答案或解析存在的问题" @input="contentError = ''" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">提交反馈</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.feedback-context { padding: 16px; margin-bottom: 20px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; color: $text-primary; }
.feedback-context strong { font-size: 13px; }
.feedback-context p { max-height: 200px; overflow: auto; margin: 8px 0 0; font-size: 14px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.feedback-error { margin-bottom: 16px; overflow-wrap: anywhere; }
@media (max-width: 600px) {
  :global(.practice-feedback-dialog.el-dialog.el-dialog) { width: 100%; height: 100dvh; max-height: 100dvh; max-width: 100%; margin: 0 !important; border-radius: 0; }
  :global(.practice-feedback-dialog.el-dialog .el-dialog__body) { flex: 1; }
  :global(.practice-feedback-dialog.el-dialog .el-dialog__footer) { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
</style>
