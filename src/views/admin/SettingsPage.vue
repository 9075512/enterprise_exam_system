<script setup lang="ts">
/**
 * 系统设置（管理员）。
 * 全局单例参数，按**标签页**分组：考试规则 / 账号安全 / 列表与导入 / 网站信息 / 消息通知。
 *
 * 采用「本地表单草稿」模式：从 store 深拷贝到 form，只有点击「保存设置」才写回全局，
 * 避免编辑过程污染其它页面已读到的设置。
 *
 * 注：练题端配置已拆为独立菜单「练题端设置」（独立单行表 practice_settings）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormItemRule,
  type FormRules,
} from 'element-plus';
import { NOTIFY_TEMPLATES_DEFAULT, NOTIFY_TEMPLATE_META } from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import PageHeader from '@/components/common/PageHeader.vue';
import type { NotifyTemplateKey, SystemSettings } from '@/types';

const settingsStore = useSettingsStore();

/* ------------------------------ 标签页 ------------------------------ */

type SettingsTab = 'exam' | 'account' | 'list' | 'brand' | 'notify';

/** 当前激活标签页 */
const activeTab = ref<SettingsTab>('exam');

/** 标签页名称（提示文案用） */
const TAB_LABEL: Record<SettingsTab, string> = {
  exam: '考试规则',
  account: '账号安全',
  list: '列表与导入',
  brand: '网站信息',
  notify: '消息通知',
};

/** 表单字段 → 所属标签页（保存校验失败时自动定位到出错标签） */
const FIELD_TAB: Record<string, SettingsTab> = {
  examDefaultDuration: 'exam',
  examDefaultPassScore: 'exam',
  examDefaultMaxAttempts: 'exam',
  cheatCountThreshold: 'exam',
  cheatSecondsThreshold: 'exam',
  cheatAutoSubmitEnabled: 'exam',
  cheatWatermarkEnabled: 'exam',
  cheatCopyGuardEnabled: 'exam',
  shuffleDefaultEnabled: 'exam',
  shuffleOptionsDefault: 'exam',
  retakeDefaultEnabled: 'exam',
  appealEnabled: 'exam',
  appealWindowDays: 'exam',
  countdownWarningMinutes: 'exam',
  defaultPassword: 'account',
  minPasswordLength: 'account',
  loginLockEnabled: 'account',
  loginMaxFails: 'account',
  loginLockMinutes: 'account',
  loginCaptchaAfterFails: 'account',
  passwordRequireUpper: 'account',
  passwordRequireLower: 'account',
  passwordRequireDigit: 'account',
  passwordRequireSymbol: 'account',
  passwordExpireDays: 'account',
  twoFactorAvailable: 'account',
  defaultPageSize: 'list',
  importMaxRows: 'list',
  importMaxFileMb: 'list',
  archiveRetentionDays: 'list',
  notifyTemplates: 'notify',
  systemName: 'brand',
  systemShortName: 'brand',
  loginSlogan: 'brand',
  copyright: 'brand',
  notifySiteEnabled: 'notify',
  notifyEmailEnabled: 'notify',
  notifyOnPublish: 'notify',
  notifyOnResult: 'notify',
  notifyOnRetake: 'notify',
  smtpHost: 'notify',
  smtpPort: 'notify',
  smtpSecure: 'notify',
  smtpUser: 'notify',
  smtpPass: 'notify',
  smtpFrom: 'notify',
};

/* ------------------------------ 表单草稿 ------------------------------ */
/** 深拷贝通知模板（避免编辑草稿时污染全局 store）。 */
function cloneTemplates(t: SystemSettings['notifyTemplates']): SystemSettings['notifyTemplates'] {
  const src = t ?? NOTIFY_TEMPLATES_DEFAULT;
  return Object.fromEntries(
    Object.entries(src).map(([k, v]) => [k, { ...v }]),
  ) as SystemSettings['notifyTemplates'];
}

