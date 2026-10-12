<script setup lang="ts">
/**
 * 系统设置（管理员）。
 * 全局单例参数，按**标签页**分组：考试规则 / 账号安全 / 列表与导入 / 系统品牌 / 公网练题。
 *
 * 采用「本地表单草稿」模式：从 store 深拷贝到 form，只有点击「保存设置」才写回全局，
 * 避免编辑过程污染其它页面已读到的设置。
 *
 * 「公网练题」为二期增量：数据存于**独立的单行表** `practice_settings`（与 `system_settings` 分离），
 * 因此使用**独立的表单与独立保存按钮**（`PUT /api/settings/practice`），不与上方整体替换语义互相覆盖。
 * 顶部操作区随当前标签页切换：前 4 个标签为「恢复默认 / 保存设置」，练题标签为「保存练题配置」。
 */
import { onMounted, reactive, ref } from 'vue';
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormItemRule,
  type FormRules,
} from 'element-plus';
import { useSettingsStore } from '@/stores/settings';
import { getPracticeSettings, updatePracticeSettings } from '@/api/settings';
import {
  DAILY_BANK_SCOPE_OPTIONS,
  DAILY_COUNT_MAX,
  DAILY_COUNT_MIN,
  FAVORITE_LIMIT_MAX,
  FAVORITE_LIMIT_MIN,
  PRACTICE_SETTINGS_DEFAULTS,
} from '@/constants/practiceSettings';
import PageHeader from '@/components/common/PageHeader.vue';
import type { PracticeSettings, QuestionType, SystemSettings } from '@/types';

const settingsStore = useSettingsStore();

/** 题型多选项（每日一练题型范围） */
const TYPE_OPTIONS: Array<{ label: string; value: QuestionType }> = [
  { label: '单选题', value: 'single' },
  { label: '多选题', value: 'multiple' },
  { label: '判断题', value: 'judge' },
];

/* ------------------------------ 标签页 ------------------------------ */

type SettingsTab = 'exam' | 'account' | 'list' | 'brand' | 'practice';

/** 当前激活标签页 */
const activeTab = ref<SettingsTab>('exam');

/** 标签页名称（提示文案用） */
const TAB_LABEL: Record<SettingsTab, string> = {
  exam: '考试规则',
  account: '账号安全',
  list: '列表与导入',
  brand: '系统品牌',
  practice: '公网练题',
};

/** 表单字段 → 所属标签页（保存校验失败时自动定位到出错标签） */
const FIELD_TAB: Record<string, SettingsTab> = {
  examDefaultDuration: 'exam',
  examDefaultPassScore: 'exam',
  examDefaultMaxAttempts: 'exam',
  cheatCountThreshold: 'exam',
  cheatSecondsThreshold: 'exam',
  countdownWarningMinutes: 'exam',
  defaultPassword: 'account',
  minPasswordLength: 'account',
  defaultPageSize: 'list',
  importMaxRows: 'list',
  importMaxFileMb: 'list',
  systemName: 'brand',
  systemShortName: 'brand',
  loginSlogan: 'brand',
  copyright: 'brand',
};

/* ------------------------------ 表单草稿 ------------------------------ */
const form = reactive<SystemSettings>({ ...settingsStore.settings });
const formRef = ref<FormInstance>();
const saving = ref(false);

