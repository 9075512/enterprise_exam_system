<script setup lang="ts">
/**
 * 菜单权限（v1.5，管理员）。
 * 以「菜单 × 角色」矩阵配置各角色可见的侧栏菜单；管理员必授菜单（系统设置/菜单权限）不可取消，防止自锁。
 *
 * v1.9：表格按侧栏的二级分组归类展示（数据中心 / 教学资源 / 考试运营 / 练题运营 / 组织与系统 / 考生中心），
 * 分组来自前端 menuConfig（展示层概念，不参与授权），仅用于让 18 项菜单一眼看清归属。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getMenuPermissions, updateMenuPermissions } from '@/api/permissions';
import { ROLE_LABELS } from '@/constants';
import { groupKeyOf, groupOrderOf, groupTextOf } from '@/layouts/menuConfig';
import PageHeader from '@/components/common/PageHeader.vue';
import type { MenuGrants, MenuPermission, Role } from '@/types';

const ROLES: Role[] = ['admin', 'author', 'examinee'];

const loading = ref(true);
const saving = ref(false);
const catalog = ref<MenuPermission['catalog']>([]);
const grants = reactive<MenuGrants>({ admin: [], author: [], examinee: [] });

/** 按分组归类 + 排序后的目录（分组列用 span-method 合并相邻同组单元格） */
const groupedCatalog = computed(() =>
  [...catalog.value]
    .map((row) => ({ ...row, groupText: groupTextOf(groupKeyOf(row.key)), groupKey: groupKeyOf(row.key) }))
    .sort((a, b) => groupOrderOf(a.groupKey) - groupOrderOf(b.groupKey)),
);

/** 分组列单元格合并：与上一行同组则不占位。 */
function spanMethod({ rowIndex, columnIndex }: { rowIndex: number; columnIndex: number }): number[] {
  if (columnIndex !== 0) return [1, 1];
  const rows = groupedCatalog.value;
  const current = rows[rowIndex];
  if (rowIndex > 0 && rows[rowIndex - 1].groupKey === current.groupKey) return [0, 0];
  let span = 1;
  for (let i = rowIndex + 1; i < rows.length && rows[i].groupKey === current.groupKey; i += 1) span += 1;
  return [span, 1];
}

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

      <el-table :data="groupedCatalog" row-key="key" border :span-method="spanMethod">
        <el-table-column label="分组" width="118">
          <template #default="{ row }">
            <span class="menu-permission-page__group">{{ row.groupText }}</span>
          </template>
        </el-table-column>
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

  &__group {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-secondary;
  }
}
</style>
