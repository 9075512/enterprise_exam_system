<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import * as banksApi from '@/api/banks';
import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';
import { useAuthStore } from '@/stores/auth';
import { vInputNumberAria } from '@/directives/inputNumberAria';
import { validateAndFocus } from '@/composables/useFormFocus';
import { useRequest } from '@/composables/useRequest';
import RequestError from '@/components/common/RequestError.vue';
import type { BankAccessConfig, BankTreeNode, QuestionBank } from '@/types';

const props = defineProps<{ visible: boolean; bank?: QuestionBank | null; tree?: BankTreeNode[]; defaultParentId?: string | null }>();
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'saved', bank: QuestionBank): void }>();
const dialogVisible = computed({ get: () => props.visible, set: (value) => { if (!submitting.value) emit('update:visible', value); } });
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole('admin'));
const isEdit = computed(() => Boolean(props.bank?.id));
const formRef = ref<FormInstance>();
const submitting = ref(false);
const createdBankId = ref('');
const submitError = ref('');
const { data: options, loading: loadingOptions, error: optionsError, refresh: loadOptions } = useRequest(async () => {
  if (!props.visible) return null;
  const accessId = props.bank?.id || props.defaultParentId;
  const [users, departments, access] = await Promise.all([
    usersApi.list(), departmentsApi.list(),
    accessId && isAdmin.value ? banksApi.access(accessId) : Promise.resolve(null),
  ]);
  return { users, departments, access, editing: Boolean(props.bank?.id) };
}, [], { immediate: false, keepPreviousData: false });
const formLocked = computed(() => submitting.value || loadingOptions.value || Boolean(optionsError.value) || !options.value);
const departments = computed(() => options.value?.departments ?? []);
watch(options, (data) => {
  if (!data?.access) return;
  if (data.editing) applyAccess(data.access);
  else form.editorIds = [...data.access.effectiveEditorIds];
});

