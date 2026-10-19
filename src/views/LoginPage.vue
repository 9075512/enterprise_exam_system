<script setup lang="ts">
/**
 * 登录页：使用已确认的圆角双栏卡片；移动端收为单列表单。
 * 保留按需图形验证码、两步验证与公开品牌配置。
 * 登录成功按 route.query.redirect 或角色首页跳转。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { ApiError } from '@/api/http';
import { validateAndFocus } from '@/composables/useFormFocus';
import CaptchaImage from '@/components/common/CaptchaImage.vue';
import type { TwoFactorChallenge, User as UserDto } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

onMounted(() => {
  void settingsStore.loadPublic();
});

// 登录页使用公开品牌配置，避免在页面模板或构建产物中固定系统名称。
watch(
  () => settingsStore.publicSettings.systemName,
  (name) => {
    if (name.trim()) document.title = name.trim();
  },
  { immediate: true },
);

const formRef = ref<FormInstance>();
const form = reactive({ username: '', password: '', captcha: '' });
const loading = ref(false);
/** 登录失败原因（常驻展示在表单内，避免 Toast 一闪而过） */
const errorMsg = ref('');

/* ------------------------- 图形验证码（v1.7③ T1） ------------------------- */
/** 是否需要填写验证码（后端 1015 时置为 true） */
const captchaRequired = ref(false);
const captchaId = ref('');
const captchaRef = ref<InstanceType<typeof CaptchaImage> | null>(null);

/* ------------------------- 两步验证（v1.7③ T2） ------------------------- */
/** 当前步骤：凭据 → 两步验证码 */
const step = ref<'credentials' | 'twofa'>('credentials');
const twoFactorCode = ref('');
const challengeToken = ref('');

/** 用户再次输入时清掉上一次的失败提示 */
function clearError(): void {
  if (errorMsg.value) errorMsg.value = '';
}

const rules = computed<FormRules>(() => ({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captcha: captchaRequired.value
    ? [{ required: true, message: '请输入图形验证码', trigger: 'blur' }]
    : [],
}));

/** 已确认登录稿中的编号能力列表。 */
const features = [
  '科目题库与精细权限',
  '考试、监考与人工阅卷',
  '成绩分析与学习反馈',
];

/** 演示账号（点击自动填充） */
const demos = [
  { role: '管理员', username: 'admin', password: 'admin123' },
  { role: '出题人', username: 'author', password: 'author123' },
  { role: '考生', username: 'zhangsan', password: '123456' },
];

function fillDemo(d: { username: string; password: string }): void {
  form.username = d.username;
  form.password = d.password;
}

/** 角色首页 */
function homePath(role: string): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'author') return '/author/banks';
  return '/exam/home'; // 考生默认落「首页」（与 menuConfig.getHomePath 一致）
}

/** 登录成功后的跳转与提示 */
async function goHome(user: UserDto, passwordExpired?: boolean): Promise<void> {
  ElMessage.success('登录成功');
  if (passwordExpired) {
    ElMessage.warning('您的密码已超过有效期，请尽快在「账号安全」中修改');
  }
  const redirect = route.query.redirect as string | undefined;
  await router.replace(redirect || homePath(user.role));
}

