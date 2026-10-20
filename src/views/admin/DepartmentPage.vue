<script setup lang="ts">
import TableActions from '@/components/common/TableActions.vue';
/**
 * 科室管理（W3-T2，管理员）。
 *
 * v3.1 方向 C 结构对齐（设计稿 departments.html）：左「科室树」（236px）+ 右「科室列表」双栏。
 * 树点击切换列表范围（含子树）；列表按层级顺序输出并带缩进，与设计稿的扁平缩进表一致。
 * 关键字筛选（客户端）+ 页内新建/编辑弹窗 + 删除（有归属用户 → 后端 1005，拦截器已提示）。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { EditPen, Expand, Fold, OfficeBuilding, Plus, Refresh, Search } from '@element-plus/icons-vue';
import * as departmentsApi from '@/api/departments';
import * as usersApi from '@/api/users';
import { useSettingsStore } from '@/stores/settings';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { validateAndFocus } from '@/composables/useFormFocus';
import { formatDateTime } from '@/utils/datetime';
import { buildDepartmentNameMap, buildDepartmentTree, getDescendantIds } from '@/utils/departmentTree';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { Department } from '@/types';

const { confirm } = useConfirm();
const { data: departments, loading, error, refresh } = useRequest(() => departmentsApi.list());
/** 用户全量（用于「人员数」列与树上的计数） */
const { data: users, loading: usersLoading, error: usersError, refresh: refreshUsers } = useRequest(() => usersApi.list());
const membersKnown = computed(() => users.value !== null && !usersLoading.value && !usersError.value);
const settingsStore = useSettingsStore();

onMounted(() => {
  void settingsStore.load();
});

/** 组织树根节点名（设置项 companyName，默认「全公司」） */
const companyName = computed<string>(() => settingsStore.settings.companyName || '全公司');

/** 树根改名：写回设置项 companyName（仅管理员；保存后全站生效） */
const renaming = ref(false);
async function renameCompany(): Promise<void> {
  if (renaming.value) return;
  renaming.value = true;
  try {
    await settingsStore.load();
    if (!settingsStore.ready) {
      ElMessage.error('组织设置加载失败，请稍后重试');
      return;
    }
    const { value } = await ElMessageBox.prompt('修改后科室树根节点与相关文案将同步更新。', '修改组织根节点名称', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPattern: /^\S.{0,39}$/,
      inputErrorMessage: '名称不能为空且不超过 40 个字符',
      inputValue: companyName.value,
    });
    const name = value.trim();
    if (!name || name === companyName.value) return;
    await settingsStore.save({ ...settingsStore.settings, companyName: name });
    ElMessage.success('组织根节点名称已更新');
  } catch {
    /* 用户取消 */
  } finally {
    renaming.value = false;
  }
}

/** 左树收起/展开（收起后左栏收窄为窄条） */
const treeCollapsed = ref(false);

/** 上级科室名称映射（表格回显）。 */
const departmentNameMap = computed<Record<string, string>>(() =>
  buildDepartmentNameMap(departments.value ?? []),
);

/* ------------------------------ 人员数 / 层级 ------------------------------ */
/** 各科室直属人员数 */
const memberCountMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  for (const u of users.value ?? []) {
    if (!u.departmentId) continue;
    map[u.departmentId] = (map[u.departmentId] ?? 0) + 1;
  }
  return map;
});

/** 在册人员总数（树根「全公司」计数） */
const totalMembers = computed<number>(() => (users.value ?? []).filter((u) => u.departmentId).length);

/** 科室按层级顺序（DFS）展开 + 层级深度（用于列表缩进） */
const orderedDepartments = computed<Array<Department & { depth: number }>>(() => {
  const all = departments.value ?? [];
  const byParent = new Map<string | null, Department[]>();
  for (const d of all) {
    const key = d.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(d);
    byParent.set(key, arr);
  }
  const out: Array<Department & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const d of byParent.get(parentId) ?? []) {
      out.push({ ...d, depth });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
});

/* ------------------------------ 左侧科室树 ------------------------------ */
interface DeptTreeNode {
  id: string;
  name: string;
  count: number;
  children: DeptTreeNode[];
}

const deptTree = computed<DeptTreeNode[]>(() => {
  const all = departments.value ?? [];
  const byParent = new Map<string | null, Department[]>();
  for (const d of all) {
    const key = d.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(d);
    byParent.set(key, arr);
  }
  const build = (parentId: string | null): DeptTreeNode[] =>
    (byParent.get(parentId) ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      count: memberCountMap.value[d.id] ?? 0,
      children: build(d.id),
    }));
  return build(null);
});

/* ------------------------------ 层级树（el-tree） ------------------------------ */
/** 虚拟根节点 id（「全公司」，非真实科室） */
const ROOT_ID = '__root__';

