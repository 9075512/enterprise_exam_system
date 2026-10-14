<script setup lang="ts">
/**
 * 题库管理页（W3-T3，PRD §7.3）。
 * 卡片网格 + 分类/关键字筛选（服务端）+ 新建/编辑/删除（删除走「空库直接删 / 有题二次强确认级联」双分支）。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { formatDateTime } from '@/utils/datetime';
import { BANK_TEXT } from '@/constants';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/common/PageHeader.vue';
import CardGrid from '@/components/common/CardGrid.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import QuestionBankFormDialog from './QuestionBankFormDialog.vue';
import BankCloneDialog from './BankCloneDialog.vue';
import type { QuestionBank } from '@/types';

const router = useRouter();
const { confirm } = useConfirm();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.currentUser?.role === 'admin');

/** 分类 / 关键字输入（点击「查询」才应用，均走后端参数） */
const keyword = ref('');
const filterCategory = ref('');

/** 分类候选：从每次加载结果中去重累积，保证过滤后仍可切换其他分类 */
const categoryOptions = ref<string[]>([]);

const {
  data: banks,
  loading,
  refresh,
} = useRequest(() =>
  banksApi.list({
    category: filterCategory.value.trim() || undefined,
    keyword: keyword.value.trim() || undefined,
  }),
);

watch(banks, (list) => {
  if (!list) return;
  const set = new Set(categoryOptions.value);
  list.forEach((b) => {
    if (b.category) set.add(b.category);
  });
  categoryOptions.value = Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});

/* ------------------------------ 题库健康度 ------------------------------ */
/**
 * 健康度指标（对齐设计稿 banks.html「题库健康度」卡形态）。
 * 仅统计能由 QuestionBank 列表项真实算出的指标：
 * 题库总数 / 题目总数 / 未开放练题数 / 无授权出题人数 / 空库数 / 题数分布。
 *
 * 数据缺口：① 后端未提供跨题库的全局聚合接口，数值随当前筛选结果集变化；
 *          ② 设计稿的「缺解析 / 从未被使用 / 正确率 < 30% / 近 12 个月未更新」
 *             属题目级或作答级指标，列表项目未返回，卡内以「—」占位。
 */
const healthSummary = computed(() => {
  const list = banks.value ?? [];
  const sizeBuckets = { lt50: 0, mid: 0, gt200: 0 };
  let totalQuestions = 0;
  let practiceClosed = 0;
  let noAuthor = 0;
  let emptyBanks = 0;
  for (const bank of list) {
    const count = bank.questionCount ?? 0;
    totalQuestions += count;
    if (!bank.allowPractice) practiceClosed += 1;
    if (!bank.authorNames || bank.authorNames.length === 0) noAuthor += 1;
    if (count === 0) emptyBanks += 1;
    if (count < 50) sizeBuckets.lt50 += 1;
    else if (count <= 200) sizeBuckets.mid += 1;
    else sizeBuckets.gt200 += 1;
  }
  return {
    totalBanks: list.length,
    totalQuestions,
    practiceClosed,
    noAuthor,
    emptyBanks,
    sizeBuckets,
  };
});

function onSearch(): void {
  void refresh();
}

function onReset(): void {
  keyword.value = '';
  filterCategory.value = '';
  void refresh();
}

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() => Boolean(keyword.value.trim() || filterCategory.value.trim()));

/** 表单弹窗状态 */
const formVisible = ref(false);
const editingBank = ref<QuestionBank | null>(null);

function openCreate(): void {
  editingBank.value = null;
  formVisible.value = true;
}

function openEdit(bank: QuestionBank): void {
  editingBank.value = bank;
  formVisible.value = true;
}

function goDetail(bank: QuestionBank): void {
  void router.push(`/author/banks/${bank.id}`);
}

/* ------------------------------ 复制题库（v1.7④ S4） ------------------------------ */
const cloneVisible = ref(false);
const cloneBank = ref<QuestionBank | null>(null);

/** 复制成功：刷新列表（新题库即时出现）。 */
function onCloned(): void {
  void refresh();
}

