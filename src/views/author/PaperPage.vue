<script setup lang="ts">
/**
 * 试卷管理页（W3-T6，PRD §7.6 列表）。
 * 关键字筛选（客户端）+ 试卷表格：名称 / 来源题库标签 / 题目数 / 总分 / 描述 / 创建时间 / 操作。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, Refresh, ArrowDown } from '@element-plus/icons-vue';
import * as papersApi from '@/api/papers';
import * as examsApi from '@/api/exams';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import type { Exam, Paper } from '@/types';

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

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() => Boolean(filterKeyword.value.trim()));

/* ------------------------------ 试卷引用检查 ------------------------------ */
/**
 * 引用关系反查：一次拉取全部考试，按 exam.paperId 归类，避免逐卷请求。
 * 数据缺口/权限：`GET /exams` 仅 admin 可访问（server .../exams.router.ts requireRole('admin')），
 * 出题人打开本页会 403 —— 此时引用数展示为 `—`，不臆断为「未被引用」。
 */
const { data: exams, loading: examsLoading, error: examsError } = useRequest(() => examsApi.list());

/** 考试列表是否成功加载（决定「—」还是真实判定） */
const examsReady = computed<boolean>(() => exams.value !== null && examsError.value === null);

const examsByPaper = computed<Map<string, Exam[]>>(() => {
  const map = new Map<string, Exam[]>();
  for (const exam of exams.value ?? []) {
    const bucket = map.get(exam.paperId);
    if (bucket) bucket.push(exam);
    else map.set(exam.paperId, [exam]);
  }
  return map;
});

/** 某份试卷的引用考试列表 */
function refsOf(paperId: string): Exam[] {
  return examsByPaper.value.get(paperId) ?? [];
}

/** 展开查看引用考试名的试卷 id */
const expandedPaperIds = ref<string[]>([]);

function isRefsExpanded(paperId: string): boolean {
  return expandedPaperIds.value.includes(paperId);
}

function toggleRefs(paperId: string): void {
  const index = expandedPaperIds.value.indexOf(paperId);
  if (index === -1) expandedPaperIds.value.push(paperId);
  else expandedPaperIds.value.splice(index, 1);
}

/** 当前列表中被引用的试卷数（用于卡头汇总） */
const referencedCount = computed<number>(
  () => filteredPapers.value.filter((p) => refsOf(p.id).length > 0).length,
);

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
const exportingId = ref('');
const cloningId = ref('');

/** 文件名清洗 */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '试卷';
}

