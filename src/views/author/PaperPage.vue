<script setup lang="ts">
/**
 * 试卷管理页（W3-T6，PRD §7.6 列表）。
 * 关键字筛选（客户端）+ 试卷表格：名称 / 来源题库标签 / 题目数 / 总分 / 描述 / 创建时间 / 操作。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import * as papersApi from '@/api/papers';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { Paper } from '@/types';

const router = useRouter();
const { confirm } = useConfirm();

const { data: papers, loading, refresh } = useRequest(() => papersApi.list());

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterKeyword = ref('');

const filteredPapers = computed<Paper[]>(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  const list = papers.value ?? [];
  if (!kw) return list;
  return list.filter(
    (p) => p.name.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw),
  );
});

function resetFilter(): void {
  filterKeyword.value = '';
}

function goComposer(): void {
  void router.push('/author/papers/composer');
}

function goPreview(paper: Paper): void {
  void router.push(`/author/papers/${paper.id}/preview`);
}

function goEdit(paper: Paper): void {
  void router.push(`/author/papers/composer?paperId=${paper.id}`);
}

const deleting = ref(false);

/** 删除试卷（被考试引用 → 后端 1005，拦截器已提示，此处不刷新） */
async function handleDelete(paper: Paper): Promise<void> {
  const ok = await confirm(`确定删除试卷「${paper.name}」吗？被考试引用的试卷无法删除`, {
    title: '删除试卷',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;

  deleting.value = true;
  try {
    await papersApi.remove(paper.id);
    ElMessage.success('试卷已删除');
    void refresh();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出（含 1005 被引用）
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="paper-page">
    <PageHeader title="试卷管理" description="从题库组合生成试卷，支持同时选择多个题库">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="goComposer">新建试卷</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !papers" :rows="5" />

    <EmptyState v-else-if="!papers || papers.length === 0" text="还没有试卷，点击右上角「新建试卷」开始组卷" />

    <el-card v-else class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-input
            v-model="filterKeyword"
            class="paper-page__filter-keyword"
            placeholder="按试卷名称 / 描述搜索"
            clearable
            :prefix-icon="Search"
          />
        </div>
        <div class="paper-page__filter-actions">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredPapers" row-key="id" stripe>
        <el-table-column prop="name" label="试卷名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="来源题库" min-width="180">
          <template #default="{ row }">
            <template v-if="row.bankNames && row.bankNames.length">
              <el-tag
                v-for="(bankName, index) in row.bankNames"
                :key="index"
                class="paper-page__bank-tag"
                size="small"
                type="info"
                effect="plain"
              >
                {{ bankName }}
              </el-tag>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="题目数" width="90" align="center">
          <template #default="{ row }">{{ row.questions.length }}</template>
        </el-table-column>
        <el-table-column label="总分" width="100" align="center">
          <template #default="{ row }">{{ formatScore(row.totalScore) }} 分</template>
        </el-table-column>
        <el-table-column label="描述" min-width="160">
          <template #default="{ row }">
            <el-tooltip v-if="row.description" :content="row.description" placement="top" :show-after="300">
              <span class="paper-page__desc">{{ row.description }}</span>
            </el-tooltip>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goPreview(row as Paper)">预览</el-button>
            <el-button link @click="goEdit(row as Paper)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row as Paper)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState text="没有匹配的试卷" />
        </template>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.paper-page__bank-tag {
  margin: 0 4px 4px 0;
}

.paper-page__filter-keyword {
  width: 260px;
}

.paper-page__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.paper-page__desc {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
