<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Collection, Folder, Refresh, Search, Setting } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import QuestionBankDetailPage from './QuestionBankDetailPage.vue';
import type { BankTreeNode } from '@/types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole('admin'));
const loading = ref(false);
const tree = ref<BankTreeNode[]>([]);
const treeRef = ref<{ filter: (value: string) => void; setCurrentKey: (key: string) => void }>();
const keyword = ref('');
const selectedId = ref('');

const flatMap = computed(() => {
  const map = new Map<string, BankTreeNode>();
  const visit = (nodes: BankTreeNode[]) => nodes.forEach((node) => {
    map.set(node.id, node);
    visit(node.children);
  });
  visit(tree.value);
  return map;
});
const selected = computed(() => flatMap.value.get(selectedId.value) ?? null);
const directChildren = computed(() => selected.value?.children ?? tree.value);

function filterNode(value: string, data: { name?: string }): boolean {
  return !value || String(data.name ?? '').toLowerCase().includes(value.trim().toLowerCase());
}
watch(keyword, (value) => treeRef.value?.filter(value));

async function loadTree(preferredId = ''): Promise<void> {
  loading.value = true;
  try {
    tree.value = await banksApi.tree();
    const requested = preferredId || String(route.query.bankId ?? '') || selectedId.value;
    selectedId.value = flatMap.value.has(requested) ? requested : (tree.value[0]?.id ?? '');
    await nextTick();
    if (selectedId.value) treeRef.value?.setCurrentKey(selectedId.value);
  } finally {
    loading.value = false;
  }
}

function selectNode(node: BankTreeNode): void {
  selectedId.value = node.id;
  void router.replace({ path: '/author/banks', query: { bankId: node.id } });
}

function openSubjectManagement(): void {
  const query = selectedId.value ? { subjectId: selectedId.value } : undefined;
  void router.push({ path: '/admin/subjects', query });
}

watch(
  () => route.query.bankId,
  (value) => {
    const id = String(value ?? '');
    if (id && flatMap.value.has(id)) {
      selectedId.value = id;
      treeRef.value?.setCurrentKey(id);
    }
  },
);
onMounted(() => void loadTree());
</script>

<template>
  <div class="bank-workspace page">
    <PageHeader title="题库管理" description="选择科目并维护叶子科目中的试题">
      <template #actions>
        <el-button :icon="Refresh" @click="loadTree()">刷新</el-button>
        <el-button v-if="isAdmin" :icon="Setting" @click="openSubjectManagement">前往科目管理</el-button>
      </template>
    </PageHeader>

    <div class="bank-workspace__card">
      <aside class="bank-workspace__tree-panel">
        <div class="bank-workspace__tree-title">科目目录</div>
        <el-input v-model="keyword" clearable placeholder="搜索科目" :prefix-icon="Search" />
        <el-tree
          ref="treeRef"
          v-loading="loading"
          class="bank-workspace__tree"
          :data="tree"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :filter-node-method="filterNode"
          highlight-current
          default-expand-all
          @node-click="selectNode"
        >
          <template #default="{ data }">
            <span class="bank-tree-node">
              <el-icon><Folder v-if="data.children.length" /><Collection v-else /></el-icon>
              <span class="bank-tree-node__name">{{ data.name }}</span>
              <span v-if="!data.children.length" class="bank-tree-node__count">{{ data.questionCount }}</span>
              <span v-if="data.effectiveStatus === 'disabled'" class="bank-tree-node__disabled">停</span>
            </span>
          </template>
        </el-tree>
        <p class="bank-workspace__tree-hint">科目结构由管理员在“科目管理”中维护</p>
      </aside>

      <main class="bank-workspace__content">
        <EmptyState v-if="!selected" text="请选择左侧科目" />
        <template v-else-if="!selected.isLeaf">
          <div class="directory-head">
            <div>
              <div class="directory-head__title-row">
                <h2>{{ selected.name }}</h2>
                <el-tag :type="selected.effectiveStatus === 'active' ? 'success' : 'info'" effect="plain">
                  {{ selected.effectiveStatus === 'active' ? '启用' : '停用' }}
                </el-tag>
              </div>
              <p>直属下级 {{ selected.children.length }} 个 · 目录科目不直接存放试题</p>
            </div>
          </div>
          <div v-if="directChildren.length" class="child-grid">
            <el-card
              v-for="child in directChildren"
              :key="child.id"
              shadow="hover"
              class="child-card"
              tabindex="0"
              @click="selectNode(child)"
              @keyup.enter="selectNode(child)"
            >
              <div class="child-card__icon"><el-icon><Folder v-if="child.children.length" /><Collection v-else /></el-icon></div>
              <div class="child-card__body">
                <h3>{{ child.name }}</h3>
                <p>{{ child.children.length ? `${child.children.length} 个下级科目` : `${child.questionCount} 道题` }}</p>
              </div>
              <el-tag size="small" :type="child.effectiveStatus === 'active' ? 'success' : 'info'">
                {{ child.effectiveStatus === 'active' ? '启用' : '停用' }}
              </el-tag>
            </el-card>
          </div>
          <EmptyState v-else text="暂无下级科目" />
        </template>
        <QuestionBankDetailPage v-else :key="selected.id" embedded :selected-bank-id="selected.id" />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-workspace__card {
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  min-height: 640px;
  overflow: hidden;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: #fff;
}

.bank-workspace__tree-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 12px;
  border-right: 1px solid $border-color;
  background: #fbfdff;
}
.bank-workspace__tree-title { margin: 0 4px 10px; color: $text-secondary; font-size: 12px; font-weight: 600; }
.bank-workspace__tree { flex: 1; min-height: 0; margin-top: 12px; background: transparent; }
.bank-tree-node { display: flex; align-items: center; gap: 7px; width: 100%; min-width: 0; }
.bank-tree-node__name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.bank-tree-node__count { color: $text-secondary; font-size: 12px; font-variant-numeric: tabular-nums; }
.bank-tree-node__disabled { color: $text-disabled; font-size: 11px; }
.bank-workspace__tree-hint { margin: 12px 4px 0; color: $text-secondary; font-size: 11px; line-height: 1.6; }

.bank-workspace__content { min-width: 0; padding: 18px; }
.directory-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
.directory-head__title-row { display: flex; align-items: center; gap: 8px; }
.directory-head h2 { margin: 0; font-size: 20px; color: $text-primary; }
.directory-head p { margin: 6px 0 0; color: $text-secondary; font-size: 13px; }
.child-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.child-card { cursor: pointer; }
.child-card :deep(.el-card__body) { display: flex; align-items: center; gap: 12px; }
.child-card__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: $color-primary-soft; color: $color-primary; font-size: 20px; }
.child-card__body { flex: 1; min-width: 0; }
.child-card__body h3 { margin: 0; overflow: hidden; color: $text-primary; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.child-card__body p { margin: 5px 0 0; color: $text-secondary; font-size: 12px; }

@media (max-width: 1200px) {
  .bank-workspace__card { grid-template-columns: 224px minmax(0, 1fr); }
}

@media (max-width: 900px) {
  .bank-workspace__card { grid-template-columns: 1fr; }
  .bank-workspace__tree-panel { max-height: 280px; border-right: 0; border-bottom: 1px solid $border-color; }
  .bank-workspace__tree { overflow: auto; }
  .bank-workspace__tree-hint { display: none; }
}
</style>
