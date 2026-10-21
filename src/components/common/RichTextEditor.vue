<script setup lang="ts">
/**
 * 轻量富文本编辑器（v1.7③ S1 + v1.8④ U4，**零依赖**）。
 *
 * - 基于 `contenteditable` + 浏览器原生 `document.execCommand`，不引入第三方编辑器。
 * - 工具栏：加粗 / 斜体 / 下划线 / 有序列表 / 无序列表 / 插入图片 / 清除格式。
 * - 图片（v1.8④）：**上传到服务端对象存储后回填站内 URL**（`/api/attachments/<id>?t=<签名>`），
 *   不再以 `data:image/...;base64` 内联（请求体从数 MB 回落到纯文本量级）；
 *   支持**工具栏选图**与 **Ctrl+V 粘贴图片**（含截图工具）。
 * - 体积/张数为前端友好提示，**服务端 `utils/richText.sanitizeRichText` 才是安全边界**。
 * - 通过 `v-model` 回传 HTML 字符串。
 *
 * 说明：`execCommand` 已被标记为废弃，但所有主流浏览器仍长期支持；本项目零依赖要求下
 * 该实现比引入编辑器体积更小、行为更可控。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Picture, RefreshLeft } from '@element-plus/icons-vue';
import * as attachmentsApi from '@/api/attachments';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    /** 最多图片数（与后端设置一致） */
    maxImages?: number;
    /** 单张图片体积上限（字节，与后端设置一致） */
    maxImageBytes?: number;
    /** 编辑区最小高度（px） */
    minHeight?: number;
  }>(),
  {
    placeholder: '请输入你的答案（支持加粗、列表与粘贴/插入图片）',
    disabled: false,
    maxImages: 3,
    maxImageBytes: 2 * 1024 * 1024,
    minHeight: 120,
  },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading-change', value: boolean): void }>();

const editorRef = ref<HTMLDivElement>();
const fileInputRef = ref<HTMLInputElement>();
/** 图片上传中（避免重复提交与光标错乱） */
const uploading = ref(false);
/** 最近一次有效的编辑区光标范围（插入图片前恢复，避免选图后光标丢失） */
let savedRange: Range | null = null;

const locked = computed<boolean>(() => props.disabled || uploading.value);

/** 把外部值同步进编辑区（仅在不一致且未聚焦时，避免打断输入） */
function syncFromModel(): void {
  const el = editorRef.value;
  if (!el) return;
  const next = props.modelValue ?? '';
  if (el.innerHTML === next) return;
  if (document.activeElement === el && next !== '') return;
  el.innerHTML = next;
}

onMounted(syncFromModel);
watch(() => props.modelValue, syncFromModel);

function rememberRange(): void {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editorRef.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

/** 光标定位到末尾 */
function focusAtEnd(): void {
  const el = editorRef.value;
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  savedRange = range.cloneRange();
}

function restoreRange(): void {
  const sel = window.getSelection();
  if (savedRange) {
    sel?.removeAllRanges();
    sel?.addRange(savedRange);
  } else {
    focusAtEnd();
  }
}

function emitValue(): void {
  emit('update:modelValue', editorRef.value?.innerHTML ?? '');
}

function onInput(): void {
  rememberRange();
  emitValue();
}

/** 执行编辑器命令并同步 v-model */
function exec(command: string, value?: string): void {
  if (locked.value) return;
  const el = editorRef.value;
  if (!el) return;
  el.focus();
  if (!savedRange) focusAtEnd();
  else restoreRange();
  document.execCommand(command, false, value);
  rememberRange();
  emitValue();
}

/** 已插入的图片数 */
function imageCount(): number {
  return (editorRef.value?.innerHTML.match(/<img\b/gi) ?? []).length;
}

/** 插入一段 HTML 到当前光标处 */
function insertHtml(html: string): void {
  const el = editorRef.value;
  if (!el) return;
  el.focus();
  restoreRange();
  document.execCommand('insertHTML', false, html);
  rememberRange();
  emitValue();
}

/** 属性值转义（URL 直接内联进 HTML，避免属性注入） */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 上传图片并插入（工具栏选图与粘贴共用）。
 *
 * 惰性校验顺序：类型 → 体积 → 张数 → 上传，均以**系统设置**为准（props 由调用方按设置注入）。
 */
async function uploadAndInsert(file: File): Promise<void> {
  if (locked.value) return;
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('仅支持图片文件');
    return;
  }
  const maxMb = Math.max(1, Math.round(props.maxImageBytes / 1024 / 1024));
  if (file.size > props.maxImageBytes) {
    ElMessage.warning(`单张图片不能超过 ${maxMb}MB`);
    return;
  }
  if (imageCount() >= props.maxImages) {
    ElMessage.warning(`最多插入 ${props.maxImages} 张图片`);
    return;
  }
  uploading.value = true;
  emit('uploading-change', true);
  try {
    const attachment = await attachmentsApi.uploadImage(file);
    insertHtml(`<img src="${escapeAttr(attachment.url)}" alt="作答图片">`);
  } catch {
    /* 错误已由请求拦截器统一提示 */
  } finally {
    uploading.value = false;
    emit('uploading-change', false);
  }
}