const form = reactive<SystemSettings>({
  ...settingsStore.settings,
  notifyTemplates: cloneTemplates(settingsStore.settings.notifyTemplates),
});
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
  loginMaxFails: numRules('登录失败锁定阈值', 1, 20, { unit: ' 次' }),
  loginLockMinutes: numRules('登录锁定时长', 1, 1440, { unit: ' 分钟' }),
  loginCaptchaAfterFails: numRules('验证码触发次数', 1, 20, { unit: ' 次' }),
  passwordExpireDays: numRules('密码有效期', 0, 3650, { unit: ' 天' }),
  // 列表与导入
  defaultPageSize: numRules('列表默认每页条数', 1, 100, { unit: ' 条' }),
  importMaxRows: numRules('Excel 单次导入最大行数', 1, 50000, { unit: ' 行' }),
  importMaxFileMb: numRules('导入文件大小上限', 1, 50, { unit: ' MB' }),
  archiveRetentionDays: numRules('成绩归档保留天数', 0, 3650, { unit: ' 天' }),
  // 系统品牌
  systemName: strRules('系统全称', 1, 40),
  systemShortName: strRules('系统简称', 1, 40),
  loginSlogan: strRules('登录页标语', 0, 80),
  copyright: strRules('版权/页脚', 0, 120),
  // 消息通知（SMTP）
  smtpHost: strRules('SMTP 服务器地址', 0, 120),
  smtpPort: numRules('SMTP 端口', 1, 65535, { unit: '' }),
  smtpUser: strRules('SMTP 账号', 0, 120),
  smtpPass: strRules('SMTP 授权码', 0, 200),
  smtpFrom: strRules('发件人地址', 0, 120),
  // 通知模板（v1.7④ S3：标题 ≤120、正文 ≤500；逐事件校验）
  ...Object.fromEntries(
    NOTIFY_TEMPLATE_META.flatMap((m) => [
      [`notifyTemplates.${m.key}.title`, strRules(`${m.label}标题`, 1, 120)],
      [`notifyTemplates.${m.key}.content`, strRules(`${m.label}正文`, 1, 500)],
    ]),
  ),
};

/* ------------------------------ 通知模板编辑（v1.7④ S3） ------------------------------ */
/** 当前编辑的事件模板 */
const tplKey = ref<NotifyTemplateKey>('examPublish');

/** 当前事件元信息（标签 + 可用变量） */
const tplMeta = computed(() => NOTIFY_TEMPLATE_META.find((m) => m.key === tplKey.value)!);

/** 可用变量展示文本（在 script 内拼接，避免模板中 `}}` 触发解析错误） */
const tplVarsText = computed(() => tplMeta.value.vars.map((v) => '{' + v + '}').join('、'));

/** 当前事件的模板（读写 form.notifyTemplates） */
const tpl = computed(() => form.notifyTemplates[tplKey.value]);

/** 重置当前事件模板为内置默认文案 */
function resetTpl(): void {
  form.notifyTemplates[tplKey.value] = { ...NOTIFY_TEMPLATES_DEFAULT[tplKey.value] };
  ElMessage.success('已恢复该事件的默认文案');
}

