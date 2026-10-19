<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import { useRequest } from '@/composables/useRequest';
import { qualityApi } from '@/api/coreFeatures';
import { QUESTION_TYPE_LABELS } from '@/constants';
const includeDisabled = ref(false);
const { data, loading, error, refresh } = useRequest(
  () => qualityApi.duplicates({ includeDisabled: includeDisabled.value ? 1 : undefined }),
  [includeDisabled], { keepPreviousData: false },
);
const rows = computed(() => data.value ?? []);
function exportCsv(): void {
  const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['内容指纹', '题库', '题型', '题干', '科目', '状态', '题目ID'].map(esc).join(',')];
  for (const group of rows.value) for (const item of group.questions)
    lines.push([group.fingerprint, item.bankName, item.type, item.stem, item.subject, item.status, item.id].map(esc).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '重复题审计-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div data-ui-layout="compare" data-ui-page="DuplicateQuestionsPage" class="admin-page">
    <PageHeader title="重复题审计" description="按题型、题干、选项与答案比对内容指纹，展开查看重复题的所属题库">
      <template #actions><el-button :icon="Download" :disabled="loading || Boolean(error) || !rows.length" @click="exportCsv">导出 CSV</el-button></template>
    </PageHeader>
    <el-card class="table-card" shadow="never">
      <div class="admin-toolbar">
        <el-checkbox v-model="includeDisabled">包含停用题</el-checkbox>
        <span class="admin-scope">全题库{{ includeDisabled ? '全部' : '启用' }}题目 · {{ error ? '数量未知' : rows.length + ' 组重复' }} · 处理历史引用前请核查</span>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button><TableDensityToggle />
      </div>
      <RequestError v-if="error" text="重复题审计加载失败" @retry="refresh" />
      <el-table v-else v-loading="loading" :data="rows" row-key="fingerprint">
        <el-table-column type="expand"><template #default="{ row }"><div class="duplicate-detail"><el-table :data="row.questions" row-key="id">
          <el-table-column prop="bankName" label="题库" min-width="160" show-overflow-tooltip />
          <el-table-column label="题型" width="90"><template #default="scope">{{ QUESTION_TYPE_LABELS[scope.row.type as keyof typeof QUESTION_TYPE_LABELS] }}</template></el-table-column>
          <el-table-column prop="stem" label="题干" min-width="320" show-overflow-tooltip />
          <el-table-column prop="subject" label="科目" min-width="130" show-overflow-tooltip />
          <el-table-column label="状态" width="90"><template #default="scope"><el-tag :type="scope.row.status === 'active' ? 'success' : 'info'">{{ scope.row.status === 'active' ? '启用' : '停用' }}</el-tag></template></el-table-column>
          <el-table-column label="定位" width="100"><template #default="scope"><router-link :to="{ path: '/author/banks', query: { bankId: scope.row.bankId } }">打开题库</router-link></template></el-table-column>
        </el-table></div></template></el-table-column>
        <el-table-column label="重复题目摘要" min-width="360" show-overflow-tooltip><template #default="{ row }">{{ row.questions[0]?.stem }}</template></el-table-column>
        <el-table-column prop="count" label="重复题数" width="110" align="right" />
        <el-table-column prop="fingerprint" label="内容指纹" min-width="250" show-overflow-tooltip />
        <template #empty><EmptyState text="当前审计范围未发现重复题" /></template>
      </el-table>
    </el-card>
  </div>
</template>
<style scoped>.duplicate-detail { padding: 12px 24px; background: var(--el-fill-color-light); }</style>
