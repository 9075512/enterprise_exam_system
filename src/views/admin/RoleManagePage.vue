<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRequest } from '@/composables/useRequest';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import RoleMenuPicker from '@/components/common/RoleMenuPicker.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import { rolesApi } from '@/api/roles';
import { getMenuPermissions } from '@/api/permissions';
import * as usersApi from '@/api/users';
import { ROLE_LABELS } from '@/constants';
import type { MenuPermission, Role, RoleDefinition } from '@/types';

const roles = ref<RoleDefinition[]>([]);
const catalog = ref<MenuPermission['catalog']>([]);
const loading = ref(true);
const loadError = ref(false);
const saving = ref(false);
const dialog = ref(false);
const editing = ref<RoleDefinition>();
const formRef = ref<FormInstance>();
const form = reactive({ name: '', baseRole: 'examinee' as Role, description: '', menuKeys: [] as string[] });
const membersDialog = ref(false);
const selectedRole = ref<RoleDefinition>();
const memberIds = ref<string[]>([]);
const originalIds = ref<string[]>([]);
const memberChanges = computed(() => ({ added: memberIds.value.filter(id => !originalIds.value.includes(id)).length, removed: originalIds.value.filter(id => !memberIds.value.includes(id)).length }));
const { data: memberData, loading: membersLoading, error: membersError, refresh: refreshMembers } = useRequest(async () => {
  if (!membersDialog.value || !selectedRole.value) return null;
  const [all, ids] = await Promise.all([usersApi.list(), rolesApi.members(selectedRole.value.id)]);
  return { users: all, ids };
}, [membersDialog, selectedRole], { immediate: false, keepPreviousData: false });
watch(memberData, (data) => {
  memberIds.value = [...(data?.ids ?? [])];
  originalIds.value = [...(data?.ids ?? [])];
});
const selectedMembers = computed(() => memberIds.value.map(id => ({ id, user: memberData.value?.users.find(user => user.id === id), original: originalIds.value.includes(id) })));

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const data = await getMenuPermissions();
    roles.value = data.roles;
    catalog.value = data.catalog;
  } catch { loadError.value = true; }
  finally { loading.value = false; }
}
function open(role?: RoleDefinition): void {
  editing.value = role;
  Object.assign(form, { name: role?.name ?? '', baseRole: role?.baseRole ?? 'examinee', description: role?.description ?? '',
    menuKeys: [...(role?.menuKeys ?? roles.value.find(r => r.id === 'examinee')?.menuKeys ?? [])] });
  dialog.value = true;
  formRef.value?.clearValidate();
}
function changeBase(): void {
  form.menuKeys = [...(roles.value.find(r => r.id === form.baseRole)?.menuKeys ?? [])];
}
async function save(): Promise<void> {
  if (saving.value) return;
  if (!await formRef.value?.validate().catch(() => false) || saving.value) return;
  saving.value = true;
  try {
    const payload = { ...form, name: form.name.trim(), description: form.description.trim(), menuKeys: [...form.menuKeys] };
    if (editing.value) await rolesApi.update(editing.value.id, payload);
    else await rolesApi.create(payload);
    dialog.value = false;
    ElMessage.success('角色已保存；权限变更的成员需重新登录');
    await load();
  } catch { /* API interceptor displays errors. */ }
  finally { saving.value = false; }
}
async function remove(role: RoleDefinition): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除角色“${role.name}”？`, '删除角色', { type: 'warning' });
    await rolesApi.remove(role.id);
    ElMessage.success('角色已删除');
    await load();
  } catch { /* Cancellation or API error. */ }
}
function openMembers(role: RoleDefinition): void {
  selectedRole.value = role;
  membersDialog.value = true;
  memberIds.value = [];
  originalIds.value = [];
}
async function saveMembers(): Promise<void> {
  if (!selectedRole.value || saving.value || membersLoading.value || membersError.value || !memberData.value) return;
  saving.value = true;
  try {
    await rolesApi.replaceMembers(selectedRole.value.id, [...memberIds.value]);
    membersDialog.value = false;
    ElMessage.success('成员已更新，角色变更的成员需重新登录');
    await load();
  } catch { /* API interceptor displays errors. */ }
  finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <div data-ui-layout="list" data-ui-page="RoleManagePage" class="role-page admin-page">
    <PageHeader title="角色管理" description="按基础身份创建角色，统一维护成员与菜单权限">
      <template #actions><el-button type="primary" :disabled="loading || !roles.length" @click="open()">新增角色</el-button></template>
    </PageHeader>
    <el-card class="table-card" shadow="never"><div class="admin-toolbar"><span class="admin-scope">全部角色 · {{ loading ? '加载中' : loadError ? '数量未知' : roles.length + ' 个角色' }} · 内置身份和业务能力保持既有规则</span><el-button :loading="loading" @click="load">刷新</el-button></div>
      <LoadingSkeleton v-if="loading && !roles.length" :rows="4" /><RequestError v-else-if="loadError" text="角色加载失败" @retry="load" />
      <el-table v-else v-loading="loading" :data="roles" row-key="id">
        <el-table-column label="角色名称" min-width="160"><template #default="{ row }">{{ row.name }} <el-tag v-if="row.isBuiltin" size="small" type="info">内置</el-tag></template></el-table-column>
        <el-table-column label="基础身份" width="120"><template #default="{ row }">{{ ROLE_LABELS[row.baseRole as Role] }}</template></el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="memberCount" label="成员数" width="90" align="center" />
        <el-table-column label="已授权菜单" width="110" align="center"><template #default="{ row }">{{ row.menuKeys.length }}</template></el-table-column>
        <el-table-column label="操作" width="220"><template #default="{ row }">
          <el-button link type="primary" @click="open(row as RoleDefinition)">编辑 / 权限</el-button>
          <el-button link type="primary" @click="openMembers(row as RoleDefinition)">成员</el-button>
          <el-button link type="danger" :disabled="row.isBuiltin || row.memberCount > 0" @click="remove(row as RoleDefinition)">删除</el-button>
        </template></el-table-column>
        <template #empty><EmptyState text="暂无可用角色" /></template>
      </el-table>
    </el-card>
    <el-drawer v-model="dialog" :title="editing ? '编辑角色' : '新增角色'" size="560px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor">
      <el-form ref="formRef" :model="form" label-position="top" :disabled="saving">
        <el-form-item label="角色名称" prop="name" :rules="[{ required: true, whitespace: true, message: '请输入角色名称', trigger: 'blur' }]">
          <el-input v-model="form.name" maxlength="120" :disabled="editing?.isBuiltin" />
        </el-form-item>
        <el-form-item label="基础身份"><el-select v-model="form.baseRole" :disabled="Boolean(editing)" @change="changeBase"><el-option v-for="(label, value) in ROLE_LABELS" :key="value" :label="label" :value="value" /></el-select><div class="hint">基础身份决定业务能力，创建后不可修改。</div></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :autosize="{minRows:3,maxRows:6}" maxlength="255" show-word-limit /></el-form-item>
        <el-form-item label="菜单权限"><RoleMenuPicker v-model="form.menuKeys" :base-role="form.baseRole" :catalog="catalog" :disabled="saving" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-drawer>
    <el-drawer v-model="membersDialog" title="分配角色成员" class="role-members-drawer" size="560px" destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" data-ui-role="editor">
      <div class="role-context"><small>当前角色</small><strong>{{ selectedRole?.name }}</strong><span>{{ selectedRole ? ROLE_LABELS[selectedRole.baseRole] : '' }}</span></div>
      <div>
        <el-alert type="info" :closable="false" show-icon :title="selectedRole?.isBuiltin ? '加入成员会替换其原角色；现有成员请通过用户管理切换角色。' : '加入成员会替换其原角色；移出成员将回到对应身份的内置角色。'" />
        <LoadingSkeleton v-if="membersLoading" :rows="3" />
        <RequestError v-else-if="membersError" text="角色成员加载失败，请重试后再保存" @retry="refreshMembers" />
        <template v-else-if="memberData">
        <el-select v-model="memberIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择成员" aria-label="选择角色成员" popper-class="organization-choice-popper" class="members-select" :disabled="saving">
          <el-option v-for="user in memberData?.users ?? []" :key="user.id" :label="`${user.name}（${user.username}）· ${user.roleName}`" :value="user.id"
            :disabled="Boolean(selectedRole?.isBuiltin && originalIds.includes(user.id))" />
        </el-select>
        <p class="member-scope" role="status">当前选择 {{ memberIds.length }} 人 · 新增 {{ memberChanges.added }} 人 · 移出 {{ memberChanges.removed }} 人</p>
        <div v-if="selectedMembers.length" class="member-list" aria-label="已选成员清单"><article v-for="member in selectedMembers" :key="member.id"><strong>{{ member.user?.name || '用户信息暂不可用' }}</strong><span>{{ member.user?.username || member.id }} · {{ member.user?.roleName || '角色未知' }}</span><small>{{ member.original ? '原有成员' : '新增选择' }}<template v-if="selectedRole?.isBuiltin && member.original"> · 内置角色原成员保留</template></small></article></div>
        <EmptyState v-else text="尚未选择成员" />
        </template>
      </div>
      <template #footer><el-button :disabled="saving" @click="membersDialog = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="membersLoading || Boolean(membersError) || !memberData" @click="saveMembers">保存成员</el-button></template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.role-page { display: flex; flex-direction: column; gap: 16px; }
.hint { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); width: 100%; }
.members-select { width: 100%; margin-top: 18px; }
.role-context { padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; margin-bottom: 16px; small, span { display: block; color: $text-secondary; font-size: 12px; } strong { display: block; margin-block: 6px; overflow-wrap: anywhere; } }
.member-scope { font-size: 12px; line-height: 1.7; color: $text-secondary; margin: 16px 0; }
.member-list { display: grid; gap: 12px; article { min-width: 0; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; } strong, span, small { display: block; overflow-wrap: anywhere; } span { margin-block: 6px; font-size: 13px; } small { font-size: 12px; color: $text-secondary; } }
</style>
