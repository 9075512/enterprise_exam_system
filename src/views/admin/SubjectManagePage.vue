<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Collection,
  Delete,
  EditPen,
  Folder,
  Plus,
  Refresh,
  Search,
  Tickets,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import { useConfirm } from '@/composables/useConfirm';
import { formatDateTime } from '@/utils/datetime';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import SubjectFormDrawer from './SubjectFormDrawer.vue';
import type { BankAccessConfig, BankTreeNode, QuestionBank } from '@/types';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const loading = ref(false);
const accessLoading = ref(false);
const tree = ref<BankTreeNode[]>([]);
const treeRef = ref<{
  filter: (value: string) => void;
  setCurrentKey: (key: string) => void;
}>();
const keyword = ref('');
const selectedId = ref('');
const access = ref<BankAccessConfig | null>(null);
const formVisible = ref(false);
const editingSubject = ref<QuestionBank | null>(null);
const defaultParentId = ref<string | null>(null);

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
const parentName = computed(() => {
  const parentId = selected.value?.parentId;
  return parentId ? flatMap.value.get(parentId)?.name ?? '—' : '根科目';
});
const selectedPath = computed(() => {
  if (!selected.value) return '';
  const names: string[] = [];
  let cursor: BankTreeNode | undefined = selected.value;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    names.unshift(cursor.name);
    cursor = cursor.parentId ? flatMap.value.get(cursor.parentId) : undefined;
  }
  return names.join(' / ');
});

const effectiveAccessSummary = computed(() => {
  if (!access.value) return [];
  const item = access.value;
  return [
    item.effectiveViewAll ? '全部人员' : '',
    item.effectiveDepartmentIds.length ? `${item.effectiveDepartmentIds.length} 个部门` : '',
    item.effectiveUserIds.length ? `${item.effectiveUserIds.length} 名指定人员` : '',
    item.effectiveEditorIds.length ? `${item.effectiveEditorIds.length} 名编辑人员` : '',
  ].filter(Boolean);
});

function filterNode(value: string, data: { name?: string }): boolean {
  return !value || String(data.name ?? '').toLowerCase().includes(value.trim().toLowerCase());
}

watch(keyword, (value) => treeRef.value?.filter(value));

async function loadAccess(id: string): Promise<void> {
  if (!id) {
    access.value = null;
    return;
  }
  accessLoading.value = true;
  try {
    access.value = await banksApi.access(id);
  } catch {
    access.value = null;
  } finally {
    accessLoading.value = false;
  }
}

async function syncSelection(id: string, updateRoute = true): Promise<void> {
  if (!id || !flatMap.value.has(id)) return;
  selectedId.value = id;
  await nextTick();
  treeRef.value?.setCurrentKey(id);
  if (updateRoute && String(route.query.subjectId ?? '') !== id) {
    void router.replace({ path: '/admin/subjects', query: { subjectId: id } });
  }
  await loadAccess(id);
}

async function loadTree(preferredId = ''): Promise<void> {
  loading.value = true;
  try {
    tree.value = await banksApi.tree();
    const requested = preferredId || String(route.query.subjectId ?? '') || selectedId.value;
    const nextId = flatMap.value.has(requested) ? requested : (tree.value[0]?.id ?? '');
    if (nextId) await syncSelection(nextId);
    else {
      selectedId.value = '';
      access.value = null;
    }
  } finally {
    loading.value = false;
  }
}

function selectNode(node: BankTreeNode): void {
  void syncSelection(node.id);
}

function openCreate(parentId: string | null = null): void {
  editingSubject.value = null;
  defaultParentId.value = parentId;
  formVisible.value = true;
}

function openEdit(): void {
  if (!selected.value) return;
  editingSubject.value = selected.value;
  defaultParentId.value = selected.value.parentId;
  formVisible.value = true;
}

async function onSaved(subject: QuestionBank): Promise<void> {
  await loadTree(subject.id);
}

async function removeSelected(): Promise<void> {
  const item = selected.value;
  if (!item) return;
  if (item.children.length > 0) {
    ElMessage.warning('该科目仍有下级，请先移动或删除下级科目');
    return;
  }
  if (item.questionCount > 0) {
    ElMessage.warning(`该科目下有 ${item.questionCount} 道题，请先迁移题目`);
    return;
  }
  const ok = await confirm(`确认删除科目“${item.name}”？`, {
    title: '删除科目',
    type: 'warning',
    confirmButtonText: '确认删除',
  });
  if (!ok) return;
  await banksApi.remove(item.id);
  ElMessage.success('科目已删除');
  selectedId.value = item.parentId ?? '';
  await loadTree(selectedId.value);
}

