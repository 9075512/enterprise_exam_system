<script setup lang="ts">
/** 题库开放即时生效，其余练题配置统一保存。 */
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
const activeTab = ref('banks');
const savedSettings = ref('');
const practiceLoadError = ref(false);
const banksLoadError = ref(false);
const hasChanges = computed(() => savedSettings.value !== '' && JSON.stringify(practiceForm) !== savedSettings.value);
const bankSearch = ref('');
const bankFilter = ref('all');
const filteredBanks = computed(() => banks.value.filter((bank) =>
  bank.name.toLowerCase().includes(bankSearch.value.trim().toLowerCase()) &&
  (bankFilter.value === 'all' || bank.allowPractice === (bankFilter.value === 'open')),
));

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

/** 至少一个题库对外开放时，练题端显示已开放。 */
const practiceOpen = computed<boolean>(() => openBankCount.value > 0);
/** 练题入口与主系统同源，共用登录态。 */
const practiceUrl = computed<string>(() =>
  typeof window === 'undefined' ? '' : `${window.location.origin}/exam/practice`,
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
  practiceLoadError.value = false;
  try {
    Object.assign(practiceForm, await getPracticeSettings());
    savedSettings.value = JSON.stringify(practiceForm);
  } catch {
    practiceLoadError.value = true;
  } finally {
    practiceLoading.value = false;
  }
}

async function handleSavePractice(): Promise<void> {
  if (!hasChanges.value || practiceLoading.value || practiceLoadError.value) return;
  practiceSaving.value = true;
  try {
    const saved = await updatePracticeSettings({ ...practiceForm });
    Object.assign(practiceForm, saved);
    savedSettings.value = JSON.stringify(practiceForm);
    ElMessage.success('练题端配置已保存，练题端即时生效');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    practiceSaving.value = false;
  }
}

async function loadBanks(): Promise<void> {
  banksLoading.value = true;
  banksLoadError.value = false;
  try {
    banks.value = await listBanks();
  } catch {
    banksLoadError.value = true;
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
    // 受控开关在请求失败时保留原状态。
  } finally {
    bankSavingId.value = '';
  }
}

