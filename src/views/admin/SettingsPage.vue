<script setup lang="ts">
/**
 * 系统设置（管理员）。
 * 全局单例参数，按**配置域**分类，每个域渲染一张卡片（卡头即域名）：
 *   1) 通知与模板     —— 通知渠道与事件 / SMTP / 文案模板
 *   2) 作答与防作弊   —— 防作弊检测 / 作答呈现与提醒 / 监考推送与简答图片
 *   3) 数据与归档     —— 列表与导入 / 数据保留与自动归档
 *   4) 账号与安全     —— 密码策略 / 登录防护与两步验证
 *   5) 考试默认值     —— 新建考试时带入的时长/及格线/答题次数
 *   6) 阅卷与复核     —— 补考申请、成绩复核与时限
 *   7) 网站与品牌     —— 品牌信息
 *
 * 设计约定（v3.1 方向 C）：
 * - 顶部用 el-tabs 真实页签切换 7 个配置域（2026-10-15 由锚点滚动改为 tab，用户决策）；
 * - 每张卡顶部有一句话说明，避免「不知道这块管什么」；
 * - 同一域内超过 6 项的字段按业务子域再分组（分组小标题 + 一句话补充）；
 * - 控件宽度、间距、提示文案统一（`settings-page__*`），不再混装。
 *
 * 采用「本地表单草稿」模式：从 store 深拷贝到 form，只有点击「保存设置」才写回全局，
 * 避免编辑过程污染其它页面已读到的设置。
 *
 * 注：练题端配置已拆为独立菜单「练题端设置」（独立单行表 practice_settings）。
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormItemRule,
  type FormRules,
} from 'element-plus';
import { NOTIFY_TEMPLATES_DEFAULT, NOTIFY_TEMPLATE_META } from '@/constants';
import { useSettingsStore } from '@/stores/settings';
import { focusFirstFormError } from '@/composables/useFormFocus';
import { useStickyActionBar } from '@/composables/useStickyActionBar';
import PageHeader from '@/components/common/PageHeader.vue';
import type { NotifyTemplateKey, SystemSettings } from '@/types';

const settingsStore = useSettingsStore();

/* ------------------------------ 配置域 ------------------------------ */

type SettingsTab = 'exam' | 'anti' | 'grading' | 'account' | 'notify' | 'data' | 'brand';

/** 当前激活页签（真实 tab 切换；保存校验失败时自动定位到出错域） */
const activeTab = ref<SettingsTab>('exam');

/** 配置域名称（卡头文案 + 定位错误提示用） */
const TAB_LABEL: Record<SettingsTab, string> = {
  exam: '考试默认值',
  anti: '作答与防作弊',
  grading: '阅卷与复核',
  account: '账号与安全',
  notify: '通知与模板',
  data: '数据与归档',
  brand: '网站与品牌',
};

/** 配置域一句话说明（渲染在各卡顶部） */
const TAB_DESC: Record<SettingsTab, string> = {
  exam: '新建考试时自动带入的默认时长、及格线与每人答题次数；已发布的考试不受影响。',
  anti: '作答过程中的防作弊检测、作答呈现与监考推送；阈值会同时影响考试端提示与成绩报表的异常判定。',
  grading: '补考申请与成绩复核的默认开放策略；未及格且答题次数用完后可申请补考，且需管理员审批。',
  account: '密码策略、登录防护与两步验证；默认密码仅用于新建账号与管理员重置密码。',
  notify: '站内信与邮件的通知渠道、触发事件、SMTP 服务与文案模板；邮件发送失败会自动降级为仅站内信。',
  data: '列表分页与 Excel 导入上限，以及审计日志清理、成绩归档的保留策略与自动执行时点。',
  brand: '登录页与侧边栏展示的品牌信息，保存后对所有用户即时生效。',
};

