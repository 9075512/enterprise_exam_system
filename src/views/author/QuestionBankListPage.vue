<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Collection, Folder, Refresh, Search, Setting } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import { useAuthStore } from '@/stores/auth';
import { useRequest } from '@/composables/useRequest';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import QuestionBankDetailPage from './QuestionBankDetailPage.vue';
import type { BankTreeNode } from '@/types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole('admin'));
const { data: treeData, loading, error: treeError, refresh: refreshTree } = useRequest(() => banksApi.tree(), [], { immediate: false, keepPreviousData: false });
const tree = computed(() => treeData.value ?? []);
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
  const response = await refreshTree();
  if (!response || response !== toRaw(treeData.value)) return;
  const requested = preferredId || String(route.query.bankId ?? '') || selectedId.value;
  selectedId.value = flatMap.value.has(requested) ? requested : (tree.value[0]?.id ?? '');
  await nextTick();
  if (selectedId.value) treeRef.value?.setCurrentKey(selectedId.value);
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
  <div data-ui-layout="tree" data-ui-page="QuestionBankListPage" class="bank-workspace subject-workspace page">
    <PageHeader title="题库管理" description="选择科目并维护叶子科目中的试题">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="loadTree()">刷新</el-button>
        <el-button v-if="isAdmin" :icon="Setting" @click="openSubjectManagement">前往科目管理</el-button>
      </template>
    </PageHeader>

    <RequestError v-if="treeError" text="题库目录加载失败" @retry="loadTree()" />
    <div v-else class="bank-workspace__card subject-workspace__layout">
      <aside class="bank-workspace__tree-panel subject-workspace__sidebar" aria-label="科目目录">
        <div class="subject-workspace__nav-heading"><h3>科目目录</h3><span>共 {{ flatMap.size }} 个</span></div>
        <el-input v-model="keyword" clearable placeholder="搜索科目" aria-label="搜索科目" :prefix-icon="Search" />
        <el-tree
          ref="treeRef"
          v-loading="loading"
          class="bank-workspace__tree subject-workspace__tree"
          :data="tree"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :filter-node-method="filterNode"
          :empty-text="loading ? '正在加载科目…' : keyword.trim() ? '未找到匹配科目' : '暂无科目'"
          highlight-current
          default-expand-all
          @node-click="selectNode"
        >
          <template #default="{ data }">
            <span class="bank-tree-node subject-workspace__node">
              <el-icon><Folder v-if="data.children.length" /><Collection v-else /></el-icon>
              <span class="subject-workspace__node-name" :title="data.name">{{ data.name }}</span>
              <span v-if="!data.children.length" class="subject-workspace__node-count" :title="`${data.questionCount} 道题`">{{ data.questionCount }}</span>
              <span v-if="data.effectiveStatus === 'disabled'" class="subject-workspace__node-disabled">停</span>
            </span>
          </template>
        </el-tree>
        <div class="subject-workspace__nav-footer"><p>科目结构由管理员在“科目管理”中维护</p></div>
      </aside>

      <main class="bank-workspace__content subject-workspace__content">
        <LoadingSkeleton v-if="loading && !selected" :rows="5" />
        <EmptyState v-else-if="!selected" text="暂无可查看的科目" />
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
            <button
              v-for="child in directChildren"
              :key="child.id"
              type="button"
              class="child-card"
              @click="selectNode(child)"
            >
              <span class="child-card__icon"><el-icon><Folder v-if="child.children.length" /><Collection v-else /></el-icon></span>
              <span class="child-card__body">
                <strong class="child-card__name" :title="child.name">{{ child.name }}</strong>
                <span class="child-card__summary">{{ child.children.length ? `${child.children.length} 个下级科目` : `${child.questionCount} 道题` }}</span>
              </span>
              <el-tag size="small" :type="child.effectiveStatus === 'active' ? 'success' : 'info'">
                {{ child.effectiveStatus === 'active' ? '启用' : '停用' }}
              </el-tag>
            </button>
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
@use '@/styles/subject-workspace.scss' as workspace;

@include workspace.layout;

.directory-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid $border-color; }
.directory-head__title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.directory-head h2 { margin: 0; font-size: 22px; color: $text-primary; overflow-wrap: anywhere; }
.directory-head p { margin: 6px 0 0; color: $text-secondary; font-size: 13px; }
.child-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 12px; }
.child-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 18px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-base;
  background: $bg-paper;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color $transition-fast, background-color $transition-fast;

  &:hover { border-color: $color-primary-border; background: $color-primary-soft; }
}
.child-card__icon { display: grid; flex-shrink: 0; place-items: center; width: 40px; height: 40px; border-radius: $radius-base; background: $color-primary-soft; color: $color-primary; font-size: 20px; }
.child-card__body { flex: 1; min-width: 0; }
.child-card__name { display: block; overflow: hidden; color: $text-primary; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.child-card__summary { display: block; margin-top: 5px; color: $text-secondary; font-size: 12px; }

</style>