const treeRef = ref<InstanceType<typeof import('element-plus')['ElTree']> | null>(null);

/** el-tree 数据：根节点（全公司）+ 科室层级，支持任意深度 */
const treeData = computed<Array<DeptTreeNode>>(() => [
  { id: ROOT_ID, name: companyName.value, count: totalMembers.value, children: deptTree.value },
]);

/** 节点点击 → 切换筛选范围（根节点 = 全公司） */
function handleTreeNodeClick(data: DeptTreeNode): void {
  selectScope(data.id === ROOT_ID ? '' : data.id);
}

/** 当前列表范围（'' = 全公司） */
const activeScopeId = ref<string>('');
const activeScopeName = computed<string>(() =>
  activeScopeId.value ? departmentNameMap.value[activeScopeId.value] ?? companyName.value : companyName.value,
);
function selectScope(id: string): void {
  activeScopeId.value = activeScopeId.value === id ? '' : id;
}

/** 同步 el-tree 高亮节点（activeScopeId 变化 / 数据刷新后） */
watch(
  [activeScopeId, treeData],
  () => {
    void nextTick(() => treeRef.value?.setCurrentKey(activeScopeId.value || ROOT_ID));
  },
  { immediate: true },
);

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterKeyword = ref('');

/** 按树范围过滤（含子树） */
const scopedDepartments = computed<Array<Department & { depth: number }>>(() => {
  const all = orderedDepartments.value;
  if (!activeScopeId.value) return all;
  const ids = new Set([activeScopeId.value, ...getDescendantIds(departments.value ?? [], activeScopeId.value)]);
  return all.filter((d) => ids.has(d.id));
});

const filteredDepartments = computed<Array<Department & { depth: number }>>(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  if (!kw) return scopedDepartments.value;
  return scopedDepartments.value.filter(
    (d) => d.name.toLowerCase().includes(kw) || d.description.toLowerCase().includes(kw),
  );
});

function resetFilter(): void {
  filterKeyword.value = '';
}

/** 页头描述（拼接放脚本里，避免模板内嵌模板字符串） */
const headerDesc = computed<string>(
  () => `共 ${error.value ? '—' : departments.value?.length ?? '—'} 个科室 · ${membersKnown.value ? totalMembers.value : '—'} 名已分配科室人员`,
);

/** 列表层级缩进（模板内不做表达式计算，便于 TS 推断；el-table row 为 any，这里内部取值） */
function indentOf(row: unknown): string {
  return `${depthOf(row) * 20}px`;
}

function depthOf(row: unknown): number {
  return (row as { depth?: number }).depth ?? 0;
}

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

/* ------------------------------ 弹窗 ------------------------------ */
const dialogVisible = ref(false);
const editingId = ref<string>('');
const submitting = ref(false);
const validating = ref(false);
const editorBusy = computed(() => submitting.value || validating.value);
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

