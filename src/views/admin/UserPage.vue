<script setup lang="ts">
/**
 * 用户管理（W3-T2，管理员）。
 * 筛选（角色/关键字）+ 表格 + 新建/编辑弹窗 + 重置密码 / 启用停用 / 删除（1005 由拦截器提示）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search, Refresh, Upload } from '@element-plus/icons-vue';
import * as departmentsApi from '@/api/departments';
import * as usersApi from '@/api/users';
import { groupsApi, positionsApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { validateAndFocus } from '@/composables/useFormFocus';
import { useSettingsStore } from '@/stores/settings';
import { ROLE_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { buildDepartmentNameMap, buildDepartmentTree } from '@/utils/departmentTree';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import TableActions from '@/components/common/TableActions.vue';
import UserImportDialog from '@/views/admin/UserImportDialog.vue';
import type { Position, Role, User, UserGroup } from '@/types';

const { confirm } = useConfirm();
const settingsStore = useSettingsStore();

/** 批量导入账号弹窗 */
const importDialogVisible = ref(false);
const positions = ref<Position[]>([]);
const groups = ref<UserGroup[]>([]);

onMounted(() => {
  void settingsStore.load();
  void Promise.all([positionsApi.list(), groupsApi.list()]).then(([p, g]) => { positions.value = p; groups.value = g; });
});

/* ------------------------------ 科室映射 ------------------------------ */
const { data: departments } = useRequest(() => departmentsApi.list());
const departmentNameMap = computed<Record<string, string>>(() =>
  buildDepartmentNameMap(departments.value ?? []),
);
/** 科室树（所属科室可挂任意节点）。 */
const departmentTree = computed(() => buildDepartmentTree(departments.value ?? []));

/* ------------------------------ 列表 ------------------------------ */
const filterGroupId = ref('');
const filterKeyword = ref('');

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() => Boolean(filterGroupId.value || filterKeyword.value.trim()));

const {
  data: users,
  loading,
  refresh,
} = useRequest(() =>
  usersApi.list({
    groupId: filterGroupId.value || undefined,
    keyword: filterKeyword.value.trim() || undefined,
  }),
);

function onSearch(): void {
  void refresh();
}

function onReset(): void {
  filterGroupId.value = '';
  filterKeyword.value = '';
  void refresh();
}

/* ------------------------------ 弹窗 ------------------------------ */
const dialogVisible = ref(false);
const editingId = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  username: '',
  name: '',
  role: 'examinee' as Role,
  departmentId: '',
  positionId: '',
  groupIds: [] as string[],
  email: '',
  status: 'active' as User['status'],
  password: '',
});

/** 当前选中用户组派生的唯一系统角色。 */
const derivedFormRole = computed<Role | ''>(() => {
  const roles = [...new Set(
    form.groupIds
      .map((id) => groups.value.find((group) => group.id === id)?.role)
      .filter((role): role is Role => Boolean(role)),
  )];
  return roles.length === 1 ? roles[0] : '';
});

watch(derivedFormRole, (role) => {
  if (role) form.role = role;
});

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '账号需为 3~20 位字母/数字/下划线', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  groupIds: [{ type: 'array', required: true, min: 1, message: '请至少选择一个用户组', trigger: 'change' }],
  email: [
    {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: '邮箱格式不正确',
      trigger: 'blur',
    },
  ],
  password: [
    {
      // 留空表示使用默认密码 / 不修改密码；非空时校验长度
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        if (value.length < settingsStore.settings.minPasswordLength) {
          callback(new Error(`密码长度不能少于 ${settingsStore.settings.minPasswordLength} 位`));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
}));

