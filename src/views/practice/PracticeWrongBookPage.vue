<script setup lang="ts">
/**
 * 练题端 · 错题本页（底部导航第 2 个 Tab）。
 *
 * - 数据：`GET /api/practice/wrong-book`（分页，题目内容不含答案/解析）+ `GET /api/practice/banks`（仅用于显示题库名）；
 * - 按题库分组展示；「全部复习」与「按题库复习」均调用错题复习会话（`/practice/wrong-book/reans`）；
 * - 仅移动端；视觉与其余练题页一致（冷静蓝 · 商务风）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import RequestError from '@/components/common/RequestError.vue';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import * as practiceApi from '@/api/practice';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import type { PracticeBank, PracticeWrongQuestion, QuestionType } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();

const PAGE_SIZE = 20;

const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const moreError = ref(false);
let generation = 0;
let disposed = false;
onBeforeUnmount(() => { disposed = true; generation += 1; });
const items = ref<PracticeWrongQuestion[]>([]);
const total = ref(0);
const page = ref(1);
const banks = ref<PracticeBank[]>([]);

const userName = computed<string>(() => practiceAuth.currentUser?.name ?? '');
const hasMore = computed<boolean>(() => items.value.length < total.value);

/** 题型中文名 */
const TYPE_LABEL: Record<string, string> = {
  single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', short: '简答题',
};

interface Group {
  bankId: string;
  name: string;
  items: PracticeWrongQuestion[];
}

/** 按题库分组（保持首次出现顺序） */
const groups = computed<Group[]>(() => {
  const map = new Map<string, Group>();
  for (const item of items.value) {
    let group = map.get(item.bankId);
    if (!group) {
      group = {
        bankId: item.bankId,
        name: banks.value.find((b) => b.id === item.bankId)?.name ?? '其他题库',
        items: [],
      };
      map.set(item.bankId, group);
    }
    group.items.push(item);
  }
  return [...map.values()];
});

/** 拉取题库名映射（失败不影响错题展示） */
async function loadBanks(): Promise<void> {
  try {
    banks.value = await practiceApi.listBanks();
  } catch {
    /* 仅用于展示题库名，失败静默 */
  }
}

/** 加载指定页（1 = 覆盖，其余 = 追加） */
async function loadPage(target: number): Promise<void> {
  const request = target === 1 ? ++generation : generation;
  const res = await practiceApi.wrongBook({ page: target, pageSize: PAGE_SIZE });
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

/** 加载更多 */
async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !hasMore.value) return;
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

/** 开始错题复习（不传 bankId = 全部） */
function startReans(bankId?: string): void {
  void router.push({ name: 'practice-reans', query: bankId ? { bankId } : {} });
}

onMounted(load);
</script>

<template>
  <PracticeLayout data-ui-layout="question-cards" data-ui-page="PracticeWrongBookPage" tabbar>
    <template #actions>
      <span class="wb__user">{{ userName }}</span>
    </template>

    <div class="wb">
      <div class="wb__head">
        <div class="wb__head-text">
          <p class="wb__title">我的错题本</p>
          <p class="wb__sub">{{ loading ? '正在加载错题…' : loadError ? '错题数量未知' : `共 ${total} 道错题 · 已加载 ${items.length} 道` }}</p>
        </div>
        <el-button type="primary" :disabled="loading || loadError || total === 0" @click="startReans()">全部复习</el-button>
      </div>

      <PracticeLoading v-if="loading" :loading="loading" :rows="5" caption="正在加载错题…" />

      <RequestError v-else-if="loadError" text="错题本加载失败" @retry="load" />
      <div v-else-if="total === 0" class="wb__empty">
        <div class="wb__empty-mark" aria-hidden="true">—</div>
        <p class="wb__empty-text">错题本还是空的，去「练题」做几道题吧</p>
        <el-button type="primary" class="wb__empty-action" @click="router.push({ name: 'practice-home' })">去练题</el-button>
      </div>

      <template v-else>
        <section v-for="group in groups" :key="group.bankId" class="wb__group">
          <div class="wb__group-head">
            <span class="wb__group-name">{{ group.name }}</span>
            <span class="wb__group-count">已加载 {{ group.items.length }} 题</span>
            <el-button size="small" :aria-label="`复习${group.name}`" @click="startReans(group.bankId)">复习</el-button>
          </div>

          <div v-for="q in group.items" :key="q.id" class="wb__item">
            <div class="wb__item-top">
              <span class="wb__type">{{ TYPE_LABEL[q.type] }}</span>
              <span class="wb__wrong">答错 {{ q.wrongCount }} 次</span>
            </div>
            <p class="wb__stem">{{ q.stem }}</p>
          </div>
        </section>

        <div v-if="hasMore" class="wb__more">
          <p v-if="moreError" class="learner-scope">加载下一页失败，已加载的错题仍保留。</p><el-button :loading="loadingMore" @click="loadMore">{{ moreError ? '重试加载更多' : '加载更多' }}</el-button>
        </div>
      </template>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.wb {
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
    font-size: 13.5px;
    color: $text-secondary;
  }

  &__empty-action { margin-top: 16px; }

  &__group {
    margin-bottom: 18px;
  }

  &__group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;

    :deep(.el-button) {
      margin-left: auto;
      border-radius: $radius-xs;
    }
  }

  &__group-name {
    font-size: 13.5px;
    font-weight: 640;
    color: $text-primary;
  }

  &__group-count {
    font-size: 12px;
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
    padding: 1px 6px;
    border-radius: $radius-xs;
    background: $practice-soft;
    font-size: 12px;
    font-weight: 600;
    color: $practice-primary;
  }

  &__wrong {
    font-size: 12px;
    color: $color-error-text;
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

  @media (max-width: 900px) {
    &__head-text { min-width: 0; overflow-wrap: anywhere; }
    &__group-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; }
    &__group-name { grid-column: 1 / -1; }
    &__group-count { grid-column: 1; }
    &__group-head :deep(.el-button) { grid-column: 2; margin-left: 0; min-width: 64px; }
  }
}
</style>
