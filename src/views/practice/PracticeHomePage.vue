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
import EmptyState from '@/components/common/EmptyState.vue';
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
const banksLoading = ref(false);
const countsLoading = ref(false);
const dailyLoading = ref(false);
const progressLoading = ref(false);
const wrongError = ref(false);
const favoriteError = ref(false);
const dailyError = ref(false);
const progressError = ref(false);
let homePending = false;
const auxiliaryBusy = computed(() => banksLoading.value || countsLoading.value || dailyLoading.value || progressLoading.value || achievementsLoading.value);
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
const bankStatsMap = computed(() => new Map((config.value.reportEnabled ? bankStats.value ?? [] : []).map(item => [item.bankId, item])));
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
  if (!config.value.achievementEnabled || achievementsLoading.value) return;
  achievementsLoading.value = true;
  achievements.value = null;
  try { achievements.value = await practiceApi.achievements(); }
  catch { /* 弹窗保留可重试的错误状态。 */ }
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

const practiceQuestionTotal = computed(() => bankCards.value.reduce((sum, item) => sum + item.bank.questionCount, 0));

/** 目录与题库保持原服务端交集，失败不扩大可访问范围。 */
async function loadBankData(): Promise<void> {
  if (banksLoading.value) return;
  banksLoading.value = true;
  loadError.value = false;
  banks.value = [];
  bankTree.value = [];
  try {
    const [bankList, treeList] = await Promise.all([practiceApi.listBanks(), practiceApi.bankTree()]);
    banks.value = bankList; bankTree.value = treeList;
  } catch { loadError.value = true; }
  finally { banksLoading.value = false; }
}

async function loadCounts(): Promise<void> {
  if (countsLoading.value) return;
  countsLoading.value = true; wrongError.value = false; favoriteError.value = false;
  wrongTotal.value = null; favoriteTotal.value = null;
  try {
    await Promise.all([
      config.value.wrongBookEnabled ? practiceApi.wrongBook({ page: 1, pageSize: 1 }).then(page => { wrongTotal.value = page.total; }).catch(() => { wrongError.value = true; }) : Promise.resolve(),
      config.value.favoriteEnabled ? practiceApi.favorites({ page: 1, pageSize: 1 }).then(page => { favoriteTotal.value = page.total; }).catch(() => { favoriteError.value = true; }) : Promise.resolve(),
    ]);
  } finally { countsLoading.value = false; }
}

async function loadDaily(): Promise<void> {
  if (dailyLoading.value) return;
  dailyLoading.value = true; dailyError.value = false; daily.value = null;
  try { daily.value = await practiceApi.daily(); }
  catch { dailyError.value = true; }
  finally { dailyLoading.value = false; }
}

async function loadProgress(): Promise<void> {
  if (!config.value.reportEnabled || progressLoading.value) return;
  progressLoading.value = true; progressError.value = false; bankStats.value = null;
  try { bankStats.value = await practiceApi.reportBanks(); }
  catch { progressError.value = true; }
  finally { progressLoading.value = false; }
}