function openCreate(): void {
  editingId.value = '';
  form.username = '';
  form.name = '';
  form.role = 'examinee';
  form.departmentId = '';
  form.positionId = '';
  form.groupIds = ['role-group-examinee'];
  form.email = '';
  form.status = 'active';
  form.password = '';
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

function openEdit(user: User): void {
  editingId.value = user.id;
  form.username = user.username;
  form.name = user.name;
  form.role = user.role;
  form.departmentId = user.departmentId;
  form.positionId = user.positionId;
  form.groupIds = user.groupIds.length ? [...user.groupIds] : [`role-group-${user.role}`];
  form.email = user.email;
  form.status = user.status;
  form.password = '';
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await validateAndFocus(formRef.value);
  if (!valid) return;

  if (!derivedFormRole.value) {
    ElMessage.warning('所选用户组必须属于同一系统角色');
    return;
  }

  if (derivedFormRole.value === 'examinee' && !form.departmentId) {
    ElMessage.warning('考生必须归属一个科室');
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      username: form.username.trim(),
      name: form.name.trim(),
      role: derivedFormRole.value,
      departmentId: form.departmentId,
      positionId: form.positionId,
      groupIds: form.groupIds,
      email: form.email.trim() ? form.email.trim() : undefined,
      status: form.status,
      password: form.password ? form.password : undefined,
    };
    if (editingId.value) {
      await usersApi.update(editingId.value, payload);
      ElMessage.success('用户已更新');
    } else {
      await usersApi.create(payload);
      ElMessage.success('用户已创建');
    }
    dialogVisible.value = false;
    void refresh();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

/* ------------------------------ 行操作 ------------------------------ */
const busy = ref(false);

async function handleResetPassword(user: User): Promise<void> {
  const ok = await confirm(`将把「${user.name}」的密码重置为默认密码 ${settingsStore.settings.defaultPassword}`, {
    title: '重置密码',
    confirmButtonText: '确认重置',
    type: 'warning',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await usersApi.resetPassword(user.id);
    ElMessage.success('密码已重置为默认密码');
  } catch {
    // 拦截器已提示
  } finally {
    busy.value = false;
  }
}

/** 强制下线该用户的全部登录设备（v1.7③）。 */
async function handleForceLogout(user: User): Promise<void> {
  const ok = await confirm(`将强制下线「${user.name}」的全部登录设备`, {
    title: '强制下线',
    confirmButtonText: '确认下线',
    type: 'warning',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const res = await usersApi.revokeSessions(user.id);
    ElMessage.success(res.count > 0 ? `已下线 ${res.count} 台设备` : '该用户当前没有在线设备');
  } catch {
    // 拦截器已提示
  } finally {
    busy.value = false;
  }
}

/** 管理员强制重置该账号的两步验证（v1.8② U2）。 */
async function handleResetTwoFactor(user: User): Promise<void> {
  const ok = await confirm(
    `将重置「${user.name}」的两步验证：清空其密钥与全部恢复码，并强制其所有设备下线`,
    { title: '重置两步验证', confirmButtonText: '确认重置', type: 'warning' },
  );
  if (!ok) return;
  busy.value = true;
  try {
    await usersApi.resetTwoFactor(user.id);
    ElMessage.success('已重置该账号的两步验证');
    await refresh();
  } catch {
    // 拦截器已提示
  } finally {
    busy.value = false;
  }
}

async function handleToggleStatus(user: User): Promise<void> {
  const next = user.status === 'active' ? 'disabled' : 'active';
  busy.value = true;
  try {
    await usersApi.update(user.id, {
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
      positionId: user.positionId,
      groupIds: user.groupIds,
      email: user.email,
      status: next,
    });
    ElMessage.success(next === 'active' ? '账号已启用' : '账号已停用');
    void refresh();
  } catch {
    // 拦截器已提示
  } finally {
    busy.value = false;
  }
}

async function handleDelete(user: User): Promise<void> {
  const ok = await confirm(`确定删除用户「${user.name}」吗？存在考试记录或为当前账号时无法删除`, {
    title: '删除用户',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await usersApi.remove(user.id);
    ElMessage.success('用户已删除');
    void refresh();
  } catch {
    // 1005 等错误已由拦截器提示；不刷新
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="user-page">
    <PageHeader title="用户管理" description="维护系统账号、所属用户组与科室；角色由用户组自动确定">
      <template #actions>
        <el-button :icon="Upload" @click="importDialogVisible = true">批量导入账号</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
      </template>
    </PageHeader>

    <el-card class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-select v-model="filterGroupId" class="user-page__filter-item" placeholder="全部用户组" clearable filterable>
            <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
          <el-input
            v-model="filterKeyword"
            class="user-page__filter-keyword"
            placeholder="按登录账号 / 姓名搜索"
            clearable
            :prefix-icon="Search"
            @keyup.enter="onSearch"
          />
        </div>
        <div class="user-page__filter-actions">
          <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
          <TableDensityToggle />
        </div>
      </div>

      <LoadingSkeleton v-if="loading && !users" :rows="5" />

      <EmptyState
        v-else-if="!users || users.length === 0"
        :text="hasFilter ? '没有匹配的用户' : '暂无用户，点击「新建用户」添加第一个账号'"
        :filtered="hasFilter"
        action-text="新建用户"
        @clear="onReset"
        @action="openCreate"
      />

      <el-table v-else v-loading="loading" :data="users" row-key="id" stripe>
        <el-table-column prop="username" label="登录账号" width="140" show-overflow-tooltip />
        <el-table-column prop="name" label="姓名" width="120" show-overflow-tooltip />
        <el-table-column label="所属科室" min-width="140">
          <template #default="{ row }">{{ departmentNameMap[row.departmentId] || '—' }}</template>
        </el-table-column>
        <el-table-column label="岗位" min-width="120"><template #default="{ row }">{{ row.positionName || '—' }}</template></el-table-column>
        <el-table-column label="用户组 / 角色" min-width="210">
          <template #default="{ row }">
            <div class="user-page__groups">
              <el-tag v-for="gid in row.groupIds" :key="gid" size="small" effect="plain">
                {{ groups.find((group) => group.id === gid)?.name || gid }}
              </el-tag>
              <span v-if="!row.groupIds.length">—</span>
              <span class="user-page__role-text">{{ ROLE_LABELS[row.role as Role] }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邮箱" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.email || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'" effect="plain">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column class-name="table-actions-cell" label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <TableActions>
              <el-button type="primary" link @click="openEdit(row as User)">编辑</el-button>
              <el-button link @click="handleToggleStatus(row as User)">
                {{ row.status === 'active' ? '停用' : '启用' }}
              </el-button>
              <template #more>
                <el-dropdown-item @click="handleResetPassword(row as User)">重置密码</el-dropdown-item>
                <el-dropdown-item @click="handleForceLogout(row as User)">强制下线</el-dropdown-item>
                <el-dropdown-item v-if="row.twoFactorEnabled" @click="handleResetTwoFactor(row as User)">重置2FA</el-dropdown-item>
                <el-dropdown-item divided class="is-danger" @click="handleDelete(row as User)">删除</el-dropdown-item>
              </template>
            </TableActions>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            text="没有匹配的用户"
            filtered
            action-text="新建用户"
            @clear="onReset"
            @action="openCreate"
          />
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑用户' : '新建用户'"
      width="520px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="登录账号" prop="username">
          <el-input v-model="form.username" maxlength="20" placeholder="3~20 位字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" maxlength="30" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="用户组" prop="groupIds">
          <el-select v-model="form.groupIds" multiple clearable filterable class="user-page__full">
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="`${group.name}（${ROLE_LABELS[group.role]}）`"
              :value="group.id"
              :disabled="Boolean(derivedFormRole && group.role !== derivedFormRole && !form.groupIds.includes(group.id))"
            />
          </el-select>
          <div class="user-page__hint">用户的系统角色由所属用户组自动确定；可加入多个同角色用户组。</div>
        </el-form-item>
        <el-form-item label="系统角色">
          <el-input :model-value="derivedFormRole ? ROLE_LABELS[derivedFormRole] : '请先选择用户组'" disabled />
        </el-form-item>
        <el-form-item label="所属科室">
          <el-tree-select
            v-model="form.departmentId"
            :data="departmentTree"
            class="user-page__full"
            placeholder="可留空（考生必选）"
            clearable
            check-strictly
            :render-after-expand="false"
            default-expand-all
          />
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="form.positionId" clearable class="user-page__full"><el-option v-for="p in positions" :key="p.id" :label="p.name" :value="p.id" /></el-select>
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" maxlength="120" placeholder="用于邮件通知，可留空" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">启用</el-radio>
            <el-radio value="disabled">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!editingId" label="初始密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="`留空则使用默认密码 ${settingsStore.settings.defaultPassword}（至少 ${settingsStore.settings.minPasswordLength} 位）`"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <UserImportDialog v-model:visible="importDialogVisible" @imported="refresh" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.user-page__filter-item {
  width: 180px;
}

.user-page__filter-keyword {
  width: 240px;
}

.user-page__filter-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.user-page__full {
  width: 100%;
}

.user-page__groups {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.user-page__role-text,
.user-page__hint {
  color: $text-secondary;
  font-size: 12px;
}

.user-page__hint {
  margin-top: 6px;
  line-height: 1.5;
}
</style>
