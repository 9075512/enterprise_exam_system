<script setup lang="ts">
/**
 * 成绩导出弹窗（成绩报表页）。
 * 勾选要导出的字段 → 调用 reports.exportExamScores 下载 .xlsx。
 * 注：后端返回裸二进制，http.ts 响应拦截器原样透传为 Blob。
 */
import { computed, ref, useId, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { CheckboxValueType } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import * as reportsApi from '@/api/reports';
import { DEFAULT_SCORE_EXPORT_FIELDS, SCORE_EXPORT_FIELDS } from '@/constants';

const props = defineProps<{ modelValue: boolean; examId: string; examName: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const selected = ref<string[]>([...DEFAULT_SCORE_EXPORT_FIELDS]);
const exporting = ref(false);
const format = ref<'xlsx' | 'pdf'>('xlsx');
const fieldLabelId = `score-export-fields-${useId()}`;

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => { if (!v && exporting.value) return; emit('update:modelValue', v); },
});

const allChecked = computed(() => selected.value.length === SCORE_EXPORT_FIELDS.length);

// 每次打开重置为默认勾选，避免上次选择「串味」。
watch(
  () => props.modelValue,
  (open) => {
    if (open) selected.value = [...DEFAULT_SCORE_EXPORT_FIELDS];
  },
);

function onCheckAll(v: CheckboxValueType): void {
  selected.value = v ? SCORE_EXPORT_FIELDS.map((f) => f.key) : [];
}

/** 文件名清洗：替换非法字符并 trim，空则回退 '考试' */
function sanitize(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || '考试';
}

/** 本地时间 YYYYMMDD-HHmm（补零） */
function stamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function handleExport(): Promise<void> {
  if (!props.examId || exporting.value) return;
  if (selected.value.length === 0) {
    ElMessage.warning('请至少选择一个导出字段');
    return;
  }
  exporting.value = true;
  try {
    const isPdf = format.value === 'pdf';
    const blob = isPdf
      ? await reportsApi.exportExamScoresPdf(props.examId, selected.value)
      : await reportsApi.exportExamScores(props.examId, selected.value);
    const ext = isPdf ? 'pdf' : 'xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitize(props.examName)}-成绩-${stamp()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
    emit('update:modelValue', false);
  } catch {
    // 失败提示已由 http.ts 响应拦截器统一弹出，此处不重复提示
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="导出成绩" width="560px" :close-on-click-modal="false" :close-on-press-escape="!exporting" :show-close="!exporting" append-to-body>
    <div class="score-export__context"><span>当前考试</span><strong>{{ examName || '未命名考试' }}</strong></div>
    <el-alert
      class="score-export__alert"
      type="info"
      :closable="false"
      show-icon
      title="按系统补考成绩口径导出"
      description="每位考生取最近一次或最高分的已交卷成绩，以系统设置为准；支持 Excel（.xlsx）与 PDF（.pdf）。"
    />

    <div class="score-export__header">
      <span class="score-export__title">导出格式</span>
      <el-radio-group v-model="format" :disabled="exporting" aria-label="导出格式">
        <el-radio-button value="xlsx">Excel（.xlsx）</el-radio-button>
        <el-radio-button value="pdf">PDF（.pdf）</el-radio-button>
      </el-radio-group>
    </div>

    <div class="score-export__header">
      <span :id="fieldLabelId" class="score-export__title">导出字段</span>
      <div class="score-export__header-right">
        <span class="score-export__count">已选 {{ selected.length }}/{{ SCORE_EXPORT_FIELDS.length }}</span>
        <el-checkbox :model-value="allChecked" :indeterminate="selected.length > 0 && !allChecked" :disabled="exporting" @change="onCheckAll">全选</el-checkbox>
      </div>
    </div>

    <div class="score-export__fields">
      <el-checkbox-group v-model="selected" class="score-export__group" :disabled="exporting" :aria-labelledby="fieldLabelId">
        <el-checkbox v-for="f in SCORE_EXPORT_FIELDS" :key="f.key" :value="f.key">
          {{ f.label }}
        </el-checkbox>
      </el-checkbox-group>
    </div>

    <template #footer>
      <el-button :disabled="exporting" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="exporting"
        :disabled="selected.length === 0"
        :icon="Download"
        @click="handleExport"
      >
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.score-export {
  &__context { display: grid; gap: 6px; margin-bottom: 16px; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; span { color: $text-secondary; font-size: 12px; } strong { color: $text-primary; font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; } }
  &__alert {
    margin-bottom: 16px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__title {
    font-weight: 600;
    color: $text-primary;
    font-size: 14px;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__count {
    font-size: 13px;
    color: $text-secondary;
  }

  &__fields {
    padding: 12px;
    background: $bg-page;
    border-radius: $radius-sm;
  }

  &__group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
    gap: 8px;
  }

  &__group :deep(.el-checkbox) {
    min-width: 0;
    margin-right: 0;
  }

  @media (max-width: 900px) {
    &__group :deep(.el-checkbox), &__header-right :deep(.el-checkbox) { min-height: 44px; }
    &__header :deep(.el-radio-button__inner) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; }
    &__group :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }
  }
}
</style>