function pickImage(): void {
  if (locked.value) return;
  fileInputRef.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // 允许重复选择同一文件
  if (file) void uploadAndInsert(file);
}

/** 粘贴：命中剪贴板图片则改为上传（普通文本/HTML 粘贴保持默认行为） */
function onPaste(event: ClipboardEvent): void {
  if (locked.value) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (!file) continue;
    event.preventDefault();
    rememberRange();
    void uploadAndInsert(file);
    return;
  }
}
</script>

<template>
  <div class="rich-editor" :class="{ 'rich-editor--disabled': disabled }">
    <div class="rich-editor__toolbar">
      <button type="button" class="rich-editor__btn" :disabled="locked" title="加粗" @click="exec('bold')">
        <b>B</b>
      </button>
      <button type="button" class="rich-editor__btn" :disabled="locked" title="斜体" @click="exec('italic')">
        <i>I</i>
      </button>
      <button type="button" class="rich-editor__btn" :disabled="locked" title="下划线" @click="exec('underline')">
        <u>U</u>
      </button>
      <span class="rich-editor__sep" />
      <button
        type="button"
        class="rich-editor__btn"
        :disabled="locked"
        title="无序列表"
        @click="exec('insertUnorderedList')"
      >
        • 列表
      </button>
      <button
        type="button"
        class="rich-editor__btn"
        :disabled="locked"
        title="有序列表"
        @click="exec('insertOrderedList')"
      >
        1. 列表
      </button>
      <span class="rich-editor__sep" />
      <button
        type="button"
        class="rich-editor__btn"
        :disabled="locked"
        title="插入图片（或直接 Ctrl+V 粘贴截图）"
        @click="pickImage"
      >
        <el-icon><Picture /></el-icon>
        图片
      </button>
      <button
        type="button"
        class="rich-editor__btn"
        :disabled="locked"
        title="清除格式"
        @click="exec('removeFormat')"
      >
        <el-icon><RefreshLeft /></el-icon>
      </button>
      <span v-if="uploading" class="rich-editor__uploading">
        <el-icon class="rich-editor__spin"><Loading /></el-icon>
        图片上传中…
      </span>
      <input
        ref="fileInputRef"
        class="rich-editor__file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
        @change="onFileChange"
      />
    </div>

    <div
      ref="editorRef"
      class="rich-editor__area rich-text"
      :class="{ 'rich-editor__area--disabled': disabled }"
      :style="{ minHeight: `${minHeight}px` }"
      :contenteditable="!disabled"
      :data-placeholder="placeholder"
      @input="onInput"
      @paste="onPaste"
      @keyup="rememberRange"
      @mouseup="rememberRange"
      @focus="rememberRange"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

@keyframes rich-editor-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rich-editor {
  width: 100%;
  border: 1px solid $border-color;
  border-radius: $radius-base;
  background: $bg-paper;
  overflow: hidden;
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus-within {
    border-color: rgba($color-primary, 0.55);
    box-shadow: 0 0 0 3px rgba($color-primary, 0.12);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid $border-color;
    background: $color-table-head;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: $radius-sm;
    background: transparent;
    font-size: 12px;
    color: $text-secondary;
    cursor: pointer;
    transition: background-color $transition-fast, color $transition-fast, border-color $transition-fast;

    &:hover:not(:disabled) {
      border-color: $border-color;
      background: $bg-paper;
      color: $color-primary;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__sep {
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background: $border-color;
  }

  &__file {
    display: none;
  }

  &__uploading {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: 12px;
    color: $color-primary;
  }

  &__spin {
    animation: rich-editor-spin 1s linear infinite;
  }

  &__area {
    padding: 10px 12px;
    outline: none;
    font-size: 14px;
    line-height: 1.75;
    color: $text-primary;
    overflow-y: auto;
    max-height: 320px;

    &--disabled {
      background: #f8fafc;
      cursor: not-allowed;
    }

    &:empty::before {
      content: attr(data-placeholder);
      color: $text-disabled;
      pointer-events: none;
    }
  }
}
</style>
