<script setup lang="ts">
/**
 * 练题首页：对外开放练题的题库列表 + 错题本入口。
 * 仅移动端布局；从题库卡进入「顺序/随机」练题。
 * 视觉：冷静蓝 · 商务风（无 emoji 装饰、无渐变、细边框卡片）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import PracticeOptionModal from './components/PracticeOptionModal.vue';
import PracticeNoticeCard from './components/PracticeNoticeCard.vue';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import * as practiceApi from '@/api/practice';
import type { PracticeAchievements, PracticeBank, PracticeDailyTask, PracticeSessionInput } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();
const configStore = usePracticeConfigStore();
/** 练题端公开配置（页面入口开关 / 默认模式 / 题量范围，v1.9⑤） */
const config = computed(() => configStore.config);

const loading = ref(true);
const banks = ref<PracticeBank[]>([]);
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

/** 序号（两位，如 01） */
function bankNo(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** 加载题库列表、错题本数量、收藏数量、今日任务与打卡成就 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    // 先取练题端配置：决定是否请求错题本 / 收藏数量 / 打卡成就（功能关闭时接口会 404）
    await configStore.load();
    const [bankList, wrongPage, favPage, dailyTask, ach] = await Promise.all([
      practiceApi.listBanks(),
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
      <!-- 问候 -->
      <div class="home__greeting">
        <p class="home__hello">你好，{{ userName || '同学' }}</p>
        <p class="home__sub">请从下方选择题库开始练习</p>
      </div>

      <!-- 公告与轮播（v1.9⑥；仅当后台发布了面向练题端且在生效期内的内容时显示） -->
      <PracticeNoticeCard />

      <div v-if="loading" class="home__skeleton">
        <el-skeleton :rows="3" animated />
        <el-skeleton :rows="3" animated />
      </div>

      <template v-else>
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

        <p class="home__hint">可练习题库</p>

        <!-- 题库列表 -->
        <div v-if="banks.length === 0" class="home__empty">
          <p class="home__empty-title">暂无可练习的题库</p>
          <p class="home__empty-sub">当前没有对外开放练题的题库，请联系管理员在「练题端设置」中开放题库。</p>
        </div>

        <div v-for="(bank, i) in banks" :key="bank.id" class="home__bank" @click="openBank(bank)">
          <span class="home__bank-no" aria-hidden="true">{{ bankNo(i) }}</span>
          <div class="home__bank-main">
            <div class="home__bank-name">{{ bank.name }}</div>
            <div class="home__bank-meta">
              <span class="home__bank-cat">{{ bank.category || '未分类' }}</span>
              <span class="home__bank-count">共 {{ bank.questionCount }} 题</span>
            </div>
            <div v-if="bank.description" class="home__bank-desc">{{ bank.description }}</div>
          </div>
          <el-button class="home__bank-btn" type="primary" size="small" :disabled="bank.questionCount === 0">
            开始练题
          </el-button>
        </div>
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
  &__user {
    max-width: 120px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__greeting {
    margin-bottom: 16px;
  }

  &__hello {
    margin: 0;
    font-size: 19px;
    font-weight: 640;
    letter-spacing: -0.02em;
    color: $text-primary;
  }

  &__sub {
    margin: 5px 0 0;
    font-size: 12.5px;
    color: $text-secondary;
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
    margin-bottom: 9px;
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
    margin-bottom: 9px;
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
    margin-bottom: 9px;
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
    border-radius: 99px;
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
    margin: 0 0 9px;
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
}
</style>
