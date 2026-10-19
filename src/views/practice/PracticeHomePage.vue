<script setup lang="ts">
/**
 * 练题首页：按确认稿排列问候、每日一练、学习快捷入口与科目卡片。
 * 题库、学习进度和功能入口使用服务端权限与配置；选题参数沿用现有流程。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Collection, Medal, Notebook, Star, TrendCharts } from '@element-plus/icons-vue';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import RequestError from '@/components/common/RequestError.vue';
import PracticeLoading from '@/components/common/PracticeLoading.vue';
import PracticeOptionModal from './components/PracticeOptionModal.vue';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import { usePracticeConfigStore } from '@/stores/practiceConfig';
import * as practiceApi from '@/api/practice';
import type { PracticeAchievements, PracticeBank, PracticeBankStat, PracticeBankTreeNode, PracticeDailyTask, PracticeSessionInput } from '@/types';

const router = useRouter();
const practiceAuth = usePracticeAuthStore();
const configStore = usePracticeConfigStore();
/** 练题端公开配置（页面入口开关 / 默认模式 / 题量范围，v1.9⑤） */
const config = computed(() => configStore.config);

const loading = ref(true);
const loadError = ref(false);
const banks = ref<PracticeBank[]>([]);
const bankTree = ref<PracticeBankTreeNode[]>([]);
const wrongTotal = ref<number | null>(null);
const favoriteTotal = ref<number | null>(null);
const daily = ref<PracticeDailyTask | null>(null);
/** 打卡与成就（v2.0⑤；模块关闭时后端 1017，静默不显示） */
const achievements = ref<PracticeAchievements | null>(null);
const bankStats = ref<PracticeBankStat[] | null>(null);
const achievementsVisible = ref(false);
const achievementsLoading = ref(false);
const achievementAvailable = computed(() => config.value.achievementEnabled && achievements.value?.enabled !== false);
const shortcutCount = computed(() => Number(config.value.wrongBookEnabled) + Number(config.value.favoriteEnabled) + Number(config.value.reportEnabled) + Number(achievementAvailable.value));
const bankStatsMap = computed(() => new Map((bankStats.value ?? []).map(item => [item.bankId, item])));
const bankCards = computed(() => {
  const rows: Array<{ bank: PracticeBank; subject: string }> = [];
  const visibleBanks = new Map(banks.value.map(bank => [bank.id, bank]));
  function visit(nodes: PracticeBankTreeNode[], ancestors: string[]): void {
    for (const node of nodes) {
      if (node.isLeaf) {
        const bank = visibleBanks.get(node.id);
        if (bank) rows.push({ bank, subject: ancestors.join(' / ') });
      } else visit(node.children ?? [], [...ancestors, node.name]);
    }
  }
  visit(bankTree.value, []);
  return rows;
});
function progressPercent(bankId: string): number {
  const stat = bankStatsMap.value.get(bankId);
  return stat && stat.totalCount > 0 ? Math.min(100, Math.round(stat.doneCount / stat.totalCount * 100)) : 0;
}
async function loadAchievements(): Promise<void> {
  if (!achievementAvailable.value || achievementsLoading.value) return;
  achievementsLoading.value = true;
  try { achievements.value = await practiceApi.achievements(); }
  catch { achievements.value = null; }
  finally { achievementsLoading.value = false; }
}

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
  loadError.value = false;
  try {
    // 先取练题端配置：决定是否请求错题本 / 收藏数量 / 打卡成就（功能关闭时接口会 404）
    await configStore.load();
    const [bankList, treeList, wrongPage, favPage, dailyTask, ach, progress] = await Promise.all([
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
      configStore.config.reportEnabled ? practiceApi.reportBanks().catch(() => null) : Promise.resolve(null),
    ]);
    banks.value = bankList;
    bankTree.value = treeList;
    wrongTotal.value = wrongPage?.total ?? null;
    favoriteTotal.value = favPage?.total ?? null;
    daily.value = dailyTask;
    achievements.value = ach;
    bankStats.value = progress;
  } catch {
    loadError.value = true;
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
  if (!dailyAvailable.value || daily.value?.completed) return;
  void router.push({
    name: 'practice-session',
    params: { bankId: 'daily' },
    query: { source: 'daily' },
  });
}

onMounted(load);
</script>

