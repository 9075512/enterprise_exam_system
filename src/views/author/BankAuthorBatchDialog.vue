<script setup lang="ts">
/**
 * 题库授权批量维护弹窗（v1.7③ S2，仅 admin）。
 *
 * 三种选择器可组合：显式手选用户 ∪（指定科室成员 ∩ 角色过滤）∪ 全部指定角色账号。
 * 「命中人数」在前端依据用户列表与科室子树即时预演（与后端同一套规则），
 * 确认后调用 `/banks/:id/authors/grant|revoke` 执行；非出题人 / 不存在的账号由后端跳过并计数。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as departmentsApi from '@/api/departments';
import * as usersApi from '@/api/users';
import { buildDepartmentTree, getDescendantIds } from '@/utils/departmentTree';
import type { Department, Role, User } from '@/types';

const props = defineProps<{
  visible: boolean;
  bankId: string;
  /** 当前已授权的出题人 id（用于预演「已授权跳过」） */
  currentAuthorIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const loading = ref(false);
const submitting = ref(false);
const departments = ref<Department[]>([]);
const users = ref<User[]>([]);

const departmentTree = computed(() => buildDepartmentTree(departments.value));
/** 候选手选出题人（仅 author 角色） */
const authorOptions = computed(() => users.value.filter((u) => u.role === 'author'));

const form = reactive({
  userIds: [] as string[],
  departmentId: '',
  includeSubDepartments: true,
  role: undefined as Role | undefined,
});

/** 打开时重置并加载基础数据 */
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    form.userIds = [];
    form.departmentId = '';
    form.includeSubDepartments = true;
    form.role = undefined;
    loading.value = true;
    try {
      const [depts, list] = await Promise.all([departmentsApi.list(), usersApi.list()]);
      departments.value = depts;
      users.value = list;
    } catch {
      // 错误已由拦截器提示
    } finally {
      loading.value = false;
    }
  },
);

/** 预演：按选择器解析命中的用户 id 集合（规则与后端 resolveTargetUserIds 一致）。 */
const matchedIds = computed<string[]>(() => {
  const ids = new Set<string>(form.userIds);
  if (form.departmentId) {
    const deptIds = form.includeSubDepartments
      ? [form.departmentId, ...getDescendantIds(departments.value, form.departmentId)]
      : [form.departmentId];
    for (const u of users.value) {
      if (u.departmentId && deptIds.includes(u.departmentId) && (!form.role || u.role === form.role)) {
        ids.add(u.id);
      }
    }
  } else if (form.role) {
    for (const u of users.value) {
      if (u.role === form.role) ids.add(u.id);
    }
  }
  return [...ids];
});

const userMap = computed(() => new Map(users.value.map((u) => [u.id, u])));
const grantedSet = computed(() => new Set(props.currentAuthorIds));

/** 预演统计 */
const preview = computed(() => {
  const matched = matchedIds.value;
  const authors = matched.filter((id) => userMap.value.get(id)?.role === 'author');
  const nonAuthor = matched.length - authors.length;
  const alreadyGranted = authors.filter((id) => grantedSet.value.has(id));
  const toGrant = authors.length - alreadyGranted.length;
  const toRevoke = authors.filter((id) => grantedSet.value.has(id)).length;
  return { matched: matched.length, authors: authors.length, nonAuthor, alreadyGranted: alreadyGranted.length, toGrant, toRevoke };
});

const hasSelector = computed<boolean>(
  () => form.userIds.length > 0 || form.departmentId !== '' || form.role !== undefined,
);

async function execute(kind: 'grant' | 'revoke'): Promise<void> {
  if (!hasSelector.value) {
    ElMessage.warning('请至少选择一名用户、一个科室或一个角色');
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      userIds: form.userIds,
      departmentId: form.departmentId || undefined,
      includeSubDepartments: form.includeSubDepartments,
      role: form.role,
    };
    const result =
      kind === 'grant'
        ? await banksApi.grantAuthors(props.bankId, payload)
        : await banksApi.revokeAuthors(props.bankId, payload);
    const verb = kind === 'grant' ? '授权' : '取消授权';
    const extra: string[] = [];
    if (result.skipped > 0) extra.push(`跳过 ${result.skipped} 人`);
    if (result.nonAuthor > 0) extra.push(`非出题人 ${result.nonAuthor} 人`);
    if (result.missing > 0) extra.push(`账号不存在 ${result.missing} 人`);
    ElMessage.success(
      `批量${verb}完成：${result.changed} 人${extra.length > 0 ? `（${extra.join('，')}）` : ''}`,
    );
    emit('saved');
    dialogVisible.value = false;
  } catch {
    // 错误已由拦截器提示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量维护授权出题人"
    width="620px"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading" class="bank-author-batch">
      <el-alert
        class="bank-author-batch__notice"
        type="info"
        :closable="false"
        title="按科室 / 角色批量圈选，或从下方手选出题人；只有「出题人」角色账号可被授权"
      />

      <el-form label-position="top">
        <el-form-item label="按科室圈选">
          <el-tree-select
            v-model="form.departmentId"
            :data="departmentTree"
            class="bank-author-batch__full"
            clearable
            check-strictly
            :render-after-expand="false"
            default-expand-all
            placeholder="选择科室（可留空）"
          />
          <div class="bank-author-batch__switch">
            <el-switch v-model="form.includeSubDepartments" active-text="包含子科室" />
          </div>
        </el-form-item>

        <el-form-item label="角色过滤">
          <el-select v-model="form.role" class="bank-author-batch__full" clearable placeholder="不限定角色">
            <el-option label="出题人" value="author" />
            <el-option label="管理员" value="admin" />
            <el-option label="考生" value="examinee" />
          </el-select>
          <span class="bank-author-batch__hint">
            未选择科室时，表示「全部该角色账号」
          </span>
        </el-form-item>

        <el-form-item label="手选出题人">
          <el-select
            v-model="form.userIds"
            class="bank-author-batch__full"
            multiple
            filterable
            placeholder="选择要授权/取消授权的出题人（可多选）"
          >
            <el-option
              v-for="a in authorOptions"
              :key="a.id"
              :label="`${a.name}（${a.username}）`"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert
        class="bank-author-batch__preview"
        type="warning"
        :closable="false"
        show-icon
        :title="`命中 ${preview.matched} 名用户（出题人 ${preview.authors}，非出题人 ${preview.nonAuthor}）`"
        :description="`本次将授权 ${preview.toGrant} 人（另有 ${preview.alreadyGranted} 人已授权将跳过）；取消授权将移除 ${preview.toRevoke} 人`"
      />
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button :loading="submitting" :disabled="!hasSelector" @click="execute('revoke')">
        取消授权
      </el-button>
      <el-button
        type="primary"
        :icon="Plus"
        :loading="submitting"
        :disabled="!hasSelector"
        @click="execute('grant')"
      >
        批量授权
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-author-batch {
  &__notice {
    margin-bottom: 14px;
  }

  &__full {
    width: 100%;
  }

  &__switch {
    margin-top: 6px;
  }

  &__hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: #94a3b8;
  }

  &__preview {
    margin-top: 4px;
  }
}
</style>
