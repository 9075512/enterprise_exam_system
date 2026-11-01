<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api/courses';
import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';
import type { User, Department } from '@/types';
import type { CourseAudience } from '@/api/courses';
import { buildDepartmentTree, getDescendantIds } from '@/utils/departmentTree';

const props = defineProps<{ modelValue: boolean; courseId: string; courseTitle: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>();
const loading = ref(false), saving = ref(false), error = ref(''), loaded = ref(false), conflict = ref(false);
const audience = ref<CourseAudience>({ mode: 'assigned', revision: 0, departmentIds: [], userIds: [] });
const users = ref<User[]>([]), departments = ref<Department[]>([]), keyword = ref('');
let baseline = ''; let generation = 0;
const busy = computed(() => loading.value || saving.value);
const dirty = computed(() => JSON.stringify([audience.value.departmentIds, audience.value.userIds]) !== baseline);
const tree = computed(() => buildDepartmentTree(departments.value));
const activeUsers = computed(() => users.value.filter(user => user.status === 'active' && user.role === 'examinee'));
const departmentNames = computed(() => new Map(departments.value.map(department => [department.id, department.name])));
const invalidUsers = computed(() => audience.value.userIds.filter(id => !activeUsers.value.some(user => user.id === id)));
const preview = computed(() => {
  const ids = new Set(audience.value.departmentIds.flatMap(id => [id, ...getDescendantIds(departments.value, id)]));
  return activeUsers.value.filter(user => audience.value.userIds.includes(user.id) || ids.has(user.departmentId));
});
const previewRows = computed(() => { const term = keyword.value.trim().toLocaleLowerCase(); return preview.value.filter(user => !term || `${user.name} ${user.username}`.toLocaleLowerCase().includes(term)); });
async function load(): Promise<void> {
  const current = ++generation; loading.value = true; error.value = ''; loaded.value = false; conflict.value = false;
  try {
    const [rules, people, depts] = await Promise.all([api.getCourseAudience(props.courseId), usersApi.list({ role: 'examinee' }), departmentsApi.list()]);
    if (current !== generation) return;
    audience.value = rules; users.value = people; departments.value = depts; baseline = JSON.stringify([rules.departmentIds, rules.userIds]); loaded.value = true;
  } catch (reason) { if (current === generation) error.value = (reason as Error).message || '绑定范围加载失败，请重试'; }
  finally { if (current === generation) loading.value = false; }
}
watch(() => [props.modelValue, props.courseId] as const, ([open]) => { if (open) { keyword.value = ''; void load(); } else generation++; }, { immediate: true });
async function discard(): Promise<boolean> {
  if (busy.value) return false;
  if (!loaded.value || !dirty.value) return true;
  try { await ElMessageBox.confirm('绑定范围尚未保存，确认放弃修改？', '未保存的绑定', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true; } catch { return false; }
}
async function close(): Promise<void> { if (await discard()) emit('update:modelValue', false); }
async function beforeClose(done: () => void): Promise<void> { if (await discard()) done(); }
async function reload(): Promise<void> { if (await discard()) await load(); }
async function save(): Promise<void> {
  if (busy.value || !loaded.value || conflict.value) return;
  if (invalidUsers.value.length) { error.value = '请移除已停用或不存在的指定人员后再保存'; return; }
  saving.value = true; error.value = '';
  try {
    const result = await api.saveCourseAudience(props.courseId, { revision: audience.value.revision, departmentIds: [...audience.value.departmentIds], userIds: [...audience.value.userIds] });
    audience.value = result; baseline = JSON.stringify([result.departmentIds, result.userIds]); emit('saved'); emit('update:modelValue', false); ElMessage.success('课程绑定已保存');
  } catch (reason) { error.value = (reason as Error).message || '绑定保存失败，请重试'; conflict.value = (reason as { status?: number }).status === 409; }
  finally { saving.value = false; }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="绑定学习人员" width="min(800px, 94vw)" :before-close="beforeClose" :close-on-click-modal="false" append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <p class="course-audience__title">{{ courseTitle }}</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <div v-if="loading" v-loading="true" class="course-audience__loading" aria-live="polite">正在加载科室和人员…</div>
    <template v-else-if="loaded">
      <el-alert :title="audience.mode === 'public' ? '当前为历史公开课程，保存后仅绑定范围可见。' : '仅绑定范围可学习；科室名单自动更新，取消绑定会保留历史进度。'" type="info" :closable="false" show-icon />
      <el-form label-position="top" class="course-audience__form" :disabled="busy">
        <el-form-item label="学习科室（包含下级科室）"><el-tree-select v-model="audience.departmentIds" :data="tree" multiple show-checkbox check-strictly filterable clearable collapse-tags collapse-tags-tooltip aria-label="绑定学习科室" placeholder="选择科室，可多选" /></el-form-item>
        <el-form-item label="单独指定人员（可跨科室）"><el-select v-model="audience.userIds" multiple filterable clearable collapse-tags collapse-tags-tooltip aria-label="单独指定人员" placeholder="搜索姓名或账号">
          <el-option v-for="user in activeUsers" :key="user.id" :value="user.id" :label="`${user.name}（${user.username}） · ${departmentNames.get(user.departmentId) || '无科室'}`" />
          <el-option v-for="id in invalidUsers" :key="id" :value="id" :label="`${users.find(user => user.id === id)?.name || id}（已停用或不存在，请移除）`" disabled />
        </el-select></el-form-item>
      </el-form>
      <div class="course-audience__preview-heading"><strong>生效名单预览 · {{ preview.length }} 人</strong><el-input v-model="keyword" clearable aria-label="搜索预览人员" placeholder="搜索姓名或账号" /></div>
      <p class="course-audience__note">科室和指定人员合并去重。保存时校验人员状态；学员仍需具备看课菜单权限。空名单保存后无人可看。</p>
      <el-table :data="previewRows" max-height="280" empty-text="当前范围没有启用中的考生" row-key="id"><el-table-column prop="name" label="姓名" min-width="100" /><el-table-column prop="username" label="账号" min-width="120" /><el-table-column prop="departmentName" label="科室" min-width="140" /></el-table>
    </template>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button :disabled="busy" @click="reload">重新加载</el-button><el-button type="primary" :loading="saving" :disabled="busy || !loaded || conflict" @click="save">保存绑定</el-button></template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.course-audience {
  &__title { color: $text-primary; font-size: 16px; margin: 0 0 16px; overflow-wrap: anywhere; }
  &__form { margin-top: 20px; .el-select, .el-tree-select { width: 100%; } }
  &__loading { min-height: 160px; padding: 24px; }
  &__preview-heading { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; .el-input { width: 240px; max-width: 100%; margin-left: auto; } }
  &__note { color: $text-secondary; font-size: 12px; line-height: 1.7; }
}
</style>