<template>
  <PracticeLayout data-ui-layout="practice-home" data-ui-page="PracticeHomePage" tabbar class="practice-home">
    <div class="home">
      <PracticeLoading v-if="loading" :loading="loading" :rows="5" caption="正在加载题库…" />
      <RequestError v-else-if="loadError" text="可练题库加载失败" @retry="load" />
      <template v-else>
        <header class="home__welcome">
          <div><p>每天进步一点点</p><h1>你好，{{ userName || '同学' }}</h1></div>
          <button type="button" class="home__avatar" aria-label="个人中心" @click="router.push('/profile')">{{ (userName || '学').slice(0, 1) }}</button>
        </header>

        <section v-if="dailyAvailable" class="home__daily" aria-label="每日一练">
          <span class="home__daily-kicker">DAILY PRACTICE</span>
          <h2>{{ daily?.completed ? '今日练习，已经完成' : '今天，也学有所得' }}</h2>
          <p>{{ dailyProgressText }}<template v-if="(daily?.streakDays ?? 0) > 0"> · 连续 {{ daily?.streakDays }} 天</template></p>
          <button type="button" class="home__daily-start" :disabled="daily?.completed" @click="goDaily">{{ daily?.completed ? '今日已完成' : '开始练习' }}<el-icon v-if="!daily?.completed"><ArrowRight /></el-icon></button>
        </section>

        <nav v-if="shortcutCount" class="home__shortcuts" aria-label="学习快捷入口" :style="{ '--shortcut-count': shortcutCount }">
          <button v-if="config.wrongBookEnabled" type="button" @click="goWrongBook"><span class="home__shortcut-icon"><el-icon><Notebook /></el-icon></span><strong>错题本</strong><small>{{ wrongTotal === null ? '错题数量暂不可用' : `${wrongTotal} 道待巩固` }}</small></button>
          <button v-if="config.favoriteEnabled" type="button" @click="goFavorites"><span class="home__shortcut-icon"><el-icon><Star /></el-icon></span><strong>收藏夹</strong><small>{{ favoriteTotal === null ? '收藏数量暂不可用' : `${favoriteTotal} 道收藏` }}</small></button>
          <button v-if="config.reportEnabled" type="button" @click="router.push({ name: 'practice-report' })"><span class="home__shortcut-icon"><el-icon><TrendCharts /></el-icon></span><strong>学习报告</strong><small>查看学习进度</small></button>
          <button v-if="achievementAvailable" type="button" @click="achievementsVisible = true"><span class="home__shortcut-icon"><el-icon><Medal /></el-icon></span><strong>成就徽章</strong><small>{{ achievements ? `${achievements.unlockedCount} 枚已解锁` : '查看学习成就' }}</small></button>
        </nav>

        <section class="home__banks-panel" aria-labelledby="practice-bank-heading">
          <header class="home__section-head"><h2 id="practice-bank-heading">选择科目，开始练题</h2><span>按权限展示</span></header>
          <p class="home__scope">{{ banks.length }} 个可练题库 · {{ practiceQuestionTotal }} 道题<template v-if="bankStats"> · 进度采用本人首次作答记录</template></p>
          <div v-if="bankCards.length === 0" class="home__empty"><p>暂无可练习的题库</p><span>当前账号暂无可练习题库，请联系管理员确认题库开放状态与浏览权限。</span></div>
          <div v-else class="home__subjects">
            <button v-for="item in bankCards" :key="item.bank.id" type="button" class="home__subject" :disabled="item.bank.questionCount <= 0" :aria-label="`${item.subject || item.bank.name}，${item.bank.name}，${item.bank.questionCount} 道题，选择练题方式`" @click="openBank(item.bank)">
              <span class="home__subject-icon"><el-icon><Collection /></el-icon></span>
              <span class="home__subject-body"><strong>{{ item.subject || item.bank.name }}</strong><span v-if="item.subject" class="home__bank-name">{{ item.bank.name }}</span><small>{{ item.bank.questionCount }} 道题<template v-if="bankStatsMap.has(item.bank.id)"> · 已练 {{ bankStatsMap.get(item.bank.id)!.doneCount }} 题</template></small><span v-if="bankStatsMap.has(item.bank.id)" class="home__progress" role="progressbar" :aria-label="`${item.bank.name}练习进度`" :aria-valuenow="progressPercent(item.bank.id)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${progressPercent(item.bank.id)}%` }" /></span></span>
              <el-icon class="home__subject-arrow"><ArrowRight /></el-icon>
            </button>
          </div>
        </section>
      </template>
    </div>
    <PracticeOptionModal v-if="selectedBank" v-model:visible="modalVisible" :bank="selectedBank" :config="config" @start="handleStart" />
    <el-dialog v-model="achievementsVisible" title="学习成就" width="560px" align-center append-to-body>
      <PracticeLoading v-if="achievementsLoading" :loading="true" :rows="2" caption="正在加载学习成就…" />
      <RequestError v-else-if="!achievements" text="成就数据加载失败" @retry="loadAchievements" />
      <div v-else class="home__achievements"><div class="home__ach-summary"><strong>{{ achievements.streakDays }}<small>天连续打卡</small></strong><span>最长 {{ achievements.bestStreak }} 天<br>累计 {{ achievements.answeredTotal }} 题 · 正确率 {{ achievements.answeredTotal ? `${achievements.accuracy}%` : '—' }}<br>已解锁 {{ achievements.unlockedCount }} / {{ achievements.badges.length }} 枚徽章</span></div><div class="home__badges"><div v-for="badge in achievements.badges" :key="badge.key" class="home__badge" :class="{ 'is-locked': !badge.unlocked }"><el-icon><Medal /></el-icon><div><strong>{{ badge.name }}</strong><p>{{ badge.desc }}</p><small>{{ badge.unlocked ? '已解锁' : `进度 ${badge.current} / ${badge.target}` }}</small></div></div></div></div>
      <template #footer><el-button @click="achievementsVisible = false">关闭</el-button></template>
    </el-dialog>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.home {
  max-width: 1040px; margin: 0 auto;
  &__welcome { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 4px 0 20px; p { margin: 0 0 4px; font-size: 12px; color: $text-secondary; } h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.5; } }
  &__avatar { flex: 0 0 42px; width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid $color-primary-border; border-radius: 50%; background: $color-primary-soft; color: $color-primary; font: inherit; font-weight: 600; cursor: pointer; }
  &__daily { position: relative; overflow: hidden; padding: 26px; border-radius: $radius-lg; background: linear-gradient(120deg, #2f6ff0, #2054d4); color: #fff; &::after { content: ''; position: absolute; width: 190px; height: 190px; right: -55px; top: -70px; border: 30px solid rgba(255,255,255,.07); border-radius: 50%; pointer-events: none; } h2 { position: relative; margin: 10px 0 8px; font-size: 24px; font-weight: 650; line-height: 1.5; } p { position: relative; margin: 0 0 20px; font-size: 13px; color: #e1eaff; line-height: 1.6; } }
  &__daily-kicker { font-size: 12px; letter-spacing: 1.8px; color: #d4e2ff; }
  &__daily-start { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 16px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 8px; background: #fff; color: #2459c8; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; &:disabled { color: #475467; cursor: default; } }
  &__shortcuts { display: grid; grid-template-columns: repeat(var(--shortcut-count), minmax(0,1fr)); gap: 12px; padding: 24px 0; button { display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; padding: 0; border: 0; background: transparent; color: $text-body; font: inherit; cursor: pointer; } strong { font-size: 13px; font-weight: 500; } small { font-size: 12px; line-height: 1.5; color: $text-secondary; text-align: center; overflow-wrap: anywhere; } }
  &__shortcut-icon { display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid $border-color; border-radius: 13px; background: $bg-paper; color: $color-primary; font-size: 21px; }
  &__section-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 6px 0 0; h2 { margin: 0; font-size: 16px; font-weight: 650; } > span { font-size: 12px; color: $text-secondary; } }
  &__scope { margin: 6px 0 14px; font-size: 12px; line-height: 1.7; color: $text-secondary; }
  &__subjects { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
  &__subject { display: flex; align-items: center; gap: 14px; min-width: 0; width: 100%; padding: 20px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-paper; text-align: left; font: inherit; color: $text-primary; cursor: pointer; transition: border-color .15s; &:hover { border-color: $color-primary-border; } &:disabled { cursor: not-allowed; opacity: .65; } }
  &__subject-icon { flex: 0 0 42px; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: $color-primary-soft; color: $color-primary; font-size: 21px; }
  &__subject-body { flex: 1; min-width: 0; strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; } small { display: block; margin-top: 4px; font-size: 12px; color: $text-secondary; } }
  &__bank-name { display: block; margin-top: 2px; font-size: 12px; line-height: 1.6; color: $text-body; overflow-wrap: anywhere; }
  &__subject-arrow { flex: 0 0 auto; color: $text-secondary; font-size: 16px; }
  &__progress { display: block; height: 4px; margin-top: 9px; border-radius: 4px; background: #eaf0fa; overflow: hidden; i { display: block; height: 100%; background: $color-primary; border-radius: inherit; } }
  &__empty { padding: 32px 20px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-paper; text-align: center; p { margin: 0 0 8px; font-weight: 600; } span { font-size: 12px; line-height: 1.7; color: $text-secondary; } }
  &__ach-loading { min-height: 180px; }
  &__ach-summary { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; padding: 16px; border-radius: 12px; background: $bg-page; > strong { color: $color-primary; font-size: 30px; small { display: block; font-size: 12px; font-weight: 500; } } > span { color: $text-secondary; font-size: 12px; line-height: 1.9; } }
  &__badges { display: grid; gap: 12px; }
  &__badge { display: flex; gap: 12px; padding: 14px; border: 1px solid $border-color; border-radius: 12px; .el-icon { font-size: 24px; color: $color-primary; } strong { font-size: 14px; } p { margin: 4px 0; font-size: 12px; color: $text-secondary; } small { font-size: 12px; color: $color-primary; } &.is-locked { background: $bg-page; .el-icon, small { color: $text-secondary; } } }
  button:focus-visible { outline: 3px solid $color-primary-border; outline-offset: 3px; }
}
@media (max-width: 900px) {
  .home {
    &__welcome { margin: 4px 2px 18px; h1 { font-size: 22px; } }
    &__daily { padding: 23px 22px; h2 { font-size: 23px; } p { font-size: 12px; } }
    &__shortcuts { gap: 8px; padding: 23px 0; strong { font-size: 12px; } small { font-size: 12px; } }
    &__subjects { grid-template-columns: minmax(0,1fr); gap: 12px; }
    &__subject { gap: 12px; padding: 16px; }
    &__section-head h2 { font-size: 15px; }
    &__scope { font-size: 12px; }
  }
}
</style>
