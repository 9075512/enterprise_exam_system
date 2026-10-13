<script setup lang="ts">
/**
 * 菜单权限（v1.5，管理员）。
 * 以「菜单 × 角色」矩阵配置各角色可见的侧栏菜单；管理员必授菜单（系统设置/菜单权限）不可取消，防止自锁。
 */
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getMenuPermissions, updateMenuPermissions } from '@/api/permissions';
import { ROLE_LABELS } from '@/constants';
import PageHeader from '@/components/common/PageHeader.vue';
import type { MenuGrants, MenuPermission, Role } from '@/types';

const ROLES: Role[] = ['admin', 'author', 'examinee'];

const loading = ref(true);
const saving = ref(false);
const catalog = ref<MenuPermission['catalog']>([]);
const grants = reactive<MenuGrants>({ admin: [], author: [], examinee: [] });

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getMenuPermissions();
    catalog.value = data.catalog;
    grants.admin = [...data.grants.admin];
    grants.author = [...data.grants.author];
    grants.examinee = [...data.grants.examinee];
  } catch {
    // 加载失败静默，保持空态
  } finally {
    loading.value = false;
  }
}

/** 某角色是否勾选某菜单。 */
function isChecked(role: Role, key: string): boolean {
  return grants[role].includes(key);
}

/** 切换勾选（adminRequired 且 admin 角色不可取消）。 */
function toggle(role: Role, key: string, adminRequired: boolean): void {
  if (role === 'admin' && adminRequired) return;
  const list = grants[role];
  const idx = list.indexOf(key);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(key);
  }
}

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    const data = await updateMenuPermissions({
      admin: [...grants.admin],
      author: [...grants.author],
      examinee: [...grants.examinee],
    });
    grants.admin = [...data.grants.admin];
    grants.author = [...data.grants.author];
    grants.examinee = [...data.grants.examinee];
    ElMessage.success('菜单权限已保存，相关角色菜单即时生效');
  } catch {
    // 错误提示已由拦截器统一弹出
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="menu-permission-page">
    <PageHeader title="菜单权限" description="配置各角色在侧边栏可见的菜单；管理员必授菜单不可关闭">
      <template #actions>
        <el-button type="primary" :loading="saving" @click="handleSave">保存权限</el-button>
      </template>
    </PageHeader>

    <el-card v-loading="loading" class="menu-permission-page__panel" shadow="never">
      <el-alert
        class="menu-permission-page__alert"
        type="info"
        show-icon
        :closable="false"
        title="取消勾选后，对应角色的侧边栏与页面入口将即时隐藏；管理员「系统设置」「菜单权限」不可取消，避免自锁"
      />

      <el-table :data="catalog" row-key="key" border>
        <el-table-column label="菜单名称" min-width="160">
          <template #default="{ row }">
            <span class="menu-permission-page__name">{{ row.name }}</span>
            <el-tag v-if="row.adminRequired" size="small" type="danger" effect="plain">必授</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-for="role in ROLES" :key="role" :label="ROLE_LABELS[role]" width="110" align="center">
          <template #default="{ row }">
            <el-checkbox
              :model-value="isChecked(role as Role, row.key)"
              :disabled="role === 'admin' && row.adminRequired"
              @change="toggle(role as Role, row.key, row.adminRequired)"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.menu-permission-page {
  &__panel {
    border-radius: $radius-lg;
  }

  &__alert {
    margin-bottom: 20px;
  }

  &__name {
    margin-right: 8px;
  }
}
</style>
