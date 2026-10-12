<script setup lang="ts">
/**
 * 成绩导出弹窗（成绩报表页）。
 * 勾选要导出的字段 → 调用 reports.exportExamScores 下载 .xlsx。
 * 注：后端返回裸二进制，http.ts 响应拦截器原样透传为 Blob。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { CheckboxValueType } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import * as reportsApi from '@/api/reports';
import { DEFAULT_SCORE_EXPORT_FIELDS, SCORE_EXPORT_FIELDS } from '@/constants';

const props = defineProps<{ modelValue: boolean; examId: string; examName: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const selected = ref<string[]>([...DEFAULT_SCORE_EXPORT_FIELDS]);
const exporting = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
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
  if (!props.examId) return;
  if (selected.value.length === 0) {
    ElMessage.warning('请至少选择一个导出字段');
    return;
  }
  exporting.value = true;
  try {
    const blob = await reportsApi.exportExamScores(props.examId, selected.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitize(props.examName)}-成绩-${stamp()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
    visible.value = false;
  } catch {
    // 失败提示已由 http.ts 响应拦截器统一弹出，此处不重复提示
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="导出成绩" width="560px" :close-on-click-modal="false">
    <el-alert
      class="score-export__alert"
      type="info"
      :closable="false"
      show-icon
      title="按「每位考生最新一次作答」导出"
      description="同一考生多次作答只导出最新一次；导出为 Excel（.xlsx）文件。"
    />

    <div class="score-export__header">
      <span class="score-export__title">导出字段</span>
      <div class="score-export__header-right">
        <span class="score-export__count">已选 {{ selected.length }}/{{ SCORE_EXPORT_FIELDS.length }}</span>
        <el-checkbox :model-value="allChecked" @change="onCheckAll">全选</el-checkbox>
      </div>
    </div>

    <div class="score-export__fields">
      <el-checkbox-group v-model="selected" class="score-export__group">
        <el-checkbox v-for="f in SCORE_EXPORT_FIELDS" :key="f.key" :value="f.key">
          {{ f.label }}
        </el-checkbox>
      </el-checkbox-group>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
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
  &__alert {
    margin-bottom: 16px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    max-height: 260px;
    overflow-y: auto;
  }

  &__group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__group :deep(.el-checkbox) {
    width: calc(33.33% - 8px);
    margin-right: 0;
  }
}
</style>
