<script setup lang="ts">
/**
 * 练题端 · 我的收藏（二期）。
 *
 * - 数据：`GET /api/practice/favorites`（分页，题目内容**不含**答案/解析）+ `GET /api/practice/banks`（题库名与筛选）；
 * - 「练收藏题」→ `/practice/favorites/reans` 生成会话后进入作答页（跨库时后端以空 bankId 处理）；
 * - 取消收藏在此页直接生效（列表即时移除）；
 * - 仅移动端；视觉沿用「冷静蓝 · 商务风」。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import RequestError from '@/components/common/RequestError.vue';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import * as practiceApi from '@/api/practice';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import type { PracticeBank, PracticeFavoriteQuestion, QuestionType } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();

const PAGE_SIZE = 20;

const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const moreError = ref(false);
const removing = ref('');
let generation = 0;
let disposed = false;
onBeforeUnmount(() => { disposed = true; generation += 1; });
const items = ref<PracticeFavoriteQuestion[]>([]);
const total = ref(0);
const page = ref(1);
const banks = ref<PracticeBank[]>([]);
/** 当前筛选题库（'' = 全部） */
const activeBank = ref('');

const userName = computed<string>(() => practiceAuth.currentUser?.name ?? '');
const hasMore = computed<boolean>(() => items.value.length < total.value);

/** 题型中文名 */
const TYPE_LABEL: Record<string, string> = {
  single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', short: '简答题',
};

/** 题库名映射 */
function bankName(bankId: string): string {
  return banks.value.find((b) => b.id === bankId)?.name ?? '其他题库';
}

