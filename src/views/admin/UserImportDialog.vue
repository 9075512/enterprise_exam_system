<script setup lang="ts">
/**
 * 用户批量导入弹窗（v1.5，管理员）。
 * 分「批量导入」与「导入历史」两个页签：
 * - 批量导入：下载模板 → 上传 .xlsx → 解析预览 → 确认导入（逐行创建，失败不阻断其余行）。
 * - 导入历史：查看历史批次（文件名 / 成功 / 失败 / 时间）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { UploadFile, UploadInstance } from 'element-plus';
import { Download, UploadFilled } from '@element-plus/icons-vue';
import * as userImportApi from '@/api/userImport';
import { useSettingsStore } from '@/stores/settings';
import { IMPORT_ALLOWED_EXTENSION } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import type { UserCommitResult, UserImportBatch, UserPreviewResult } from '@/types';

const props = defineProps<{
  visible: boolean;
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

const HEADERS = ['登录账号', '姓名', '角色', '科室', '邮箱', '初始密码'] as const;

/** 页签：wizard = 批量导入；history = 导入历史 */
const tab = ref<'wizard' | 'history'>('wizard');

/* ------------------------------ 批量导入 ------------------------------ */
/** 当前步骤索引（0 下载模板 / 1 上传 / 2 预览 / 3 完成） */
const step = ref(0);
const activeStep = computed<number>(() => (step.value >= 3 ? 4 : step.value));

const uploadRef = ref<UploadInstance>();
const selectedFile = ref<File | null>(null);
const preview = ref<UserPreviewResult | null>(null);
const result = ref<UserCommitResult | null>(null);

const parsing = ref(false);
const committing = ref(false);
const downloading = ref(false);

onMounted(() => {
  void settingsStore.load();
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void settingsStore.load();
      resetWizard();
      tab.value = 'wizard';
      void loadHistory();
    }
  },
);

