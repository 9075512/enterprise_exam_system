<script setup lang="ts">
/**
 * 练题首页：对外开放练题的题库列表 + 错题本入口。
 * 仅移动端布局；从题库卡进入「顺序/随机」练题。
 * 视觉：冷静蓝 · 商务风（无 emoji 装饰、无渐变、细边框卡片）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import PracticeOptionModal from './components/PracticeOptionModal.vue';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import * as practiceApi from '@/api/practice';
import type { PracticeAchievements, PracticeBank, PracticeBankTreeNode, PracticeDailyTask, PracticeSessionInput } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();
const configStore = usePracticeConfigStore();
/** 练题端公开配置（页面入口开关 / 默认模式 / 题量范围，v1.9⑤） */
const config = computed(() => configStore.config);

const loading = ref(true);
const banks = ref<PracticeBank[]>([]);
const bankTree = ref<PracticeBankTreeNode[]>([]);
const wrongTotal = ref(0);
const favoriteTotal = ref(0);
const daily = ref<PracticeDailyTask | null>(null);
/** 打卡与成就（v2.0⑤；模块关闭时后端 1017，静默不显示） */
const achievements = ref<PracticeAchievements | null>(null);

const userName = computed<string>(() => practiceAuth.currentUser?.name ?? '');

/** 每日一练是否可用（后台开启且有题） */
const dailyAvailable = computed<boolean>(
  () => Boolean(daily.value?.enabled) && (daily.value?.total ?? 0) > 0,
);

/** 每日一练进度文案 */
const dailyProgressText = computed<string>(() => {
  const d = daily.value;
  if (!d || !d.enabled || d.total === 0) return '';
  return d.completed ? `今日已全部完成（${d.total} 题）` : `已答 ${d.doneCount} / ${d.total} 题`;
});

const practiceQuestionTotal = computed<number>(() =>
  banks.value.reduce((total, bank) => total + bank.questionCount, 0),
);

/** 加载题库列表、错题本数量、收藏数量、今日任务与打卡成就 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    // 先取练题端配置：决定是否请求错题本 / 收藏数量 / 打卡成就（功能关闭时接口会 404）
    await configStore.load();
    const [bankList, treeList, wrongPage, favPage, dailyTask, ach] = await Promise.all([
      practiceApi.listBanks(),
      practiceApi.bankTree(),
      configStore.config.wrongBookEnabled
        ? practiceApi.wrongBook({ page: 1, pageSize: 1 }).catch(() => null)
        : Promise.resolve(null),
      configStore.config.favoriteEnabled
        ? practiceApi.favorites({ page: 1, pageSize: 1 }).catch(() => null)
        : Promise.resolve(null),
      // 每日一练可能被后台关闭或暂无题目 → 失败静默降级为不显示
      practiceApi.daily().catch(() => null),
      // 打卡与成就（模块关闭时 404）
      configStore.config.achievementEnabled ? practiceApi.achievements().catch(() => null) : Promise.resolve(null),
    ]);
    banks.value = bankList;
    bankTree.value = treeList;
    wrongTotal.value = wrongPage?.total ?? 0;
    favoriteTotal.value = favPage?.total ?? 0;
    daily.value = dailyTask;
    achievements.value = ach;
  } catch {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

/* 选练题方式弹层 */
const modalVisible = ref(false);
const selectedBank = ref<PracticeBank | null>(null);

function openBank(bank: PracticeBank): void {
  selectedBank.value = bank;
  modalVisible.value = true;
}

function openTreeNode(node: PracticeBankTreeNode): void {
  if (!node.isLeaf) return;
  const bank = banks.value.find((item) => item.id === node.id);
  if (bank) openBank(bank);
}

/** 开始练习：携带 mode/count/types 跳到作答页（作答页据此生成会话） */
function handleStart(payload: PracticeSessionInput): void {
  void router.push({
    name: 'practice-session',
    params: { bankId: payload.bankId },
    query: {
      mode: payload.mode,
      count: payload.count ? String(payload.count) : undefined,
      types: payload.types && payload.types.length ? payload.types.join(',') : undefined,
    },
  });
}

/** 进入错题本列表页 */
function goWrongBook(): void {
  void router.push({ name: 'practice-wrong-book' });
}

/** 进入我的收藏页 */
function goFavorites(): void {
  void router.push({ name: 'practice-favorites' });
}

/** 开始今天的每日一练（作答页据 source=daily 走 /daily/session） */
function goDaily(): void {
  void router.push({
    name: 'practice-session',
    params: { bankId: 'daily' },
    query: { source: 'daily' },
  });
}

