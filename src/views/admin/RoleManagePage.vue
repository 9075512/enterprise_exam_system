<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import RoleMenuPicker from '@/components/common/RoleMenuPicker.vue';
import { rolesApi } from '@/api/roles';
import { getMenuPermissions } from '@/api/permissions';
import * as usersApi from '@/api/users';
import { ROLE_LABELS } from '@/constants';
import type { MenuPermission, Role, RoleDefinition, User } from '@/types';

const roles = ref<RoleDefinition[]>([]);
const catalog = ref<MenuPermission['catalog']>([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const editing = ref<RoleDefinition>();
const formRef = ref<FormInstance>();
const form = reactive({ name: '', baseRole: 'examinee' as Role, description: '', menuKeys: [] as string[] });
const membersDialog = ref(false);
const membersLoading = ref(false);
const selectedRole = ref<RoleDefinition>();
const users = ref<User[]>([]);
const memberIds = ref<string[]>([]);
const originalIds = ref<string[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getMenuPermissions();
    roles.value = data.roles;
    catalog.value = data.catalog;
  } catch { /* API interceptor displays errors. */ }
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
  if (!await formRef.value?.validate().catch(() => false)) return;
  saving.value = true;
  try {
    const payload = { ...form, name: form.name.trim(), description: form.description.trim() };
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
async function openMembers(role: RoleDefinition): Promise<void> {
  selectedRole.value = role;
  membersLoading.value = true;
  membersDialog.value = true;
  users.value = [];
  memberIds.value = [];
  try {
    const [all, ids] = await Promise.all([usersApi.list(), rolesApi.members(role.id)]);
    users.value = all; memberIds.value = ids; originalIds.value = [...ids];
  } catch { membersDialog.value = false; }
  finally { membersLoading.value = false; }
}
async function saveMembers(): Promise<void> {
  if (!selectedRole.value) return;
  saving.value = true;
  try {
    await rolesApi.replaceMembers(selectedRole.value.id, memberIds.value);
    membersDialog.value = false;
    ElMessage.success('成员已更新，角色变更的成员需重新登录');
    await load();
  } catch { /* API interceptor displays errors. */ }
  finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="role-page">
    <PageHeader title="角色管理" description="按基础身份创建角色，统一维护成员与菜单权限">
      <template #actions><el-button type="primary" :disabled="loading || !roles.length" @click="open()">新增角色</el-button></template>
    </PageHeader>
    <el-card shadow="never" v-loading="loading">
      <el-table :data="roles" row-key="id">
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
      </el-table>
    </el-card>
    <el-dialog v-model="dialog" :title="editing ? '编辑角色' : '新增角色'" width="720px" destroy-on-close :close-on-click-modal="!saving">
      <el-form ref="formRef" :model="form" label-position="top">
        <el-form-item label="角色名称" prop="name" :rules="[{ required: true, whitespace: true, message: '请输入角色名称', trigger: 'blur' }]">
          <el-input v-model="form.name" maxlength="120" :disabled="editing?.isBuiltin" />
        </el-form-item>
        <el-form-item label="基础身份"><el-select v-model="form.baseRole" :disabled="Boolean(editing)" @change="changeBase"><el-option v-for="(label, value) in ROLE_LABELS" :key="value" :label="label" :value="value" /></el-select><div class="hint">基础身份决定业务能力，创建后不可修改。</div></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" maxlength="255" show-word-limit /></el-form-item>
        <el-form-item label="菜单权限"><RoleMenuPicker v-model="form.menuKeys" :base-role="form.baseRole" :catalog="catalog" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="membersDialog" :title="`分配成员 · ${selectedRole?.name ?? ''}`" width="620px" destroy-on-close>
      <div v-loading="membersLoading">
        <el-alert type="info" :closable="false" show-icon :title="selectedRole?.isBuiltin ? '加入成员会替换其原角色；现有成员请通过用户管理切换角色。' : '加入成员会替换其原角色；移出成员将回到对应身份的内置角色。'" />
        <el-select v-model="memberIds" multiple filterable placeholder="选择成员" class="members-select" :disabled="membersLoading">
          <el-option v-for="user in users" :key="user.id" :label="`${user.name}（${user.username}）· ${user.roleName}`" :value="user.id"
            :disabled="Boolean(selectedRole?.isBuiltin && originalIds.includes(user.id))" />
        </el-select>
      </div>
      <template #footer><el-button @click="membersDialog = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="membersLoading" @click="saveMembers">保存成员</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.role-page { display: flex; flex-direction: column; gap: 16px; }
.hint { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); width: 100%; }
.members-select { width: 100%; margin-top: 18px; }
</style>
