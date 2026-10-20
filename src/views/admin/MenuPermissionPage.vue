<script setup lang="ts">
/** 角色菜单授权与个人菜单例外，共用角色管理的权限数据。 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getMenuPermissions, updateMenuPermissions } from '@/api/permissions';
import * as usersApi from '@/api/users';
import { menuOverridesApi } from '@/api/coreFeatures';
import { groupKeyOf, groupOrderOf, groupTextOf } from '@/layouts/menuConfig';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import RoleMenuPicker from '@/components/common/RoleMenuPicker.vue';
import { formatDateTime } from '@/utils/datetime';
import type { MenuGrants, MenuPermission, RoleDefinition, User } from '@/types';

const definitions = ref<RoleDefinition[]>([]);
const ROLES = computed(() => definitions.value.map(r => r.id));
const activeRole = computed(() => definitions.value.find(r => r.id === selectedRole.value));
function roleName(id: string): string { return definitions.value.find(r => r.id === id)?.name ?? id; }

const loading = ref(true);
const loadError = ref(false);
const usersError = ref(false);
const usersLoading = ref(false);
const overrideLoading = ref(false);
const overrideError = ref(false);
let overrideRequest = 0;
onBeforeUnmount(() => { overrideRequest += 1; });
const saving = ref(false);
const saveError = ref('');
const overrideSaveError = ref('');
const catalog = ref<MenuPermission['catalog']>([]);
const grants = reactive<MenuGrants>({ admin: [], author: [], examinee: [] });

/** 当前编辑的角色 ID。 */
const selectedRole = ref('admin');
const users = ref<User[]>([]);
const overrideUserId = ref('');
const overrideDraft = reactive<Record<string, '' | 'allow' | 'deny'>>({});
const overrideSaving = ref(false);
const savingAny = computed(() => saving.value || overrideSaving.value);
const overrideUser = computed(() => users.value.find(u => u.id === overrideUserId.value));
const overrideGroups = computed(() => [...new Set(overrideCatalog.value.map(item => item.groupKey))].map(key => ({
  key, name: groupTextOf(key), items: overrideCatalog.value.filter(item => item.groupKey === key),
})));
function selectRole(id: string): void { if (!savingAny.value && !loading.value) selectedRole.value = id; }
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
  void loadUsers();
});

async function loadUsers(): Promise<void> {
  if (usersLoading.value || savingAny.value) return;
  usersLoading.value = true;
  usersError.value = false;
  try { users.value = await usersApi.list(); } catch { usersError.value = true; }
  finally { usersLoading.value = false; }
}
async function loadOverrides(): Promise<void> {
  if (savingAny.value) return;
  const request = ++overrideRequest;
  const userId = overrideUserId.value;
  for (const key of Object.keys(overrideDraft)) delete overrideDraft[key];
  overrideError.value = false;
  overrideSaveError.value = '';
  overrideLoading.value = Boolean(userId);
  if (!userId) return;
  try {
    const rows = await menuOverridesApi.list(userId);
    if (request !== overrideRequest) return;
    for (const item of overrideCatalog.value) overrideDraft[item.key] = '';
    for (const item of rows) overrideDraft[item.menuKey] = item.effect;
  } catch { if (request === overrideRequest) overrideError.value = true; }
  finally { if (request === overrideRequest) overrideLoading.value = false; }
}

async function saveOverrides(): Promise<void> {
  if (!overrideUserId.value) { ElMessage.warning('请先选择用户'); return; }
  if (savingAny.value || loading.value || usersLoading.value || usersError.value || overrideLoading.value || overrideError.value || loadError.value) return;
  overrideSaving.value = true;
  overrideSaveError.value = '';
  try {
    await menuOverridesApi.replace(overrideUserId.value, overrideCatalog.value.flatMap((item) => {
      const effect = overrideDraft[item.key];
      return effect ? [{ menuKey: item.key, effect }] : [];
    }));
    ElMessage.success('个人菜单例外已保存');
  } catch { overrideSaveError.value = '保存失败，个人例外选择已保留，请重试。'; }
  finally { overrideSaving.value = false; }
}

