<script setup lang="ts">
/**
 * 练题端设置（v1.5，独立菜单；原「系统设置 → 公网练题」拆出）。
 * 数据存于独立单行表 `practice_settings`，与 system_settings 分离，独立保存。
 *
 * 结构（v1.8+ 重排）：
 *   1) 基础配置卡片 —— 每日一练 / 收藏上限等（存 practice_settings）
 *   2) 练题题库卡片 —— 「对外开放练题」开关（存 question_banks.allow_practice）
 *
 * ⚠️ 练题端可见性铁律：**只有 `allow_practice = 1` 的题库**才会出现在练题端；
 *    一个都没开时，练题端「题库列表」为空、每日一练也抽不到题（卡片不显示）。
 *    因此本页把题库开放管理前置，避免管理员「配好了却什么都看不到」。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getPracticeSettings, updatePracticeSettings } from '@/api/settings';
import { list as listBanks, setPracticeFlag } from '@/api/banks';
import {
  DAILY_BANK_SCOPE_OPTIONS,
  DAILY_COUNT_MAX,
  DAILY_COUNT_MIN,
  DAILY_MIN_COUNT_MAX,
  DAILY_MIN_COUNT_MIN,
  DAILY_RESET_HOUR_MAX,
  DAILY_RESET_HOUR_MIN,
  DEFAULT_PRACTICE_MODE_OPTIONS,
  FAVORITE_LIMIT_MAX,
  FAVORITE_LIMIT_MIN,
  PRACTICE_SETTINGS_DEFAULTS,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
  WRONG_AUTO_REMOVE_MAX,
  WRONG_AUTO_REMOVE_MIN,
} from '@/constants/practiceSettings';
import PageHeader from '@/components/common/PageHeader.vue';
import type { PracticeSettings, QuestionBank, QuestionType } from '@/types';

/** 题型多选项（每日一练题型范围） */
const TYPE_OPTIONS: Array<{ label: string; value: QuestionType }> = [
  { label: '单选题', value: 'single' },
  { label: '多选题', value: 'multiple' },
  { label: '判断题', value: 'judge' },
];

const practiceForm = reactive<PracticeSettings>({ ...PRACTICE_SETTINGS_DEFAULTS });
const practiceLoading = ref(true);
const practiceSaving = ref(false);

/* ------------------------------ 练题题库 ------------------------------ */

const banks = ref<QuestionBank[]>([]);
const banksLoading = ref(true);
/** 正在提交的题库 id（行级 switch 的 loading） */
const bankSavingId = ref('');
const bankBatchSaving = ref(false);

/** 已开放练题的题库数 */
const openBankCount = computed<number>(() => banks.value.filter((b) => b.allowPractice).length);
/** 已开放题库合计题目数（= 练题端当前可练总量） */
const openQuestionCount = computed<number>(() =>
  banks.value.filter((b) => b.allowPractice).reduce((sum, b) => sum + b.questionCount, 0),
);
/** 一个题库都没开放 → 练题端空列表（高危状态，页面显著提示） */
const noOpenBank = computed<boolean>(() => !banksLoading.value && banks.value.length > 0 && openBankCount.value === 0);

/* --------------- v3.2 设计稿区块的派生状态（不新增接口，复用页面已有状态） --------------- */

/** 练题端是否已开放（= 至少一个题库对外开放；「开放策略」卡唯一可推导的状态） */
const practiceOpen = computed<boolean>(() => openBankCount.value > 0);
/** 题库列表已加载但为空 → 依赖题库的区块（开放策略 / 关闭态预览）显示空态 */
const noBanks = computed<boolean>(() => !banksLoading.value && banks.value.length === 0);
/**
 * 练题端地址（说明性）：练题端是独立公网实例（见 deploy/nginx-practice.conf，
 * 静态资源 publicPath = /practice/），管理端没有承载该公网域名的配置项，
 * 故按当前访问域名拼出 `/practice/` 仅作提示，真实公网域名以部署为准。
 */
const practiceUrl = computed<string>(() =>
  typeof window === 'undefined' ? '' : `${window.location.origin}/practice/`,
);

