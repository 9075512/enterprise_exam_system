<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import TableActions from '@/components/common/TableActions.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { formatDateTime } from '@/utils/datetime';
import { templatesApi } from '@/api/coreFeatures';
import type { AudienceTemplate, PaperTemplate } from '@/types';

type Kind = 'paper' | 'audience';
const tab = ref<Kind>('paper');
const keyword = ref('');
const { data, loading, error, refresh } = useRequest(async () => {
  const [papers, audiences] = await Promise.all([templatesApi.papers(), templatesApi.audiences()]);
  return { papers, audiences };
});
const rows = computed(() => {
  const all = (tab.value === 'paper' ? data.value?.papers : data.value?.audiences) ?? [];
  const q = keyword.value.trim().toLowerCase();
  return all.filter(item => (item.name + ' ' + item.description).toLowerCase().includes(q));
});
const dialog = ref(false);
const kind = ref<Kind>('paper');
const editId = ref('');
const saving = ref(false);
const form = reactive({ name: '', description: '', json: '{}' });
const { confirm } = useConfirm();
function open(k: Kind, item?: PaperTemplate | AudienceTemplate): void {
  kind.value = k;
  editId.value = item?.id ?? '';
  form.name = item?.name ?? '';
  form.description = item?.description ?? '';
  form.json = JSON.stringify(item ? ('config' in item ? item.config : item.rules) : (k === 'paper' ? {} : {
    departmentIds: [], roleIds: [], positionIds: [], includeUserIds: [], excludeUserIds: [], includeSubDepartments: true, randomCount: null,
  }), null, 2);
  dialog.value = true;
}
async function save(): Promise<void> {
  if (saving.value) return;
  if (!form.name.trim()) { ElMessage.warning('请输入模板名称'); return; }
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(form.json);
    if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error();
  } catch { ElMessage.error('参数须为有效的 JSON 对象'); return; }
  saving.value = true;
  try {
    const base = { name: form.name.trim(), description: form.description.trim() };
    if (kind.value === 'paper') await templatesApi.savePaper({ ...base, config }, editId.value || undefined);
    else await templatesApi.saveAudience({ ...base, rules: config as unknown as AudienceTemplate['rules'] }, editId.value || undefined);
    dialog.value = false;
    ElMessage.success('模板已保存');
    await refresh();
  } catch { /* Keep the draft on API failure. */ }
  finally { saving.value = false; }
}
async function remove(item: PaperTemplate | AudienceTemplate): Promise<void> {
  const k = tab.value;
  if (!await confirm('确认删除模板「' + item.name + '」？', { title: '删除模板', type: 'warning' })) return;
  try {
    if (k === 'paper') await templatesApi.removePaper(item.id);
    else await templatesApi.removeAudience(item.id);
    ElMessage.success('模板已删除');
    await refresh();
  } catch { /* API interceptor */ }
}
</script>

<template>
  <div data-ui-layout="list" data-ui-page="TemplateManagePage" class="admin-page template-page">
    <PageHeader title="模板管理" description="维护组卷与人员抽考参数；已创建考试的冻结名单保持原有规则">
      <template #actions><el-button type="primary" :icon="Plus" @click="open(tab)">新增模板</el-button></template>
    </PageHeader>
    <el-card class="table-card" shadow="never">
      <el-tabs v-model="tab"><el-tab-pane label="组卷参数模板" name="paper" /><el-tab-pane label="人员抽考模板" name="audience" /></el-tabs>
      <div class="admin-toolbar">
        <span class="admin-scope">当前{{ tab === 'paper' ? '组卷参数' : '人员抽考' }}模板 · {{ error ? '数量未知' : rows.length + ' 条匹配' }}</span>
        <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="搜索模板名称、说明" class="admin-keyword" />
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button><TableDensityToggle />
      </div>
      <RequestError v-if="error" text="模板加载失败" @retry="refresh" />
      <el-table v-else v-loading="loading" :data="rows" row-key="id">
        <el-table-column prop="name" label="模板名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="260" show-overflow-tooltip><template #default="{ row }">{{ row.description || '—' }}</template></el-table-column>
        <el-table-column v-if="tab === 'audience'" label="随机人数" width="110"><template #default="{ row }">{{ row.rules.randomCount ?? '全部' }}</template></el-table-column>
        <el-table-column label="更新时间" width="180"><template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="150" class-name="table-actions-cell"><template #default="{ row }"><TableActions><el-button link type="primary" @click="open(tab, row as PaperTemplate | AudienceTemplate)">编辑</el-button><template #more><el-dropdown-item class="is-danger" @click="remove(row as PaperTemplate | AudienceTemplate)">删除</el-dropdown-item></template></TableActions></template></el-table-column>
        <template #empty><EmptyState :text="keyword ? '没有匹配的模板' : '暂无模板，创建后可在考试中复用'" :filtered="Boolean(keyword)" action-text="新增模板" @clear="keyword = ''" @action="open(tab)" /></template>
      </el-table>
    </el-card>
    <el-drawer v-model="dialog" :title="(editId ? '编辑' : '新增') + (kind === 'paper' ? '组卷参数' : '人员抽考') + '模板'" size="720px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor">
      <el-form label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="模板名称" required><el-input v-model="form.name" maxlength="120" show-word-limit placeholder="输入便于识别的模板名称" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" maxlength="255" show-word-limit placeholder="说明适用场景" /></el-form-item>
        <el-form-item label="参数 JSON" required><el-input v-model="form.json" type="textarea" :rows="12" class="admin-code-input" /><p class="admin-hint">{{ kind === 'paper' ? '可保存题库范围、题型题量、分值、目标难度与乱序参数。' : '支持 departmentIds、roleIds、positionIds、includeUserIds、excludeUserIds、includeSubDepartments、randomCount。' }}</p></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存模板</el-button></template>
    </el-drawer>
  </div>
</template>
