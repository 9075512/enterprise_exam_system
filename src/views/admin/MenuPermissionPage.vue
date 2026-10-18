<script setup lang="ts">
/** 角色菜单授权与个人菜单例外，共用角色管理的权限数据。 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getMenuPermissions, updateMenuPermissions } from '@/api/permissions';
import * as usersApi from '@/api/users';
import { menuOverridesApi } from '@/api/coreFeatures';
import { groupKeyOf, groupOrderOf, groupTextOf } from '@/layouts/menuConfig';
import PageHeader from '@/components/common/PageHeader.vue';
import RoleMenuPicker from '@/components/common/RoleMenuPicker.vue';
import { formatDateTime } from '@/utils/datetime';
import type { MenuGrants, MenuPermission, RoleDefinition, User } from '@/types';

const definitions = ref<RoleDefinition[]>([]);
const ROLES = computed(() => definitions.value.map(r => r.id));
const activeRole = computed(() => definitions.value.find(r => r.id === selectedRole.value));
function roleName(id: string): string { return definitions.value.find(r => r.id === id)?.name ?? id; }

const loading = ref(true);
const saving = ref(false);
const catalog = ref<MenuPermission['catalog']>([]);
const grants = reactive<MenuGrants>({ admin: [], author: [], examinee: [] });

/** 当前编辑的角色 ID。 */
const selectedRole = ref('admin');
const users = ref<User[]>([]);
const overrideUserId = ref('');
const overrideDraft = reactive<Record<string, '' | 'allow' | 'deny'>>({});
const overrideSaving = ref(false);
const overrideCatalog = computed(() => {
  const user = users.value.find(u => u.id === overrideUserId.value);
  return groupedCatalog.value.filter(item => user && (item.defaultRoles.includes(user.role) || item.key === 'exam-messages'));
});

/** 所选角色已授权菜单数（复用 grants / catalog 既有状态） */
const grantedCount = computed<number>(() => (grants[selectedRole.value] ?? []).length);
/** 所选角色未授权菜单数 */
const ungrantedCount = computed<number>(() => Math.max(0, catalog.value.filter(m => activeRole.value && (m.defaultRoles.includes(activeRole.value.baseRole) || m.key === 'exam-messages')).length - grantedCount.value));

/** 按分组归类 + 排序后的目录（分组列用 span-method 合并相邻同组单元格） */
const groupedCatalog = computed(() =>
  [...catalog.value]
    .map((row) => ({ ...row, groupText: groupTextOf(groupKeyOf(row.key)), groupKey: groupKeyOf(row.key) }))
    .sort((a, b) => groupOrderOf(a.groupKey) - groupOrderOf(b.groupKey)),
);

onMounted(() => {
  void load();
  void usersApi.list().then((rows) => { users.value = rows; }).catch(() => {});
});

async function loadOverrides(): Promise<void> {
  for (const key of Object.keys(overrideDraft)) delete overrideDraft[key];
  if (!overrideUserId.value) return;
  const rows = await menuOverridesApi.list(overrideUserId.value);
  for (const item of rows) overrideDraft[item.menuKey] = item.effect;
}

