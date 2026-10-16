<script setup lang="ts">
/**
 * 题库管理页（W3-T3，PRD §7.3）。
 * 卡片网格 + 分类/关键字筛选（服务端）+ 新建/编辑/删除（删除走「空库直接删 / 有题二次强确认级联」双分支）。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { CopyDocument, Delete, EditPen, Plus, Refresh, Search } from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
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

/** 点击分类 chip：切换筛选并立即应用（服务端过滤） */
function pickCategory(category: string): void {
  if (filterCategory.value === category) return;
  filterCategory.value = category;
  void refresh();
}

/** 去组卷（携带题库预选） */
function goComposer(): void {
  void router.push('/author/papers');
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

    <!-- 筛选行（设计稿 banks.html：分类 chips + 搜索） -->
    <div class="bank-list__filter">
      <div class="bank-list__chips">
        <button
          type="button"
          class="bank-list__chip"
          :class="{ 'is-on': filterCategory === '' }"
          @click="pickCategory('')"
        >
          全部分类
        </button>
        <button
          v-for="category in categoryOptions"
          :key="category"
          type="button"
          class="bank-list__chip"
          :class="{ 'is-on': filterCategory === category }"
          @click="pickCategory(category)"
        >
          {{ category }}
        </button>
      </div>
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

    <!-- 卡片网格（对齐设计稿 banks.html 卡片结构） -->
    <CardGrid v-else>
      <el-card
        v-for="bank in banks"
        :key="bank.id"
        class="bank-card hover-lift"
        @click="goDetail(bank)"
      >
        <div class="bank-card__head">
          <el-tag size="small" effect="plain" class="bank-card__cat">{{ bank.category || '未分类' }}</el-tag>
          <el-tag v-if="(bank.questionCount ?? 0) === 0" size="small" type="warning" effect="plain">
            空题库
          </el-tag>
        </div>
        <h3 class="bank-card__name" :title="bank.name">{{ bank.name }}</h3>
        <p v-if="bank.description" class="bank-card__desc" :title="bank.description">
          {{ bank.description }}
        </p>

        <div class="bank-card__metrics">
          <div>
            <span class="bank-card__micro">题目</span>
            <span class="bank-card__num">{{ bank.questionCount ?? 0 }}</span>
          </div>
          <div>
            <span class="bank-card__micro">创建人</span>
            <span class="bank-card__num">{{ bank.createdBy || '—' }}</span>
          </div>
          <div>
            <span class="bank-card__micro">练题端</span>
            <span class="bank-card__num">{{ bank.allowPractice ? '已开放' : '未开放' }}</span>
          </div>
        </div>

        <div class="bank-card__foot">
          <span class="bank-card__updated">更新于 {{ dayjs(bank.createdAt).format('MM-DD') }}</span>
          <el-tag
            size="small"
            effect="plain"
            :type="bank.allowPractice ? 'success' : 'info'"
          >
            {{ bank.allowPractice ? '练题端已开放' : '未开放练题' }}
          </el-tag>
        </div>

        <div class="bank-card__actions" @click.stop>
          <el-button type="primary" size="small" class="bank-card__main-act" @click="goDetail(bank)">
            查看题目
          </el-button>
          <el-tooltip content="去组卷" placement="top">
            <el-button size="small" @click="goComposer()">组卷</el-button>
          </el-tooltip>
          <el-button size="small" :icon="EditPen" @click="openEdit(bank)" aria-label="编辑题库" />
          <el-button size="small" :icon="CopyDocument" @click="openClone(bank)" aria-label="复制题库" />
          <el-button size="small" :icon="Delete" @click="handleDelete(bank)" aria-label="删除题库" />
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
  flex-wrap: wrap;
  margin-bottom: 16px;
}

/* 分类 chips（设计稿 .chips .btn--sm） */
.bank-list__chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-right: auto;
}

.bank-list__chip {
  height: 28px;
  padding: 0 12px;
  border: 1px solid $line-strong;
  border-radius: 999px;
  background: #fff;
  font-size: 12.5px;
  font-weight: 550;
  color: $text-body;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    border-color: $color-primary;
    color: $color-primary;
  }

  &.is-on {
    background: $color-primary;
    border-color: $color-primary;
    color: #fff;
  }
}

.bank-list__keyword {
  max-width: 320px;
}

.bank-card {
  border-radius: $radius-lg;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__cat {
    // 分类色例外（规范 §2.5）：info plain 足够，不额外引入新色
    font-weight: 550;
  }

  &__name {
    margin: 10px 0 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__desc {
    margin: 5px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 38px;
  }

  // 指标行（设计稿 grid g3 micro+num）
  &__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  &__micro {
    display: block;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $text-secondary;
  }

  &__num {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    font-weight: 620;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 分隔线 + 更新时间/练题态
  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid $border-color;
  }

  &__updated {
    font-size: 11.5px;
    color: $text-secondary;
  }

  // 动作行：主按钮占满 + 图标按钮
  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 10px;

    .el-button + .el-button {
      margin-left: 0;
    }
  }

  &__main-act {
    flex: 1;
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
