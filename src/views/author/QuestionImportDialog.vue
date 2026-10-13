<script setup lang="ts">
/**
 * Excel 批量导入弹窗（W3-T5，PRD §6.1 / §7.5）。
 * 4 步向导：① 选题库 → ② 上传文件 → ③ 预览结果 → ④ 完成。
 * - 前端预校验：后缀必须 .xlsx、大小 ≤ 系统设置的文件大小上限 MB。
 * - 预览：展示成功/失败统计、warnings（黄色提示）、失败明细表，并支持前端导出 CSV 错误报告。
 * - 提交：仅写入成功行（后端单事务）；完成后 emit('imported') 供父级刷新。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { UploadFile, UploadInstance } from 'element-plus';
import { Download, UploadFilled } from '@element-plus/icons-vue';
import * as importsApi from '@/api/imports';
import { useSettingsStore } from '@/stores/settings';
import { IMPORT_ALLOWED_EXTENSION, IMPORT_HEADERS } from '@/constants';
import type { CommitResult, PreviewResult } from '@/types';

const props = defineProps<{
  visible: boolean;
  bankId: string;
  bankName: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'imported'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const settingsStore = useSettingsStore();

onMounted(() => {
  void settingsStore.load();
});

/** 当前步骤索引（0 选题库 / 1 上传 / 2 预览 / 3 完成） */
const step = ref(0);
/** el-steps 的 active：第 4 步时置 4 让前三步全部完成 */
const activeStep = computed<number>(() => (step.value >= 3 ? 4 : step.value));

const uploadRef = ref<UploadInstance>();
const selectedFile = ref<File | null>(null);
const preview = ref<PreviewResult | null>(null);
const result = ref<CommitResult | null>(null);
/** 内容去重式复用开关（v1.8⑤ U5）：跳过目标题库中已存在的相同题目；默认关闭（行为不变） */
const dedupe = ref(false);

const parsing = ref(false);
const committing = ref(false);
const downloading = ref(false);

const templateHint = reactive({
  headers: IMPORT_HEADERS.join('、'),
  answerRule: '单选填单个字母（如 A）；多选连续填字母（如 ABD，亦支持 A,B,D）；判断填「对 / 错」。',
});

/** 打开时重置全部状态 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void settingsStore.load();
      reset();
    }
  },
);

function reset(): void {
  step.value = 0;
  selectedFile.value = null;
  preview.value = null;
  result.value = null;
  dedupe.value = false;
  parsing.value = false;
  committing.value = false;
  uploadRef.value?.clearFiles();
}

function next(): void {
  if (step.value < 3) step.value += 1;
}

function prev(): void {
  if (step.value > 0) step.value -= 1;
}

function close(): void {
  dialogVisible.value = false;
}

/** 下载导入模板（二进制 Blob → 触发浏览器下载） */
async function handleDownloadTemplate(): Promise<void> {
  downloading.value = true;
  try {
    const blob = await importsApi.downloadTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question-import-template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    downloading.value = false;
  }
}

/** 校验扩展名与大小，通过则记录文件 */
function validateAndSet(raw: File): void {
  const name = raw.name.toLowerCase();
  if (!name.endsWith(IMPORT_ALLOWED_EXTENSION)) {
    ElMessage.error(`仅支持 ${IMPORT_ALLOWED_EXTENSION} 格式文件`);
    uploadRef.value?.clearFiles();
    selectedFile.value = null;
    return;
  }
  if (raw.size > settingsStore.settings.importMaxFileMb * 1024 * 1024) {
    ElMessage.error(`文件大小不能超过 ${settingsStore.settings.importMaxFileMb}MB`);
    uploadRef.value?.clearFiles();
    selectedFile.value = null;
    return;
  }
  selectedFile.value = raw;
}

function handleFileChange(file: UploadFile): void {
  if (file.raw) validateAndSet(file.raw);
}

/** 超出 limit=1：清空后校验最新选择 */
function handleExceed(files: File[]): void {
  uploadRef.value?.clearFiles();
  const raw = files[0];
  if (raw) validateAndSet(raw);
}