async function saveOverrides(): Promise<void> {
  if (!overrideUserId.value) { ElMessage.warning('请先选择用户'); return; }
  overrideSaving.value = true;
  try {
    await menuOverridesApi.replace(overrideUserId.value, overrideCatalog.value.flatMap((item) => {
      const effect = overrideDraft[item.key];
      return effect ? [{ menuKey: item.key, effect }] : [];
    }));
    ElMessage.success('个人菜单例外已保存');
  } finally { overrideSaving.value = false; }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getMenuPermissions();
    catalog.value = data.catalog;
    definitions.value = data.roles;
    for (const key of Object.keys(grants)) delete grants[key];
    Object.assign(grants, data.grants);
  } catch {
    // 加载失败静默，保持空态
  } finally {
    loading.value = false;
  }
}

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    const data = await updateMenuPermissions(Object.fromEntries(Object.entries(grants).map(([id, keys]) => [id, [...keys]])));
    definitions.value = data.roles;
    for (const key of Object.keys(grants)) delete grants[key];
    Object.assign(grants, data.grants);
    ElMessage.success('菜单权限已保存，受影响成员需重新登录');
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
        <el-button type="primary" :loading="saving" :disabled="loading || !definitions.length" @click="handleSave">保存权限</el-button>
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
              <span class="menu-permission-page__role-name">{{ roleName(role) }}</span>
              <span class="menu-permission-page__role-meta">
                已授权 {{ grants[role]?.length ?? 0 }} 项菜单
              </span>
            </li>
          </ul>
        </el-card>

        <el-card class="menu-permission-page__panel" shadow="never">
          <template #header>
            <div class="menu-permission-page__head">
              <span class="menu-permission-page__head-title">当前统计</span>
              <span class="menu-permission-page__head-meta">{{ roleName(selectedRole) }}</span>
            </div>
          </template>

          <template v-if="catalog.length">
            <div class="menu-permission-page__kv">
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">已授权菜单</span>
                <span class="menu-permission-page__kv-val">{{ grantedCount }}</span>
              </div>
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">未授权</span>
                <span class="menu-permission-page__kv-val">{{ ungrantedCount }}</span>
              </div>
              <div class="menu-permission-page__kv-row">
                <span class="menu-permission-page__kv-key">最后修改</span>
                <span class="menu-permission-page__kv-val">{{ activeRole ? formatDateTime(activeRole.updatedAt) : '—' }}</span>
              </div>
            </div>
          </template>
          <!-- 空态：目录缺失（加载失败或尚未配置）时给出简短提醒 -->
          <p v-else class="menu-permission-page__hint">暂无菜单目录，无法统计授权情况。</p>
        </el-card>
      </div>

      <!-- 右栏：所选角色的菜单权限 -->
      <el-card v-loading="loading" class="menu-permission-page__panel menu-permission-page__main" shadow="never">
        <el-alert
          class="menu-permission-page__alert"
          type="info"
          show-icon
          :closable="false"
          title="按所选角色的基础身份配置可见菜单；权限修改后受影响成员需重新登录，管理员必授菜单不可关闭"
        />

        <RoleMenuPicker v-if="activeRole" v-model="grants[selectedRole]" :base-role="activeRole.baseRole" :catalog="catalog" />
      </el-card>
    </div>

    <el-card class="menu-permission-page__panel" shadow="never">
      <template #header><div class="menu-permission-page__head"><span class="menu-permission-page__head-title">个人菜单例外</span><span class="menu-permission-page__head-meta">在基础角色权限之上设置允许或拒绝；管理员必备菜单不可拒绝</span></div></template>
      <div style="display:flex;gap:12px;margin-bottom:14px"><el-select v-model="overrideUserId" filterable clearable placeholder="选择用户" style="width:260px" @change="loadOverrides"><el-option v-for="user in users" :key="user.id" :label="`${user.name}（${user.username}）`" :value="user.id"/></el-select><el-button type="primary" :loading="overrideSaving" :disabled="!overrideUserId" @click="saveOverrides">保存个人例外</el-button></div>
      <el-table v-if="overrideUserId" :data="overrideCatalog" row-key="key" size="small" border><el-table-column prop="name" label="菜单" min-width="180"/><el-table-column label="个人例外" width="220"><template #default="{ row }"><el-radio-group v-model="overrideDraft[row.key]"><el-radio-button value="">继承角色</el-radio-button><el-radio-button value="allow">允许</el-radio-button><el-radio-button value="deny" :disabled="users.find(u=>u.id===overrideUserId)?.role==='admin' && row.adminRequired">拒绝</el-radio-button></el-radio-group></template></el-table-column></el-table>
      <p v-else class="menu-permission-page__hint">选择用户后配置个人菜单允许/拒绝例外。</p>
    </el-card>
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

    @media (max-width: 1100px) {
      grid-template-columns: minmax(0, 1fr);
    }
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
