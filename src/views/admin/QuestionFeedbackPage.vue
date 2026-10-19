<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import { useRequest } from '@/composables/useRequest';
import { formatDateTime } from '@/utils/datetime';
import { feedbackApi } from '@/api/coreFeatures';
import type { QuestionFeedback, QuestionFeedbackStatus } from '@/types';

const status = ref<QuestionFeedbackStatus | ''>('');
const { data, loading, error, refresh } = useRequest(() => feedbackApi.list(status.value || undefined), [status], { keepPreviousData: false });
const rows = computed(() => data.value ?? []);
const dialog = ref(false);
const saving = ref(false);
const current = ref<QuestionFeedback | null>(null);
const form = reactive({ status: 'processing' as QuestionFeedbackStatus, reply: '' });
const labels: Record<QuestionFeedbackStatus, string> = { pending: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' };
const tones = { pending: 'warning', processing: 'primary', resolved: 'success', closed: 'info' } as const;
function open(row: QuestionFeedback): void {
  current.value = row;
  form.status = row.status;
  form.reply = row.reply;
  dialog.value = true;
}
async function save(): Promise<void> {
  if (!current.value || saving.value) return;
  saving.value = true;
  try {
    await feedbackApi.update(current.value.id, { ...form });
    dialog.value = false;
    ElMessage.success('处理结果已保存');
    await refresh();
  } catch { /* Keep the reply on failure. */ }
  finally { saving.value = false; }
}
</script>

<template>
  <div data-ui-layout="list" data-ui-page="QuestionFeedbackPage" class="admin-page">
    <PageHeader title="题目反馈" description="统一处理考试与练题中的纠错反馈，处理结果保留审计记录" />
    <el-card class="table-card" shadow="never">
      <div class="admin-toolbar">
        <el-select v-model="status" clearable placeholder="全部状态" class="admin-select"><el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" /></el-select>
        <span class="admin-scope">当前状态范围 · {{ error ? '数量未知' : rows.length + ' 条反馈' }}</span>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button><TableDensityToggle />
      </div>
      <RequestError v-if="error" text="题目反馈加载失败" @retry="refresh" />
      <el-table v-else v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="userName" label="反馈人" width="120" show-overflow-tooltip />
        <el-table-column label="来源" width="100"><template #default="{ row }">{{ row.source === 'exam' ? '考试' : row.source === 'practice' ? '练题' : row.source }}</template></el-table-column>
        <el-table-column prop="category" label="类型" width="120" />
        <el-table-column prop="content" label="反馈内容" min-width="280" show-overflow-tooltip />
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="tones[row.status as QuestionFeedbackStatus]">{{ labels[row.status as QuestionFeedbackStatus] }}</el-tag></template></el-table-column>
        <el-table-column label="提交时间" width="180"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" @click="open(row as QuestionFeedback)">查看并处理</el-button></template></el-table-column>
        <template #empty><EmptyState :text="status ? '该状态下暂无反馈' : '暂无题目反馈'" :filtered="Boolean(status)" @clear="status = ''" /></template>
      </el-table>
    </el-card>
    <el-drawer v-model="dialog" title="处理题目反馈" size="720px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor">
      <div class="admin-detail-block"><strong>{{ current?.userName }} · {{ current ? formatDateTime(current.createdAt) : '' }}</strong><p>{{ current?.content }}</p></div>
      <el-form label-position="top" :disabled="saving">
        <el-form-item label="处理状态"><el-select v-model="form.status"><el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" /></el-select></el-form-item>
        <el-form-item label="回复内容"><el-input v-model="form.reply" type="textarea" :rows="5" maxlength="1000" show-word-limit placeholder="输入处理说明或回复" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存处理结果</el-button></template>
    </el-drawer>
  </div>
</template>