/** 导出试卷 PDF（考生版 / 答案版，v1.7①） */
async function handleExportPdf(paper: Paper, withAnswer: boolean): Promise<void> {
  if (exportingId.value) return;
  exportingId.value = paper.id;
  try {
    const blob = await papersApi.exportPaperPdf(paper.id, withAnswer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitize(paper.name)}-试卷-${withAnswer ? '答案版' : '考生版'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    exportingId.value = '';
  }
}

/** 克隆试卷（v1.7②；后端自动命名为「原名（副本）」） */
async function handleClone(paper: Paper): Promise<void> {
  const ok = await confirm(`确定克隆试卷「${paper.name}」吗？将生成一份题目与分值完全相同的副本。`, {
    title: '克隆试卷',
    confirmButtonText: '确认克隆',
  });
  if (!ok) return;

  cloningId.value = paper.id;
  try {
    const created = await papersApi.clone(paper.id);
    ElMessage.success(`已克隆为「${created.name}」`);
    void refresh();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    cloningId.value = '';
  }
}

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

    <EmptyState
      v-else-if="!papers || papers.length === 0"
      text="还没有试卷，从题库组一份试卷试试"
      action-text="新建试卷"
      @action="goComposer"
    />

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
          <TableDensityToggle />
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
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goPreview(row as Paper)">预览</el-button>
            <el-button link @click="goEdit(row as Paper)">编辑</el-button>
            <el-button
              link
              type="primary"
              :loading="cloningId === (row as Paper).id"
              @click="handleClone(row as Paper)"
            >
              克隆
            </el-button>
            <el-dropdown
              trigger="click"
              :disabled="exportingId === (row as Paper).id"
              @command="(cmd: string) => handleExportPdf(row as Paper, cmd === 'answer')"
            >
              <el-button link type="primary">
                导出 PDF<el-icon class="paper-page__caret"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="student">考生版</el-dropdown-item>
                  <el-dropdown-item command="answer">答案版（含答案与解析）</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="danger" link @click="handleDelete(row as Paper)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            text="没有匹配的试卷"
            filtered
            action-text="新建试卷"
            @clear="resetFilter"
            @action="goComposer"
          />
        </template>
      </el-table>
    </el-card>

    <el-card v-if="papers && papers.length" class="reference-card" shadow="never">
      <template #header>
        <div class="reference-card__head">
          <span class="reference-card__title">试卷引用检查</span>
          <el-tag
            v-if="examsReady && referencedCount > 0"
            type="danger"
            effect="plain"
            size="small"
          >
            {{ referencedCount }} 份被引用 · 不可删除
          </el-tag>
        </div>
      </template>

      <!-- 数据缺口：后端无「按试卷聚合作答记录数」接口，故不展示「涉及作答记录」；
           亦无试卷归档能力（无归档接口 / 状态字段），故不提供「归档试卷」操作。
           本卡只呈现可由 exam.paperId 真实反查的「引用考试数 / 考试名」。 -->
      <p class="reference-card__hint">
        被考试引用的试卷无法删除，删除会影响历史成绩；未被引用的试卷可安全删除。
      </p>

      <ul class="reference-card__list">
        <li v-for="paper in filteredPapers" :key="paper.id" class="reference-card__item">
          <span class="reference-card__name" :title="paper.name">{{ paper.name }}</span>
          <span class="reference-card__status">
            <template v-if="examsLoading && !exams">
              <span class="reference-card__muted">检查中…</span>
            </template>
            <template v-else-if="!examsReady">
              <!-- 数据缺口：考试列表不可用（无权限 / 请求失败），引用数无法判定 -->
              <span class="reference-card__muted">—</span>
            </template>
            <template v-else-if="refsOf(paper.id).length">
              <el-tag type="warning" effect="plain" size="small">
                被 {{ refsOf(paper.id).length }} 场考试引用
              </el-tag>
              <el-button link type="primary" @click="toggleRefs(paper.id)">
                {{ isRefsExpanded(paper.id) ? '收起' : '查看引用考试' }}
              </el-button>
            </template>
            <el-tag v-else type="success" effect="plain" size="small">未被引用</el-tag>
          </span>
          <ul v-if="isRefsExpanded(paper.id)" class="reference-card__exams">
            <li v-for="exam in refsOf(paper.id)" :key="exam.id" class="reference-card__exam">
              {{ exam.name }}
            </li>
          </ul>
        </li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.paper-page__bank-tag {
  margin: 0 4px 4px 0;
}

.paper-page__caret {
  margin-left: 2px;
  font-size: 12px;
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

.reference-card {
  margin-top: 16px;

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__hint {
    margin: 0 0 4px;
    font-size: 12.5px;
    line-height: 1.7;
    color: $text-secondary;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    column-gap: 24px;
  }

  &__item {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 9px 0;
    border-bottom: 1px solid $border-color;
  }

  &__name {
    flex: 1 1 140px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: $text-body;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  &__muted {
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__exams {
    flex: 0 0 100%;
    margin: 0;
    padding: 0 0 0 14px;
    list-style: none;
  }

  &__exam {
    position: relative;
    font-size: 12.5px;
    line-height: 1.7;
    color: $text-secondary;

    &::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 9px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: $color-primary-border;
    }
  }
}
</style>