async function load(): Promise<void> {
  if (savingAny.value) return;
  loading.value = true;
  loadError.value = false;
  saveError.value = '';
  try {
    const data = await getMenuPermissions();
    catalog.value = data.catalog;
    definitions.value = data.roles;
    for (const key of Object.keys(grants)) delete grants[key];
    Object.assign(grants, data.grants);
    if (!data.roles.some(role => role.id === selectedRole.value)) selectedRole.value = data.roles[0]?.id ?? '';
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (savingAny.value || loading.value || loadError.value || !definitions.value.length) return;
  saving.value = true;
  saveError.value = '';
  try {
    const data = await updateMenuPermissions(Object.fromEntries(Object.entries(grants).map(([id, keys]) => [id, [...keys]])));
    definitions.value = data.roles;
    for (const key of Object.keys(grants)) delete grants[key];
    Object.assign(grants, data.grants);
    ElMessage.success('菜单权限已保存，受影响成员需重新登录');
  } catch {
    saveError.value = '保存失败，各角色的菜单选择已保留，请重试。';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div data-ui-layout="list" data-ui-page="MenuPermissionPage" class="menu-permission-page">
    <PageHeader title="菜单权限" description="配置各角色在侧边栏可见的菜单；管理员必授菜单不可关闭">
      <template #actions>
        <el-button type="primary" :loading="saving" :disabled="overrideSaving || loading || loadError || !definitions.length" @click="handleSave">保存权限</el-button>
      </template>
    </PageHeader>

    <RequestError v-if="loadError" text="菜单权限加载失败" @retry="load" />
    <p v-if="saveError" class="menu-permission-page__error" role="status">{{ saveError }}</p>
    <div v-if="!loadError" class="menu-permission-page__layout">
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
              :aria-disabled="savingAny || loading"
              :tabindex="savingAny || loading ? -1 : 0"
              role="button"
              :aria-pressed="role === selectedRole"
              @keydown.enter="selectRole(role)"
              @keydown.space.prevent="selectRole(role)"
              @click="selectRole(role)"
            >
              <span class="menu-permission-page__role-name">{{ roleName(role) }}</span>
              <span class="menu-permission-page__role-meta">
                已授权 {{ grants[role]?.length ?? 0 }} 项菜单
              </span>
            </li>
          </ul>
          <p v-if="loading" class="menu-permission-page__hint" role="status">角色与菜单目录加载中…</p>
        </el-card>

        <el-card class="menu-permission-page__panel" shadow="never">
          <template #header>
            <div class="menu-permission-page__head">
              <span class="menu-permission-page__head-title">当前统计</span>
              <span class="menu-permission-page__head-meta">{{ roleName(selectedRole) }}</span>
            </div>
          </template>

          <p v-if="loading" class="menu-permission-page__hint" role="status">授权统计加载中…</p>
          <template v-else-if="catalog.length">
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

        <RoleMenuPicker v-if="activeRole" v-model="grants[selectedRole]" :base-role="activeRole.baseRole" :catalog="catalog" :disabled="savingAny || loading || loadError" />
      </el-card>
    </div>

    <el-card class="menu-permission-page__panel" shadow="never">
      <template #header><div class="menu-permission-page__head"><span class="menu-permission-page__head-title">个人菜单例外</span><span class="menu-permission-page__head-meta">在基础角色权限之上设置允许或拒绝；管理员必备菜单不可拒绝</span></div></template>
      <RequestError v-if="usersError" text="用户选项加载失败" @retry="loadUsers" />
      <div class="admin-toolbar"><el-select v-model="overrideUserId" class="menu-permission-page__user" :loading="usersLoading" :disabled="savingAny || loading || usersLoading || usersError || loadError" filterable clearable placeholder="选择用户" popper-class="organization-choice-popper" @change="loadOverrides"><el-option v-for="user in users" :key="user.id" :label="`${user.name}（${user.username}）`" :value="user.id"/></el-select><el-button type="primary" :loading="overrideSaving" :disabled="saving || loading || usersLoading || usersError || !overrideUserId || overrideLoading || overrideError || loadError" @click="saveOverrides">保存个人例外</el-button></div>
      <p v-if="overrideSaveError" class="menu-permission-page__error" role="status">{{ overrideSaveError }}</p>
      <RequestError v-if="overrideError" text="个人菜单例外加载失败" @retry="loadOverrides" />
      <template v-else-if="overrideUserId">
        <p class="menu-permission-page__context">{{ overrideUser?.name }} · {{ overrideUser?.username }} · {{ overrideLoading ? '正在加载个人例外' : '未单独设置的菜单继承角色权限' }}</p>
        <div v-loading="overrideLoading" class="menu-permission-page__overrides" :aria-busy="overrideLoading">
          <section v-for="group in overrideLoading ? [] : overrideGroups" :key="group.key" class="menu-permission-page__override-group"><h3>{{ group.name }}</h3>
            <div v-for="item in group.items" :key="item.key" class="menu-permission-page__override-item"><div class="menu-permission-page__override-name">{{ item.name }}<small v-if="overrideUser?.role === 'admin' && item.adminRequired">管理员必备菜单，不可拒绝</small></div><el-radio-group v-model="overrideDraft[item.key]" :disabled="savingAny || loading || loadError" :aria-label="item.name + '个人例外'"><el-radio-button value="">继承角色</el-radio-button><el-radio-button value="allow">允许</el-radio-button><el-radio-button value="deny" :disabled="savingAny || loading || loadError || overrideUser?.role==='admin' && item.adminRequired">拒绝</el-radio-button></el-radio-group></div>
          </section>
          <EmptyState v-if="!overrideLoading && !overrideCatalog.length" text="该用户暂无可配置菜单" />
        </div>
      </template>
      <p v-else class="menu-permission-page__hint">选择用户后配置个人菜单允许/拒绝例外。</p>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.menu-permission-page {
  &__error { margin: 0; padding: 12px 16px; border-radius: $radius-base; background: $color-error-bg; color: $color-error-text; overflow-wrap: anywhere; }
  &__user { width: 300px; max-width: 100%; }
  &__context { font-size: 13px; color: $text-secondary; overflow-wrap: anywhere; }
  &__overrides { min-height: 80px; display: grid; gap: 16px; }
  &__override-group { min-width: 0; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; h3 { margin: 0 0 12px; font-size: 13px; color: $text-secondary; } }
  &__override-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding-block: 10px; border-bottom: 1px solid $border-color; &:last-child { border: 0; } }
  &__override-name { min-width: 0; overflow-wrap: anywhere; small { display: block; color: $text-secondary; margin-top: 4px; } }
  display: flex; flex-direction: column; gap: 20px; min-width: 0;
  > :deep(.page-header) { margin-bottom: 0; }
  &__layout {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 20px;
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
    flex-wrap: wrap;
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
    min-height: 44px;
    &[aria-disabled="true"] { cursor: wait; opacity: .7; }
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
    overflow-wrap: anywhere;
  }

  &__role-meta {
    flex-shrink: 0;
    font-size: 12px;
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
@media(max-width:900px) { .menu-permission-page__role { align-items: flex-start; flex-direction: column; gap: 4px; padding: 12px; } .menu-permission-page__head-meta { min-width: 0; overflow-wrap: anywhere; } .menu-permission-page__override-item { grid-template-columns: minmax(0, 1fr); } .menu-permission-page__override-item :deep(.el-radio-group) { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); width: 100%; } .menu-permission-page__override-item :deep(.el-radio-button__inner) { width: 100%; display: grid; place-items: center; min-height: 44px; padding-inline: 4px; } .menu-permission-page__user { flex: 1 1 100%; width: 100%; } }
</style>