/* ------------------------------ 加载 ------------------------------ */
onMounted(async () => {
  await settingsStore.load(true);
  Object.assign(form, settingsStore.settings, {
    notifyTemplates: cloneTemplates(settingsStore.settings.notifyTemplates),
  });
});

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
        <el-button @click="handleReset">恢复默认</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存设置</el-button>
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
                <el-form-item label="切屏异常：自动强制交卷" prop="cheatAutoSubmitEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.cheatAutoSubmitEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后，考生切屏次数或累计离开秒数达到上方阈值时将自动强制交卷；关闭则仅记录异常。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="答题页浮水印（考生姓名/账号）" prop="cheatWatermarkEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.cheatWatermarkEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后答题页铺陈考生姓名与账号的淡浮水印，防止截屏/拍照泄题。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="答题页复制/粘贴限制" prop="cheatCopyGuardEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.cheatCopyGuardEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后答题页禁用复制、右键菜单与长按选择，降低题目内容外泄风险。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="人手一卷（默认）" prop="shuffleDefaultEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.shuffleDefaultEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后，新建考试默认人手一卷（题目顺序随机）；可在单场考试中单独覆盖。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="选项乱序（默认）" prop="shuffleOptionsDefault">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.shuffleOptionsDefault"
                      active-text="开启"
                      inactive-text="关闭"
                      :disabled="!form.shuffleDefaultEnabled"
                    />
                    <p class="settings-page__hint">
                      人手一卷开启时，进一步打乱每道题的选项顺序（同步调整正确答案）。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="补考申请（默认）" prop="retakeDefaultEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.retakeDefaultEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后，新建考试默认开放补考申请；补考仅限答题次数为 1 次的考试，且需管理员审批。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="成绩复核（默认）" prop="appealEnabled">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.appealEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后，新建考试默认开放成绩复核；考生可在时限内对已出成绩申请复核，管理员可改分。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="成绩复核时限（天）" prop="appealWindowDays">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.appealWindowDays"
                      :min="0"
                      :max="365"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">自交卷起算；填 0 表示不限时限。</p>
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
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="登录失败锁定" prop="loginLockEnabled">
                  <div class="settings-page__control">
                    <el-switch v-model="form.loginLockEnabled" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">关闭后连续登录失败不锁定账号；开启后按下方阈值锁定。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="连续失败锁定阈值（次）" prop="loginMaxFails">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.loginMaxFails"
                      :min="1"
                      :max="20"
                      :step="1"
                      :disabled="!form.loginLockEnabled"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">连续登录失败达到该次数后锁定账号。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="锁定时长（分钟）" prop="loginLockMinutes">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.loginLockMinutes"
                      :min="1"
                      :max="1440"
                      :step="5"
                      :disabled="!form.loginLockEnabled"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">锁定期间该账号无法登录，达到时长后自动解锁。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="验证码触发次数" prop="loginCaptchaAfterFails">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.loginCaptchaAfterFails"
                      :min="1"
                      :max="20"
                      :step="1"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">
                      同一账号连续登录失败达到该次数后，登录需填写图形验证码。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="24">
                <el-form-item label="密码复杂度要求">
                  <div class="settings-page__control">
                    <div class="settings-page__switch-row">
                      <el-checkbox v-model="form.passwordRequireUpper">大写字母</el-checkbox>
                      <el-checkbox v-model="form.passwordRequireLower">小写字母</el-checkbox>
                      <el-checkbox v-model="form.passwordRequireDigit">数字</el-checkbox>
                      <el-checkbox v-model="form.passwordRequireSymbol">符号</el-checkbox>
                    </div>
                    <p class="settings-page__hint">
                      勾选项为用户自助改密时的强制要求（管理员重置为默认密码不受限）。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="密码有效期（天）" prop="passwordExpireDays">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.passwordExpireDays"
                      :min="0"
                      :max="3650"
                      :step="30"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">0 = 不启用；超期用户登录时会收到修改密码提示。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="两步验证">
                  <div class="settings-page__control">
                    <el-switch
                      v-model="form.twoFactorAvailable"
                      active-text="允许开启"
                      inactive-text="关闭"
                    />
                    <p class="settings-page__hint">
                      开启后用户可在「账号安全」中绑定 TOTP 验证器，登录需二次校验验证码。
                    </p>
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

            <el-row :gutter="20">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="成绩归档保留天数（天）" prop="archiveRetentionDays">
                  <div class="settings-page__control">
                    <el-input-number
                      v-model="form.archiveRetentionDays"
                      :min="0"
                      :max="3650"
                      :step="30"
                      class="settings-page__num"
                    />
                    <p class="settings-page__hint">
                      0 表示不启用自动归档；手动归档在「系统维护」页执行（未配置时以 365 天为默认保留期）。
                    </p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <!-- 4. 网站信息 -->
          <el-tab-pane label="网站信息" name="brand">
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

          <!-- 5. 消息通知 -->
          <el-tab-pane label="消息通知" name="notify">
            <el-alert
              class="settings-page__alert"
              type="info"
              show-icon
              :closable="false"
              title="站内信零依赖；邮件需配置 SMTP。各事件可独立开关，邮件发送失败自动降级为仅站内信"
            />
            <el-row :gutter="24">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="站内信通知" prop="notifySiteEnabled">
                  <div class="settings-page__control">
                    <el-switch v-model="form.notifySiteEnabled" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">关闭后不再写入站内信（消息中心）。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="邮件通知" prop="notifyEmailEnabled">
                  <div class="settings-page__control">
                    <el-switch v-model="form.notifyEmailEnabled" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">需在下方配置 SMTP；未配置或发送失败自动降级为仅站内信。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="考试发布通知" prop="notifyOnPublish">
                  <div class="settings-page__control">
                    <el-switch v-model="form.notifyOnPublish" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">新建考试时通知参与科室的考生。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="成绩通知" prop="notifyOnResult">
                  <div class="settings-page__control">
                    <el-switch v-model="form.notifyOnResult" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">交卷出成绩后通知考生本人。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="补考审批通知" prop="notifyOnRetake">
                  <div class="settings-page__control">
                    <el-switch v-model="form.notifyOnRetake" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">补考申请通过/驳回后通知考生本人。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="SMTP 服务器地址" prop="smtpHost">
                  <div class="settings-page__control">
                    <el-input v-model="form.smtpHost" maxlength="120" placeholder="如 smtp.exmail.qq.com" class="settings-page__input" />
                    <p class="settings-page__hint">留空表示未配置邮件发送。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="SMTP 端口" prop="smtpPort">
                  <div class="settings-page__control">
                    <el-input-number v-model="form.smtpPort" :min="1" :max="65535" :step="1" class="settings-page__num" />
                    <p class="settings-page__hint">默认 465（SSL）。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="SMTP 加密（SSL）" prop="smtpSecure">
                  <div class="settings-page__control">
                    <el-switch v-model="form.smtpSecure" active-text="开启" inactive-text="关闭" />
                    <p class="settings-page__hint">465 端口建议开启，25 端口建议关闭。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="SMTP 账号" prop="smtpUser">
                  <div class="settings-page__control">
                    <el-input v-model="form.smtpUser" maxlength="120" class="settings-page__input" />
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="SMTP 授权码 / 密码" prop="smtpPass">
                  <div class="settings-page__control">
                    <el-input v-model="form.smtpPass" type="password" show-password maxlength="200" class="settings-page__input" />
                    <p class="settings-page__hint">仅管理员可见；保存后接口不回传明文，请勿重复提交空值覆盖。</p>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="发件人地址" prop="smtpFrom">
                  <div class="settings-page__control">
                    <el-input v-model="form.smtpFrom" maxlength="120" placeholder="如 noreply@example.com" class="settings-page__input" />
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <div class="settings-page__section-title">通知文案模板</div>
            <el-alert type="info" :closable="false" show-icon class="settings-page__hint-block">
              站内信与邮件的标题/正文均可自定义；正文支持 <code>{变量}</code> 占位，未提供的变量将被替换为空。
            </el-alert>

            <el-row :gutter="20">
              <el-col :xs="24" :sm="24" :md="12">
                <el-form-item label="通知事件">
                  <div class="settings-page__control">
                    <el-select v-model="tplKey" class="settings-page__input">
                      <el-option v-for="m in NOTIFY_TEMPLATE_META" :key="m.key" :label="m.label" :value="m.key" />
                    </el-select>
                    <p class="settings-page__hint">
                      可用变量：{{ tplVarsText }}
                    </p>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="通知标题" :prop="`notifyTemplates.${tplKey}.title`">
              <el-input v-model="tpl.title" maxlength="120" show-word-limit class="settings-page__input" />
            </el-form-item>

            <el-form-item label="通知正文" :prop="`notifyTemplates.${tplKey}.content`">
              <el-input
                v-model="tpl.content"
                type="textarea"
                :rows="3"
                maxlength="500"
                show-word-limit
                class="settings-page__input"
              />
            </el-form-item>

            <el-form-item label=" ">
              <el-button @click="resetTpl">恢复该事件默认文案</el-button>
            </el-form-item>
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

  &__switch-row {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
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

  /* 通知模板区（v1.7④ S3） */
  &__section-title {
    margin: 18px 0 10px;
    padding-left: 9px;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    border-left: 3px solid $color-primary;
  }

  &__hint-block {
    margin-bottom: 14px;

    code {
      padding: 0 3px;
      font-size: 12px;
      color: $color-primary-dark;
      background: $color-primary-soft;
      border-radius: 3px;
    }
  }

  &__form :deep(.el-form-item) {
    margin-bottom: 18px;
  }
}
</style>