/** 新增下级科室（列表行操作）——以上级为父，直接预填 */
function openCreateChild(department: Department): void {
  openCreate();
  form.parentId = department.id;
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value || editorBusy.value) return;
  validating.value = true;
  let valid = false;
  try {
    valid = await validateAndFocus(formRef.value);
  } finally {
    validating.value = false;
  }
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
  if (deleting.value) return;
  deleting.value = true;
  try {
    const ok = await confirm(`确定删除科室「${department.name}」吗？存在归属用户或子科室的科室无法删除`, {
      title: '删除科室',
      confirmButtonText: '确认删除',
      type: 'warning',
    });
    if (!ok) return;

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
  <div data-ui-layout="tree" data-ui-page="DepartmentPage" class="department-page">
    <PageHeader title="科室管理" :description="headerDesc">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建科室</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !departments" :rows="5" />

    <RequestError v-else-if="error" text="科室加载失败" @retry="refresh" />

    <EmptyState
      v-else-if="!departments || departments.length === 0"
      text="还没有科室，先建立组织架构"
      action-text="新建科室"
      @action="openCreate"
    />

    <div v-else class="department-page__wrap">
      <RequestError v-if="usersError" class="department-page__members-error" text="人员统计加载失败，科室结构仍可使用" @retry="refreshUsers" />
      <!-- 左：科室树（可收起；根节点可改名） -->
      <el-card
        class="department-page__tree-card"
        :class="{ 'is-collapsed': treeCollapsed }"
        shadow="never"
      >
        <template #header>
          <div class="department-page__tree-head">
            <span class="department-page__tree-title">{{ treeCollapsed ? '科室范围：' + activeScopeName : '科室树' }}</span>
            <el-button
              text
              size="small"
              :icon="treeCollapsed ? Expand : Fold"
              :aria-label="treeCollapsed ? '展开科室树' : '收起科室树'"
              @click="treeCollapsed = !treeCollapsed"
            />
          </div>
        </template>
        <template v-if="!treeCollapsed">
        <!-- 真实层级树（el-tree）：节点箭头展开/收起，支持任意层级 -->
        <el-tree
          ref="treeRef"
          class="department-page__tree"
          :data="treeData"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          default-expand-all
          highlight-current
          :expand-on-click-node="false"
          :current-node-key="activeScopeId || ROOT_ID"
          @node-click="handleTreeNodeClick"
        >
          <template #default="{ data }">
            <span class="department-page__tnode" :title="data.name">
              <el-icon v-if="data.id === ROOT_ID" class="department-page__tnode-ico"><OfficeBuilding /></el-icon>
              <span class="department-page__tnode-name">{{ data.name }}</span>
              <span class="department-page__tnode-count">{{ membersKnown ? data.count : '—' }}</span>
              <el-button
                v-if="data.id === ROOT_ID"
                class="department-page__tnode-edit"
                text
                :icon="EditPen"
                :disabled="renaming"
                aria-label="修改组织根节点名称"
                @click.stop="renameCompany"
              />
            </span>
          </template>
        </el-tree>
        <div class="department-page__tree-foot">
          <p class="department-page__scope-note">科室人数为直属人员；组织合计仅含已分配科室的人员。</p>
          <el-button text :icon="Plus" @click="openCreate">新增同级科室</el-button>
        </div>
        </template>
      </el-card>

      <!-- 右：科室列表 -->
      <el-card class="table-card department-page__list-card" shadow="never">
        <div class="table-card__toolbar">
          <div class="department-page__list-head">
            <span class="department-page__list-title">科室列表</span>
            <span class="department-page__list-sub">当前范围：{{ activeScopeName }}（含下级） · {{ filteredDepartments.length }} 个科室</span>
          </div>
          <div class="table-card__toolbar-filters">
            <el-input
              v-model="filterKeyword"
              class="department-page__filter-keyword"
              placeholder="搜索科室名称"
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
          <el-table-column label="科室信息" min-width="260">
            <template #default="{ row }">
              <span class="department-page__name" :style="{ paddingLeft: indentOf(row) }">
                <span v-if="depthOf(row) > 0" class="department-page__branch">└</span>
                <span :class="{ 'department-page__name--strong': depthOf(row) === 0 }">
                  {{ row.name }}
                </span>
              </span>
              <div class="department-page__row-meta" :style="{ paddingLeft: indentOf(row) }"><span>上级：{{ row.parentId ? departmentNameMap[row.parentId] || '—' : companyName }}</span><span v-if="row.description">{{ row.description }}</span></div>
            </template>
          </el-table-column>
          <el-table-column label="人员数" width="100" align="right">
            <template #default="{ row }">
              <span class="num department-page__count">{{ membersKnown ? memberCountMap[row.id] ?? 0 : '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">
              <span class="department-page__muted">{{ formatDateTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column class-name="table-actions-cell" label="操作" width="210" align="right" fixed="right">
            <template #default="{ row }">
              <TableActions :loading="deleting">
                <el-button type="primary" link @click="openCreateChild(row as Department)">新增下级</el-button>
                <el-button type="primary" link @click="openEdit(row as Department)">编辑</el-button>
                <template #more>
                  <el-dropdown-item class="is-danger" @click="handleDelete(row as Department)">删除</el-dropdown-item>
                </template>
              </TableActions>
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
    </div>

    <el-drawer
      v-model="dialogVisible"
      :title="editingId ? '编辑科室' : '新建科室'"
      class="department-editor"
      size="560px"
      append-to-body
      destroy-on-close
      :close-on-click-modal="!editorBusy"
      :close-on-press-escape="!editorBusy"
      :show-close="!editorBusy"
     data-ui-role="editor">
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="submitting" label-position="top">
        <el-form-item label="科室名称" prop="name">
          <el-input v-model="form.name" maxlength="60" show-word-limit placeholder="如：研发部" />
        </el-form-item>
        <el-form-item label="上级科室">
          <el-tree-select
            v-model="form.parentId"
            :data="parentTree"
            popper-class="department-parent-popper"
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
            :autosize="{ minRows: 3, maxRows: 8 }"
            maxlength="255"
            show-word-limit
            placeholder="选填"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="editorBusy" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editorBusy" @click="handleSubmit">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

/* 双栏：左科室树（236px，设计稿 departments.html；收起态收窄为窄条）+ 右列表 */
.department-page__wrap {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  gap: 16px;
  align-items: start;

  &:has(.department-page__tree-card.is-collapsed) {
    grid-template-columns: 52px minmax(0, 1fr);
  }
}
.department-page__members-error { grid-column: 1 / -1; }
.department-page__scope-note { margin: 0 4px 8px; color: $text-secondary; font-size: 12px; line-height: 1.7; }

@media (max-width: 900px) {
  .department-page__wrap, .department-page__wrap:has(.department-page__tree-card.is-collapsed) { grid-template-columns: minmax(0, 1fr); }
}

.department-page__tree-card.el-card {
  --el-card-padding: 8px;
}

/* 卡头：标题 + 收起/展开按钮 */
.department-page__tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

/* 收起态：隐藏头部文字，只留切换按钮 */
.department-page__tree-card.is-collapsed {
  :deep(.el-card__header) {
    padding: 10px 6px;
  }

  .department-page__tree-title {
    display: none;
  }

  .department-page__tree-head {
    justify-content: center;
  }
}

/* 根节点改名铅笔：hover 时浮现 */
.department-page__tree-title {
  font-size: 13.5px;
  font-weight: 600;
  color: $text-primary;
}

.department-page__tree {
  font-size: 12.5px;
  max-height: 65vh;
  overflow: auto;
}

/* 层级树节点（el-tree）：设计稿 .tree__i —— 选中态主色软底，任意层级 */
.department-page__tree {
  font-size: 12.5px;

  :deep(.el-tree-node__content) {
    height: auto;
    min-height: 36px;
    padding-block: 4px;
    border-radius: $radius-xs;
    transition: background-color 0.12s;
  }

  :deep(.el-tree-node__content:hover) {
    background: $color-table-head;
  }

  /* 选中态：主色软底 + 主色字（覆盖 EP 的 primary 实色底） */
  :deep(.el-tree-node.is-current > .el-tree-node__content) {
    background: $color-primary-soft;
    color: $color-primary;
    font-weight: 560;
  }
}

.department-page__tnode {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding-right: 4px;
}

.department-page__tnode-ico {
  flex: 0 0 auto;
  font-size: 14px;
  color: $text-secondary;
}

.department-page__tnode-name {
  flex: 1;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.department-page__tnode-count {
  flex: 0 0 auto;
  font-size: 12px;
  color: $text-disabled;
  font-variant-numeric: tabular-nums;
}

/* 根节点改名铅笔：hover 时浮现 */
.department-page__tnode-edit {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px;
  font-size: 12px;
  color: $text-disabled;
  opacity: 0;
  transition: opacity 0.12s;

  .department-page__tnode:hover &,
  .department-page__tnode:focus-within & {
    opacity: 1;
  }

  &:hover {
    color: $color-primary;
  }
}

.department-page__tree-foot {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid $border-color;

  .el-button {
    width: 100%;
    justify-content: center;
  }
}

.department-page__list-card .table-card__toolbar {
  align-items: center;
}

.department-page__list-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
  overflow-wrap: anywhere;
}

.department-page__list-title {
  font-size: 13.5px;
  font-weight: 600;
  color: $text-primary;
}

.department-page__list-sub {
  font-size: 12px;
  color: $text-secondary;
}

.department-page__filter-keyword {
  width: 220px;
}

.department-page__row-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; color: $text-secondary; font-size: 12px; line-height: 1.6; margin-top: 4px; overflow-wrap: anywhere; }
.department-page__full {
  width: 100%;
  :deep(.el-select__selected-item) { position: static; white-space: normal; overflow-wrap: anywhere; }
  :deep(.el-select__wrapper) { height: auto; }
}

.department-page__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 列表单元：层级缩进 + 主色/弱色分工 */
.department-page__name {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  overflow-wrap: anywhere;
}

.department-page__branch {
  color: $text-disabled;
  font-size: 12px;
}

.department-page__name--strong {
  color: $text-primary;
  font-weight: 600;
}

.department-page__muted {
  color: $text-body;
}

.department-page__count {
  font-size: 13.5px;
  font-weight: 600;
  color: $text-primary;
}

@media (max-width: 900px) {
  .department-page__wrap {
    grid-template-columns: minmax(0, 1fr);
  }

  .department-page__tree {
    max-height: min(360px, 45dvh);
    :deep(.el-tree-node__content) { height: auto; min-height: 44px; padding-block: 4px; }
    :deep(.el-tree-node__expand-icon) { display: flex; align-items: center; justify-content: center; flex: 0 0 44px; width: 44px; min-height: 44px; padding: 0; }
  }
  .department-page__tnode-edit { opacity: 1; }
  .department-page__tree-card.is-collapsed .department-page__tree-title { display: block; min-width: 0; overflow-wrap: anywhere; }
  .department-page__tree-card.is-collapsed .department-page__tree-head { justify-content: space-between; }
  .department-page__tree-head > .el-button { flex-shrink: 0; }
  .department-page__list-head { display: block; }
  .department-page__list-sub { display: block; margin-top: 4px; }
}
</style>
