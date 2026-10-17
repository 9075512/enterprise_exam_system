<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import * as banksApi from '@/api/banks';
import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';
import { useAuthStore } from '@/stores/auth';
import { validateAndFocus } from '@/composables/useFormFocus';
import type { BankAccessConfig, BankTreeNode, Department, QuestionBank, User } from '@/types';

const props = defineProps<{ visible: boolean; bank?: QuestionBank | null; tree?: BankTreeNode[]; defaultParentId?: string | null }>();
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'saved', bank: QuestionBank): void }>();
const dialogVisible = computed({ get: () => props.visible, set: (value) => emit('update:visible', value) });
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole('admin'));
const isEdit = computed(() => Boolean(props.bank?.id));
const formRef = ref<FormInstance>();
const submitting = ref(false);
const loadingOptions = ref(false);
const users = ref<User[]>([]);
const departments = ref<Department[]>([]);

const form = reactive({
  name: '', parentId: null as string | null, sortOrder: 0, status: 'active' as 'active' | 'disabled',
  description: '', allowPractice: false, permissionMode: 'override' as 'inherit' | 'override',
  viewAll: true, includeChildDepartments: true, departmentIds: [] as string[], userIds: [] as string[], editorIds: [] as string[],
});
const isRoot = computed(() => !form.parentId);
const rules: FormRules = {
  name: [{ required: true, message: '请输入科目名称', trigger: 'blur' }, { max: 120, message: '科目名称不能超过 120 字', trigger: 'blur' }],
  description: [{ max: 255, message: '描述不能超过 255 字', trigger: 'blur' }],
};

interface FlatNode { id: string; name: string; depth: number }
const flatNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = [];
  const blocked = new Set<string>();
  const find = (nodes: BankTreeNode[], target: string): BankTreeNode | undefined => {
    for (const node of nodes) { if (node.id === target) return node; const child = find(node.children, target); if (child) return child; }
    return undefined;
  };
  const mark = (node?: BankTreeNode) => { if (!node) return; blocked.add(node.id); node.children.forEach(mark); };
  if (props.bank?.id) mark(find(props.tree ?? [], props.bank.id));
  const visit = (nodes: BankTreeNode[], depth: number) => nodes.forEach((node) => {
    if (!blocked.has(node.id) && node.questionCount === 0) result.push({ id: node.id, name: node.name, depth });
    visit(node.children, depth + 1);
  });
  visit(props.tree ?? [], 0); return result;
});
const activeUsers = computed(() => users.value.filter((user) => user.status === 'active'));
const authorOptions = computed(() => activeUsers.value.filter((user) => user.role === 'author'));

async function loadOptions(): Promise<void> {
  loadingOptions.value = true;
  try { [users.value, departments.value] = await Promise.all([usersApi.list(), departmentsApi.list()]); }
  catch { users.value = []; departments.value = []; }
  finally { loadingOptions.value = false; }
}
function applyAccess(access: BankAccessConfig): void {
  form.permissionMode = access.permissionMode;
  // 继承节点也预装“当前有效结果”：用户切到完整覆盖时会以它为初始值，
  // 避免一次切换意外清空原本继承到的访问范围。
  const inherited = access.permissionMode === 'inherit';
  form.viewAll = inherited ? access.effectiveViewAll : access.viewAll;
  form.includeChildDepartments = inherited ? access.effectiveIncludeChildDepartments : access.includeChildDepartments;
  form.departmentIds = [...(inherited ? access.effectiveDepartmentIds : access.departmentIds)];
  form.userIds = [...(inherited ? access.effectiveUserIds : access.userIds)];
  form.editorIds = [...(inherited ? access.effectiveEditorIds : access.editorIds)];
}
async function resetForm(): Promise<void> {
  form.name = props.bank?.name ?? ''; form.parentId = props.bank?.parentId ?? props.defaultParentId ?? null;
  form.sortOrder = props.bank?.sortOrder ?? 0; form.status = props.bank?.status ?? 'active';
  form.description = props.bank?.description ?? ''; form.allowPractice = props.bank?.allowPractice ?? false;
  // 新建科目统一使用独立权限，默认允许所有人员预览；编辑时再加载既有配置。
  form.permissionMode = 'override'; form.viewAll = !props.bank?.id; form.includeChildDepartments = true;
  form.departmentIds = []; form.userIds = []; form.editorIds = [];
  await loadOptions();
  if (props.bank?.id && isAdmin.value) {
    try {
      applyAccess(await banksApi.access(props.bank.id));
    } catch { /* 统一错误提示；保留安全默认值 */ }
  } else if (form.parentId && isAdmin.value) {
    try {
      // 浏览范围仍采用“所有人可预览”的新默认，仅延续上级有效编辑人员，避免新增下级后出题人失权。
      const parentAccess = await banksApi.access(form.parentId);
      form.editorIds = [...parentAccess.effectiveEditorIds];
    } catch { /* 新建节点仍保持默认公开预览、无额外编辑人的兜底 */ }
  }
  formRef.value?.clearValidate();
}
watch(() => props.visible, (visible) => { if (visible) void resetForm(); });
watch(() => form.parentId, (parentId) => {
  if (!parentId) form.permissionMode = 'override';
});

