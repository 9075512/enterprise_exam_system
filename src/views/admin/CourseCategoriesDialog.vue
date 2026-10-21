<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api/courses';
import type { CourseCategory } from '@/api/courses';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>();
const items = ref<CourseCategory[]>([]); const loading = ref(false); const operation = ref('');
const listError = ref(''); const actionError = ref(''); const editing = ref<CourseCategory>();
const form = reactive({ name: '', sortOrder: 0 }); let baseline = JSON.stringify(form);
const busy = computed(() => loading.value || !!operation.value);
const dirty = computed(() => JSON.stringify(form) !== baseline);
function reset(): void { editing.value = undefined; Object.assign(form, { name: '', sortOrder: 0 }); baseline = JSON.stringify(form); }
async function load(): Promise<void> {
  loading.value = true; listError.value = '';
  try { items.value = await api.listCourseCategories(); }
  catch { listError.value = '分类列表加载失败，请重试'; }
  finally { loading.value = false; }
}
watch(() => props.modelValue, open => { if (open) { reset(); actionError.value = ''; void load(); } }, { immediate: true });
async function discard(): Promise<boolean> {
  if (busy.value) return false;
  if (!dirty.value) return true;
  try { await ElMessageBox.confirm('当前分类填写尚未保存，确认放弃？', '未保存的分类', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true; } catch { return false; }
}
async function close(): Promise<void> { if (await discard()) emit('update:modelValue', false); }
async function beforeClose(done: () => void): Promise<void> { if (await discard()) done(); }
async function edit(item: CourseCategory): Promise<void> {
  if (!await discard()) return;
  editing.value = item; form.name = item.name; form.sortOrder = item.sortOrder; baseline = JSON.stringify(form); actionError.value = '';
}
async function save(): Promise<void> {
  if (busy.value) return;
  if (!form.name.trim()) { actionError.value = '请输入分类名称'; return; }
  operation.value = 'save'; actionError.value = '';
  try {
    const input = { name: form.name.trim(), sortOrder: form.sortOrder };
    if (editing.value) await api.updateCourseCategory(editing.value.id, editing.value.revision, input); else await api.createCourseCategory(input);
    reset(); emit('changed'); ElMessage.success('分类已保存'); await load();
  } catch (error) { actionError.value = (error as Error).message || '分类保存失败，请重试'; }
  finally { operation.value = ''; }
}
async function remove(item: CourseCategory): Promise<void> {
  if (busy.value || item.courseCount) return;
  operation.value = item.id; actionError.value = '';
  try {
    try { await ElMessageBox.confirm(`删除分类“${item.name}”？`, '删除课程分类', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }); } catch { return; }
    await api.deleteCourseCategory(item.id, item.revision); if (editing.value?.id === item.id) reset(); emit('changed'); await load();
  } catch (error) { actionError.value = (error as Error).message || '分类删除失败，请重试'; }
  finally { operation.value = ''; }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="课程分类维护" width="min(680px, 94vw)" class="course-categories-dialog" destroy-on-close :before-close="beforeClose" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy" @update:model-value="$emit('update:modelValue', $event)">
    <p class="course-categories__hint">分类改名会同步到关联课程；正在被课程使用的分类不能删除。</p>
    <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" role="alert" />
    <el-form label-position="top" :disabled="busy" class="course-categories__form" @submit.prevent="save">
      <el-form-item label="分类名称" required><el-input v-model="form.name" aria-label="分类名称" maxlength="50" placeholder="例如：自救互救" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sortOrder" aria-label="分类排序" :min="0" :max="99999" :precision="0" /></el-form-item>
      <div class="course-categories__form-actions"><el-button v-if="editing" :disabled="busy" @click="reset">取消编辑</el-button><el-button type="primary" :loading="operation === 'save'" :disabled="busy" @click="save">{{ editing ? '保存分类' : '添加分类' }}</el-button></div>
    </el-form>
    <div v-if="listError" role="alert">{{ listError }} <el-button :disabled="busy" @click="load">重新加载分类</el-button></div>
    <p v-else-if="loading" role="status">正在加载分类…</p>
    <el-empty v-else-if="!items.length" description="暂无分类，先添加第一个分类" />
    <div v-else class="course-categories__list"><article v-for="item in items" :key="item.id"><div><strong>{{ item.name }}</strong><small>排序 {{ item.sortOrder }} · {{ item.courseCount }} 门课程</small></div><div><el-button :disabled="busy" @click="edit(item)">编辑</el-button><el-button type="danger" plain :disabled="busy || item.courseCount > 0" :title="item.courseCount ? '请先调整关联课程分类' : '删除未使用的分类'" @click="remove(item)">删除</el-button></div></article></div>
    <template #footer><el-button :disabled="busy" @click="close">关闭</el-button></template>
  </el-dialog>
</template>

<style lang="scss">
@use '@/styles/variables.scss' as *;
.course-categories-dialog {
  .el-alert { margin-bottom: 16px; }
  .course-categories__hint { color: $text-secondary; font-size: 12px; line-height: 1.8; }
  .course-categories__form { display: grid; grid-template-columns: minmax(0, 1fr) 140px; gap: 12px; .el-form-item { margin-bottom: 0; } .el-input-number { width: 100%; } }
  .course-categories__form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .course-categories__list article { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-top: 1px solid $border-color; padding: 14px 0; strong { font-size: 14px; overflow-wrap: anywhere; } small { display: block; color: $text-secondary; font-size: 12px; } }
}
@media (max-width: 600px) { .course-categories-dialog { .course-categories__form { grid-template-columns: minmax(0, 1fr); } .course-categories__list article { align-items: flex-start; flex-wrap: wrap; } .el-button { min-height: 44px; } } }
</style>