/** 数值型字段校验：范围 + 整数（按需） */
function numRules(
  label: string,
  min: number,
  max: number,
  opts: { unit?: string; integer?: boolean } = {},
): FormItemRule[] {
  const unit = opts.unit ?? '';
  const integer = opts.integer ?? true;
  const rangeMsg = `${label}必须为 ${min}~${max}${unit}`;
  return [
    {
      validator: (_rule, value, callback) => {
        if (value === undefined || value === null || value === '') {
          callback(new Error(rangeMsg));
          return;
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
          callback(new Error(rangeMsg));
          return;
        }
        if (integer && !Number.isInteger(n)) {
          callback(new Error(`${label}必须为整数`));
          return;
        }
        if (n < min || n > max) {
          callback(new Error(rangeMsg));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ];
}

/** 字符串型字段校验：必填（min>0）+ 长度上限 */
function strRules(label: string, min: number, max: number): FormItemRule[] {
  const list: FormItemRule[] = [];
  if (min > 0) {
    list.push({ required: true, message: `请输入${label}`, trigger: 'blur' });
    list.push({ min, max, message: `${label}长度需为 ${min}~${max} 个字符`, trigger: 'blur' });
  } else {
    list.push({ max, message: `${label}不能超过 ${max} 个字符`, trigger: 'blur' });
  }
  return list;
}

const rules: FormRules = {
  // 考试规则与防作弊
  examDefaultDuration: numRules('考试默认时长', 1, 600, { unit: ' 分钟' }),
  examDefaultPassScore: numRules('考试默认及格线', 1, 1000, { integer: false }),
  examDefaultMaxAttempts: numRules('考试默认答题次数', 1, 10, { unit: ' 次' }),
  cheatCountThreshold: numRules('切屏次数阈值', 1, 99, { unit: ' 次' }),
  cheatSecondsThreshold: numRules('切屏累计离开时长阈值', 5, 3600, { unit: ' 秒' }),
  countdownWarningMinutes: numRules('倒计时提醒阈值', 1, 60, { unit: ' 分钟' }),
  // 账号安全
  defaultPassword: strRules('默认密码', 6, 64),
  minPasswordLength: numRules('密码最小长度', 6, 32, { unit: ' 位' }),
  // 列表与导入
  defaultPageSize: numRules('列表默认每页条数', 1, 100, { unit: ' 条' }),
  importMaxRows: numRules('Excel 单次导入最大行数', 1, 50000, { unit: ' 行' }),
  importMaxFileMb: numRules('导入文件大小上限', 1, 50, { unit: ' MB' }),
  // 系统品牌
  systemName: strRules('系统全称', 1, 40),
  systemShortName: strRules('系统简称', 1, 40),
  loginSlogan: strRules('登录页标语', 0, 80),
  copyright: strRules('版权/页脚', 0, 120),
};

/* ------------------------------ 加载 ------------------------------ */
onMounted(async () => {
  await settingsStore.load(true);
  Object.assign(form, settingsStore.settings);
  void loadPractice();
});

/* ------------------------------ 公网练题配置（独立表单 + 独立保存） ------------------------------ */

/** 练题配置草稿（与上方系统设置完全解耦） */
const practiceForm = reactive<PracticeSettings>({ ...PRACTICE_SETTINGS_DEFAULTS });
const practiceLoading = ref(true);
const practiceSaving = ref(false);

/** 读取练题配置（失败回退默认值，不阻塞页面其余部分） */
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

/** 保存练题配置（走独立接口，不影响 system_settings） */
async function handleSavePractice(): Promise<void> {
  practiceSaving.value = true;
  try {
    const saved = await updatePracticeSettings({ ...practiceForm });
    Object.assign(practiceForm, saved);
    ElMessage.success('公网练题配置已保存，练题端即时生效');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    practiceSaving.value = false;
  }
}

/* ------------------------------ 保存 ------------------------------ */
async function handleSave(): Promise<void> {
  if (!formRef.value) return;

  // 使用回调式校验以拿到 invalidFields（用于自动定位出错标签页）
  const [valid, invalidFields] = await new Promise<
    [boolean, Record<string, unknown> | undefined]
  >((resolve) => {
    formRef.value!.validate((ok, fields) => {
      resolve([ok, fields as Record<string, unknown> | undefined]);
    });
  });

  if (!valid) {
    const firstField = Object.keys(invalidFields ?? {})[0];
    const tab = firstField ? FIELD_TAB[firstField] : undefined;
    if (tab && tab !== activeTab.value) {
      activeTab.value = tab;
      ElMessage.warning(`「${TAB_LABEL[tab]}」中有待修正项，请检查后重新保存`);
    }
    return;
  }

  saving.value = true;
  try {
    await settingsStore.save({ ...form });
    ElMessage.success('设置已保存，已全局生效');
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    saving.value = false;
  }
}

/* ------------------------------ 恢复默认 ------------------------------ */
async function handleReset(): Promise<void> {
  const ok = await ElMessageBox.confirm(
    '确定恢复为系统默认设置吗？恢复后需点击「保存设置」才会生效。',
    '恢复默认设置',
    { confirmButtonText: '恢复默认', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => true)
    .catch(() => false);
  if (!ok) return;

  Object.assign(form, settingsStore.resetToDefaults());
  formRef.value?.clearValidate();
}
</script>

<template>
  <div class="settings-page">
    <PageHeader title="系统设置" description="全局参数对所有用户实时生效，仅管理员可修改">
      <template #actions>
        <!-- 顶部操作区随标签页切换：练题配置走独立接口与独立保存 -->
        <template v-if="activeTab === 'practice'">
          <el-button type="primary" :loading="practiceSaving" @click="handleSavePractice">
            保存练题配置
          </el-button>
        </template>
        <template v-else>
          <el-button @click="handleReset">恢复默认</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">保存设置</el-button>
        </template>
      </template>
    </PageHeader>

    <div class="settings-page__panel">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="settings-page__form"
      >
        <el-tabs v-model="activeTab" class="settings-page__tabs">
          <!-- 1. 考试规则与防作弊 -->
          <el-tab-pane label="考试规则" name="exam">
            <el-alert
              class="settings-page__alert"
              type="info"
              show-icon
              :closable="false"
              title="切屏阈值与倒计时提醒会影响考生端作答体验"
            />
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="考试默认时长（分钟）" prop="examDefaultDuration">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.examDefaultDuration"
                      :min="1"
                      :max="600"
                      :step="5"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">新建考试时预设的考试时长，从开考时刻起算。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="考试默认及格线" prop="examDefaultPassScore">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.examDefaultPassScore"
                      :min="1"
                      :max="1000"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">新建考试时预设的及格分数线。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="考试默认答题次数（每人最多）" prop="examDefaultMaxAttempts">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.examDefaultMaxAttempts"
                      :min="1"
                      :max="10"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">新建考试时预设的每人最多作答次数。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="切屏异常：次数阈值（≥ 判为异常）" prop="cheatCountThreshold">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.cheatCountThreshold"
                      :min="1"
                      :max="99"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">
                      切屏次数达到该值会在考生端提示并计入异常，同时影响成绩报表判定。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="切屏异常：累计离开秒数阈值" prop="cheatSecondsThreshold">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.cheatSecondsThreshold"
                      :min="5"
                      :max="3600"
                      :step="5"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">单场考试累计离开页面的秒数达到该值即判为异常。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="倒计时提醒：剩余不足该分钟数时提醒" prop="countdownWarningMinutes">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.countdownWarningMinutes"
                      :min="1"
                      :max="60"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">考生端倒计时剩余不足该分钟数时进入提醒态。</p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <!-- 2. 账号安全 -->
          <el-tab-pane label="账号安全" name="account">
            <el-alert
              class="settings-page__alert"
              type="info"
              show-icon
              :closable="false"
              title="默认密码 / 密码长度会影响新建账号与改密校验"
            />
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="新建账号默认密码" prop="defaultPassword">
                  <div class="settings-page__control">
                    <el-input
                      v-model="form.defaultPassword"
                      type="password"
                      show-password
                      maxlength="64"
                      class="settings-page__input"
                    />
                    <p class="settings-page__hint">默认密码用于新建账号与重置密码。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="密码最小长度" prop="minPasswordLength">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.minPasswordLength"
                      :min="6"
                      :max="32"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">修改后立即对新建账号与改密校验生效。</p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <!-- 3. 列表与导入 -->
          <el-tab-pane label="列表与导入" name="list">
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="列表默认每页条数" prop="defaultPageSize">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.defaultPageSize"
                      :min="1"
                      :max="100"
                      :step="5"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">各列表页初始每页显示条数。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="Excel 单次导入最大行数" prop="importMaxRows">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.importMaxRows"
                      :min="1"
                      :max="50000"
                      :step="100"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">单次 Excel 导入允许的最大数据行数。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="Excel 导入文件大小上限（MB）" prop="importMaxFileMb">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.importMaxFileMb"
                      :min="1"
                      :max="50"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">Excel 导入文件的大小上限，单位为 MB。</p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <!-- 4. 系统品牌 -->
          <el-tab-pane label="系统品牌" name="brand">
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="系统全称（登录页品牌名）" prop="systemName">
                  <div class="settings-page__control">
                    <el-input
                      v-model="form.systemName"
                      maxlength="40"
                      show-word-limit
                      class="settings-page__input"
                    />
                    <p class="settings-page__hint">登录页展示的系统全称。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="系统简称（侧边栏名称）" prop="systemShortName">
                  <div class="settings-page__control">
                    <el-input
                      v-model="form.systemShortName"
                      maxlength="40"
                      show-word-limit
                      class="settings-page__input"
                    />
                    <p class="settings-page__hint">侧边栏顶部展示的系统简称。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="登录页标语" prop="loginSlogan">
                  <div class="settings-page__control">
                    <el-input
                      v-model="form.loginSlogan"
                      maxlength="80"
                      show-word-limit
                      class="settings-page__input"
                    />
                    <p class="settings-page__hint">展示在登录页品牌区，留空则不显示。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="登录页版权 / 页脚" prop="copyright">
                  <div class="settings-page__control">
                    <el-input
                      v-model="form.copyright"
                      maxlength="120"
                      show-word-limit
                      class="settings-page__input"
                    />
                    <p class="settings-page__hint">展示在登录页页脚，留空则不显示。</p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <!-- 5. 公网练题（二期；独立表单 + 独立保存，不与 system_settings 互相覆盖） -->
          <el-tab-pane label="公网练题" name="practice">
            <div v-loading="practiceLoading" class="settings-page__practice">
              <el-alert
                class="settings-page__alert"
                type="info"
                show-icon
                :closable="false"
                title="仅作用于公网练题端（题库练习、每日一练、收藏夹），不影响内网考试功能"
              />

              <el-row :gutter="24">
                <el-col :xs="24" :sm="24" :md="12">
                  <div class="settings-page__item">
                    <label class="settings-page__label">每日一练</label>
                    <div class="settings-page__control">
                      <el-switch
                        v-model="practiceForm.dailyEnabled"
                        active-text="开启"
                        inactive-text="关闭"
                      />
                      <p class="settings-page__hint">
                        关闭后练题端首页不再显示每日一练入口，且无法新建当日任务；已产生的打卡记录保留。
                      </p>
                    </div>
                  </div>
                </el-col>

                <el-col :xs="24" :sm="24" :md="12">
                  <div class="settings-page__item">
                    <label class="settings-page__label">每日题量（题）</label>
                    <div class="settings-page__control">
                      <el-input-number
                        v-model="practiceForm.dailyQuestionCount"
                        :min="DAILY_COUNT_MIN"
                        :max="DAILY_COUNT_MAX"
                        :step="1"
                        :disabled="!practiceForm.dailyEnabled"
                        class="settings-page__num"
                      />
                      <p class="settings-page__hint">
                        默认 10 题；开放题库题量不足时按实际题量生成。当日已生成的任务不受修改影响。
                      </p>
                    </div>
                  </div>
                </el-col>

                <el-col :xs="24" :sm="24" :md="12">
                  <div class="settings-page__item">
                    <label class="settings-page__label">题型范围</label>
                    <div class="settings-page__control">
                      <el-select
                        v-model="practiceForm.dailyTypes"
                        multiple
                        collapse-tags
                        placeholder="全部题型"
                        :disabled="!practiceForm.dailyEnabled"
                        class="settings-page__select"
                      >
                        <el-option
                          v-for="opt in TYPE_OPTIONS"
                          :key="opt.value"
                          :label="opt.label"
                          :value="opt.value"
                        />
                      </el-select>
                      <p class="settings-page__hint">留空表示包含全部题型。</p>
                    </div>
                  </div>
                </el-col>

                <el-col :xs="24" :sm="24" :md="12">
                  <div class="settings-page__item">
                    <label class="settings-page__label">抽题范围</label>
                    <div class="settings-page__control">
                      <el-radio-group
                        v-model="practiceForm.dailyBankScope"
                        :disabled="!practiceForm.dailyEnabled"
                      >
                        <el-radio
                          v-for="opt in DAILY_BANK_SCOPE_OPTIONS"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </el-radio>
                      </el-radio-group>
                      <p class="settings-page__hint">仅每日一练抽题时生效，题库练习不受影响。</p>
                    </div>
                  </div>
                </el-col>

                <el-col :xs="24" :sm="24" :md="12">
                  <div class="settings-page__item">
                    <label class="settings-page__label">收藏夹上限（题）</label>
                    <div class="settings-page__control">
                      <el-input-number
                        v-model="practiceForm.favoriteLimit"
                        :min="FAVORITE_LIMIT_MIN"
                        :max="FAVORITE_LIMIT_MAX"
                        :step="10"
                        class="settings-page__num"
                      />
                      <p class="settings-page__hint">调小仅限制新增收藏，不会删除已有收藏。</p>
                    </div>
                  </div>
                </el-col>
              </el-row>

              <p class="settings-page__practice-note">
                该配置保存在独立的练题配置表中，与「系统设置」分开读写，互不影响。
              </p>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-form>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.settings-page {
  /* 标签页容器：白底卡片，承载标签栏与内容区 */
  &__panel {
    padding: 8px 20px 20px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
  }

  &__tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 20px;
    }

    :deep(.el-tabs__item) {
      font-weight: 600;
    }

    /* 标签栏下划线跟随主题主色（与内网整体商务风一致） */
    :deep(.el-tabs__active-bar) {
      height: 2px;
    }
  }

  &__alert {
    margin-bottom: 18px;
  }

  &__practice {
    min-height: 220px;
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

  &__select {
    width: 100%;
    max-width: 320px;
  }

  &__practice-note {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: $text-disabled;
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

  &__input {
    max-width: 320px;
  }

  &__hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: $text-secondary;
  }

  &__form :deep(.el-form-item) {
    margin-bottom: 18px;
  }
}
</style>