async function handleSubmit(): Promise<void> {
  if (!formRef.value || !(await validateAndFocus(formRef.value))) return;
  if (isRoot.value) form.permissionMode = 'override';
  if (props.bank && props.bank.parentId !== form.parentId) {
    try { await ElMessageBox.confirm('移动科目可能改变该节点及后代的有效浏览/编辑权限，确认继续？', '权限影响提示', { type: 'warning' }); }
    catch { return; }
  }
  submitting.value = true;
  try {
    const payload: banksApi.BankPayload = {
      name: form.name.trim(), parentId: form.parentId, sortOrder: form.sortOrder, status: form.status,
      description: form.description.trim(), allowPractice: form.allowPractice,
      authorIds: form.permissionMode === 'override' ? [...form.editorIds] : [],
    };
    const saved = props.bank ? await banksApi.update(props.bank.id, payload) : await banksApi.create(payload);
    await banksApi.updateAccess(saved.id, {
      permissionMode: form.permissionMode, viewAll: form.viewAll, includeChildDepartments: form.includeChildDepartments,
      departmentIds: form.permissionMode === 'override' ? form.departmentIds : [],
      userIds: form.permissionMode === 'override' ? form.userIds : [], editorIds: form.permissionMode === 'override' ? form.editorIds : [],
    });
    ElMessage.success(props.bank ? '科目已更新' : '科目已创建'); emit('saved', saved); dialogVisible.value = false;
  } finally { submitting.value = false; }
}
</script>

<template>
  <el-drawer v-model="dialogVisible" :title="isEdit ? '编辑科目' : '新增科目'" size="560px" append-to-body destroy-on-close>
    <el-form ref="formRef" v-loading="loadingOptions" :model="form" :rules="rules" label-position="top">
      <el-form-item label="上级科目"><el-select v-model="form.parentId" clearable filterable placeholder="根科目" style="width:100%"><el-option v-for="node in flatNodes" :key="node.id" :label="`${'　'.repeat(node.depth)}${node.name}`" :value="node.id" /></el-select></el-form-item>
      <el-form-item label="科目名称" prop="name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
      <div class="form-grid"><el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" :max="999999" /></el-form-item><el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio-button value="active">启用</el-radio-button><el-radio-button value="disabled">停用</el-radio-button></el-radio-group></el-form-item></div>
      <el-form-item label="描述" prop="description"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" show-word-limit /></el-form-item>
      <el-form-item label="开放练题"><el-switch v-model="form.allowPractice" /><span class="hint">叶子科目还需命中浏览权限才会出现在练题端</span></el-form-item>
      <el-divider content-position="left">访问权限</el-divider>
      <el-form-item label="权限方式"><el-radio-group v-model="form.permissionMode"><el-radio value="inherit" :disabled="isRoot">继承上级</el-radio><el-radio value="override">完整覆盖</el-radio></el-radio-group><div class="hint">覆盖会替换继承的整组权限；编辑人员自动拥有浏览权限。根科目必须使用完整覆盖。</div></el-form-item>
      <template v-if="form.permissionMode === 'override'">
        <el-form-item label="浏览范围"><el-checkbox v-model="form.viewAll">所有人员均可预览</el-checkbox><div v-if="!isEdit" class="hint">新增科目默认向管理员、出题人和考生开放预览；考生还需启用“开放练题”后才能进入练习。</div></el-form-item>
        <el-form-item label="浏览部门"><el-select v-model="form.departmentIds" multiple filterable collapse-tags style="width:100%"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-checkbox v-model="form.includeChildDepartments">包含子部门</el-checkbox></el-form-item>
        <el-form-item label="浏览人员"><el-select v-model="form.userIds" multiple filterable collapse-tags style="width:100%"><el-option v-for="item in activeUsers" :key="item.id" :label="`${item.name}（${item.username}）`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="编辑人员"><el-select v-model="form.editorIds" multiple filterable collapse-tags style="width:100%"><el-option v-for="item in authorOptions" :key="item.id" :label="`${item.name}（${item.username}）`" :value="item.id" /></el-select><div class="hint">仅出题人可选；管理员始终拥有全部权限。</div></el-form-item>
      </template>
    </el-form>
    <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button></template>
  </el-drawer>
</template>

<style scoped lang="scss">
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.hint { display:block; margin:6px 0 0 10px; color:#94a3b8; font-size:12px; line-height:1.55; }
</style>
