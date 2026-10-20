<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TableInstance } from 'element-plus';
import { Download, Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import { useRequest } from '@/composables/useRequest';
import { qualityApi } from '@/api/coreFeatures';
import { QUESTION_TYPE_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import type { DuplicateQuestionGroup } from '@/types';
const includeDisabled = ref(false);
const { data, loading, error, refresh } = useRequest(
  () => qualityApi.duplicates({ includeDisabled: includeDisabled.value ? 1 : undefined }),
  [includeDisabled], { keepPreviousData: false },
);
const rows = computed(() => data.value ?? []);
const returnedQuestions = computed(() => rows.value.reduce((sum, group) => sum + group.questions.length, 0));
const tableRef = ref<TableInstance>();
const expanded = ref<string[]>([]);
watch(data, () => { expanded.value = expanded.value.filter(key => rows.value.some(group => group.fingerprint === key)); });
function onExpand(row: DuplicateQuestionGroup, groups: DuplicateQuestionGroup[] | boolean): void {
  expanded.value = Array.isArray(groups) ? groups.map(group => group.fingerprint) : groups ? [...new Set([...expanded.value, row.fingerprint])] : expanded.value.filter(key => key !== row.fingerprint);
}
function toggle(row: DuplicateQuestionGroup): void { tableRef.value?.toggleRowExpansion(row); }
function exportCsv(): void {
  if (loading.value || error.value || !rows.value.length) return;
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
  <div data-ui-layout="compare" data-ui-page="DuplicateQuestionsPage" class="admin-page duplicates-page">
    <PageHeader title="重复题审计" description="按题型、题干、选项与答案比对内容指纹，展开查看重复题的所属题库">
      <template #actions><el-button :icon="Download" :disabled="loading || Boolean(error) || !rows.length" @click="exportCsv">导出 CSV</el-button></template>
    </PageHeader>
    <el-card class="table-card duplicate-table-card" shadow="never">
      <div class="admin-toolbar">
        <el-checkbox v-model="includeDisabled" class="duplicate-scope-toggle">包含停用题</el-checkbox>
        <span class="admin-scope">{{ includeDisabled ? '含停用题' : '启用题目' }}范围 · {{ loading ? '正在加载' : error ? '数量未知' : '已返回 ' + rows.length + ' 组重复、' + returnedQuestions + ' 道题' }} · 处理历史引用前请核查</span>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button><TableDensityToggle />
      </div>
      <RequestError v-if="error" text="重复题审计加载失败" @retry="refresh" />
      <el-table v-else ref="tableRef" v-loading="loading" :data="rows" :expand-row-keys="expanded" row-key="fingerprint" @expand-change="onExpand">
        <el-table-column type="expand" width="64"><template #default="{ row }"><section class="duplicate-detail">
          <h3>组内题目对照 · {{ row.questions.length }} 道题</h3>
          <p class="duplicate-detail__fingerprint">内容指纹：{{ row.fingerprint }}</p>
          <div class="duplicate-detail__grid">
            <article v-for="item in row.questions" :key="item.id" class="duplicate-question">
              <h4>{{ item.bankName }}</h4>
              <div class="duplicate-question__meta"><span>{{ QUESTION_TYPE_LABELS[item.type as keyof typeof QUESTION_TYPE_LABELS] || item.type }}</span><el-tag :type="item.status === 'active' ? 'success' : 'info'">{{ item.status === 'active' ? '启用' : '停用' }}</el-tag></div>
              <p class="duplicate-question__stem">{{ item.stem }}</p>
              <dl><div><dt>科目</dt><dd>{{ item.subject || '未设置' }}</dd></div><div><dt>题目 ID</dt><dd>{{ item.id }}</dd></div><div><dt>创建时间</dt><dd>{{ formatDateTime(item.createdAt) }}</dd></div></dl>
              <router-link class="duplicate-question__link" :to="{ path: '/author/banks', query: { bankId: item.bankId } }">打开题库</router-link>
            </article>
          </div>
        </section></template></el-table-column>
        <el-table-column label="重复题目摘要" min-width="360"><template #default="{ row }"><p class="duplicate-summary">{{ row.questions[0]?.stem }}</p><el-button link type="primary" @click="toggle(row as DuplicateQuestionGroup)">{{ expanded.includes(row.fingerprint) ? '收起对照' : '展开对照' }}</el-button></template></el-table-column>
        <el-table-column prop="count" label="重复题数" width="110" align="right" />
        <el-table-column prop="fingerprint" label="内容指纹" min-width="250" show-overflow-tooltip />
        <template #empty><EmptyState text="当前审计范围未发现重复题" /></template>
      </el-table>
    </el-card>
  </div>
</template>
<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.duplicate-table-card { container-type: inline-size; }
.duplicates-page :deep(.el-table__expanded-cell) { padding: 0; }
.duplicates-page :deep(.el-table__expand-column .cell) { display: flex; justify-content: center; padding: 0; }
.duplicate-summary { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.duplicate-detail { box-sizing: border-box; width: 100cqw; max-width: 100%; padding: 20px; background: $bg-page; h3 { margin: 0 0 8px; font-size: 14px; } &__fingerprint { margin: 0 0 16px; color: $text-secondary; font-size: 12px; overflow-wrap: anywhere; } &__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } }
.duplicate-question { min-width: 0; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-paper; h4 { margin: 0 0 12px; font-size: 14px; overflow-wrap: anywhere; } &__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 12px; color: $text-secondary; } &__stem { margin-block: 16px; white-space: pre-wrap; overflow-wrap: anywhere; } dl { display: grid; gap: 10px; margin: 0; } dt { font-size: 12px; color: $text-secondary; } dd { margin: 2px 0 0; overflow-wrap: anywhere; } &__link { display: inline-flex; align-items: center; min-height: 36px; margin-top: 12px; color: $color-primary; } }
@media(max-width: 900px) { .duplicate-detail { padding: 16px; } .duplicate-detail__grid { grid-template-columns: minmax(0, 1fr); } .duplicate-question__link, .duplicate-scope-toggle { min-height: 44px; } .duplicates-page :deep(.el-table__expand-icon) { display: grid; place-items: center; width: 44px; height: 44px; } }
</style>