function openClone(bank: QuestionBank): void {
  cloneBank.value = bank;
  cloneVisible.value = true;
}

const deleting = ref(false);

/**
 * 删除题库（双分支语义，PRD §3.3）：
 * - 先取详情拿到精确统计；
 * - 空库 → 一次确认后直接删；
 * - 有题 → 二次强确认（给出试题数与被引用试卷数）后带 cascade 删。
 */
async function handleDelete(bank: QuestionBank): Promise<void> {
  let detail;
  try {
    detail = await banksApi.detail(bank.id);
  } catch {
    return; // 错误提示由拦截器弹出
  }

  const questionCount = detail.questionCount;
  let cascade = false;

  if (questionCount === 0) {
    const ok = await confirm(`确认删除题库「${bank.name}」？`, {
      title: '删除题库',
      confirmButtonText: '确认删除',
      type: 'warning',
    });
    if (!ok) return;
  } else {
    const refClause =
      detail.referencedQuestionCount !== undefined
        ? `（其中 ${detail.referencedQuestionCount} 道已被 ${detail.referencedPaperCount} 份试卷引用）`
        : detail.referencedPaperCount > 0
          ? `（其中部分试题已被 ${detail.referencedPaperCount} 份试卷引用）`
          : '';
    const ok = await confirm(
      `该题库下存在 ${questionCount} 道试题${refClause}。确认将题库连同其试题一起删除？此操作不可恢复。`,
      { title: BANK_TEXT.CASCADE_CONFIRM_TITLE, confirmButtonText: '确认删除', type: 'warning' },
    );
    if (!ok) return;
    cascade = true;
  }

  deleting.value = true;
  try {
    await banksApi.remove(bank.id, cascade);
    ElMessage.success('题库已删除');
    void refresh();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="bank-list">
    <PageHeader title="题库管理" description="维护题库分类与题目，支持 Excel 批量导入">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建题库</el-button>
      </template>
    </PageHeader>

    <!-- 筛选行 -->
    <div class="bank-list__filter">
      <el-select
        v-model="filterCategory"
        class="bank-list__category"
        placeholder="全部分类"
        clearable
      >
        <el-option label="全部分类" value="" />
        <el-option v-for="category in categoryOptions" :key="category" :label="category" :value="category" />
      </el-select>
      <el-input
        v-model="keyword"
        class="bank-list__keyword"
        placeholder="按题库名称 / 分类搜索"
        clearable
        :prefix-icon="Search"
        @keyup.enter="onSearch"
      />
      <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
      <el-button :icon="Refresh" @click="onReset">重置</el-button>
    </div>

    <!-- 加载中 -->
    <LoadingSkeleton v-if="loading && !banks" :rows="4" />

    <!-- 空态：筛选无结果 → 清空筛选 + 新建；真无数据 → 新建 -->
    <EmptyState
      v-else-if="!banks || banks.length === 0"
      :text="hasFilter ? '没有匹配的题库' : BANK_TEXT.EMPTY_LIST"
      :filtered="hasFilter"
      action-text="新建题库"
      @clear="onReset"
      @action="openCreate"
    />

    <!-- 卡片网格 -->
    <CardGrid v-else>
      <el-card
        v-for="bank in banks"
        :key="bank.id"
        class="bank-card hover-lift"
        @click="goDetail(bank)"
      >
        <div class="bank-card__head">
          <h3 class="bank-card__name" :title="bank.name">{{ bank.name }}</h3>
          <el-tag size="small" type="info" effect="plain">{{ bank.category }}</el-tag>
        </div>
        <p class="bank-card__count">题目数：{{ bank.questionCount }}</p>
        <p class="bank-card__meta">
          创建人：{{ bank.createdBy }} · {{ formatDateTime(bank.createdAt) }}
        </p>
        <p v-if="bank.description" class="bank-card__desc" :title="bank.description">
          {{ bank.description }}
        </p>
        <div class="bank-card__actions" @click.stop>
          <el-button type="primary" link @click="goDetail(bank)">详情</el-button>
          <el-button link @click="openClone(bank)">复制</el-button>
          <el-button link @click="openEdit(bank)">编辑</el-button>
          <el-button type="danger" link :loading="deleting" @click="handleDelete(bank)">
            删除
          </el-button>
        </div>
      </el-card>
    </CardGrid>

    <!-- 题库健康度（对齐设计稿 banks.html「题库健康度」卡：卡头 + kv 行） -->
    <el-card v-if="banks && banks.length > 0" class="bank-health" shadow="never">
      <template #header>
        <h3 class="bank-health__title">题库健康度</h3>
      </template>

      <div class="bank-health__list">
        <div class="bank-health__row">
          <span class="bank-health__k">题库总数</span>
          <span class="bank-health__v num">{{ healthSummary.totalBanks }} 个</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">题目总数</span>
          <span class="bank-health__v num">{{ healthSummary.totalQuestions }} 道</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">未开放练题的题库</span>
          <span class="bank-health__v num">{{ healthSummary.practiceClosed }} 个</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">无授权出题人的题库</span>
          <span class="bank-health__v num">{{ healthSummary.noAuthor }} 个</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">空题库（0 题）</span>
          <span class="bank-health__v num">{{ healthSummary.emptyBanks }} 个</span>
        </div>
      </div>

      <p class="bank-health__group">题数分布</p>
      <div class="bank-health__list">
        <div class="bank-health__row">
          <span class="bank-health__k">&lt; 50 题</span>
          <span class="bank-health__v num">{{ healthSummary.sizeBuckets.lt50 }} 个</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">50 – 200 题</span>
          <span class="bank-health__v num">{{ healthSummary.sizeBuckets.mid }} 个</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">&gt; 200 题</span>
          <span class="bank-health__v num">{{ healthSummary.sizeBuckets.gt200 }} 个</span>
        </div>
      </div>

      <!-- 数据缺口：以下为设计稿行位，属题目级 / 作答级指标，题库列表项未返回，以「—」占位 -->
      <div class="bank-health__list bank-health__list--muted">
        <div class="bank-health__row">
          <span class="bank-health__k">缺解析题目</span>
          <span class="bank-health__v">—</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">从未被使用的题目</span>
          <span class="bank-health__v">—</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">正确率低于 30%</span>
          <span class="bank-health__v">—</span>
        </div>
        <div class="bank-health__row">
          <span class="bank-health__k">近 12 个月未更新</span>
          <span class="bank-health__v">—</span>
        </div>
      </div>
      <p class="bank-health__note">
        数据缺口：缺解析 / 从未被使用 / 正确率 / 更新时效为题目级或作答级指标，题库列表项未返回，暂无法统计。
      </p>
    </el-card>

    <!-- 新建 / 编辑弹窗 -->
    <QuestionBankFormDialog v-model:visible="formVisible" :bank="editingBank" @saved="refresh" />

    <!-- 复制题库弹窗 -->
    <BankCloneDialog
      v-model:visible="cloneVisible"
      :bank="cloneBank"
      :is-admin="isAdmin"
      @saved="onCloned"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.bank-list__filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.bank-list__keyword {
  max-width: 320px;
}

.bank-list__category {
  width: 180px;
}

.bank-card {
  border-radius: $radius-lg;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  &__name {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    margin: 12px 0 0;
    font-size: 13px;
    color: $text-primary;
  }

  &__meta {
    margin: 6px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  &__desc {
    margin: 8px 0 0;
    font-size: 12px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 12px;
    border-top: 1px solid $border-color;
    padding-top: 8px;
  }
}

.bank-health {
  margin-top: 16px;
  border-radius: $radius-lg;

  &__title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 10px;

    &--muted .bank-health__v {
      font-weight: 400;
      color: $text-disabled;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }

  &__k {
    color: $text-secondary;
  }

  &__v {
    color: $text-primary;
    font-weight: 600;
  }

  &__group {
    margin: 16px 0 10px;
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
  }

  &__note {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }
}
</style>