function resetWizard(): void {
  step.value = 0;
  selectedFile.value = null;
  preview.value = null;
  result.value = null;
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

/** 下载用户导入模板 */
async function handleDownloadTemplate(): Promise<void> {
  downloading.value = true;
  try {
    const blob = await userImportApi.downloadUserTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-import-template.xlsx';
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
    preview.value = await userImportApi.previewUsers(selectedFile.value);
    step.value = 2;
  } catch {
    // 错误提示已由拦截器统一弹出
  } finally {
    parsing.value = false;
  }
}

/** 确认导入 */
async function handleCommit(): Promise<void> {
  if (!preview.value || !selectedFile.value) return;
  committing.value = true;
  try {
    result.value = await userImportApi.commitUsers({
      fileName: selectedFile.value.name,
      validRows: preview.value.validRows,
      errors: preview.value.errors,
    });
    ElMessage.success(`导入完成：成功 ${result.value.successCount} 条，失败 ${result.value.failCount} 条`);
    step.value = 3;
    emit('imported');
  } catch {
    // 错误提示已由拦截器统一弹出
  } finally {
    committing.value = false;
  }
}

/** 再导入一批 */
function importAgain(): void {
  step.value = 1;
  selectedFile.value = null;
  preview.value = null;
  result.value = null;
  uploadRef.value?.clearFiles();
}

/* ------------------------------ 导入历史 ------------------------------ */
const historyLoading = ref(false);
const historyList = ref<UserImportBatch[]>([]);
const historyPage = ref(1);
const historyPageSize = ref(10);
const historyTotal = ref(0);

async function loadHistory(): Promise<void> {
  historyLoading.value = true;
  try {
    const data = await userImportApi.userBatches(historyPage.value, historyPageSize.value);
    historyList.value = data.list;
    historyTotal.value = data.total;
  } catch {
    historyList.value = [];
    historyTotal.value = 0;
  } finally {
    historyLoading.value = false;
  }
}

function handleHistoryPageChange(p: number): void {
  historyPage.value = p;
  void loadHistory();
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量导入账号"
    width="760px"
    top="6vh"
    append-to-body
    destroy-on-close
    @closed="resetWizard"
  >
    <el-tabs v-model="tab">
      <!-- 批量导入 -->
      <el-tab-pane label="批量导入" name="wizard">
        <el-steps :active="activeStep" finish-status="success" align-center class="user-import__steps">
          <el-step title="下载模板" />
          <el-step title="上传文件" />
          <el-step title="预览结果" />
          <el-step title="完成" />
        </el-steps>

        <!-- 步骤 0：下载模板 -->
        <div v-if="step === 0" class="user-import__pane">
          <el-button :icon="Download" :loading="downloading" @click="handleDownloadTemplate">
            下载导入模板
          </el-button>
          <div class="user-import__hint">
            <p><strong>模板 6 列表头：</strong>{{ HEADERS.join('、') }}</p>
            <p><strong>角色：</strong>管理员 / 出题人 / 考生（亦接受 admin / author / examinee）。</p>
            <p><strong>科室：</strong>仅「考生」必填，填写科室名称须与系统内已有科室一致。</p>
            <p><strong>初始密码：</strong>留空则使用系统默认密码；邮箱用于邮件通知，可留空。</p>
          </div>
        </div>

        <!-- 步骤 1：上传文件 -->
        <div v-else-if="step === 1" class="user-import__pane">
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

        <!-- 步骤 2：预览结果 -->
        <div v-else-if="step === 2 && preview" class="user-import__pane">
          <div class="user-import__stats">
            <div class="user-import__stats-item user-import__stats-item--success">
              成功 {{ preview.successCount }} 条
            </div>
            <div class="user-import__stats-item user-import__stats-item--fail">
              失败 {{ preview.failCount }} 条
            </div>
            <div class="user-import__stats-item">共 {{ preview.totalRows }} 行</div>
          </div>

          <div class="user-import__errors-header">
            <span>失败明细（{{ preview.errors.length }}）</span>
          </div>
          <el-table :data="preview.errors" border stripe max-height="280" empty-text="没有失败行">
            <el-table-column prop="row" label="行号" width="80" align="center" />
            <el-table-column prop="column" label="列" width="120" />
            <el-table-column prop="value" label="原始值" min-width="140" show-overflow-tooltip />
            <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
          </el-table>

          <p class="user-import__tip">确认后将仅写入成功的 {{ preview.successCount }} 条，失败行将被跳过。</p>
        </div>

        <!-- 步骤 3：完成 -->
        <div v-else-if="step === 3 && result" class="user-import__pane user-import__done">
          <el-result icon="success" title="导入完成">
            <template #sub-title>
              <p>成功 {{ result.successCount }} 条 · 失败 {{ result.failCount }} 条 · 共 {{ result.totalRows }} 行</p>
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
            <el-button type="primary" :disabled="!selectedFile" :loading="parsing" @click="handlePreview">
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
      </el-tab-pane>

      <!-- 导入历史 -->
      <el-tab-pane label="导入历史" name="history">
        <el-table v-loading="historyLoading" :data="historyList" row-key="id" border stripe max-height="360">
          <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip />
          <el-table-column label="成功" width="90" align="center">
            <template #default="{ row }">{{ row.successCount }}</template>
          </el-table-column>
          <el-table-column label="失败" width="90" align="center">
            <template #default="{ row }">{{ row.failCount }}</template>
          </el-table-column>
          <el-table-column label="总行数" width="90" align="center">
            <template #default="{ row }">{{ row.totalRows }}</template>
          </el-table-column>
          <el-table-column label="导入时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <template #empty>暂无导入历史</template>
        </el-table>

        <el-pagination
          v-if="historyTotal > historyPageSize"
          class="user-import__pager"
          layout="total, prev, pager, next"
          :total="historyTotal"
          :page-size="historyPageSize"
          :current-page="historyPage"
          @current-change="handleHistoryPageChange"
        />
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.user-import {
  &__steps {
    margin-bottom: 20px;
  }

  &__pane {
    min-height: 180px;
  }

  &__hint {
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

  &__stats {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__stats-item {
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

  &__errors-header {
    margin-bottom: 8px;
    font-weight: 600;
    color: $text-primary;
  }

  &__tip {
    margin: 12px 0 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__done {
    display: flex;
    justify-content: center;
  }

  &__pager {
    margin-top: 16px;
    justify-content: flex-end;
  }
}
</style>