/** 复制练题端地址（纯前端剪贴板，未新增后端接口） */
async function copyPracticeUrl(): Promise<void> {
  if (!practiceUrl.value) return;
  try {
    await navigator.clipboard.writeText(practiceUrl.value);
    ElMessage.success('练题端地址已复制');
  } catch {
    ElMessage.info('浏览器未授权剪贴板，请手动复制');
  }
}

onMounted(() => {
  void loadPractice();
  void loadBanks();
});

async function loadPractice(): Promise<void> {
  practiceLoading.value = true;
  try {
    Object.assign(practiceForm, await getPracticeSettings());
  } catch {
    Object.assign(practiceForm, PRACTICE_SETTINGS_DEFAULTS);
  } finally {
    practiceLoading.value = false;
  }
}

async function handleSavePractice(): Promise<void> {
  practiceSaving.value = true;
  try {
    const saved = await updatePracticeSettings({ ...practiceForm });
    Object.assign(practiceForm, saved);
    ElMessage.success('练题端配置已保存，练题端即时生效');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    practiceSaving.value = false;
  }
}

async function loadBanks(): Promise<void> {
  banksLoading.value = true;
  try {
    banks.value = await listBanks();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    banksLoading.value = false;
  }
}

/** 行级开关：只提交该题库 */
async function toggleBank(row: QuestionBank, value: boolean): Promise<void> {
  bankSavingId.value = row.id;
  try {
    const updated = await setPracticeFlag([row.id], value);
    const hit = updated.find((b) => b.id === row.id);
    row.allowPractice = hit ? hit.allowPractice : value;
    ElMessage.success(value ? `已开放「${row.name}」到练题端` : `已关闭「${row.name}」的练题开放`);
  } catch {
    // 失败时回滚开关显示（后端未变更）
    row.allowPractice = !value;
  } finally {
    bankSavingId.value = '';
  }
}

