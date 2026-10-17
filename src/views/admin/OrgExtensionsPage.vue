<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import { groupsApi, positionsApi } from '@/api/coreFeatures';
import * as usersApi from '@/api/users';
import { ROLE_LABELS } from '@/constants';
import type { Position, Role, User, UserGroup } from '@/types';

const tab = ref('groups');
const positions = ref<Position[]>([]);
const groups = ref<UserGroup[]>([]);
const users = ref<User[]>([]);
const dialog = ref(false);
const kind = ref<'position' | 'group'>('group');
const editId = ref('');
const saving = ref(false);
const form = reactive({
  name: '',
  role: 'examinee' as Role,
  description: '',
  userIds: [] as string[],
});

const dialogTitle = computed(() => {
  const action = editId.value ? '编辑' : '新增';
  return `${action}${kind.value === 'position' ? '岗位' : '用户组'}`;
});
const editingDefaultRoleGroup = computed(() => /^role-group-(admin|author|examinee)$/.test(editId.value));

function isDefaultRoleGroup(id: string): boolean {
  return /^role-group-(admin|author|examinee)$/.test(id);
}

async function load(): Promise<void> {
  [positions.value, groups.value, users.value] = await Promise.all([
    positionsApi.list(),
    groupsApi.list(),
    usersApi.list(),
  ]);
}

function open(type: 'position' | 'group', item?: Position | UserGroup): void {
  kind.value = type;
  editId.value = item?.id ?? '';
  form.name = item?.name ?? '';
  form.role = item && 'role' in item ? item.role : 'examinee';
  form.description = item?.description ?? '';
  form.userIds = item && 'userIds' in item ? [...item.userIds] : [];
  dialog.value = true;
}

async function save(): Promise<void> {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning(kind.value === 'position' ? '请输入岗位名称' : '请输入用户组名称');
    return;
  }
  saving.value = true;
  try {
    if (kind.value === 'position') {
      const payload = { name, description: form.description.trim() };
      if (editId.value) await positionsApi.update(editId.value, payload);
      else await positionsApi.create(payload);
    } else {
      const payload = { name, role: form.role, description: form.description.trim(), userIds: form.userIds };
      if (editId.value) await groupsApi.update(editId.value, payload);
      else await groupsApi.create(payload);
    }
    dialog.value = false;
    ElMessage.success('已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(type: 'position' | 'group', item: Position | UserGroup): Promise<void> {
  const typeName = type === 'position' ? '岗位' : '用户组';
  await ElMessageBox.confirm(`确认删除${typeName}“${item.name}”？`, `删除${typeName}`, { type: 'warning' });
  if (type === 'position') await positionsApi.remove(item.id);
  else await groupsApi.remove(item.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageHeader title="用户组与岗位" description="用户组统一维护成员与系统角色；岗位用于组织属性和人员圈选" />

    <el-card shadow="never">
      <el-alert
        title="每个用户组绑定一个系统角色。将成员调入其他角色的组时，系统会同步切换其角色。"
        type="info"
        :closable="false"
        show-icon
        class="group-notice"
      />

      <el-tabs v-model="tab">
        <el-tab-pane label="用户组" name="groups">
          <div class="actions"><el-button type="primary" @click="open('group')">新增用户组</el-button></div>
          <el-table :data="groups" row-key="id">
            <el-table-column prop="name" label="用户组" min-width="180" />
            <el-table-column label="系统角色" width="120">
              <template #default="{ row }"><el-tag effect="plain">{{ ROLE_LABELS[row.role as Role] }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
            <el-table-column label="成员数" width="100" align="center">
              <template #default="{ row }">{{ row.userIds.length }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" @click="open('group', row as UserGroup)">编辑</el-button>
                <el-tooltip :disabled="!isDefaultRoleGroup(row.id)" content="默认角色组不可删除">
                  <span><el-button link type="danger" :disabled="isDefaultRoleGroup(row.id)" @click="remove('group', row as UserGroup)">删除</el-button></span>
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="岗位" name="positions">
          <div class="actions"><el-button type="primary" @click="open('position')">新增岗位</el-button></div>
          <el-table :data="positions" row-key="id">
            <el-table-column prop="name" label="岗位" min-width="180" />
            <el-table-column prop="description" label="说明" min-width="260" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" @click="open('position', row as Position)">编辑</el-button>
                <el-button link type="danger" @click="remove('position', row as Position)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="dialog" :title="dialogTitle" width="560px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item :label="kind === 'position' ? '岗位名称' : '用户组名称'" required>
          <el-input v-model="form.name" maxlength="120" :disabled="kind === 'group' && editingDefaultRoleGroup" />
        </el-form-item>
        <el-form-item v-if="kind === 'group'" label="系统角色" required>
          <el-select v-model="form.role" class="full-width" :disabled="editingDefaultRoleGroup">
            <el-option label="管理员" value="admin" />
            <el-option label="出题人" value="author" />
            <el-option label="考生" value="examinee" />
          </el-select>
          <div class="field-hint">保存后，组内成员的系统角色会同步为此角色。</div>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item v-if="kind === 'group'" label="组成员">
          <el-select v-model="form.userIds" multiple filterable clearable class="full-width">
            <el-option v-for="user in users" :key="user.id" :label="`${user.name}（${user.username}）`" :value="user.id" />
          </el-select>
          <div class="field-hint">成员可属于多个同角色用户组；调入不同角色组会自动移出原角色组。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.page { display: flex; flex-direction: column; gap: 16px; }
.group-notice { margin-bottom: 12px; }
.actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.full-width { width: 100%; }
.field-hint { margin-top: 6px; color: $text-secondary; font-size: 12px; line-height: 1.5; }
</style>
