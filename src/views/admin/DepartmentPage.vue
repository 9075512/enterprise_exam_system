<script setup lang="ts">
/**
 * 科室管理（W3-T2，管理员）。
 * 关键字筛选（客户端）+ 列表 + 页内新建/编辑弹窗 + 删除（有归属用户 → 后端 1005，拦截器已提示）。
 */
import { computed, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import * as departmentsApi from '@/api/departments';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { validateAndFocus } from '@/composables/useFormFocus';
import { formatDateTime } from '@/utils/datetime';
import { buildDepartmentNameMap, buildDepartmentTree, getDescendantIds } from '@/utils/departmentTree';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { Department } from '@/types';

const { confirm } = useConfirm();
const { data: departments, loading, refresh } = useRequest(() => departmentsApi.list());

/** 上级科室名称映射（表格回显）。 */
const departmentNameMap = computed<Record<string, string>>(() =>
  buildDepartmentNameMap(departments.value ?? []),
);

/** 表单「上级科室」可选项：编辑时排除自身及其子孙（防环）。 */
const parentTree = computed(() => {
  const all = departments.value ?? [];
  const tree = buildDepartmentTree(all);
  if (!editingId.value) return tree;
  const disabled = new Set([editingId.value, ...getDescendantIds(all, editingId.value)]);
  const filter = (nodes: typeof tree): typeof tree =>
    nodes
      .filter((n) => !disabled.has(n.value))
      .map((n) => ({ ...n, children: n.children ? filter(n.children) : undefined }));
  return filter(tree);
});

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterKeyword = ref('');

const filteredDepartments = computed<Department[]>(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  const list = departments.value ?? [];
  if (!kw) return list;
  return list.filter(
    (d) => d.name.toLowerCase().includes(kw) || d.description.toLowerCase().includes(kw),
  );
});

function resetFilter(): void {
  filterKeyword.value = '';
}

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() => Boolean(filterKeyword.value.trim()));

/* ------------------------------ 弹窗 ------------------------------ */
const dialogVisible = ref(false);
const editingId = ref<string>('');
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({ name: '', description: '', parentId: null as string | null });

const rules: FormRules = {
  name: [
    { required: true, message: '请输入科室名称', trigger: 'blur' },
    { max: 60, message: '科室名称不能超过 60 字', trigger: 'blur' },
  ],
  description: [{ max: 255, message: '描述不能超过 255 字', trigger: 'blur' }],
};

function openCreate(): void {
  editingId.value = '';
  form.name = '';
  form.description = '';
  form.parentId = null;
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

function openEdit(department: Department): void {
  editingId.value = department.id;
  form.name = department.name;
  form.description = department.description;
  form.parentId = department.parentId;
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await validateAndFocus(formRef.value);
  if (!valid) return;

  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      parentId: form.parentId,
    };
    if (editingId.value) {
      await departmentsApi.update(editingId.value, payload);
      ElMessage.success('科室已更新');
    } else {
      await departmentsApi.create(payload);
      ElMessage.success('科室已创建');
    }
    dialogVisible.value = false;
    void refresh();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

const deleting = ref(false);

async function handleDelete(department: Department): Promise<void> {
  const ok = await confirm(`确定删除科室「${department.name}」吗？存在归属用户或子科室的科室无法删除`, {
    title: '删除科室',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;

  deleting.value = true;
  try {
    await departmentsApi.remove(department.id);
    ElMessage.success('科室已删除');
    void refresh();
  } catch {
    // 1005 等错误已由拦截器提示；不刷新
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="department-page">
    <PageHeader title="科室管理" description="维护组织科室，用户归属科室">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建科室</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !departments" :rows="5" />

    <EmptyState
      v-else-if="!departments || departments.length === 0"
      text="还没有科室，先建立组织架构"
      action-text="新建科室"
      @action="openCreate"
    />

    <el-card v-else class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-input
            v-model="filterKeyword"
            class="department-page__filter-keyword"
            placeholder="按科室名称 / 描述搜索"
            clearable
            :prefix-icon="Search"
          />
        </div>
        <div class="department-page__filter-actions">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
          <TableDensityToggle />
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredDepartments" row-key="id" stripe>
        <el-table-column prop="name" label="科室名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="上级科室" min-width="140">
          <template #default="{ row }">{{ row.parentId ? departmentNameMap[row.parentId] || '—' : '—' }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '—' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row as Department)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row as Department)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            text="没有匹配的科室"
            filtered
            action-text="新建科室"
            @clear="resetFilter"
            @action="openCreate"
          />
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑科室' : '新建科室'"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="科室名称" prop="name">
          <el-input v-model="form.name" maxlength="60" show-word-limit placeholder="如：研发部" />
        </el-form-item>
        <el-form-item label="上级科室">
          <el-tree-select
            v-model="form.parentId"
            :data="parentTree"
            class="department-page__full"
            placeholder="留空表示顶级科室"
            clearable
            check-strictly
            :render-after-expand="false"
            default-expand-all
          />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="选填"
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
  </div>
</template>

<style scoped lang="scss">
.department-page__filter-keyword {
  width: 260px;
}

.department-page__full {
  width: 100%;
}

.department-page__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
