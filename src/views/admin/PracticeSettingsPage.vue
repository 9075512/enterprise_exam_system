<script setup lang="ts">
/**
 * 练题端设置（v1.5，独立菜单；原「系统设置 → 公网练题」拆出）。
 * 数据存于独立单行表 `practice_settings`，与 system_settings 分离，独立保存。
 */
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
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
import type { PracticeSettings, QuestionType } from '@/types';

/** 题型多选项（每日一练题型范围） */
const TYPE_OPTIONS: Array<{ label: string; value: QuestionType }> = [
  { label: '单选题', value: 'single' },
  { label: '多选题', value: 'multiple' },
  { label: '判断题', value: 'judge' },
];

const practiceForm = reactive<PracticeSettings>({ ...PRACTICE_SETTINGS_DEFAULTS });
const practiceLoading = ref(true);
const practiceSaving = ref(false);

onMounted(() => {
  void loadPractice();
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
</script>

<template>
  <div class="practice-settings-page">
    <PageHeader title="练题端设置" description="仅作用于公网练题端（题库练习、每日一练、收藏夹），不影响内网考试功能">
      <template #actions>
        <el-button type="primary" :loading="practiceSaving" @click="handleSavePractice">
          保存练题配置
        </el-button>
      </template>
    </PageHeader>

    <el-card v-loading="practiceLoading" class="practice-settings-page__panel" shadow="never">
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
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.practice-settings-page {
  &__panel {
    border-radius: $radius-lg;
  }

  &__alert {
    margin-bottom: 20px;
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
}
</style>
