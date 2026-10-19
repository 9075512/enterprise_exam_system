<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import { Search, Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import { positionsApi } from '@/api/coreFeatures';
import type { Position } from '@/types';

const positions = ref<Position[]>([]);
const loading = ref(true);
const loadError = ref(false);
const keyword = ref('');
const filtered = computed(() => positions.value.filter(item => (item.name + ' ' + item.description).toLowerCase().includes(keyword.value.trim().toLowerCase())));
const saving = ref(false);
const dialog = ref(false);
const editId = ref('');
const form = reactive({ name: '', description: '' });
async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try { positions.value = await positionsApi.list(); } catch { loadError.value = true; }
  finally { loading.value = false; }
}
function open(item?: Position): void {
  editId.value = item?.id ?? ''; Object.assign(form, { name: item?.name ?? '', description: item?.description ?? '' }); dialog.value = true;
}
async function save(): Promise<void> {
  if (saving.value) return;
  if (!form.name.trim()) { ElMessage.warning('请输入岗位名称'); return; }
  saving.value = true;
  try {
    const data = { name: form.name.trim(), description: form.description.trim() };
    if (editId.value) await positionsApi.update(editId.value, data); else await positionsApi.create(data);
    dialog.value = false; ElMessage.success('岗位已保存'); await load();
  } catch { /* interceptor */ } finally { saving.value = false; }
}
async function remove(item: Position): Promise<void> {
  try { await ElMessageBox.confirm(`确认删除岗位“${item.name}”？`, '删除岗位', { type: 'warning' }); await positionsApi.remove(item.id); ElMessage.success('岗位已删除'); await load(); } catch { /* cancellation/interceptor */ }
}
onMounted(load);
</script>
<template>
  <div data-ui-layout="list" data-ui-page="PositionManagePage" class="position-page admin-page">
    <PageHeader title="岗位管理" description="维护岗位信息，用于组织属性与考试人员圈选"><template #actions><el-button type="primary" @click="open()">新增岗位</el-button></template></PageHeader>
    <el-card class="table-card" shadow="never"><div class="admin-toolbar"><span class="admin-scope">全部岗位 · {{ loading ? '加载中' : loadError ? '数量未知' : filtered.length + ' 条匹配' }}</span><el-input v-model="keyword" class="admin-keyword" :prefix-icon="Search" clearable placeholder="搜索岗位名称、说明" /><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div><LoadingSkeleton v-if="loading && !positions.length" :rows="4" /><RequestError v-else-if="loadError" text="岗位加载失败" @retry="load" /><el-table v-else v-loading="loading" :data="filtered" row-key="id">
      <el-table-column prop="name" label="岗位名称" min-width="180" /><el-table-column prop="description" label="说明" min-width="260" />
      <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="open(row as Position)">编辑</el-button><el-button link type="danger" @click="remove(row as Position)">删除</el-button></template></el-table-column>
    <template #empty><EmptyState :text="keyword ? '没有匹配的岗位' : '暂无岗位'" :filtered="Boolean(keyword)" action-text="新增岗位" @clear="keyword = ''" @action="open()" /></template></el-table></el-card>
    <el-drawer v-model="dialog" :title="editId ? '编辑岗位' : '新增岗位'" size="520px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor"><el-form label-position="top" :disabled="saving"><el-form-item label="岗位名称" required><el-input v-model="form.name" maxlength="120" /></el-form-item><el-form-item label="说明"><el-input v-model="form.description" type="textarea" :autosize="{minRows:3,maxRows:6}" maxlength="255" show-word-limit /></el-form-item></el-form><template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template></el-drawer>
  </div>
</template>
<style scoped>.position-page { display: flex; flex-direction: column; gap: 16px; }</style>