/** 解析预览 */
async function handlePreview(): Promise<void> {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择 .xlsx 文件');
    return;
  }
  parsing.value = true;
  try {
    preview.value = await importsApi.preview(selectedFile.value, props.bankId);
    step.value = 2;
  } catch {
    // 错误提示已由拦截器统一弹出
  } finally {
    parsing.value = false;
  }
}

/** 前端导出错误报告为 CSV（带 BOM 防中文乱码） */
function handleExportErrors(): void {
  const errors = preview.value?.errors ?? [];
  if (errors.length === 0) return;
  const escape = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [['行号', '列', '原始值', '原因'].map(escape).join(',')];
  for (const e of errors) {
    lines.push([e.row, e.column, e.value, e.reason].map(escape).join(','));
  }
  const csv = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-errors-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 确认导入 */
async function handleCommit(): Promise<void> {
  if (!preview.value || !selectedFile.value) return;
  committing.value = true;
  try {
    result.value = await importsApi.commit({
      bankId: props.bankId,
      fileName: selectedFile.value.name,
      validRows: preview.value.validRows,
      errors: preview.value.errors,
      dedupe: dedupe.value,
    });
    // v1.8⑤ U5：如实反馈内容去重跳过的条数
    const reusedPart = result.value.reused > 0 ? `，跳过重复 ${result.value.reused} 条` : '';
    ElMessage.success(
      `导入完成：成功 ${result.value.successCount} 条，失败 ${result.value.failCount} 条${reusedPart}`,
    );
    step.value = 3;
    emit('imported');
  } catch {
    // 错误提示已由拦截器统一弹出
  } finally {
    committing.value = false;
  }
}

/** 再导入一批：回到步骤 1 并清空上传/预览 */
function importAgain(): void {
  step.value = 1;
  selectedFile.value = null;
  preview.value = null;
  result.value = null;
  uploadRef.value?.clearFiles();
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量导入试题"
    width="760px"
    top="6vh"
    append-to-body
    destroy-on-close
    @closed="reset"
  >
    <el-steps :active="activeStep" finish-status="success" align-center class="import-steps">
      <el-step title="选题库" />
      <el-step title="上传文件" />
      <el-step title="预览结果" />
      <el-step title="完成" />
    </el-steps>

    <!-- 步骤 1：选题库 -->
    <div v-if="step === 0" class="import-pane">
      <el-alert
        class="import-pane__bank"
        type="info"
        :closable="false"
        :title="`目标题库：${bankName || '（未命名题库）'}`"
        description="导入的试题将归属该题库。"
      />
      <el-button :icon="Download" :loading="downloading" @click="handleDownloadTemplate">
        下载导入模板
      </el-button>
      <div class="import-hint">
        <p><strong>模板 12 列表头：</strong>{{ templateHint.headers }}</p>
        <p><strong>答案填写规范：</strong>{{ templateHint.answerRule }}</p>
        <p>判断题的 C~H 选项列可留空，系统自动填充「正确 / 错误」。</p>
      </div>
    </div>

    <!-- 步骤 2：上传文件 -->
    <div v-else-if="step === 1" class="import-pane">
      <el-upload
        ref="uploadRef"
        drag
        :accept="IMPORT_ALLOWED_EXTENSION"
        :auto-upload="false"
        :limit="1"
        :on-change="handleFileChange"
        :on-exceed="handleExceed"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将 .xlsx 文件拖到此处，或<em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">
            仅支持 .xlsx，大小不超过 {{ settingsStore.settings.importMaxFileMb }}MB，单次最多
            {{ settingsStore.settings.importMaxRows }} 行；选择后请点击「解析预览」。
          </div>
        </template>
      </el-upload>
    </div>

    <!-- 步骤 3：预览结果 -->
    <div v-else-if="step === 2 && preview" class="import-pane">
      <div class="import-stats">
        <div class="import-stats__item import-stats__item--success">
          ✅ 成功 {{ preview.successCount }} 条
        </div>
        <div class="import-stats__item import-stats__item--fail">
          ❌ 失败 {{ preview.failCount }} 条
        </div>
        <div class="import-stats__item">共 {{ preview.totalRows }} 行</div>
      </div>

      <el-alert
        v-if="preview.warnings.length > 0"
        class="import-warnings"
        type="warning"
        :closable="false"
        title="以下行存在提示（不阻断导入）"
      >
        <ul class="import-warnings__list">
          <li v-for="(w, index) in preview.warnings" :key="index">
            第 {{ w.row }} 行 · {{ w.column }} · {{ w.value }} — {{ w.reason }}
          </li>
        </ul>
      </el-alert>

      <div class="import-errors__header">
        <span>失败明细（{{ preview.errors.length }}）</span>
        <el-button
          type="primary"
          link
          :icon="Download"
          :disabled="preview.errors.length === 0"
          @click="handleExportErrors"
        >
          导出错误报告
        </el-button>
      </div>
      <el-table
        :data="preview.errors"
        border
        stripe
        max-height="280"
        empty-text="没有失败行"
      >
        <el-table-column prop="row" label="行号" width="80" align="center" />
        <el-table-column prop="column" label="列" width="120" />
        <el-table-column prop="value" label="原始值" min-width="140" show-overflow-tooltip />
        <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
      </el-table>

      <div class="import-dedupe">
        <el-switch v-model="dedupe" />
        <span class="import-dedupe__label">跳过重复题目（内容去重）</span>
        <span class="import-dedupe__hint">
          开启后，「题型 + 题干 + 选项 + 答案」完全相同且已存在于本题库的题目将不再重复写入
        </span>
      </div>

      <p class="import-tip">确认后将仅写入成功的 {{ preview.successCount }} 条，失败行将被跳过。</p>
    </div>

    <!-- 步骤 4：完成 -->
    <div v-else-if="step === 3 && result" class="import-pane import-done">
      <el-result icon="success" title="导入完成">
        <template #sub-title>
          <p>
            成功 {{ result.successCount }} 条 · 失败 {{ result.failCount }} 条 · 共 {{ result.totalRows }} 行<template
              v-if="result.reused > 0"
            >
              · 跳过重复 {{ result.reused }} 条</template
            >
          </p>
        </template>
      </el-result>
    </div>

    <template #footer>
      <template v-if="step === 0">
        <el-button @click="close">取消</el-button>
        <el-button type="primary" @click="next">下一步：上传</el-button>
      </template>
      <template v-else-if="step === 1">
        <el-button @click="prev">上一步</el-button>
        <el-button @click="close">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedFile"
          :loading="parsing"
          @click="handlePreview"
        >
          解析预览
        </el-button>
      </template>
      <template v-else-if="step === 2">
        <el-button @click="prev">上一步</el-button>
        <el-button @click="close">取消</el-button>
        <el-button
          type="primary"
          :disabled="!preview || preview.successCount === 0"
          :loading="committing"
          @click="handleCommit"
        >
          确认导入
        </el-button>
      </template>
      <template v-else>
        <el-button @click="importAgain">再导入一批</el-button>
        <el-button type="primary" @click="close">完成</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.import-steps {
  margin-bottom: 20px;
}

.import-pane {
  min-height: 180px;

  &__bank {
    margin-bottom: 16px;
  }
}

.import-hint {
  margin-top: 16px;
  padding: 12px;
  background: $bg-page;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-secondary;

  p {
    margin: 4px 0;
  }
}

.import-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;

  &__item {
    padding: 12px 16px;
    border-radius: $radius-sm;
    background: $bg-page;
    font-size: 14px;
    font-weight: 600;

    &--success {
      color: $color-success;
    }

    &--fail {
      color: $color-error;
    }
  }
}

.import-warnings {
  margin-bottom: 16px;

  &__list {
    margin: 4px 0 0;
    padding-left: 18px;
    max-height: 120px;
    overflow-y: auto;
    font-size: 13px;
  }
}

.import-errors__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 600;
  color: $text-primary;
}

.import-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: $text-secondary;
}

.import-dedupe {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 12px;
  background: $bg-paper;
  border: 1px solid $border-color;
  border-radius: $radius-sm;

  &__label {
    font-size: 13px;
    color: $text-primary;
  }

  &__hint {
    font-size: 12px;
    color: $text-disabled;
  }
}

.import-done {
  display: flex;
  justify-content: center;
}
</style>