/** 收藏时间（只显示日期部分，UTC ISO → YYYY-MM-DD） */
function favoriteDate(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** 拉取题库列表（失败不影响收藏展示） */
async function loadBanks(): Promise<void> {
  try {
    banks.value = await practiceApi.listBanks();
  } catch {
    /* 仅用于展示题库名与筛选，失败静默 */
  }
}

/** 加载指定页（1 = 覆盖，其余 = 追加） */
async function loadPage(target: number, bankId = activeBank.value): Promise<void> {
  const request = target === 1 ? ++generation : generation;
  const res = await practiceApi.favorites({
    bankId: bankId || undefined,
    page: target,
    pageSize: PAGE_SIZE,
  });
  if (disposed || request !== generation) return;
  total.value = res.total;
  items.value = target === 1 ? res.list : [...items.value, ...res.list];
  page.value = target;
}

/** 首次加载 */
async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  moreError.value = false;
  try {
    void loadBanks();
    await loadPage(1);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

/** 切换题库筛选 */
async function switchBank(bankId: string): Promise<void> {
  if (activeBank.value === bankId || loading.value || loadingMore.value || removing.value) return;
  loading.value = true;
  loadError.value = false;
  moreError.value = false;
  try {
    await loadPage(1, bankId);
    activeBank.value = bankId;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

/** 加载更多 */
async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || removing.value || !hasMore.value) return;
  loadingMore.value = true;
  moreError.value = false;
  try {
    await loadPage(page.value + 1);
  } catch {
    moreError.value = true;
  } finally {
    loadingMore.value = false;
  }
}

/** 取消收藏（列表即时移除，失败回滚） */
async function unfavorite(q: PracticeFavoriteQuestion): Promise<void> {
  if (removing.value || loading.value || loadingMore.value) return;
  removing.value = q.id;
  try {
    await practiceApi.removeFavorite(q.id);
    await load();
  } catch {
    // 接口失败保留原列表。
  } finally { removing.value = ''; }
}

/** 开始「练收藏题」（不传 bankId = 全部收藏） */
function startReans(): void {
  void router.push({
    name: 'practice-reans',
    query: { source: 'favorite', ...(activeBank.value ? { bankId: activeBank.value } : {}) },
  });
}

onMounted(load);
</script>

<template>
  <PracticeLayout data-ui-layout="question-cards" data-ui-page="PracticeFavoritesPage" tabbar>
    <template #actions>
      <span class="fav__user">{{ userName }}</span>
    </template>

    <div class="fav">
      <div class="fav__head">
        <div class="fav__head-text">
          <p class="fav__title">我的收藏</p>
          <p class="fav__sub">{{ loadError ? '收藏数量未知' : `共 ${total} 道题 · 已加载 ${items.length} 道` }}</p>
        </div>
        <el-button type="primary" :disabled="loading || loadError || total === 0 || Boolean(removing)" @click="startReans">练收藏题</el-button>
      </div>

      <!-- 题库筛选 -->
      <div v-if="banks.length > 1" class="fav__filter" role="group" aria-label="按题库筛选">
        <button
          type="button"
          class="fav__chip"
          :disabled="loading || loadingMore"
          :class="{ 'is-active': activeBank === '' }"
          :aria-pressed="activeBank === ''"
          @click="switchBank('')"
        >
          全部
        </button>
        <button
          v-for="bank in banks"
          :key="bank.id"
          type="button"
          class="fav__chip"
          :disabled="loading || loadingMore"
          :class="{ 'is-active': activeBank === bank.id }"
          :aria-pressed="activeBank === bank.id"
          @click="switchBank(bank.id)"
        >
          {{ bank.name }}
        </button>
      </div>

      <PracticeLoading v-if="loading && items.length === 0" :loading="loading" :rows="5" caption="正在加载收藏…" />

      <RequestError v-else-if="loadError" text="收藏列表加载失败" @retry="load" />
      <div v-else-if="total === 0" class="fav__empty">
        <div class="fav__empty-mark" aria-hidden="true">—</div>
        <p class="fav__empty-text">还没有收藏的题目，答题时点击「收藏」即可加入</p>
      </div>

      <template v-else>
        <PracticeLoading :loading="loading" compact caption="正在更新收藏…" />
        <div v-for="q in items" :key="q.id" class="fav__item">
          <div class="fav__item-top">
            <span class="fav__type">{{ TYPE_LABEL[q.type] }}</span>
            <span class="fav__bank">{{ bankName(q.bankId) }}</span>
            <span class="fav__date">{{ favoriteDate(q.favoritedAt) }}</span>
            <button type="button" class="fav__remove" :disabled="Boolean(removing) || loading" @click="unfavorite(q)">{{ removing === q.id ? '取消中…' : '取消收藏' }}</button>
          </div>
          <p class="fav__stem">{{ q.stem }}</p>
        </div>

        <div v-if="hasMore" class="fav__more">
          <p v-if="moreError" class="learner-scope">加载下一页失败，已加载的收藏仍保留。</p><el-button :loading="loadingMore" :disabled="loading || Boolean(removing)" @click="loadMore">{{ moreError ? '重试加载更多' : '加载更多' }}</el-button>
        </div>
      </template>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.fav {
  &__user {
    max-width: 120px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    padding: 13px 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;

    :deep(.el-button) {
      flex: 0 0 auto;
      border: none;
      border-radius: $radius-xs;
      background: $practice-primary;

      &:hover,
      &:active {
        background: $practice-primary-dark;
      }
    }
  }

  &__title {
    margin: 0;
    font-size: 15px;
    font-weight: 640;
    color: $text-primary;
  }

  &__sub {
    margin: 3px 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  /* 筛选 chip 行：横向滚动，不换行（设计图 .m-chips / .m-chip） */
  &__filter {
    display: flex;
    gap: 7px;
    margin-bottom: 14px;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 11px;
    border: 1px solid $line-strong;
    border-radius: 99px; // radius-exception: filter chip pill
    background: $bg-paper;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color $transition-fast, border-color $transition-fast, background-color $transition-fast;

    &.is-active {
      border-color: $practice-primary;
      background: $practice-primary;
      color: #fff;
      font-weight: 620;
    }
  }

  &__skeleton {
    padding: 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__empty {
    padding: 56px 0;
    text-align: center;
  }

  &__empty-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    margin-bottom: 14px;
    border-radius: 50%;
    background: $practice-surface-3;
    font-size: 18px;
    font-weight: 640;
    color: $text-disabled;
    line-height: 1;
  }

  &__empty-text {
    margin: 0;
    padding: 0 24px;
    font-size: 13.5px;
    line-height: 1.7;
    color: $text-secondary;
  }

  &__item {
    padding: 13px 14px;
    margin-bottom: 8px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__item-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__type {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: $radius-xs;
    background: $practice-soft;
    font-size: 12px;
    font-weight: 600;
    color: $practice-primary;
  }

  &__bank {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    color: $text-secondary;
  }

  &__date {
    flex: 0 0 auto;
    font-size: 12px;
    color: $text-disabled;
  }

  &__remove {
    flex: 0 0 auto;
    margin-left: auto;
    min-height: 28px;
    padding: 0 8px;
    border: none;
    background: transparent;
    font-size: 12px;
    color: $color-error-text;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  &__stem {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.7;
    color: $text-primary;
    word-break: break-word;
  }

  &__more {
    padding: 4px 0 8px;
    text-align: center;

    :deep(.el-button) {
      border-radius: $radius-xs;
    }
  }
}
</style>