/** 批量：全部开放 / 全部关闭 */
async function setAllBanks(allowPractice: boolean): Promise<void> {
  const targets = banks.value.filter((b) => b.allowPractice !== allowPractice && (!allowPractice || b.questionCount > 0));
  if (targets.length === 0) {
    ElMessage.info(allowPractice ? '没有可开放的题库（空题库无法开放）' : '全部题库均已关闭');
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
    <PageHeader title="练题端设置" description="管理题库开放与学员练题体验">
      <template #actions>
        <span v-if="hasChanges" class="practice-settings-page__unsaved" role="status">有未保存的修改</span>
        <el-button type="primary" :loading="practiceSaving" :disabled="!hasChanges || practiceLoading || practiceLoadError" @click="handleSavePractice">保存配置</el-button>
      </template>
    </PageHeader>

    <section class="practice-settings-page__overview" aria-label="练题开放概况">
      <div class="practice-settings-page__status">
        <span class="practice-settings-page__eyebrow">练题端状态</span>
        <span class="practice-settings-page__status-value">
          <i class="practice-settings-page__dot" :class="{ 'is-open': practiceOpen && !banksLoadError && !banksLoading }" />
          {{ banksLoading ? '加载中' : banksLoadError ? '加载失败' : practiceOpen ? '已开放' : '未开放' }}
        </span>
      </div>
      <div class="practice-settings-page__metric">
        <span class="practice-settings-page__eyebrow">开放题库</span>
        <span class="practice-settings-page__metric-value">{{ banksLoading || banksLoadError ? '—' : openBankCount }}<small>/ {{ banksLoading || banksLoadError ? '—' : banks.length }} 个</small></span>
      </div>
      <div class="practice-settings-page__metric">
        <span class="practice-settings-page__eyebrow">可练题目</span>
        <span class="practice-settings-page__metric-value">{{ banksLoading || banksLoadError ? '—' : openQuestionCount.toLocaleString() }}<small>道</small></span>
      </div>
      <div class="practice-settings-page__entry">
        <label for="practice-entry" class="practice-settings-page__eyebrow">练题端地址</label>
        <div class="practice-settings-page__url">
          <el-input id="practice-entry" :model-value="practiceUrl" readonly aria-label="练题端地址" />
          <el-button @click="copyPracticeUrl">复制链接</el-button>
        </div>
      </div>
    </section>

    <div v-if="practiceLoadError" class="practice-settings-page__error" role="alert">
      配置加载失败，请重试后编辑。
      <el-button link type="primary" @click="loadPractice">重新加载</el-button>
    </div>

    <el-tabs v-model="activeTab" class="practice-settings-page__tabs">
      <el-tab-pane label="题库开放" name="banks">
        <section v-loading="banksLoading" class="practice-settings-page__section" aria-label="题库开放设置">
          <div class="practice-settings-page__section-head">
            <div><h3>题库开放</h3><p>开启后学员即可练习，修改即时生效。</p></div>
            <div class="practice-settings-page__bulk">
              <el-button :disabled="banksLoading || banksLoadError || Boolean(bankSavingId) || bankBatchSaving" @click="setAllBanks(true)">全部开放</el-button>
              <el-button :disabled="banksLoading || banksLoadError || Boolean(bankSavingId) || bankBatchSaving" @click="setAllBanks(false)">全部关闭</el-button>
            </div>
          </div>
          <el-alert v-if="noOpenBank && !banksLoadError" class="practice-settings-page__alert" type="warning" show-icon :closable="false" title="尚未开放题库，学员暂时无法练题。请至少开放一个有题目的题库。" />
          <div class="practice-settings-page__toolbar">
            <el-input v-model="bankSearch" placeholder="搜索题库名称" clearable aria-label="搜索题库名称" />
            <el-select v-model="bankFilter" aria-label="筛选开放状态">
              <el-option label="全部状态" value="all" />
              <el-option label="已开放" value="open" />
              <el-option label="未开放" value="closed" />
            </el-select>
            <el-button text :disabled="banksLoading || bankBatchSaving || Boolean(bankSavingId)" @click="loadBanks">刷新列表</el-button>
          </div>
          <div v-if="banksLoadError" class="practice-settings-page__error" role="alert">题库加载失败，请点击刷新列表重试。</div>
          <template v-else>
<el-table :data="filteredBanks" row-key="id" :empty-text="banks.length ? '没有匹配的题库' : '暂无题库，请先在题库管理中创建'">
            <el-table-column prop="name" label="题库名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="questionCount" label="题数" width="90" align="center" />
            <el-table-column label="开放练题" width="150" align="center">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.allowPractice"
                  :loading="bankSavingId === row.id"
                  :disabled="Boolean(bankSavingId) || bankBatchSaving || (row.questionCount === 0 && !row.allowPractice)"
                  :aria-label="`${row.name}开放练题`"
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
            <p class="practice-settings-page__table-note">共 {{ filteredBanks.length }} 个题库<span v-if="bankSearch || bankFilter !== 'all'">（总计 {{ banks.length }} 个）</span> · 空题库无法开放</p>
          </template>
        </section>
      </el-tab-pane>
      <el-tab-pane label="每日一练" name="daily">
        <section v-loading="practiceLoading" class="practice-settings-page__section">
          <div class="practice-settings-page__section-head"><div><h3>每日一练</h3><p>设置每日任务的题量、题型与生成规则，保存后生效。</p></div></div>
          <fieldset :disabled="practiceLoadError || practiceSaving" class="practice-settings-page__fields">
<el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">每日一练</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.dailyEnabled" aria-label="每日一练" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">
                    关闭后隐藏每日一练入口，已有打卡记录保留。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">每日题量（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.dailyQuestionCount" aria-label="每日题量"
                    :min="DAILY_COUNT_MIN"
                    :max="DAILY_COUNT_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    题目不足时按实际题量生成，已生成的当日任务不变。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">题型范围</label>
                <div class="practice-settings-page__control">
                  <el-select
                    v-model="practiceForm.dailyTypes" aria-label="题型范围"
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
                  <el-radio-group v-model="practiceForm.dailyBankScope" aria-label="抽题范围" :disabled="!practiceForm.dailyEnabled">
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
                    v-model="practiceForm.dailyResetHour" aria-label="每日重置时点"
                    :min="DAILY_RESET_HOUR_MIN"
                    :max="DAILY_RESET_HOUR_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    每日任务与打卡日期在此时点重置，例如 4 点前仍计入前一天。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">最少抽题数（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.dailyMinQuestionCount" aria-label="最少抽题数"
                    :min="DAILY_MIN_COUNT_MIN"
                    :max="DAILY_MIN_COUNT_MAX"
                    :step="1"
                    :disabled="!practiceForm.dailyEnabled"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    可用题目少于此数量时，不生成每日任务。
                  </p>
                </div>
              </div>
            </el-col>


          </el-row>
          </fieldset>
        </section>
      </el-tab-pane>
      <el-tab-pane label="练题规则" name="rules">
        <section v-loading="practiceLoading" class="practice-settings-page__section">
          <div class="practice-settings-page__section-head"><div><h3>练题规则</h3><p>设置练习方式、题量与作答反馈，保存后生效。</p></div></div>
          <fieldset :disabled="practiceLoadError || practiceSaving" class="practice-settings-page__fields">
<el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">默认练题方式</label>
                <div class="practice-settings-page__control">
                  <el-radio-group v-model="practiceForm.defaultPracticeMode" aria-label="默认练题方式">
                    <el-radio v-for="opt in DEFAULT_PRACTICE_MODE_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </el-radio>
                  </el-radio-group>
                  <p class="practice-settings-page__hint">
                    学员开始练习时默认使用此方式，也可自行切换。
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
                      v-model="practiceForm.sessionMinCount" aria-label="单次练习题量下限"
                      :min="SESSION_COUNT_MIN"
                      :max="SESSION_COUNT_MAX"
                      :step="1"
                      class="practice-settings-page__num-sm"
                    />
                    <span class="practice-settings-page__sep">~</span>
                    <el-input-number
                      v-model="practiceForm.sessionMaxCount" aria-label="单次练习题量上限"
                      :min="SESSION_COUNT_MIN"
                      :max="SESSION_COUNT_MAX"
                      :step="1"
                      class="practice-settings-page__num-sm"
                    />
                    <span class="practice-settings-page__unit">题</span>
                  </div>
                  <p class="practice-settings-page__hint">
                    学员可在此范围内选择题量，题目不足时按实际数量生成。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">作答后展示正确答案</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.showAnswer" aria-label="作答后展示正确答案" active-text="展示" inactive-text="隐藏" />
                  <p class="practice-settings-page__hint">
                    关闭后仅提示作答正误，不展示正确答案。
                  </p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">作答后展示解析</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.showAnalysis" aria-label="作答后展示解析" active-text="展示" inactive-text="隐藏" />
                  <p class="practice-settings-page__hint">控制作答后是否展示题目解析。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">错题本自动移除阈值</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.wrongAutoRemoveStreak" aria-label="错题本自动移除阈值"
                    :min="WRONG_AUTO_REMOVE_MIN"
                    :max="WRONG_AUTO_REMOVE_MAX"
                    :step="1"
                    class="practice-settings-page__num"
                  />
                  <p class="practice-settings-page__hint">
                    连续答对指定次数后自动移除；设为 0 则仅手动移除。
                  </p>
                </div>
              </div>
            </el-col>
          </el-row>
          </fieldset>
        </section>
      </el-tab-pane>
      <el-tab-pane label="功能入口" name="features">
        <section v-loading="practiceLoading" class="practice-settings-page__section">
          <div class="practice-settings-page__section-head"><div><h3>功能入口</h3><p>选择学员可使用的功能，保存后生效。</p></div></div>
          <fieldset :disabled="practiceLoadError || practiceSaving" class="practice-settings-page__fields">
<el-row :gutter="24">
            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">学习报告</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.reportEnabled" aria-label="学习报告" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后练题端底部「报告」入口隐藏。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">错题本</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.wrongBookEnabled" aria-label="错题本" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后隐藏错题本入口。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">收藏夹</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.favoriteEnabled" aria-label="收藏夹" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后作答页收藏按钮与收藏夹入口隐藏。</p>
                </div>
              </div>
            </el-col>

            <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">打卡与成就</label>
                <div class="practice-settings-page__control">
                  <el-switch v-model="practiceForm.achievementEnabled" aria-label="打卡与成就" active-text="开启" inactive-text="关闭" />
                  <p class="practice-settings-page__hint">关闭后隐藏连续打卡与成就徽章。</p>
                </div>
              </div>
            </el-col>
                      <el-col :xs="24" :sm="24" :md="12">
              <div class="practice-settings-page__item">
                <label class="practice-settings-page__label">收藏夹上限（题）</label>
                <div class="practice-settings-page__control">
                  <el-input-number
                    v-model="practiceForm.favoriteLimit" aria-label="收藏夹上限"
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
          </fieldset>
        </section>
      </el-tab-pane>
    </el-tabs>
    <p class="practice-settings-page__page-note">设置仅作用于练题模块，不影响考试。练题数据可在「练题监控」中查看。</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-settings-page {
  container-type: inline-size;
  &__overview {
    display: grid;
    grid-template-columns: auto auto auto minmax(260px, 1fr);
    align-items: center;
    gap: 24px;
    padding: 22px 24px;
    margin-bottom: 22px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
  }
  &__status, &__metric, &__entry {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  &__metric { border-left: 1px solid $border-color; padding-left: 24px; }
  &__entry { margin-left: 12px; padding-left: 24px; border-left: 1px solid $border-color; }
  &__eyebrow { color: $text-secondary; font-size: 12px; }
  &__status-value {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 17px;
    color: $text-primary;
    min-height: 28px;
  }
  &__dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: $text-disabled;
    &.is-open { background: $color-success; }
  }
  &__metric-value {
    font-size: 24px;
    line-height: 28px;
    font-weight: 650;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
    small { margin-left: 8px; color: $text-secondary; font-size: 12px; font-weight: 400; }
  }
  &__url {
    display: flex;
    align-items: center;
    gap: 8px;
    :deep(.el-input) { min-width: 0; }
  }
  &__unsaved { color: $color-warning-text; font-size: 12px; }
  &__tabs {
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    :deep(.el-tabs__header) { margin: 0; padding: 0 24px; }
    :deep(.el-tabs__nav-wrap::after) { height: 1px; background: $border-color; }
    :deep(.el-tabs__item) { height: 54px; font-size: 14px; }
  }
  &__section { padding: 24px; min-height: 300px; }
  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
    h3 { margin: 0 0 6px; font-size: 16px; color: $text-primary; }
    p { margin: 0; font-size: 12px; color: $text-secondary; line-height: 1.6; }
  }
  &__bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    :deep(.el-button + .el-button) { margin-left: 0; }
  }
  &__toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 18px;
    > :deep(.el-input) { width: 260px; max-width: 100%; }
    > :deep(.el-select) { width: 140px; }
    > :deep(.el-button) { margin-left: auto; }
  }
  &__alert { margin-bottom: 20px; }
  &__error {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 16px;
    border-radius: $radius-sm;
    color: $color-error-text;
    background: $color-error-bg;
    font-size: 13px;
  }
  &__table-note { margin: 16px 0 0; font-size: 12px; color: $text-secondary; }
  &__fields {
    padding: 0;
    margin: 0;
    border: 0;
    min-width: 0;
    &:disabled { pointer-events: none; opacity: .65; }
  }
  &__item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 0;
    border-top: 1px solid $border-color;
    height: 100%;
    box-sizing: border-box;
  }
  &__label { font-size: 13px; font-weight: 600; color: $text-primary; }
  &__control {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    :deep(.el-radio-group) { display: flex; flex-direction: column; align-items: flex-start; max-width: 100%; }
    :deep(.el-radio) { margin-right: 0; height: auto; min-height: 32px; white-space: normal; max-width: 100%; }
    :deep(.el-radio__label) { white-space: normal; overflow-wrap: anywhere; line-height: 1.6; }
  }
  &__num { width: 180px; max-width: 100%; }
  &__select { width: 100%; max-width: 320px; }
  &__hint { margin: 0; font-size: 12px; line-height: 1.65; color: $text-secondary; max-width: 460px; }
  &__inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  &__num-sm { width: 120px; }
  &__sep, &__unit { color: $text-secondary; font-size: 13px; }
  &__page-note { margin: 16px 0 0; font-size: 12px; color: $text-secondary; line-height: 1.6; }
  @media (max-width: 1199px) {
    &__overview { grid-template-columns: 1fr 1fr 1fr; }
    &__entry { grid-column: 1 / -1; margin: 0; padding: 16px 0 0; border-left: 0; border-top: 1px solid $border-color; }
  }
  @media (max-width: 600px) {
    &__overview { padding: 18px 16px; gap: 16px; }
    &__metric { padding-left: 12px; }
    &__status-value { font-size: 14px; }
    &__metric-value { font-size: 20px; small { margin-left: 4px; } }
    &__section { padding: 20px 16px; }
    &__tabs :deep(.el-tabs__header) { padding: 0 16px; }
    &__toolbar { gap: 8px; > :deep(.el-input) { width: 100%; } }
    &__url :deep(.el-button) { padding: 8px 10px; }
  }
}

@container (max-width: 500px) {
  .practice-settings-page {
    &__overview { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    &__status { grid-column: 1 / -1; }
    &__metric { padding-left: 0; border-left: 0; }
    &__metric-value { white-space: nowrap; }
    &__url { flex-wrap: wrap; }
    &__url :deep(.el-input) { flex-basis: 100%; }
  }
}
</style>
