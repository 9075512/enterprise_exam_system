<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import { positionsApi } from '@/api/coreFeatures';
import type { Position } from '@/types';

const positions = ref<Position[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const editId = ref('');
const form = reactive({ name: '', description: '' });
async function load(): Promise<void> {
  loading.value = true;
  try { positions.value = await positionsApi.list(); } catch { /* interceptor */ }
  finally { loading.value = false; }
}
function open(item?: Position): void {
  editId.value = item?.id ?? ''; Object.assign(form, { name: item?.name ?? '', description: item?.description ?? '' }); dialog.value = true;
}
async function save(): Promise<void> {
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
  <div class="position-page">
    <PageHeader title="岗位管理" description="维护岗位信息，用于组织属性与考试人员圈选"><template #actions><el-button type="primary" @click="open()">新增岗位</el-button></template></PageHeader>
    <el-card shadow="never" v-loading="loading"><el-table :data="positions" row-key="id">
      <el-table-column prop="name" label="岗位名称" min-width="180" /><el-table-column prop="description" label="说明" min-width="260" />
      <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="open(row as Position)">编辑</el-button><el-button link type="danger" @click="remove(row as Position)">删除</el-button></template></el-table-column>
    </el-table></el-card>
    <el-dialog v-model="dialog" :title="editId ? '编辑岗位' : '新增岗位'" width="520px" destroy-on-close><el-form label-position="top"><el-form-item label="岗位名称" required><el-input v-model="form.name" maxlength="120" /></el-form-item><el-form-item label="说明"><el-input v-model="form.description" type="textarea" maxlength="255" show-word-limit /></el-form-item></el-form><template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template></el-dialog>
  </div>
</template>
<style scoped>.position-page { display: flex; flex-direction: column; gap: 16px; }</style>