const form = reactive({
  name: '', parentId: null as string | null, sortOrder: 0, status: 'active' as 'active' | 'disabled',
  description: '', allowPractice: true, permissionMode: 'override' as 'inherit' | 'override',
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
const activeUsers = computed(() => (options.value?.users ?? []).filter((user) => user.status === 'active'));
const authorOptions = computed(() => activeUsers.value.filter((user) => user.role === 'author'));

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
  createdBankId.value = '';
  submitError.value = '';
  form.name = props.bank?.name ?? ''; form.parentId = props.bank?.parentId ?? props.defaultParentId ?? null;
  form.sortOrder = props.bank?.sortOrder ?? 0; form.status = props.bank?.status ?? 'active';
  form.description = props.bank?.description ?? ''; form.allowPractice = props.bank?.allowPractice ?? true;
  // 新建科目默认开放练题，并向全部部门、全部人员开放浏览；编辑时加载既有配置。
  form.permissionMode = 'override'; form.viewAll = !props.bank?.id; form.includeChildDepartments = true;
  form.departmentIds = []; form.userIds = []; form.editorIds = [];
  await loadOptions();
  formRef.value?.clearValidate();
}
watch(() => [props.visible, props.bank?.id, props.defaultParentId], () => {
  if (props.visible) void resetForm();
  else void loadOptions(); // 作废关闭前仍在途的权限请求。
}, { immediate: true });
watch(() => form.parentId, (parentId) => {
  if (!parentId) form.permissionMode = 'override';
});

async function handleSubmit(): Promise<void> {
  if (!formRef.value || submitting.value || loadingOptions.value || optionsError.value || !options.value) return;
  if (!(await validateAndFocus(formRef.value)) || submitting.value) return;
  submitError.value = '';
  submitting.value = true;
  try {
    if (isRoot.value) form.permissionMode = 'override';
    if (props.bank && props.bank.parentId !== form.parentId) {
      try { await ElMessageBox.confirm('移动科目可能改变该节点及后代的有效浏览/编辑权限，确认继续？', '权限影响提示', { type: 'warning' }); }
      catch { return; }
    }
    const payload: banksApi.BankPayload = {
      name: form.name.trim(), parentId: form.parentId, sortOrder: form.sortOrder, status: form.status,
      description: form.description.trim(), allowPractice: form.allowPractice,
      authorIds: form.permissionMode === 'override' ? [...form.editorIds] : [],
    };
    const targetId = props.bank?.id || createdBankId.value;
    const saved = targetId ? await banksApi.update(targetId, payload) : await banksApi.create(payload);
    if (!props.bank) createdBankId.value = saved.id;
    await banksApi.updateAccess(saved.id, {
      permissionMode: form.permissionMode, viewAll: form.viewAll, includeChildDepartments: form.includeChildDepartments,
      departmentIds: form.permissionMode === 'override' ? form.departmentIds : [],
      userIds: form.permissionMode === 'override' ? form.userIds : [], editorIds: form.permissionMode === 'override' ? form.editorIds : [],
    });
    ElMessage.success(props.bank ? '科目已更新' : '科目已创建'); emit('saved', saved); emit('update:visible', false);
  } catch { submitError.value = '保存未完成，已保留填写内容，请重试。'; }
  finally { submitting.value = false; }
}
</script>

<template>
  <el-drawer v-model="dialogVisible" :title="isEdit ? '编辑科目' : '新增科目'" size="720px" append-to-body destroy-on-close :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
    <el-alert v-if="createdBankId && !submitting" type="warning" :closable="false" title="科目已创建，访问权限尚未保存。请重试保存以完成配置。" show-icon />
    <RequestError v-if="optionsError" text="科目权限或人员选项加载失败，请重试后再保存" @retry="loadOptions" />
    <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" />
    <el-form class="subject-form" ref="formRef" v-loading="loadingOptions" :model="form" :rules="rules" label-position="top" :disabled="formLocked">
      <el-form-item label="上级科目"><el-select v-model="form.parentId" clearable filterable popper-class="organization-choice-popper" placeholder="根科目" style="width:100%"><el-option v-for="node in flatNodes" :key="node.id" :label="`${'　'.repeat(node.depth)}${node.name}`" :value="node.id" /></el-select><div v-if="form.parentId" class="hint">当前上级：{{ flatNodes.find(node => node.id === form.parentId)?.name || form.parentId }}</div></el-form-item>
      <el-form-item label="科目名称" prop="name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
      <div class="form-grid"><el-form-item label="排序"><el-input-number v-input-number-aria v-model="form.sortOrder" :min="0" :max="999999" /></el-form-item><el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio-button value="active">启用</el-radio-button><el-radio-button value="disabled">停用</el-radio-button></el-radio-group></el-form-item></div>
      <el-form-item label="描述" prop="description"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" show-word-limit /></el-form-item>
      <el-form-item label="开放练题"><el-switch v-model="form.allowPractice" /><span class="hint">叶子科目还需命中浏览权限才会出现在练题端</span></el-form-item>
      <el-divider content-position="left">访问权限</el-divider>
      <el-form-item label="权限方式"><el-radio-group v-model="form.permissionMode"><el-radio value="inherit" :disabled="formLocked || isRoot">继承上级</el-radio><el-radio value="override">完整覆盖</el-radio></el-radio-group><div class="hint">覆盖会替换继承的整组权限；编辑人员自动拥有浏览权限。根科目必须使用完整覆盖。</div></el-form-item>
      <template v-if="form.permissionMode === 'override'">
        <el-form-item label="浏览范围"><el-checkbox v-model="form.viewAll">所有人员均可预览</el-checkbox><div v-if="!isEdit" class="hint">新增科目默认开放练题，并向全部部门和全部人员开放浏览。</div><div v-if="form.viewAll" class="hint">已包含全部部门和全部人员，后续新增的部门及人员也可浏览；取消勾选后可指定范围。</div></el-form-item>
        <el-form-item label="浏览部门"><el-select v-model="form.departmentIds" :disabled="formLocked || form.viewAll" :placeholder="form.viewAll ? '全部部门' : '请选择浏览部门'" multiple filterable popper-class="organization-choice-popper" collapse-tags style="width:100%"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select><div v-if="!form.viewAll && form.departmentIds.length" class="hint">已选部门：{{ form.departmentIds.map(id => departments.find(item => item.id === id)?.name || id).join('、') }}</div><el-checkbox v-model="form.includeChildDepartments" :disabled="formLocked || form.viewAll">包含子部门</el-checkbox></el-form-item>
        <el-form-item label="浏览人员"><el-select v-model="form.userIds" :disabled="formLocked || form.viewAll" :placeholder="form.viewAll ? '全部人员' : '请选择浏览人员'" multiple filterable popper-class="organization-choice-popper" collapse-tags style="width:100%"><el-option v-for="item in activeUsers" :key="item.id" :label="`${item.name}（${item.username}）`" :value="item.id" /></el-select><div v-if="!form.viewAll && form.userIds.length" class="hint">已选人员：{{ form.userIds.map(id => activeUsers.find(user => user.id === id)?.name || id).join('、') }}</div></el-form-item>
        <el-form-item label="编辑人员"><el-select v-model="form.editorIds" multiple filterable popper-class="organization-choice-popper" collapse-tags style="width:100%"><el-option v-for="item in authorOptions" :key="item.id" :label="`${item.name}（${item.username}）`" :value="item.id" /></el-select><div v-if="form.editorIds.length" class="hint">已选编辑人员：{{ form.editorIds.map(id => activeUsers.find(user => user.id === id)?.name || id).join('、') }}</div><div class="hint">仅出题人可选；管理员始终拥有全部权限。</div></el-form-item>
      </template>
    </el-form>
    <template #footer><el-button :disabled="submitting" @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="submitting" :disabled="loadingOptions || Boolean(optionsError) || !options" @click="handleSubmit">保存</el-button></template>
  </el-drawer>
</template>

<style scoped lang="scss">
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.hint { display:block; flex-basis:100%; width:100%; margin:6px 0 0; color:var(--el-text-color-secondary); font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
@media (max-width:600px) {
  .form-grid { grid-template-columns:minmax(0,1fr); gap:0; }
  .subject-form :deep(.el-input-number.el-input-number) { width: min(180px, 100%); height: 44px; line-height: 44px; }
  .subject-form :deep(.el-input-number.el-input-number .el-input-number__decrease),
  .subject-form :deep(.el-input-number.el-input-number .el-input-number__increase) { top: 0; bottom: 0; width: 44px; height: 44px; line-height: 44px; }
  .subject-form :deep(.el-input-number.el-input-number .el-input__wrapper) { padding-inline: 44px; min-height: 44px; }
}
</style>