/** 批量：全部开放 / 全部关闭 */
async function setAllBanks(allowPractice: boolean): Promise<void> {
  const targets = banks.value.filter((b) => b.allowPractice !== allowPractice);
  if (targets.length === 0) {
    ElMessage.info(allowPractice ? '全部题库均已开放' : '全部题库均已关闭');
    return;
  }
  const actionText = allowPractice ? '开放' : '关闭';
  try {
    await ElMessageBox.confirm(
      `将${actionText} ${targets.length} 个题库的对外练题（共 ${banks.value.length} 个题库）？`,
      `批量${actionText}`,
      { type: 'warning', confirmButtonText: `确认${actionText}`, cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  bankBatchSaving.value = true;
  try {
    await setPracticeFlag(
      targets.map((b) => b.id),
      allowPractice,
    );
    await loadBanks();
    ElMessage.success(`已${actionText} ${targets.length} 个题库`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    bankBatchSaving.value = false;
  }
}
</script>

<template>
  <div class="practice-settings-page">
    <PageHeader
      title="练题端设置"
      description="仅作用于公网练题端（题库练习、每日一练、收藏夹），不影响内网考试功能"
    >
      <template #actions>
        <el-button type="primary" :loading="practiceSaving" @click="handleSavePractice">
          保存练题配置
        </el-button>
      </template>
    </PageHeader>

    <!-- 表单与辅助信息各自成列，避免说明卡较高时推开后续配置。 -->
    <div class="practice-settings-page__columns">
      <div class="practice-settings-page__stack">
        <el-card v-loading="banksLoading" class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">开放策略</span>
              <el-tag :type="practiceOpen ? 'success' : 'info'" size="small" effect="plain">
                {{ practiceOpen ? '已开放' : '未开放' }}
              </el-tag>
            </div>
          </template>

          <p v-if="noBanks" class="practice-settings-page__empty">
            暂无题库数据，请先在「题库管理」创建题库，再来配置练题端开放策略。
          </p>
          <template v-else>
            <div class="practice-settings-page__row">
              <div class="practice-settings-page__row-main">
                <span class="practice-settings-page__row-title">对外开放练题</span>
                <span class="practice-settings-page__row-desc">
                  由下方「练题题库（对外开放）」逐库开关汇聚：当前开放
                  <b>{{ openBankCount }}</b>
                  个题库、可练
                  <b>{{ openQuestionCount }}</b>
                  道题；全部关闭时练题端停止服务，已登录学员立即失效。
                </span>
              </div>
              <el-tag :type="practiceOpen ? 'success' : 'info'" size="small" effect="plain">
                {{ practiceOpen ? '已开放' : '未开放' }}
              </el-tag>
            </div>

            <div class="practice-settings-page__row">
              <div class="practice-settings-page__row-main">
                <span class="practice-settings-page__row-title">允许游客浏览题库目录</span>
                <span class="practice-settings-page__row-desc">
                  未登录用户可查看题库名称与题数，开始答题需登录账号。
                </span>
              </div>
              <span class="practice-settings-page__row-ind">练题端固定</span>
            </div>

            <div class="practice-settings-page__row">
              <div class="practice-settings-page__row-main">
                <span class="practice-settings-page__row-title">答完自动进入下一题</span>
                <span class="practice-settings-page__row-desc">
                  关闭后需手动点击「下一题」；属练题端会话内的交互相应。
                </span>
              </div>
              <span class="practice-settings-page__row-ind">练题端固定</span>
            </div>

            <div class="practice-settings-page__row">
              <div class="practice-settings-page__row-main">
                <span class="practice-settings-page__row-title">答错立即显示解析</span>
                <span class="practice-settings-page__row-desc">
                  跟随本页「作答后展示解析」开关；关闭则交卷后统一展示。
                </span>
              </div>
              <el-tag :type="practiceForm.showAnalysis ? 'success' : 'info'" size="small" effect="plain">
                {{ practiceForm.showAnalysis ? '展示' : '隐藏' }}
              </el-tag>
            </div>

            <p class="practice-settings-page__footnote">
              标注「练题端固定」的条目为练题端内置行为，本管理页不提供开关。
            </p>
          </template>
        </el-card>
        <el-card v-loading="banksLoading" class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">练题题库（对外开放）</span>
              <span class="practice-settings-page__head-meta">
                共 {{ banks.length }} 个题库 · 已开放
                <b>{{ openBankCount }}</b>
                个 · 可练题目
                <b>{{ openQuestionCount }}</b>
                道
              </span>
            </div>
          </template>

          <el-alert
            class="practice-settings-page__alert"
            type="warning"
            show-icon
            :closable="false"
            title="只有这里开启的题库才会出现在练题端"
            description="未开启任何题库时，练题端「题库列表」为空、每日一练也抽不到题目（首页不显示入口）。此处开关与「题库管理 → 编辑题库 → 对外开放练题」是同一个开关。"
          />

          <div v-if="noOpenBank" class="practice-settings-page__danger">
            当前没有任何题库对外开放练题，练题端将看不到题库与每日一练。请至少开启一个题库。
          </div>

          <div class="practice-settings-page__bulk">
            <el-button :loading="bankBatchSaving" @click="setAllBanks(true)">全部开放</el-button>
            <el-button :loading="bankBatchSaving" @click="setAllBanks(false)">全部关闭</el-button>
            <el-button text @click="loadBanks">刷新</el-button>
          </div>

          <el-table :data="banks" row-key="id" stripe size="small" empty-text="暂无题库，请先在「题库管理」中创建">
            <el-table-column prop="name" label="题库名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="category" label="分类" width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.category || '未分类' }}</template>
            </el-table-column>
            <el-table-column prop="questionCount" label="题数" width="90" align="center" />
            <el-table-column label="对外开放练题" width="150" align="center">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.allowPractice"
                  :loading="bankSavingId === row.id"
                  :disabled="bankSavingId === row.id || row.questionCount === 0"
                  @update:model-value="(v: string | number | boolean) => toggleBank(row as QuestionBank, Boolean(v))"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="140">
              <template #default="{ row }">
                <el-tag v-if="row.allowPractice && row.questionCount > 0" type="success" size="small" effect="plain">
                  练题端可见
                </el-tag>
                <el-tag v-else-if="row.questionCount === 0" type="info" size="small" effect="plain">暂无题目</el-tag>
                <el-tag v-else type="info" size="small" effect="plain">未开放</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card v-loading="practiceLoading" class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">每日一练与收藏</span>
            </div>
          </template>

          <el-alert
            class="practice-settings-page__alert"
            type="info"
            show-icon
            :closable="false"
            title="该配置保存在独立的练题配置表中，与「系统设置」分开读写，互不影响"
          />

          <el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">每日一练</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.dailyEnabled" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">
                    关闭后练题端首页不再显示每日一练入口，且无法新建当日任务；已产生的打卡记录保留。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">每日题量（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.dailyQuestionCount"
                    :min="DAILY_COUNT_MIN"
                    :max="DAILY_COUNT_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    默认 10 题；开放题库题量不足时按实际题量生成。当日已生成的任务不受修改影响。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">题型范围</label>
                <div class="practice-settings-page__control">
                  <el-select
                    v-model="practiceForm.dailyTypes"
                    multiple
                    collapse-tags
                    placeholder="全部题型"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__select"
                  >
                    <el-option v-for="opt in TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                  <p class="practice-settings-page__hint">留空表示包含全部题型。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">抽题范围</label>
                <div class="practice-settings-page__control">
                  <el-radio-group v-model="practiceForm.dailyBankScope" :disabled="!practiceForm.dailyEnabled">
                    <el-radio v-for="opt in DAILY_BANK_SCOPE_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </el-radio>
                  </el-radio-group>
                  <p class="practice-settings-page__hint">仅每日一练抽题时生效，题库练习不受影响。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">重置时点（时）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.dailyResetHour"
                    :min="DAILY_RESET_HOUR_MIN"
                    :max="DAILY_RESET_HOUR_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    默认 0 点。设为 4 点则凌晨 4 点前仍算作前一天，适合「跨零点仍在练题」的场景；打卡统计与趋势图同步按此切分。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">最少抽题数（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.dailyMinQuestionCount"
                    :min="DAILY_MIN_COUNT_MIN"
                    :max="DAILY_MIN_COUNT_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    开放题库题量不足该值时，当日视为「无题可练」（不显示入口），避免只抽到一两题就开练。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">收藏夹上限（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.favoriteLimit"
                    :min="FAVORITE_LIMIT_MIN"
                    :max="FAVORITE_LIMIT_MAX"
                    :step="10"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">调小仅限制新增收藏，不会删除已有收藏。</p>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
        <el-card v-loading="practiceLoading" class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">练题行为与作答反馈</span>
            </div>
          </template>

          <el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">默认练题方式</label>
                <div class="practice-settings-page__control">
                  <el-radio-group v-model="practiceForm.defaultPracticeMode">
                    <el-radio v-for="opt in DEFAULT_PRACTICE_MODE_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </el-radio>
                  </el-radio-group>
                  <p class="practice-settings-page__hint">
                    练题端发起练习时未显式选择方式时的默认值；考生仍可在题库内手动切换。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">单次练习题量范围</label>
                <div class="practice-settings-page__control">
                  <div class="practice-settings-page__inline">
                    <el-input-number
                      v-model="practiceForm.sessionMinCount"
                      :min="SESSION_COUNT_MIN"
                      :max="SESSION_COUNT_MAX"
                      :step="1"
                      class="practice-settings-page__num-sm"
                    />
                    <span class="practice-settings-page__sep">~</span>
                    <el-input-number
                      v-model="practiceForm.sessionMaxCount"
                      :min="SESSION_COUNT_MIN"
                      :max="SESSION_COUNT_MAX"
                      :step="1"
                      class="practice-settings-page__num-sm"
                    />
                    <span class="practice-settings-page__unit">题</span>
                  </div>
                  <p class="practice-settings-page__hint">
                    限制练题端「抽取题量」的可选区间；上限须不小于下限。题库题量不足时按实际题量出题。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">作答后展示正确答案</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.showAnswer" active-text="展示" inactive-text="隐藏" />
                  <p class="practice-settings-page__hint">
                    关闭后判分仍返回正误，但不下发正确答案（防止「边练边看答案」）。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">作答后展示解析</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.showAnalysis" active-text="展示" inactive-text="隐藏" />
                  <p class="practice-settings-page__hint">关闭后判分不下发题目解析。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">错题本自动移除阈值</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.wrongAutoRemoveStreak"
                    :min="WRONG_AUTO_REMOVE_MIN"
                    :max="WRONG_AUTO_REMOVE_MAX"
                    :step="1"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    设为 0 表示不自动移除（仅手动移除）；设为 N（1~20）时，错题连续答对 N 次后自动移出错题本。
                  </p>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
        <el-card v-loading="practiceLoading" class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">页面入口开关</span>
              <span class="practice-settings-page__head-meta">关闭后练题端隐藏对应入口，接口一并拒绝</span>
            </div>
          </template>

          <el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="8">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">学习报告</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.reportEnabled" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后练题端底部「报告」入口隐藏。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="8">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">错题本</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.wrongBookEnabled" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后「错题本」入口隐藏，作答不再进入错题本浏览。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="8">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">收藏夹</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.favoriteEnabled" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后作答页收藏按钮与收藏夹入口隐藏。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="8">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">打卡与成就</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.achievementEnabled" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后练题首页隐藏连续打卡与成就徽章（接口返回 1017）。</p>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </div>
      <div class="practice-settings-page__stack">
        <el-card class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">访问链接</span>
            </div>
          </template>

          <template v-if="practiceUrl">
            <div class="practice-settings-page__item">
              <label class="practice-settings-page__label">练题端地址</label>
              <div class="practice-settings-page__url">
                <el-input :model-value="practiceUrl" readonly />
                <el-button @click="copyPracticeUrl">复制</el-button>
              </div>
              <p class="practice-settings-page__hint">
                练题端为独立公网实例，实际公网域名以部署为准（见 deploy/nginx-practice.conf）。
              </p>
            </div>

            <div class="practice-settings-page__item">
              <label class="practice-settings-page__label">免登录时长</label>
              <div class="practice-settings-page__control">
                <span class="practice-settings-page__row-ind">
                  由练题端服务端会话配置决定，本页不提供调整
                </span>
              </div>
            </div>

            <div class="practice-settings-page__item">
              <label class="practice-settings-page__label">单次练题题量上限</label>
              <div class="practice-settings-page__control">
                <span class="practice-settings-page__value">{{ practiceForm.sessionMaxCount }} 题</span>
                <p class="practice-settings-page__hint">
                  跟随「练题行为与作答反馈 → 单次练习题量范围」的上限。
                </p>
              </div>
            </div>

            <el-alert
              class="practice-settings-page__alert"
              type="info"
              show-icon
              :closable="false"
              title="练题端为独立公网实例，不注册考试域接口"
              description="公网仅放行 /api/practice/** 与 /practice 静态资源；其可访问的数据表清单维护在 deploy/db-grants-practice.sql。"
            />
          </template>

          <p v-else class="practice-settings-page__empty">未取到可用域名，无法拼出练题端地址。</p>
        </el-card>
        <el-card class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">练题端数据概览</span>
            </div>
          </template>

          <div class="practice-settings-page__kv">
            <span class="practice-settings-page__kv-k">累计练题人次</span>
            <span class="practice-settings-page__kv-v practice-settings-page__kv-v--none">—</span>
          </div>
          <div class="practice-settings-page__kv">
            <span class="practice-settings-page__kv-k">日活跃学员</span>
            <span class="practice-settings-page__kv-v practice-settings-page__kv-v--none">—</span>
          </div>
          <div class="practice-settings-page__kv">
            <span class="practice-settings-page__kv-k">平均正确率</span>
            <span class="practice-settings-page__kv-v practice-settings-page__kv-v--none">—</span>
          </div>
          <div class="practice-settings-page__kv">
            <span class="practice-settings-page__kv-k">错题巩固完成率</span>
            <span class="practice-settings-page__kv-v practice-settings-page__kv-v--none">—</span>
          </div>

          <p class="practice-settings-page__footnote">
            练题端学习统计由埋点汇总，管理端暂未接入该数据源，接入后在此展示。
          </p>
        </el-card>
        <el-card class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">关闭态预览</span>
              <el-tag :type="practiceOpen ? 'info' : 'danger'" size="small" effect="plain">
                当前：{{ practiceOpen ? '已开放' : '已关闭' }}
              </el-tag>
            </div>
          </template>

          <p v-if="noBanks" class="practice-settings-page__empty">
            暂无法预览：未加载到题库数据。
          </p>
          <template v-else>
            <el-alert
              class="practice-settings-page__alert"
              type="error"
              show-icon
              :closable="false"
              title="关闭后练题端全部页面返回维护提示，已登录会话立即失效"
            />
            <div class="practice-settings-page__row">
              <div class="practice-settings-page__row-main">
                <span class="practice-settings-page__row-title">对外开放练题</span>
                <span class="practice-settings-page__row-desc">
                  当前：{{ practiceOpen ? '开启（本卡为关闭态预览）' : '关闭' }}
                </span>
              </div>
              <el-tag :type="practiceOpen ? 'info' : 'danger'" size="small" effect="plain">
                {{ practiceOpen ? '开启' : '关闭' }}
              </el-tag>
            </div>
            <p class="practice-settings-page__footnote">
              如需重新开放，请在「练题题库（对外开放）」中重新开启题库开关。
            </p>
          </template>
        </el-card>
        <el-card class="practice-settings-page__panel" shadow="never">
          <template #header>
            <div class="practice-settings-page__head">
              <span class="practice-settings-page__head-title">配置留痕</span>
              <span class="practice-settings-page__head-meta">记录谁在何时修改了练题设置</span>
            </div>
          </template>

          <p class="practice-settings-page__empty">
            配置变更留痕（开放 / 关闭题库、调整开关与题量等）将按时间倒序汇总展示；当前管理端暂未接入留痕数据源。
          </p>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-settings-page {
  &__columns {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: start;
    gap: 16px;
  }

  &__stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }

  @media (max-width: 991px) {
    &__columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__panel {
    min-width: 0;
    border-radius: $radius-lg;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  &__head-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  &__head-meta {
    font-size: 12.5px;
    color: $text-secondary;

    b {
      color: $color-primary;
      font-variant-numeric: tabular-nums;
    }
  }

  &__alert {
    margin-bottom: 16px;
  }

  &__danger {
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid $color-error-border;
    border-radius: $radius-sm;
    background: $color-error-bg;
    font-size: 13px;
    color: $color-error-text;
  }

  &__bulk {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }

  &__label {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  &__control {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  &__num {
    width: 200px;
  }

  &__select {
    width: 100%;
    max-width: 320px;
  }

  &__hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: $text-secondary;
  }

  &__inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__num-sm {
    width: 120px;
  }

  &__sep {
    color: $text-secondary;
  }

  &__unit {
    font-size: 13px;
    color: $text-secondary;
  }

  /* ---------- v3.2 设计稿区块（开放策略 / 访问链接 / 概览 / 关闭态 / 留痕） ---------- */

  /** 说明行：左标题 + 描述，右对齐一条状态指示 */
  &__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px dashed $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__row-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  &__row-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-body;
  }

  &__row-desc {
    font-size: 12.5px;
    line-height: 1.5;
    color: $text-secondary;

    b {
      font-weight: 600;
      color: $text-body;
      font-variant-numeric: tabular-nums;
    }
  }

  &__row-ind {
    flex: 0 0 auto;
    padding-top: 1px;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__footnote {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: $text-secondary;
  }

  /** 简版空态：虚线框 + 中性底 + 一句提醒，不用大插画 */
  &__empty {
    margin: 0;
    padding: 12px 14px;
    border: 1px dashed $line-strong;
    border-radius: $radius-sm;
    background: $color-table-head;
    font-size: 12.5px;
    line-height: 1.55;
    color: $text-secondary;
  }

  /** 访问链接：只读地址 + 复制 */
  &__url {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /** 只读取值（跟随既有配置） */
  &__value {
    font-size: 13px;
    font-weight: 600;
    color: $text-body;
    font-variant-numeric: tabular-nums;
  }

  /** 概览 kv 行 */
  &__kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__kv-k {
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__kv-v {
    font-size: 13px;
    font-weight: 600;
    color: $text-body;
    font-variant-numeric: tabular-nums;

    &--none {
      font-weight: 400;
      color: $text-disabled;
    }
  }
}
</style>