function viewQuestions(): void {
  if (!selected.value?.isLeaf) return;
  void router.push({ path: '/author/banks', query: { bankId: selected.value.id } });
}

watch(
  () => route.query.subjectId,
  (value) => {
    const id = String(value ?? '');
    if (id && id !== selectedId.value && flatMap.value.has(id)) void syncSelection(id, false);
  },
);

onMounted(() => void loadTree());
</script>

<template>
  <div class="subject-manage page">
    <PageHeader title="科目管理" description="维护科目层级、状态、练题开放范围与数据权限">
      <template #actions>
        <el-button :icon="Refresh" @click="loadTree()">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate(null)">新增根科目</el-button>
      </template>
    </PageHeader>

    <div class="subject-manage__workspace">
      <aside class="subject-manage__tree-panel">
        <el-input v-model="keyword" clearable placeholder="搜索科目" :prefix-icon="Search" />
        <el-tree
          ref="treeRef"
          v-loading="loading"
          class="subject-manage__tree"
          :data="tree"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :filter-node-method="filterNode"
          highlight-current
          default-expand-all
          @node-click="selectNode"
        >
          <template #default="{ data }">
            <span class="subject-node">
              <el-icon><Folder v-if="data.children.length" /><Collection v-else /></el-icon>
              <span class="subject-node__name">{{ data.name }}</span>
              <span v-if="!data.children.length" class="subject-node__count">{{ data.questionCount }}</span>
              <span v-if="data.effectiveStatus === 'disabled'" class="subject-node__disabled">停</span>
            </span>
          </template>
        </el-tree>
        <el-button class="subject-manage__tree-add" text :icon="Plus" @click="openCreate(null)">
          新增根科目
        </el-button>
      </aside>

      <main class="subject-manage__detail">
        <EmptyState
          v-if="!loading && !selected"
          text="暂无科目"
          action-text="新增根科目"
          @action="openCreate(null)"
        />
        <LoadingSkeleton v-else-if="loading && !selected" :rows="5" />
        <template v-else-if="selected">
          <header class="subject-detail__header">
            <div class="subject-detail__heading">
              <div class="subject-detail__title-row">
                <h2>{{ selected.name }}</h2>
                <el-tag :type="selected.effectiveStatus === 'active' ? 'success' : 'info'" effect="plain">
                  {{ selected.effectiveStatus === 'active' ? '启用' : '停用' }}
                </el-tag>
                <el-tag effect="plain" type="info">{{ selected.isLeaf ? '叶子科目' : '目录科目' }}</el-tag>
              </div>
              <p>{{ selectedPath }}</p>
            </div>
            <div class="subject-detail__actions">
              <el-button v-if="selected.isLeaf" :icon="Tickets" @click="viewQuestions">查看题目</el-button>
              <el-tooltip
                :disabled="selected.questionCount === 0"
                content="已有题目的科目不能新增下级，请先迁移题目"
              >
                <span><el-button :icon="Plus" :disabled="selected.questionCount > 0" @click="openCreate(selected.id)">新增下级</el-button></span>
              </el-tooltip>
              <el-button type="primary" :icon="EditPen" @click="openEdit">编辑科目</el-button>
              <el-button type="danger" plain :icon="Delete" @click="removeSelected">删除</el-button>
            </div>
          </header>

          <div class="subject-detail__metrics">
            <div class="subject-metric"><span>直属下级</span><strong>{{ selected.children.length }}</strong></div>
            <div class="subject-metric"><span>题目数量</span><strong>{{ selected.questionCount }}</strong></div>
            <div class="subject-metric"><span>练题开放</span><strong>{{ selected.allowPractice ? '已开放' : '未开放' }}</strong></div>
            <div class="subject-metric"><span>排序值</span><strong>{{ selected.sortOrder }}</strong></div>
          </div>

          <div class="subject-detail__grid">
            <el-card shadow="never" class="subject-detail__card">
              <template #header><h3>基本信息</h3></template>
              <dl class="subject-detail__list">
                <div><dt>上级科目</dt><dd>{{ parentName }}</dd></div>
                <div><dt>创建人</dt><dd>{{ selected.createdBy || '—' }}</dd></div>
                <div><dt>创建时间</dt><dd>{{ formatDateTime(selected.createdAt) }}</dd></div>
                <div class="is-block"><dt>描述</dt><dd>{{ selected.description || '暂无描述' }}</dd></div>
              </dl>
            </el-card>

            <el-card v-loading="accessLoading" shadow="never" class="subject-detail__card">
              <template #header><h3>有效权限</h3></template>
              <dl class="subject-detail__list">
                <div><dt>权限方式</dt><dd>{{ access?.permissionMode === 'inherit' ? '继承上级' : '完整覆盖' }}</dd></div>
                <div><dt>权限来源</dt><dd>{{ access?.effectiveFromBankId ? flatMap.get(access.effectiveFromBankId)?.name || '上级科目' : '当前科目' }}</dd></div>
                <div class="is-block">
                  <dt>浏览与编辑范围</dt>
                  <dd class="subject-detail__tags">
                    <el-tag v-for="item in effectiveAccessSummary" :key="item" size="small" effect="plain">{{ item }}</el-tag>
                    <span v-if="!effectiveAccessSummary.length">未配置可见人员</span>
                  </dd>
                </div>
              </dl>
            </el-card>
          </div>
        </template>
      </main>
    </div>

    <SubjectFormDrawer
      v-model:visible="formVisible"
      :bank="editingSubject"
      :tree="tree"
      :default-parent-id="defaultParentId"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.subject-manage__workspace {
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  min-height: 640px;
  overflow: hidden;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: #fff;
}