/** 首屏统一读取，后续各区域独立恢复；刷新期间不重复发起请求。 */
async function load(): Promise<void> {
  if (homePending || auxiliaryBusy.value) return;
  homePending = true; loading.value = true;
  try {
    await configStore.load();
    await Promise.all([loadBankData(), loadCounts(), loadDaily(), loadAchievements(), loadProgress()]);
  } catch { loadError.value = true; }
  finally { loading.value = false; homePending = false; }
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
  <PracticeLayout data-ui-layout="practice-home" data-ui-page="PracticeHomePage" class="practice-home">
    <div class="home">
      <PracticeLoading v-if="loading" :loading="loading" :rows="5" caption="正在加载题库…" />
      <template v-else>
        <header class="home__welcome">
          <div class="home__welcome-text"><p>每天进步一点点</p><h1>你好，{{ userName || '同学' }}</h1></div>
          <el-button :disabled="auxiliaryBusy" @click="load">刷新首页</el-button>
        </header>

        <PracticeLoading v-if="dailyLoading" :loading="true" compact caption="正在读取每日一练…" />
        <RequestError v-else-if="dailyError" text="每日一练状态加载失败" @retry="loadDaily" />
        <section v-if="dailyAvailable" class="home__daily" aria-label="每日一练">
          <span class="home__daily-kicker">DAILY PRACTICE</span>
          <h2>{{ daily?.completed ? '今日练习，已经完成' : '今天，也学有所得' }}</h2>
          <p>{{ dailyProgressText }}<template v-if="(daily?.streakDays ?? 0) > 0"> · 连续 {{ daily?.streakDays }} 天</template></p>
          <button type="button" class="home__daily-start" :disabled="daily?.completed" @click="goDaily">{{ daily?.completed ? '今日已完成' : '开始练习' }}<el-icon v-if="!daily?.completed"><ArrowRight /></el-icon></button>
        </section>

        <nav v-if="shortcutCount" class="home__shortcuts" aria-label="学习快捷入口" :style="{ '--shortcut-count': shortcutCount }">
          <button v-if="config.wrongBookEnabled" type="button" @click="goWrongBook"><span class="home__shortcut-icon"><el-icon><Notebook /></el-icon></span><strong>错题本</strong><small>{{ countsLoading ? '正在读取数量…' : wrongTotal === null ? '错题数量暂不可用' : `${wrongTotal} 道待巩固` }}</small></button>
          <button v-if="config.favoriteEnabled" type="button" @click="goFavorites"><span class="home__shortcut-icon"><el-icon><Star /></el-icon></span><strong>收藏夹</strong><small>{{ countsLoading ? '正在读取数量…' : favoriteTotal === null ? '收藏数量暂不可用' : `${favoriteTotal} 道收藏` }}</small></button>
          <button v-if="config.reportEnabled" type="button" @click="router.push({ name: 'practice-report' })"><span class="home__shortcut-icon"><el-icon><TrendCharts /></el-icon></span><strong>学习报告</strong><small>查看学习进度</small></button>
          <button v-if="achievementAvailable" type="button" @click="achievementsVisible = true"><span class="home__shortcut-icon"><el-icon><Medal /></el-icon></span><strong>成就徽章</strong><small>{{ achievements ? `${achievements.unlockedCount} 枚已解锁` : '查看学习成就' }}</small></button>
        </nav>

        <div v-if="wrongError || favoriteError" class="home__status" role="status"><p>{{ wrongError ? '错题数量暂不可用。' : '' }}{{ favoriteError ? '收藏数量暂不可用。' : '' }}入口仍可使用。</p><el-button :loading="countsLoading" @click="loadCounts">重试学习数量</el-button></div>

        <section class="home__banks-panel" aria-labelledby="practice-bank-heading">
          <header class="home__section-head"><h2 id="practice-bank-heading">选择科目，开始练题</h2><span>按权限展示</span></header>
          <p v-if="!banksLoading && !loadError" class="home__scope">当前目录 {{ bankCards.length }} 个可练题库 · {{ practiceQuestionTotal }} 道题<template v-if="config.reportEnabled && bankStats"> · 进度采用本人首次作答记录</template></p>
          <PracticeLoading v-if="banksLoading" :loading="true" :rows="3" caption="正在读取可练题库…" />
          <RequestError v-else-if="loadError" text="可练题库加载失败" @retry="loadBankData" />
          <EmptyState v-else-if="bankCards.length === 0" text="暂无可练习的题库" description="暂无可练习的题库，请联系管理员确认题库开放状态与浏览权限。" action-text="重新读取" @action="loadBankData" />
          <div v-else class="home__subjects">
            <button v-for="item in bankCards" :key="item.bank.id" type="button" class="home__subject" :disabled="item.bank.questionCount <= 0" :aria-label="`${item.subject || item.bank.name}，${item.bank.name}，${item.bank.questionCount} 道题，选择练题方式`" @click="openBank(item.bank)">
              <span class="home__subject-icon"><el-icon><Collection /></el-icon></span>
              <span class="home__subject-body"><strong>{{ item.subject || item.bank.name }}</strong><span v-if="item.subject" class="home__bank-name">{{ item.bank.name }}</span><small>{{ item.bank.questionCount }} 道题<template v-if="bankStatsMap.has(item.bank.id)"> · 已练 {{ bankStatsMap.get(item.bank.id)!.doneCount }} 题</template></small><span v-if="bankStatsMap.has(item.bank.id)" class="home__progress" role="progressbar" :aria-label="`${item.bank.name}练习进度`" :aria-valuenow="progressPercent(item.bank.id)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${progressPercent(item.bank.id)}%` }" /></span></span>
              <el-icon class="home__subject-arrow"><ArrowRight /></el-icon>
            </button>
          </div>
          <PracticeLoading v-if="progressLoading" :loading="true" compact caption="正在读取练习进度…" />
          <div v-else-if="progressError" class="home__status" role="status"><p>练习进度暂不可用，题库仍可正常选择。</p><el-button @click="loadProgress">重试练习进度</el-button></div>
        </section>
      </template>
    </div>
    <PracticeOptionModal v-if="selectedBank" v-model:visible="modalVisible" :bank="selectedBank" :config="config" @start="handleStart" />
    <el-dialog v-model="achievementsVisible" title="学习成就" width="560px" align-center append-to-body class="achievement-dialog">
      <PracticeLoading v-if="achievementsLoading" :loading="true" :rows="2" caption="正在加载学习成就…" />
      <RequestError v-else-if="!achievements" text="成就数据加载失败" @retry="loadAchievements" />
      <EmptyState v-else-if="!achievements.enabled" text="学习成就暂未开放" />
      <div v-else class="home__achievements"><p class="learner-scope">累计题量与正确率基于本人首次作答；打卡统计从当前业务日前400天起算，按后台每日重置时间划分。徽章进度按当前规则计算。</p><div class="home__ach-summary"><strong>{{ achievements.streakDays }}<small>天连续打卡</small></strong><span>最长 {{ achievements.bestStreak }} 天<br>累计 {{ achievements.answeredTotal }} 题 · 正确率 {{ achievements.answeredTotal ? `${achievements.accuracy}%` : '—' }}<br>已解锁 {{ achievements.unlockedCount }} / {{ achievements.badges.length }} 枚徽章</span></div><div class="home__badges"><div v-for="badge in achievements.badges" :key="badge.key" class="home__badge" :class="{ 'is-locked': !badge.unlocked }"><el-icon><Medal /></el-icon><div><strong>{{ badge.name }}</strong><p>{{ badge.desc }}</p><small>{{ badge.unlocked ? '已解锁' : `进度 ${badge.current} / ${badge.target}` }}</small></div></div></div></div>
      <template #footer><el-button :loading="achievementsLoading" :disabled="loading" @click="loadAchievements">刷新成就</el-button><el-button @click="achievementsVisible = false">关闭</el-button></template>
    </el-dialog>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.home {
  max-width: 1040px; margin: 0 auto;
  &__welcome-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  &__status { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-paper; p { flex: 1; min-width: 0; margin: 0; color: $text-secondary; font-size: 13px; overflow-wrap: anywhere; } .el-button { min-height: 44px; } }
  &__welcome { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin: 4px 0 20px; p { margin: 0 0 4px; font-size: 12px; color: $text-secondary; } h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.5; } }
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
  &__badge { min-width: 0; overflow-wrap: anywhere; > div { min-width: 0; } .el-icon { flex: 0 0 24px; } display: flex; gap: 12px; padding: 14px; border: 1px solid $border-color; border-radius: 12px; .el-icon { font-size: 24px; color: $color-primary; } strong { font-size: 14px; } p { margin: 4px 0; font-size: 12px; color: $text-secondary; } small { font-size: 12px; color: $color-primary; } &.is-locked { background: $bg-page; .el-icon, small { color: $text-secondary; } } }
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
@media (max-width: 600px) {
  .home__welcome-text { flex-basis: 100%; order: 0; }
  .home__welcome > .el-button { order: 2; min-height: 44px; margin-left: 0; }
  :global(.achievement-dialog.el-dialog.el-dialog) { width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh; margin: 0 !important; border-radius: 0; }
  :global(.achievement-dialog.el-dialog .el-dialog__body) { flex: 1; }
  :global(.achievement-dialog.el-dialog .el-dialog__footer) { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
</style>
