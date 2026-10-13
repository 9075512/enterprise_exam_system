<script setup lang="ts">
/**
 * 用户管理（W3-T2，管理员）。
 * 筛选（角色/关键字）+ 表格 + 新建/编辑弹窗 + 重置密码 / 启用停用 / 删除（1005 由拦截器提示）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search, Refresh, Upload } from '@element-plus/icons-vue';
import * as departmentsApi from '@/api/departments';
import * as usersApi from '@/api/users';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { useSettingsStore } from '@/stores/settings';
import { ROLE_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { buildDepartmentNameMap, buildDepartmentTree } from '@/utils/departmentTree';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import UserImportDialog from '@/views/admin/UserImportDialog.vue';
import type { Role, User } from '@/types';

const { confirm } = useConfirm();
const settingsStore = useSettingsStore();

/** 批量导入账号弹窗 */
const importDialogVisible = ref(false);

onMounted(() => {
  void settingsStore.load();
});

/* ------------------------------ 科室映射 ------------------------------ */
const { data: departments } = useRequest(() => departmentsApi.list());
const departmentNameMap = computed<Record<string, string>>(() =>
  buildDepartmentNameMap(departments.value ?? []),
);
/** 科室树（所属科室可挂任意节点）。 */
const departmentTree = computed(() => buildDepartmentTree(departments.value ?? []));

/* ------------------------------ 列表 ------------------------------ */
const filterRole = ref<Role | ''>('');
const filterKeyword = ref('');

const {
  data: users,
  loading,
  refresh,
} = useRequest(() =>
  usersApi.list({
    role: filterRole.value || undefined,
    keyword: filterKeyword.value.trim() || undefined,
  }),
);

function onSearch(): void {
  void refresh();
}

function onReset(): void {
  filterRole.value = '';
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
  email: '',
  status: 'active' as User['status'],
  password: '',
});

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '账号需为 3~20 位字母/数字/下划线', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
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
  form.email = user.email;
  form.status = user.status;
  form.password = '';
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  if (form.role === 'examinee' && !form.departmentId) {
    ElMessage.warning('考生必须归属一个科室');
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      username: form.username.trim(),
      name: form.name.trim(),
      role: form.role,
      departmentId: form.departmentId,
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

async function handleToggleStatus(user: User): Promise<void> {
  const next = user.status === 'active' ? 'disabled' : 'active';
  busy.value = true;
  try {
    await usersApi.update(user.id, {
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
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
    <PageHeader title="用户管理" description="维护系统账号、角色与所属科室">
      <template #actions>
        <el-button :icon="Upload" @click="importDialogVisible = true">批量导入账号</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
      </template>
    </PageHeader>

    <el-card class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-select v-model="filterRole" class="user-page__filter-item" placeholder="全部角色" clearable>
            <el-option label="全部角色" value="" />
            <el-option label="管理员" value="admin" />
            <el-option label="出题人" value="author" />
            <el-option label="考生" value="examinee" />
          </el-select>
          <el-input
            v-model="filterKeyword"
            class="user-page__filter-keyword"
            placeholder="按用户名 / 姓名搜索"
            clearable
            :prefix-icon="Search"
            @keyup.enter="onSearch"
          />
        </div>
        <div class="user-page__filter-actions">
          <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </div>
      </div>

      <LoadingSkeleton v-if="loading && !users" :rows="5" />

      <EmptyState v-else-if="!users || users.length === 0" text="没有匹配的用户" />

      <el-table v-else v-loading="loading" :data="users" row-key="id" stripe>
        <el-table-column prop="username" label="用户名" width="140" show-overflow-tooltip />
        <el-table-column prop="name" label="姓名" width="120" show-overflow-tooltip />
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ ROLE_LABELS[row.role as Role] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属科室" min-width="140">
          <template #default="{ row }">{{ departmentNameMap[row.departmentId] || '—' }}</template>
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
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row as User)">编辑</el-button>
            <el-button link @click="handleResetPassword(row as User)">重置密码</el-button>
            <el-button link @click="handleToggleStatus(row as User)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
            <el-button type="danger" link @click="handleDelete(row as User)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState text="暂无用户" />
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
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" class="user-page__full">
            <el-option label="管理员" value="admin" />
            <el-option label="出题人" value="author" />
            <el-option label="考生" value="examinee" />
          </el-select>
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
  width: 140px;
}

.user-page__filter-keyword {
  width: 240px;
}

.user-page__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-page__full {
  width: 100%;
}
</style>