/** 第一步：账号密码（+ 必要时图形验证码）。 */
async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await validateAndFocus(formRef.value);
  if (!valid) return;

  loading.value = true;
  errorMsg.value = '';
  try {
    const result = await auth.login(
      form.username,
      form.password,
      captchaRequired.value ? { captchaId: captchaId.value, captcha: form.captcha } : undefined,
    );
    // 账号开启了两步验证 → 进入第二步
    if ('twoFactorRequired' in result) {
      const challenge = result as TwoFactorChallenge;
      challengeToken.value = challenge.challengeToken;
      step.value = 'twofa';
      twoFactorCode.value = '';
      return;
    }
    await goHome(result.user, result.passwordExpired);
  } catch (err) {
    const apiErr = err as ApiError;
    if (apiErr.code === 1015) {
      // 需要图形验证码：展示并换一张
      captchaRequired.value = true;
      form.captcha = '';
      captchaRef.value?.refresh();
    }
    errorMsg.value = apiErr?.message || '登录失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

/** 第二步：两步验证码。 */
async function handleTwoFactor(): Promise<void> {
  if (!twoFactorCode.value.trim()) {
    errorMsg.value = '请输入验证码或恢复码';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const result = await auth.completeTwoFactor(challengeToken.value, twoFactorCode.value.trim());
    await goHome(result.user, result.passwordExpired);
  } catch (err) {
    errorMsg.value = (err as Error)?.message || '验证失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

/** 返回上一步重新输入账号。 */
function backToCredentials(): void {
  step.value = 'credentials';
  twoFactorCode.value = '';
  challengeToken.value = '';
  errorMsg.value = '';
}
</script>

<template>
  <div data-ui-layout="login" data-ui-page="LoginPage" class="login">
    <div class="login__card">
      <!-- 左：已确认稿的渐变品牌区 -->
      <section class="login__brand">
        <div class="login__brand-inner">
          <div class="login__logo">
            <span class="login__logo-mark">考</span>
            <span class="login__logo-name">
              {{ settingsStore.publicSettings.systemShortName }}
              <small>EXAM MANAGEMENT</small>
            </span>
          </div>

          <h1 v-if="settingsStore.publicSettings.loginSlogan" class="login__headline">
            {{ settingsStore.publicSettings.loginSlogan }}
          </h1>
          <p class="login__tagline">从题库管理到考试运营，从在线答题到成绩复核，<br class="login__desktop-break">把教学与考务工作有序连接。</p>

          <ul class="login__features">
            <li v-for="(f, i) in features" :key="i" class="login__feature">
              <span class="login__feature-number">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="login__feature-text">{{ f }}</span>
            </li>
          </ul>

          <p v-if="settingsStore.publicSettings.copyright" class="login__copyright">
            {{ settingsStore.publicSettings.copyright }}
          </p>
        </div>
      </section>

      <!-- 右：表单区 -->
      <section class="login__panel">
        <div class="login__form-wrap">
          <h2 class="login__title">{{ step === 'twofa' ? '两步验证' : '登录考试系统' }}</h2>
          <p class="login__subtitle">
            {{ step === 'twofa' ? '请输入动态验证码或恢复码' : '使用工作账号进入考试管理系统' }}
          </p>

          <el-form
            v-if="step === 'credentials'"
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            size="large"
            @submit.prevent="handleSubmit"
          >
            <el-form-item label="账号 / 工号" prop="username">
              <el-input
                v-model="form.username"
                placeholder="请输入账号或工号"
                clearable
                autocomplete="username"
                @input="clearError"
                @keyup.enter="handleSubmit"
              />
            </el-form-item>
            <el-form-item label="登录密码" prop="password">
              <el-input
                v-model="form.password"
                type="password"
                placeholder="请输入登录密码"
                show-password
                autocomplete="current-password"
                @input="clearError"
                @keyup.enter="handleSubmit"
              />
            </el-form-item>
            <el-form-item v-if="captchaRequired" label="图形验证码" prop="captcha">
              <div class="login__captcha-row">
                <el-input
                  v-model="form.captcha"
                  placeholder="请输入图中字符"
                  maxlength="6"
                  @input="clearError"
                  @keyup.enter="handleSubmit"
                />
                <CaptchaImage ref="captchaRef" v-model="captchaId" />
              </div>
            </el-form-item>

            <el-alert
              v-if="errorMsg"
              class="login__error"
              type="error"
              :title="errorMsg"
              :closable="false"
              show-icon
              role="alert"
            />

            <el-button
              type="primary"
              class="login__submit"
              :loading="loading"
              native-type="submit"
              @click="handleSubmit"
            >
              登 录 →
            </el-button>
          </el-form>

          <el-form v-else size="large" @submit.prevent="handleTwoFactor">
            <el-form-item label="动态验证码">
              <el-input
                v-model="twoFactorCode"
                placeholder="6 位验证码，或恢复码 XXXXX-XXXXX"
                maxlength="11"
                autocomplete="one-time-code"
                @input="clearError"
                @keyup.enter="handleTwoFactor"
              />
            </el-form-item>
            <p class="login__twofa-hint">
              验证器不可用时，可输入启用两步验证时保存的恢复码（每个仅可用一次）。
            </p>

            <el-alert
              v-if="errorMsg"
              class="login__error"
              type="error"
              :title="errorMsg"
              :closable="false"
              show-icon
              role="alert"
            />

            <el-button
              type="primary"
              class="login__submit"
              :loading="loading"
              native-type="submit"
              @click="handleTwoFactor"
            >
              验 证
            </el-button>
            <el-button class="login__back" text @click="backToCredentials">返回重新输入账号</el-button>
          </el-form>

          <p class="login__hint">
            首次登录请修改初始密码，账号异常请联系管理员。
          </p>

          <details v-if="step === 'credentials'" class="login__demo">
            <summary class="login__demo-label">演示账号 · 点击展开</summary>
            <div class="login__demo-list">
              <button
                v-for="d in demos"
                :key="d.username"
                type="button"
                class="login__demo-chip"
                @click="fillDemo(d)"
              >
                <strong>{{ d.role }}</strong>
                <small>{{ d.username }}</small>
              </button>
            </div>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

// 当前确认稿：docs/ui-workbuddy/app.js 的 login() 与 style.css。
.login {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 40px 32px;
  background: $bg-page;

  &__card {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    width: 100%;
    max-width: 1200px;
    min-height: 570px;
    overflow: hidden;
    border: 1px solid #e1e7f0;
    border-radius: 18px; // radius-exception：已确认登录稿 .login-preview 的外框圆角。
  }

  &__brand {
    position: relative;
    overflow: hidden;
    padding: 38px;
    color: #fff;
    background: linear-gradient(135deg, #1e41b4, #2a6cf0 70%, #3d82fa);

    &::after {
      content: '';
      position: absolute;
      width: 280px;
      height: 280px;
      right: -90px;
      top: -100px;
      border-radius: 50%;
      background: #ffffff08;
      pointer-events: none;
    }
  }

  &__brand-inner { position: relative; z-index: 1; }
  &__logo { display: flex; align-items: center; gap: 12px; }
  &__logo-mark {
    display: grid;
    place-items: center;
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    border: 1px solid #ffffff30;
    border-radius: 12px;
    background: #ffffff20;
    box-shadow: 0 5px 12px rgba($color-primary, 0.19);
    color: #fff;
    font-size: 22px;
    font-weight: 700;
  }
  &__logo-name {
    min-width: 0;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 1px;
    line-height: 1.6;
    overflow-wrap: anywhere;
    small {
      display: block;
      margin-top: 1px;
      color: #c4d6ff;
      font-size: 8px;
      font-weight: 400;
      letter-spacing: 1.8px;
    }
  }
  &__headline {
    max-width: 10em;
    margin: 68px 0 0;
    font-size: 33px;
    font-weight: 700;
    line-height: 1.55;
    letter-spacing: -0.5px;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  &__tagline { margin: 17px 0 0; color: #c6d7ff; font-size: 12px; line-height: 2; }
  &__features { display: flex; flex-direction: column; margin: 58px 0 0; padding: 0; list-style: none; }
  &__feature { display: flex; gap: 12px; color: #bdd2ff; font-size: 11px; line-height: 2.4; }
  &__feature-number { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
  &__copyright { margin: 45px 0 0; padding-top: 21px; border-top: 1px solid #ffffff20; color: #c7d7ff; font-size: 10px; }

  &__panel { display: flex; align-items: center; justify-content: center; padding: 50px 15%; background: #f9fafc; }
  &__form-wrap { width: 100%; min-width: 0; }
  &__title { margin: 0 0 5px; color: $text-primary; font-size: 23px; font-weight: 700; line-height: 1.6; }
  &__subtitle { margin: 0 0 28px; color: $text-secondary; font-size: 12px; }
  :deep(.el-form-item) { margin-bottom: 20px; }
  :deep(.el-form-item__label) { height: auto; margin-bottom: 7px; padding: 0; color: $text-body; font-size: 12px; line-height: 1.6; }
  :deep(.el-input__wrapper) { min-height: 41px; padding-inline: 11px; border-radius: 8px; background: #fff; }
  :deep(.el-input__inner) { height: 39px; font-size: 12px; }
  &__submit { width: 100%; height: 42px; margin-top: 5px; border-radius: 8px; font-size: 12px; box-shadow: 0 3px 6px rgba($color-primary, 0.07); }
  &__hint { margin: 25px 0 0; color: $text-secondary; font-size: 12px; text-align: center; line-height: 1.8; }
  &__error { margin-bottom: 14px; :deep(.el-alert__title) { font-size: 13px; line-height: 1.5; } }
  &__captcha-row { display: flex; align-items: center; gap: 8px; width: 100%; :deep(.el-input) { flex: 1; min-width: 0; } }
  &__twofa-hint { margin: -6px 0 14px; color: $text-secondary; font-size: 12px; line-height: 1.8; }
  &__back { width: 100%; margin: 10px 0 0; color: $text-secondary; font-size: 12px; }
  &__demo { margin-top: 18px; color: $text-secondary; font-size: 12px; }
  &__demo-label { width: fit-content; margin: 0 auto; cursor: pointer; }
  &__demo-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
  &__demo-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    min-height: 52px;
    padding: 7px 3px;
    border: 1px solid $border-color;
    border-radius: 8px;
    background: #fff;
    font: inherit;
    cursor: pointer;
    strong { color: $text-primary; font-size: 12px; font-weight: 600; }
    small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-family: Consolas, monospace; font-size: 12px; }
    &:hover { border-color: $color-primary; background: $color-primary-soft; }
  }
}

@media (max-width: 1100px) {
  .login__panel { padding: 40px 12%; }
  .login__brand { padding: 30px; }
  .login__logo-name { font-size: 17px; }
  .login__headline { font-size: 28px; }
  .login__desktop-break { display: none; }
}

@media (max-width: 900px) {
  .login {
    padding: 24px;
    &__card { grid-template-columns: minmax(0, 1fr); max-width: 520px; min-height: 580px; }
    &__brand { display: none; }
    &__panel { padding: 45px 30px; }
    &__demo-label { min-height: 44px; padding-block: 12px; }
    &__demo-chip { min-height: 52px; }
    &__submit, &__back { min-height: 44px; }
    :deep(.el-input__wrapper) { min-height: 44px; }
    :deep(.el-input__inner) { min-height: 42px; font-size: 16px; }
  }
}

@media (max-width: 374px) {
  .login { padding: 16px; &__panel { padding: 32px 20px; } }
}
</style>
