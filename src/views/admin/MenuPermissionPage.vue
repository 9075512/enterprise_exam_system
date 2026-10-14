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

/**
 * 侧栏「选择角色」的当前选中项——仅用于「当前统计」的展示口径，
 * 不参与上方矩阵的勾选与保存逻辑（矩阵始终同时编辑三个角色）。
 */
const selectedRole = ref<Role>('admin');

/** 所选角色已授权菜单数（复用 grants / catalog 既有状态） */
const grantedCount = computed<number>(() => grants[selectedRole.value].length);
/** 所选角色未授权菜单数 */
const ungrantedCount = computed<number>(() => Math.max(0, catalog.value.length - grantedCount.value));

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

    <div class="menu-permission-page__layout">
      <!-- 左栏：选择角色 + 当前统计（对齐设计稿 permissions.html 的独立卡） -->
      <div class="menu-permission-page__aside">
        <el-card class="menu-permission-page__panel" shadow="never">
          <template #header>
            <div class="menu-permission-page__head">
              <span class="menu-permission-page__head-title">选择角色</span>
            </div>
          </template>

          <ul class="menu-permission-page__roles">
            <li
              v-for="role in ROLES"
              :key="role"
              class="menu-permission-page__role"
              :class="{ 'is-active': role === selectedRole }"
              @click="selectedRole = role"
            >
              <span class="menu-permission-page__role-name">{{ ROLE_LABELS[role] }}</span>
              <span class="menu-permission-page__role-meta">
                已授权 {{ grants[role].length }} / {{ catalog.length }}
              </span>
            </li>
          </ul>
        </el-card>

        <el-card class="menu-permission-page__panel" shadow="never">
          <template #header>
            <div class="menu-permission-page__head">
              <span class="menu-permission-page__head-title">当前统计</span>
              <span class="menu-permission-page__head-meta">{{ ROLE_LABELS[selectedRole] }}</span>
            </div>
          </template>

          <template v-if="catalog.length">
            <div class="menu-permission-page__kv">
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">已授权菜单</span>
                <span class="menu-permission-page__kv-val">{{ grantedCount }} / {{ catalog.length }}</span>
              </div>
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">未授权</span>
                <span class="menu-permission-page__kv-val">{{ ungrantedCount }}</span>
              </div>
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">最后修改</span>
                <span class="menu-permission-page__kv-val">—</span>
              </div>
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">修改人</span>
                <span class="menu-permission-page__kv-val">—</span>
              </div>
            </div>
            <!-- 说明性文案：菜单权限接口未返回「最后修改时间 / 修改人」，故以 — 占位 -->
            <p class="menu-permission-page__hint">接口未返回修改记录，「最后修改 / 修改人」暂以 — 占位。</p>
          </template>
          <!-- 空态：目录缺失（加载失败或尚未配置）时给出简短提醒 -->
          <p v-else class="menu-permission-page__hint">暂无菜单目录，无法统计授权情况。</p>
        </el-card>
      </div>

      <!-- 右栏：菜单权限矩阵 -->
      <el-card v-loading="loading" class="menu-permission-page__panel menu-permission-page__main" shadow="never">
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
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.menu-permission-page {
  &__layout {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  &__aside {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__main {
    min-width: 0;
  }

  &__panel {
    border-radius: $radius-lg;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  &__head-title {
    font-size: 13.5px;
    font-weight: 700;
    color: $text-primary;
  }

  &__head-meta {
    font-size: 12px;
    color: $text-secondary;
  }

  &__roles {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__role {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 8px;
    border-radius: $radius-sm;
    font-size: 12.5px;
    color: $text-body;
    cursor: pointer;

    &:hover {
      background: $bg-page;
    }

    &.is-active {
      background: $color-primary-soft;
      color: $color-primary;
      font-weight: 600;
    }
  }

  &__role-name {
    min-width: 0;
  }

  &__role-meta {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__kv {
    display: flex;
    flex-direction: column;
  }

  &__kv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed $border-color;
    font-size: 12.5px;
    color: $text-body;

    &:last-child {
      border-bottom: none;
    }
  }

  &__kv-key {
    color: $text-secondary;
  }

  &__kv-val {
    color: $text-primary;
    font-weight: 600;
    text-align: right;
  }

  &__hint {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: $text-secondary;
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