onMounted(load);
</script>

<template>
  <PracticeLayout tabbar>
    <template #actions>
      <span class="home__user">{{ userName }}</span>
    </template>

    <div class="home">
      <PracticeLoading v-if="loading" :loading="loading" :rows="5" caption="正在加载题库…" />

      <template v-else>
        <section
          class="home__overview"
          :class="{ 'has-daily': dailyAvailable, 'has-achievements': Boolean(achievements) }"
          aria-label="练题概览"
        >
        <!-- 每日一练任务卡（后台关闭或暂无题目时整体不显示） -->
        <div v-if="dailyAvailable" class="home__daily" :class="{ 'is-done': daily?.completed }" @click="goDaily">
          <span class="home__daily-mark" aria-hidden="true">每日</span>
          <div class="home__daily-body">
            <span class="home__daily-title">
              {{ daily?.completed ? '今日已完成' : '每日一练' }}
            </span>
            <span class="home__daily-sub">
              {{ dailyProgressText }}
              <template v-if="(daily?.streakDays ?? 0) > 0"> · 连续 {{ daily?.streakDays }} 天</template>
            </span>
          </div>
          <el-button class="home__daily-btn" type="primary" size="small" :disabled="daily?.completed">
            {{ daily?.completed ? '已完成' : '开始' }}
          </el-button>
        </div>

        <!-- 打卡与成就（v2.0⑤；模块关闭或接口失败时整体不显示） -->
        <div v-if="achievements" class="home__ach">
          <div class="home__ach-head">
            <div class="home__ach-streak">
              <span class="home__ach-num">{{ achievements.streakDays }}</span>
              <span class="home__ach-unit">天</span>
            </div>
            <div class="home__ach-text">
              <span class="home__ach-title">连续打卡</span>
              <span class="home__ach-sub">
                最长 {{ achievements.bestStreak }} 天 · 累计 {{ achievements.answeredTotal }} 题 · 正确率
                {{ achievements.accuracy }}%
              </span>
            </div>
            <span class="home__ach-count">{{ achievements.unlockedCount }}/{{ achievements.badges.length }}</span>
          </div>
          <div class="home__badges">
            <span
              v-for="badge in achievements.badges"
              :key="badge.key"
              class="home__badge"
              :class="{ 'is-locked': !badge.unlocked }"
              :title="badge.unlocked ? badge.desc : `未解锁：${badge.desc}`"
            >
              {{ badge.name }}
            </span>
          </div>
        </div>

        <div class="home__shortcut-grid">
        <!-- 错题本入口（后台可关闭） -->
        <div
          v-if="config.wrongBookEnabled"
          class="home__wrong"
          :class="{ 'is-empty': wrongTotal === 0 }"
          @click="goWrongBook"
        >
          <span class="home__wrong-icon" aria-hidden="true">错</span>
          <div class="home__wrong-body">
            <span class="home__wrong-title">我的错题本</span>
            <span class="home__wrong-count">已收集 {{ wrongTotal }} 道题</span>
          </div>
          <el-button class="home__wrong-btn" size="small" :disabled="wrongTotal === 0">查看错题</el-button>
        </div>

        <!-- 我的收藏入口（后台可关闭） -->
        <div
          v-if="config.favoriteEnabled"
          class="home__wrong home__wrong--fav"
          :class="{ 'is-empty': favoriteTotal === 0 }"
          @click="goFavorites"
        >
          <span class="home__wrong-icon home__wrong-icon--fav" aria-hidden="true">藏</span>
          <div class="home__wrong-body">
            <span class="home__wrong-title">我的收藏</span>
            <span class="home__wrong-count">已收藏 {{ favoriteTotal }} 道题</span>
          </div>
          <el-button class="home__wrong-btn" size="small" :disabled="favoriteTotal === 0">查看收藏</el-button>
        </div>
        </div>
        </section>

        <section class="home__banks-panel" aria-labelledby="practice-bank-heading">
          <header class="home__section-head">
            <div>
              <h2 id="practice-bank-heading" class="home__hint">可练习题库</h2>
              <p class="home__section-sub">按科目选择题库，开始顺序练习或随机练习</p>
            </div>
            <span class="home__section-meta">{{ banks.length }} 个题库 · {{ practiceQuestionTotal }} 道题</span>
          </header>

        <!-- 题库列表 -->
        <div v-if="bankTree.length === 0" class="home__empty">
          <p class="home__empty-title">暂无可练习的题库</p>
          <p class="home__empty-sub">当前没有对外开放练题的题库，请联系管理员在「练题端设置」中开放题库。</p>
        </div>

        <el-tree
          v-else
          class="home__tree"
          :data="bankTree"
          node-key="id"
          default-expand-all
          :expand-on-click-node="false"
          :props="{ label: 'name', children: 'children' }"
          @node-click="openTreeNode"
        >
          <template #default="{ data }">
            <div class="home__tree-node" :class="{ 'is-leaf': data.isLeaf }">
              <span class="home__tree-kind">{{ data.isLeaf ? '题库' : '科目' }}</span>
              <span class="home__tree-name">{{ data.name }}</span>
              <span v-if="data.isLeaf" class="home__tree-count">{{ data.questionCount }} 题</span>
              <el-button v-if="data.isLeaf" type="primary" size="small" :disabled="data.questionCount === 0">开始</el-button>
            </div>
          </template>
        </el-tree>
        </section>
      </template>
    </div>

    <PracticeOptionModal
      v-if="selectedBank"
      v-model:visible="modalVisible"
      :bank="selectedBank"
      :config="config"
      @start="handleStart"
    />
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.home {
  &__shortcut-grid {
    display: contents;
  }

  &__section-head {
    min-width: 0;
  }

  &__section-sub,
  &__section-meta {
    display: none;
  }

  &__user {
    max-width: 120px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__skeleton {
    :deep(.el-skeleton) {
      margin-bottom: 12px;
      padding: 14px;
      background: $bg-paper;
      border: 1px solid $border-color;
      border-radius: $practice-radius;
    }
  }

  /* 错题本入口：图标块 + 卡片（v3.1 去左缘强调条） */
  &__wrong {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 10px;
    padding: 13px 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:active {
      background: $practice-surface-2;
    }

    &.is-empty {
      opacity: 0.72;
    }
  }

  &__wrong-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-xs;
    background: $color-error-bg;
    font-size: 13px;
    font-weight: 680;
    color: $color-error-text;
    line-height: 1;
  }

  &__wrong-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__wrong-title {
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__wrong-count {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__wrong-btn {
    flex: 0 0 auto;
    border-radius: $radius-xs;
  }

  /* 收藏卡：图标块用主色软底（区别于错题本的语义红） */
  &__wrong--fav {
    border-color: $border-color;
  }

  &__wrong-icon--fav {
    background: $practice-soft;
    color: $practice-primary;
  }

  /* 每日一练任务卡 */
  &__daily {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 10px;
    padding: 13px 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:active {
      background: $practice-surface-2;
    }

    &.is-done .home__daily-mark {
      background: $color-success-bg;
      color: $color-success-text;
    }
  }

  &__daily-mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-xs;
    background: $practice-soft;
    font-size: 11.5px;
    font-weight: 680;
    color: $practice-primary;
    line-height: 1;
  }

  &__daily-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__daily-title {
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__daily-sub {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__daily-btn {
    flex: 0 0 auto;
    min-height: 31px;
    padding: 0 13px;
    border: none;
    border-radius: $radius-xs;
    font-size: 12.5px;
    background: $practice-primary;

    &:hover,
    &:active {
      background: $practice-primary-dark;
    }
  }

  /* 打卡与成就卡 */
  &__ach {
    margin-bottom: 10px;
    padding: 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__ach-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__ach-streak {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    gap: 2px;
    min-width: 52px;
  }

  &__ach-num {
    font-size: 26px;
    font-weight: 700;
    color: $practice-primary;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  &__ach-unit {
    font-size: 12px;
    color: $text-secondary;
  }

  &__ach-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  &__ach-title {
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__ach-sub {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__ach-count {
    flex: 0 0 auto;
    font-size: 11.5px;
    font-weight: 600;
    color: $practice-primary;
    font-variant-numeric: tabular-nums;
  }

  &__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed $border-color;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 9px;
    border-radius: 99px; // radius-exception: status badge pill
    background: $practice-soft;
    font-size: 10.5px;
    font-weight: 600;
    color: $practice-primary;

    &.is-locked {
      background: $practice-surface-3;
      color: $text-disabled;
      font-weight: 500;
    }
  }

  /* 区块标题：v3.1 去掉左缘竖条 */
  &__hint {
    margin: 18px 2px 9px;
    font-size: 14px;
    font-weight: 640;
    color: $text-primary;
  }

  &__empty {
    padding: 24px 12px;
    text-align: center;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
  }

  &__empty-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__empty-sub {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }

  &__tree {
    padding: 8px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;

    :deep(.el-tree-node__content) { height: auto; min-height: 48px; border-radius: $radius-xs; }
    :deep(.el-tree-node__content:hover) { background: $practice-surface-2; }
  }

  &__tree-node { display:flex; align-items:center; gap:8px; width:100%; min-width:0; padding:6px 8px 6px 2px; }
  &__tree-kind { flex:0 0 auto; padding:2px 6px; border-radius:$radius-xs; background:$practice-surface-3; color:$text-secondary; font-size:10px; }
  &__tree-node.is-leaf &__tree-kind { background:$practice-soft; color:$practice-primary; }
  &__tree-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:600; color:$text-primary; }
  &__tree-count { flex:0 0 auto; color:$text-secondary; font-size:11.5px; }

  /* 题库卡：图标块 + 细边框 */
  &__bank {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 9px;
    padding: 13px 14px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $practice-radius;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:active {
      border-color: rgba($practice-primary, 0.45);
      background: $practice-surface-2;
    }
  }

  &__bank-no {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: $radius-xs;
    background: $practice-surface-3;
    font-size: 12px;
    font-weight: 680;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  &__bank-main {
    min-width: 0;
    flex: 1;
  }

  // 首页仅展示摘要，查看更多弹窗仍保留完整文本。
  :deep(.paged-overview__preview) {
    .home__bank-name,
    .home__bank-desc {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }

    .home__bank-cat {
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  &__bank-name {
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
    word-break: break-word;
  }

  &__bank-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 3px;
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__bank-cat {
    padding: 1px 6px;
    border-radius: $radius-xs;
    background: $practice-soft;
    color: $practice-primary;
    font-size: 10.5px;
    font-weight: 600;
  }

  &__bank-count {
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__bank-desc {
    margin-top: 5px;
    font-size: 11.5px;
    line-height: 1.6;
    color: $text-disabled;
    word-break: break-word;
  }

  &__bank-btn {
    flex: 0 0 auto;
    min-height: 31px;
    padding: 0 13px;
    font-size: 12.5px;
    font-weight: 580;
    border: none;
    border-radius: $radius-xs;
    background: $practice-primary;

    &:hover,
    &:active {
      background: $practice-primary-dark;
    }
  }

  @media (min-width: 901px) {
    &__overview {
      display: grid;
      grid-template-columns: minmax(380px, 0.9fr) minmax(0, 1.1fr);
      grid-template-areas:
        'daily achievement'
        'shortcuts achievement';
      gap: 14px 16px;
      align-items: stretch;
      margin-bottom: 20px;

      &:not(.has-achievements) {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          'daily'
          'shortcuts';
      }

      &.has-achievements:not(.has-daily) {
        grid-template-areas: 'shortcuts achievement';
      }
    }

    &__daily {
      grid-area: daily;
      min-height: 92px;
      margin: 0;
      padding: 18px;

      &:hover {
        border-color: $practice-border-soft;
        background: $practice-surface-2;
      }
    }

    &__daily-mark,
    &__wrong-icon {
      width: 40px;
      height: 40px;
    }

    &__daily-title,
    &__wrong-title,
    &__ach-title {
      font-size: 14px;
    }

    &__ach {
      grid-area: achievement;
      min-height: 180px;
      margin: 0;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    &__ach-num {
      font-size: 32px;
    }

    &__badges {
      margin-top: 16px;
      padding-top: 16px;
    }

    &__shortcut-grid {
      grid-area: shortcuts;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    &__wrong {
      min-width: 0;
      min-height: 74px;
      margin: 0;
      padding: 12px;

      &:hover:not(.is-empty) {
        border-color: $practice-border-soft;
        background: $practice-surface-2;
      }
    }

    &__wrong-btn {
      padding-inline: 10px;
    }

    &__banks-panel {
      overflow: hidden;
      background: $bg-paper;
      border: 1px solid $border-color;
      border-radius: $practice-radius;
    }

    &__section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 16px 18px;
    }

    &__hint {
      margin: 0;
      font-size: 15px;
    }

    &__section-sub {
      display: block;
      margin: 4px 0 0;
      font-size: 11.5px;
      color: $text-secondary;
    }

    &__section-meta {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      height: 26px;
      padding: 0 10px;
      border-radius: 99px; // radius-exception: section counter pill
      background: $practice-soft;
      color: $practice-primary;
      font-size: 11.5px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    &__tree {
      padding: 8px 12px 12px;
      border: 0;
      border-top: 1px solid $border-color;
      border-radius: 0;

      :deep(.el-tree-node__content) {
        min-height: 52px;
      }
    }

    &__empty {
      padding: 42px 16px;
      border: 0;
      border-top: 1px solid $border-color;
      border-radius: 0;
    }
  }
}
</style>
