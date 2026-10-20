<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import { Search, Refresh } from '@element-plus/icons-vue';
import PageHeader from '@/components/common/PageHeader.vue';
import { positionsApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import type { Position } from '@/types';

const { data: positions, loading, error: loadError, refresh: load } = useRequest(() => positionsApi.list());
const keyword = ref('');
const filtered = computed(() => (positions.value ?? []).filter(item => (item.name + ' ' + (item.description ?? '')).toLowerCase().includes(keyword.value.trim().toLowerCase())));
const saving = ref(false);
const removing = ref('');
const mutationBusy = computed(() => saving.value || Boolean(removing.value));
const dialogOpen = ref(false);
const dialog = computed({ get: () => dialogOpen.value, set: (value: boolean) => { if (!saving.value) dialogOpen.value = value; } });
const editId = ref('');
const form = reactive({ name: '', description: '' });
const nameError = ref('');
const saveError = ref('');
const actionError = ref('');
const formHost = ref<HTMLElement>();
const actionErrorRef = ref<HTMLElement>();
function open(item?: Position): void {
  if (mutationBusy.value) return;
  editId.value = item?.id ?? '';
  Object.assign(form, { name: item?.name ?? '', description: item?.description ?? '' });
  nameError.value = ''; saveError.value = ''; dialogOpen.value = true;
}
async function save(): Promise<void> {
  if (mutationBusy.value) return;
  nameError.value = form.name.trim() ? '' : '请输入岗位名称';
  if (nameError.value) { await nextTick(); formHost.value?.querySelector('input')?.focus(); return; }
  saving.value = true; saveError.value = '';
  const id = editId.value;
  const data = { name: form.name.trim(), description: form.description.trim() };
  try {
    if (id) await positionsApi.update(id, data); else await positionsApi.create(data);
    dialogOpen.value = false; ElMessage.success('岗位已保存'); await load();
  } catch {
    saveError.value = '岗位保存失败，填写内容已保留，请重试。';
    await nextTick(); formHost.value?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  } finally { saving.value = false; }
}
async function remove(item: Position): Promise<void> {
  if (mutationBusy.value) return;
  removing.value = item.id; actionError.value = '';
  try {
    await ElMessageBox.confirm('确认删除岗位“' + item.name + '”？', '删除岗位', { type: 'warning' });
  } catch { removing.value = ''; return; }
  try {
    await positionsApi.remove(item.id); ElMessage.success('岗位已删除'); await load();
  } catch {
    actionError.value = '岗位“' + item.name + '”删除失败，请检查岗位引用情况后重试。';
    await nextTick(); actionErrorRef.value?.focus();
  } finally { removing.value = ''; }
}
</script>
<template>
  <div data-ui-layout="list" data-ui-page="PositionManagePage" class="position-page admin-page">
    <PageHeader title="岗位管理" description="维护岗位信息，用于组织属性与考试人员圈选"><template #actions><el-button type="primary" :disabled="mutationBusy" @click="open()">新增岗位</el-button></template></PageHeader>
    <el-card class="table-card" shadow="never">
      <div class="admin-toolbar"><span class="admin-scope">全部岗位 · {{ loading ? '加载中' : loadError ? '数量未知' : filtered.length + ' 条匹配' }}</span><el-input v-model="keyword" class="admin-keyword" :prefix-icon="Search" clearable placeholder="搜索岗位名称、说明" /><el-button :icon="Refresh" :loading="loading" :disabled="mutationBusy" @click="load">刷新</el-button></div>
      <div v-if="actionError" ref="actionErrorRef" role="alert" tabindex="-1"><el-alert :title="actionError" type="error" :closable="false" show-icon /></div>
      <LoadingSkeleton v-if="loading && !positions?.length" :rows="4" />
      <RequestError v-else-if="loadError" text="岗位加载失败" @retry="load" />
      <template v-else>
        <el-table class="position-page__table" v-loading="loading" :data="filtered" row-key="id">
          <el-table-column prop="name" label="岗位名称" min-width="180" /><el-table-column prop="description" label="说明" min-width="260" />
          <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" :disabled="mutationBusy" @click="open(row as Position)">编辑</el-button><el-button link type="danger" :disabled="mutationBusy" @click="remove(row as Position)">删除</el-button></template></el-table-column>
          <template #empty><EmptyState :text="keyword ? '没有匹配的岗位' : '暂无岗位'" :filtered="Boolean(keyword)" action-text="新增岗位" @clear="keyword = ''" @action="open()" /></template>
        </el-table>
        <div class="position-page__cards" v-loading="loading">
          <article v-for="item in filtered" :key="item.id" class="position-page__item">
            <h3>{{ item.name }}</h3><p>{{ item.description || '暂无说明' }}</p>
            <div class="position-page__actions"><el-button :disabled="mutationBusy" @click="open(item)">编辑</el-button><el-button type="danger" plain :loading="removing === item.id" :disabled="mutationBusy" @click="remove(item)">删除</el-button></div>
          </article>
          <EmptyState v-if="!filtered.length" :text="keyword ? '没有匹配的岗位' : '暂无岗位'" :filtered="Boolean(keyword)" action-text="新增岗位" @clear="keyword = ''" @action="open()" />
        </div>
      </template>
    </el-card>
    <el-drawer v-model="dialog" :title="editId ? '编辑岗位' : '新增岗位'" size="520px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor">
      <div ref="formHost"><div v-if="saveError" role="alert" tabindex="-1"><el-alert :title="saveError" type="error" :closable="false" show-icon /></div>
        <el-form label-position="top" :disabled="saving" @submit.prevent="save"><el-form-item label="岗位名称" required :error="nameError"><el-input v-model="form.name" maxlength="120" @input="nameError = ''" /></el-form-item><el-form-item label="说明"><el-input v-model="form.description" type="textarea" :autosize="{minRows:3,maxRows:6}" maxlength="255" show-word-limit /></el-form-item></el-form>
      </div><template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-drawer>
  </div>
</template>
<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.position-page {
  display: flex; flex-direction: column; gap: 16px;
  &__table :deep(.cell) { overflow-wrap: anywhere; white-space: pre-wrap; }
  &__cards { display: none; }
  &__item { min-width: 0; padding: 16px; border: 1px solid $border-color; border-radius: $radius-base; background: $bg-paper; }
  &__item h3 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
  &__item p { margin: 8px 0 16px; color: $text-secondary; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
  &__actions { display: flex; flex-wrap: wrap; gap: 8px; .el-button { margin: 0; min-height: 44px; flex: 1; } }
  @media (max-width: 600px) { &__table { display: none; } &__cards { display: grid; gap: 12px; } }
}
</style>