.subject-manage__tree-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 12px;
  border-right: 1px solid $border-color;
  background: #fbfdff;
}

.subject-manage__tree {
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  background: transparent;
}

.subject-node {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
}

.subject-node__name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.subject-node__count { color: $text-secondary; font-size: 12px; font-variant-numeric: tabular-nums; }
.subject-node__disabled { color: $text-disabled; font-size: 11px; }
.subject-manage__tree-add { width: 100%; margin-top: 10px; }

.subject-manage__detail { min-width: 0; padding: 20px; }

.subject-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid $border-color;
}

.subject-detail__heading { min-width: 0; }
.subject-detail__title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.subject-detail__title-row h2 { margin: 0; font-size: 22px; color: $text-primary; }
.subject-detail__heading p { margin: 6px 0 0; color: $text-secondary; font-size: 12px; }
.subject-detail__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.subject-detail__actions :deep(.el-button + .el-button) { margin-left: 0; }

.subject-detail__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.subject-metric {
  padding: 14px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-base;
  background: $bg-page;
}
.subject-metric span { display: block; font-size: 12px; color: $text-secondary; }
.subject-metric strong { display: block; margin-top: 5px; font-size: 18px; color: $text-primary; font-variant-numeric: tabular-nums; }

.subject-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.subject-detail__card { border-radius: $radius-lg; }
.subject-detail__card h3 { margin: 0; font-size: 15px; color: $text-primary; }
.subject-detail__list { margin: 0; }
.subject-detail__list > div { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid $border-color; }
.subject-detail__list > div:last-child { border-bottom: 0; }
.subject-detail__list > .is-block { flex-direction: column; gap: 6px; }
.subject-detail__list dt { color: $text-secondary; font-size: 13px; }
.subject-detail__list dd { margin: 0; color: $text-primary; font-size: 13px; text-align: right; overflow-wrap: anywhere; }
.subject-detail__list .is-block dd { text-align: left; }
.subject-detail__tags { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 1200px) {
  .subject-manage__workspace { grid-template-columns: 224px minmax(0, 1fr); }
  .subject-detail__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .subject-detail__grid { grid-template-columns: 1fr; }
}

@media (max-width: 900px) {
  .subject-manage__workspace { grid-template-columns: 1fr; }
  .subject-manage__tree-panel { max-height: 280px; border-right: 0; border-bottom: 1px solid $border-color; }
  .subject-manage__tree { overflow: auto; }
  .subject-detail__header { flex-direction: column; }
  .subject-detail__actions { justify-content: flex-start; }
}

@media (max-width: 640px) {
  .subject-manage__detail { padding: 14px; }
  .subject-detail__metrics { grid-template-columns: 1fr; }
}
</style>