/** 表单字段 → 所属配置域（保存校验失败时自动定位到出错卡片） */
const FIELD_TAB: Record<string, SettingsTab> = {
  // 考试默认值
  examDefaultDuration: 'exam',
  examDefaultPassScore: 'exam',
  examDefaultMaxAttempts: 'exam',
  paperTargetDifficulty: 'exam',
  // 作答与防作弊
  cheatCountThreshold: 'anti',
  cheatSecondsThreshold: 'anti',
  cheatAutoSubmitEnabled: 'anti',
  cheatWatermarkEnabled: 'anti',
  cheatCopyGuardEnabled: 'anti',
  shuffleDefaultEnabled: 'anti',
  shuffleOptionsDefault: 'anti',
  countdownWarningMinutes: 'anti',
  monitorPushEnabled: 'anti',
  monitorPushIntervalSeconds: 'anti',
  richTextImageMaxMb: 'anti',
  richTextImageMaxCount: 'anti',
  // 阅卷与复核
  retakeDefaultEnabled: 'grading',
  appealEnabled: 'grading',
  appealWindowDays: 'grading',
  // 账号与安全
  defaultPassword: 'account',
  minPasswordLength: 'account',
  passwordRequireUpper: 'account',
  passwordRequireLower: 'account',
  passwordRequireDigit: 'account',
  passwordRequireSymbol: 'account',
  passwordExpireDays: 'account',
  loginLockEnabled: 'account',
  loginMaxFails: 'account',
  loginLockMinutes: 'account',
  loginCaptchaAfterFails: 'account',
  twoFactorAvailable: 'account',
  // 通知与模板
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
  notifyTemplates: 'notify',
  // 数据与归档
  defaultPageSize: 'data',
  importMaxRows: 'data',
  importMaxFileMb: 'data',
  auditRetentionDays: 'data',
  archiveRetentionDays: 'data',
  archiveAutoEnabled: 'data',
  archiveAutoHour: 'data',
  // 网站与品牌
  companyName: 'brand',
  systemName: 'brand',
  systemShortName: 'brand',
  loginSlogan: 'brand',
  copyright: 'brand',
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

/** 页头操作区滚出视野后，显示贴底的 sticky 操作条（设计规范 §9.3） */
const { sentinelRef, revealed: showActionBar } = useStickyActionBar();

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
  // 考试默认值
  examDefaultDuration: numRules('考试默认时长', 1, 600, { unit: ' 分钟' }),
  examDefaultPassScore: numRules('考试默认及格线', 1, 1000, { integer: false }),
  examDefaultMaxAttempts: numRules('考试默认答题次数', 1, 10, { unit: ' 次' }),
  paperTargetDifficulty: numRules('难度系数目标值', 0.01, 1, { integer: false }),
  // 作答与防作弊
  cheatCountThreshold: numRules('切屏次数阈值', 1, 99, { unit: ' 次' }),
  cheatSecondsThreshold: numRules('切屏累计离开时长阈值', 5, 3600, { unit: ' 秒' }),
  countdownWarningMinutes: numRules('倒计时提醒阈值', 1, 60, { unit: ' 分钟' }),
  monitorPushIntervalSeconds: numRules('监考推送间隔', 3, 60, { unit: ' 秒' }),
  richTextImageMaxMb: numRules('作答题图片单张上限', 1, 10, { unit: ' MB' }),
  richTextImageMaxCount: numRules('作答题图片最多张数', 1, 10, { unit: ' 张' }),
  // 阅卷与复核
  appealWindowDays: numRules('成绩复核时限', 0, 365, { unit: ' 天' }),
  // 账号与安全
  defaultPassword: strRules('默认密码', 6, 64),
  minPasswordLength: numRules('密码最小长度', 6, 32, { unit: ' 位' }),
  loginMaxFails: numRules('登录失败锁定阈值', 1, 20, { unit: ' 次' }),
  loginLockMinutes: numRules('登录锁定时长', 1, 1440, { unit: ' 分钟' }),
  loginCaptchaAfterFails: numRules('验证码触发次数', 1, 20, { unit: ' 次' }),
  passwordExpireDays: numRules('密码有效期', 0, 3650, { unit: ' 天' }),
  // 通知与模板
  smtpHost: strRules('SMTP 服务器地址', 0, 120),
  smtpPort: numRules('SMTP 端口', 1, 65535, { unit: '' }),
  smtpUser: strRules('SMTP 账号', 0, 120),
  smtpPass: strRules('SMTP 授权码', 0, 200),
  smtpFrom: strRules('发件人地址', 0, 120),
  // 数据与归档
  defaultPageSize: numRules('列表默认每页条数', 1, 100, { unit: ' 条' }),
  importMaxRows: numRules('Excel 单次导入最大行数', 1, 50000, { unit: ' 行' }),
  importMaxFileMb: numRules('导入文件大小上限', 1, 50, { unit: ' MB' }),
  auditRetentionDays: numRules('审计日志保留天数', 0, 3650, { unit: ' 天' }),
  archiveRetentionDays: numRules('成绩归档保留天数', 0, 3650, { unit: ' 天' }),
  archiveAutoHour: numRules('自动归档时点', 0, 23, { unit: ' 时' }),
  // 网站与品牌
  systemName: strRules('系统全称', 1, 40),
  systemShortName: strRules('系统简称', 1, 40),
  companyName: strRules('组织根节点名称', 1, 40),
  loginSlogan: strRules('登录页标语', 0, 80),
  copyright: strRules('版权/页脚', 0, 120),
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
const loading = ref(true);
const loadFailed = ref(false);
const formLocked = computed(() => loading.value || loadFailed.value || saving.value);

async function loadSettings(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;
  try {
    await settingsStore.load(true);
    // 首次加载失败时不能将默认值当成服务端配置保存回去。
    if (!settingsStore.ready) {
      loadFailed.value = true;
      return;
    }
    Object.assign(form, settingsStore.settings, {
      notifyTemplates: cloneTemplates(settingsStore.settings.notifyTemplates),
    });
  } finally {
    loading.value = false;
  }
}

onMounted(loadSettings);

/* ------------------------------ 保存 ------------------------------ */
async function handleSave(): Promise<void> {
  if (formLocked.value || !formRef.value) return;

  // 使用回调式校验以拿到 invalidFields（用于自动定位出错配置域）
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
    } else {
      ElMessage.warning('存在待修正项，请检查标红字段');
    }
    // 定位到出错页签后，等 tab 内容渲染完成再聚焦第一个错误项（设计规范 §9.3）
    await nextTick();
    await focusFirstFormError();
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
  if (formLocked.value) return;
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
        <el-button :disabled="formLocked" @click="handleReset">恢复默认</el-button>
        <el-button type="primary" :loading="saving" :disabled="formLocked" @click="handleSave">保存设置</el-button>
      </template>
    </PageHeader>

    <!-- 哨兵：滚出视野说明页头操作区已不可见，此时改用贴底操作条 -->
    <div ref="sentinelRef" class="settings-page__sentinel" aria-hidden="true" />

    <el-alert v-if="loadFailed" type="error" :closable="false" show-icon>
      <template #title>设置加载失败，请重试后再编辑。</template>
      <el-button @click="loadSettings">重新加载</el-button>
    </el-alert>

    <el-form
      v-loading="loading"
      ref="formRef"
      :disabled="formLocked"
      :aria-busy="loading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="settings-page__form"
    >
      <el-tabs v-model="activeTab" class="settings-page__tabs">
        <el-tab-pane label="通知与模板" name="notify">
      <!-- ===================== 1. 通知与模板 ===================== -->
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">通知与模板</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.notify }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">通知渠道与触发事件</span>
          <span class="settings-page__section-note">各事件可独立开关</span>
        </div>
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
        </el-row>

        <div class="settings-page__section">
          <span class="settings-page__section-title">SMTP 邮件服务</span>
          <span class="settings-page__section-note">留空表示未配置邮件发送</span>
        </div>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="SMTP 服务器地址" prop="smtpHost">
              <div class="settings-page__control">
                <el-input
                  v-model="form.smtpHost"
                  maxlength="120"
                  placeholder="如 smtp.exmail.qq.com"
                  class="settings-page__input"
                />
                <p class="settings-page__hint">留空表示未配置邮件发送。</p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="SMTP 端口" prop="smtpPort">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.smtpPort"
                  :min="1"
                  :max="65535"
                  :step="1"
                  class="settings-page__num"
                />
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
                <el-input
                  v-model="form.smtpPass"
                  type="password"
                  show-password
                  maxlength="200"
                  class="settings-page__input"
                />
                <p class="settings-page__hint">仅管理员可见；保存后接口不回传明文，请勿重复提交空值覆盖。</p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="发件人地址" prop="smtpFrom">
              <div class="settings-page__control">
                <el-input
                  v-model="form.smtpFrom"
                  maxlength="120"
                  placeholder="如 noreply@example.com"
                  class="settings-page__input"
                />
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="settings-page__section">
          <span class="settings-page__section-title">通知文案模板</span>
          <span class="settings-page__section-note">
            站内信与邮件共用同一份文案，正文支持 <code>{变量}</code> 占位
          </span>
        </div>

        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="通知事件">
              <div class="settings-page__control">
                <el-select v-model="tplKey" class="settings-page__input">
                  <el-option v-for="m in NOTIFY_TEMPLATE_META" :key="m.key" :label="m.label" :value="m.key" />
                </el-select>
                <p class="settings-page__hint">可用变量：{{ tplVarsText }}</p>
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
      </el-card>

      <!-- ===================== 2. 作答与防作弊 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="作答与防作弊" name="anti">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">作答与防作弊</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.anti }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">防作弊检测</span>
          <span class="settings-page__section-note">切屏行为判定与作答页防护</span>
        </div>
        <el-row :gutter="24">
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
                  切屏次数达到该值会在考试端提示并计入异常，同时影响成绩报表判定。
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
                  开启后，切屏次数或累计离开秒数达到上方阈值将自动强制交卷；关闭则仅记录异常。
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
        </el-row>

        <div class="settings-page__section">
          <span class="settings-page__section-title">作答呈现与提醒</span>
          <span class="settings-page__section-note">试卷下发方式与考试端时间提醒</span>
        </div>
        <el-row :gutter="24">
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
            <el-form-item label="倒计时提醒：剩余不足该分钟数时提醒" prop="countdownWarningMinutes">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.countdownWarningMinutes"
                  :min="1"
                  :max="60"
                  :step="1"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">考试端倒计时剩余不足该分钟数时进入提醒态。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="settings-page__section">
          <span class="settings-page__section-title">监考推送与简答图片</span>
          <span class="settings-page__section-note">监考大屏实时性与作答题图片上传约束</span>
        </div>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="监考大屏实时推送（SSE）" prop="monitorPushEnabled">
              <div class="settings-page__control">
                <el-switch v-model="form.monitorPushEnabled" active-text="开启" inactive-text="关闭" />
                <p class="settings-page__hint">
                  开启后监考大屏按下方间隔接收服务端推送；关闭或推送不可用时自动回退 15 秒轮询。
                </p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="监考推送间隔（秒）" prop="monitorPushIntervalSeconds">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.monitorPushIntervalSeconds"
                  :min="3"
                  :max="60"
                  :step="1"
                  :disabled="!form.monitorPushEnabled"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">
                  3~60 秒（默认 5）。同一场考试的全部监考页共享一次查库，间隔越短实时性越好。
                </p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="简答作图片：单张上限（MB）" prop="richTextImageMaxMb">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.richTextImageMaxMb"
                  :min="1"
                  :max="10"
                  :step="1"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">
                  1~10MB（默认 2）。图片上传至服务端存储后以站内链接插入答案，不再内联 base64。
                </p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="简答作图片：最多张数" prop="richTextImageMaxCount">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.richTextImageMaxCount"
                  :min="1"
                  :max="10"
                  :step="1"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">1~10 张（默认 3）。前端提示 + 服务端净化双重把关。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- ===================== 3. 数据与归档 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="数据与归档" name="data">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">数据与归档</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.data }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">列表与导入</span>
          <span class="settings-page__section-note">影响所有列表页与 Excel 批量导入</span>
        </div>
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

        <div class="settings-page__section">
          <span class="settings-page__section-title">数据保留与自动归档</span>
          <span class="settings-page__section-note">清理与归档均可在「系统维护」页手动执行</span>
        </div>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="审计日志保留天数（天）" prop="auditRetentionDays">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.auditRetentionDays"
                  :min="0"
                  :max="3650"
                  :step="30"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">
                  0 表示不启用自动清理；系统维护页可按该天数手动清理历史审计日志。
                </p>
              </div>
            </el-form-item>
          </el-col>
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
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="自动归档（每日定时）" prop="archiveAutoEnabled">
              <div class="settings-page__control">
                <el-switch
                  v-model="form.archiveAutoEnabled"
                  active-text="开启"
                  inactive-text="关闭"
                />
                <p class="settings-page__hint">
                  开启后服务端每日在下方时点自动执行一次历史成绩归档；需上方保留天数 &gt; 0 才会真正搬运数据。
                </p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="自动归档时点（0~23 时）" prop="archiveAutoHour">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.archiveAutoHour"
                  :min="0"
                  :max="23"
                  :step="1"
                  :disabled="!form.archiveAutoEnabled"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">
                  按服务器本地时点（默认 3 时）；同一天已执行过则不再重复执行。执行结果见审计日志。
                </p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- ===================== 4. 账号与安全 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="账号与安全" name="account">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">账号与安全</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.account }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">密码策略</span>
          <span class="settings-page__section-note">新建账号与用户自助改密的校验口径</span>
        </div>
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
                <p class="settings-page__hint">默认密码用于新建账号与管理员重置密码。</p>
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
        </el-row>

        <div class="settings-page__section">
          <span class="settings-page__section-title">登录防护与两步验证</span>
          <span class="settings-page__section-note">失败锁定、图形验证码与 TOTP 二次校验</span>
        </div>
        <el-row :gutter="24">
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
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="两步验证">
              <div class="settings-page__control">
                <el-switch
                  v-model="form.twoFactorAvailable"
                  active-text="允许开启"
                  inactive-text="关闭"
                />
                <p class="settings-page__hint">
                  开启后用户可在「账号安全」中绑定 TOTP 验证器，登录需二次校验验证码；
                  管理员可在用户管理中强制重置某账号的两步验证。
                </p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- ===================== 5. 考试默认值 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="考试默认值" name="exam">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">考试默认值</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.exam }}</p>

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
                <p class="settings-page__hint">新建考试时预设的每人最多作答次数；次数用尽后仍不及格可申请补考。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="组卷难度系数目标值" prop="paperTargetDifficulty">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.paperTargetDifficulty"
                  :min="0.01"
                  :max="1"
                  :step="0.01"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">组卷页评估试卷难度时的对标目标（P 值，越高越易）。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- ===================== 6. 阅卷与复核 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="阅卷与复核" name="grading">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">阅卷与复核</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.grading }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">补考与成绩复核</span>
          <span class="settings-page__section-note">仅作为新建考试的默认值，可在单场考试中覆盖</span>
        </div>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="补考申请（默认）" prop="retakeDefaultEnabled">
              <div class="settings-page__control">
                <el-switch
                  v-model="form.retakeDefaultEnabled"
                  active-text="开启"
                  inactive-text="关闭"
                />
                <p class="settings-page__hint">
                  开启后，新建考试默认开放补考申请；考生未及格且答题次数用完后可申请，且需管理员审批。
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
          <el-col :xs="24" :sm="24" :md="12">
            <el-form-item label="成绩复核时限（天）" prop="appealWindowDays">
              <div class="settings-page__control">
                <el-input-number
                  v-model="form.appealWindowDays"
                  :min="0"
                  :max="365"
                  :step="1"
                  :disabled="!form.appealEnabled"
                  class="settings-page__num"
                />
                <p class="settings-page__hint">自交卷起算；填 0 表示不限时限。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- ===================== 7. 网站与品牌 ===================== -->
        </el-tab-pane>
        <el-tab-pane label="网站与品牌" name="brand">
      <el-card shadow="never" class="settings-page__card">
        <template #header>
          <h3 class="settings-page__card-title">网站与品牌</h3>
        </template>

        <p class="settings-page__desc">{{ TAB_DESC.brand }}</p>

        <div class="settings-page__section">
          <span class="settings-page__section-title">品牌信息</span>
          <span class="settings-page__section-note">留空则不展示对应位置</span>
        </div>
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
            <el-form-item label="组织根节点名称" prop="companyName">
              <div class="settings-page__control">
                <el-input
                  v-model="form.companyName"
                  maxlength="40"
                  show-word-limit
                  class="settings-page__input"
                />
                <p class="settings-page__hint">科室管理页组织树的根节点名（默认「全公司」），也可在科室树中直接改名。</p>
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
      </el-card>
        </el-tab-pane>
      </el-tabs>

    </el-form>

    <!-- sticky 底部操作条：页头操作区滚出视野后出现，长表单无需滚回顶部 -->
    <transition name="settings-actionbar">
      <div v-if="showActionBar" class="settings-page__actionbar">
        <span class="settings-page__actionbar-tip">修改后需点击「保存设置」方可全局生效</span>
        <div class="settings-page__actionbar-actions">
          <el-button :disabled="formLocked" @click="handleReset">恢复默认</el-button>
          <el-button type="primary" :loading="saving" :disabled="formLocked" @click="handleSave">保存设置</el-button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.settings-page {
  display: flex;
  flex-direction: column;

  /* 观测哨兵：不占视觉空间，仅用于探知页头操作区是否滚出视野 */
  &__sentinel {
    height: 0;
    margin: 0;
    pointer-events: none;
  }

  /* 配置域页签（真实 tab 切换，刻度由全局 index.scss 统一承担） */
  &__tabs {
    :deep(.el-tabs__content) {
      padding-top: 16px;
    }

    /* pane 内卡片沿用纵向堆叠距 */
    :deep(.el-tab-pane) > .settings-page__card + .settings-page__card {
      margin-top: 16px;
    }
  }

  /* 表单容器：每域一张卡，改为纵向堆叠（原单面板的白底外框已由卡片承担） */
  &__form {
    display: flex;
    flex-direction: column;
    gap: 16px;

    :deep(.el-form-item) {
      margin-bottom: 18px;
    }
  }

  /* 配置域卡片：卡头即域名（刻度由全局 index.scss 统一承担） */
  &__card {
    scroll-margin-top: 8px;
  }

  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  /* 每张卡顶部的一句话说明 —— 走设计稿 .tip--info 形态（浅底无边框 + 6px 圆角），
     v2.x 的 3px 左缘强调条在方向 C 已废弃。 */
  &__desc {
    margin: 0 0 18px;
    padding: 10px 12px;
    font-size: 12.5px;
    line-height: 1.6;
    color: $color-info-text;
    background: $color-info-bg;
    border-radius: $radius-sm;
  }

  /* 卡内分组小标题（同一域内的业务子域）—— 对齐设计稿 .card__hd h3，纯标题不加左条 */
  &__section {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 4px 0 14px;
    flex-wrap: wrap;

    & + .el-row {
      margin-bottom: 4px;
    }
  }

  &__section-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__section-note {
    font-size: 12.5px;
    color: $text-secondary;

    code {
      padding: 0 3px;
      font-size: 12px;
      color: $color-primary-dark;
      background: $color-primary-soft;
      border-radius: 3px;
    }
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

  /* sticky 底部操作条（设计规范 §9.3）：长表单滚到底部也能直接保存 */
  &__actionbar {
    position: sticky;
    bottom: 0;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding: 12px 18px;
    background: $bg-paper;
    border: 1px solid $border-color;
    border-radius: $radius-base;
  }

  &__actionbar-tip {
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__actionbar-actions {
    display: flex;
    flex-shrink: 0;
    gap: 10px;
  }
}

/* sticky 操作条入场/退场（页头操作区滚出视野时出现） */
.settings-actionbar-enter-active,
.settings-actionbar-leave-active {
  transition: opacity $transition-base, transform $transition-base;
}

.settings-actionbar-enter-from,
.settings-actionbar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
