<script setup lang="ts">
/**
 * 登录页（v1.2 视觉升级；v1.7③ 增图形验证码与两步验证）。
 * 左右分栏 —— 左侧品牌区（渐变 + 能力清单），右侧登录表单。
 * 登录成功按 route.query.redirect 或角色首页跳转。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Collection, Lock, TrendCharts, User } from '@element-plus/icons-vue';
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

/** 品牌能力点（设计稿 .login__pt：单行短句） */
const features = [
  { icon: Collection, desc: '题库集中管理，智能组卷秒级成卷' },
  { icon: Lock, desc: '防切屏、随机抽题、全程留痕' },
  { icon: TrendCharts, desc: '成绩分析到人到题，短板一目了然' },
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
  <div class="login">
    <!-- 左：品牌区（设计稿 .login__brand：深底 + 主色辐光） -->
    <section class="login__brand">
      <div class="login__brand-inner">
        <div class="login__logo">
          <span class="login__logo-mark">考</span>
          <span class="login__logo-name">
            {{ settingsStore.publicSettings.systemShortName || '考试中心' }}
            <small>EXAM CENTER</small>
          </span>
        </div>

        <h1 v-if="settingsStore.publicSettings.loginSlogan" class="login__headline">
          {{ settingsStore.publicSettings.loginSlogan }}
        </h1>
        <p class="login__tagline">题库、组卷、监考、阅卷、成绩分析，考试全流程一套系统完成，数据随时可追溯。</p>

        <ul class="login__features">
          <li v-for="(f, i) in features" :key="i" class="login__feature">
            <span class="login__feature-icon">
              <el-icon :size="12"><component :is="f.icon" /></el-icon>
            </span>
            <span class="login__feature-text">{{ f.desc }}</span>
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
        <h2 class="login__title">{{ step === 'twofa' ? '两步验证' : '欢迎回来' }}</h2>
        <p class="login__subtitle">
          {{ step === 'twofa' ? '请输入验证器 App 中的 6 位动态验证码，或使用恢复码' : '请使用企业统一账号登录' }}
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
              :prefix-icon="User"
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
              :prefix-icon="Lock"
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
            登 录
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
          首次登录请使用初始密码，登录后需立即修改。<br />如账号被锁定，请联系所在部门管理员。
        </p>

        <div v-if="step === 'credentials'" class="login__demo">
          <span class="login__demo-label">演示账号 · 点击自动填充</span>
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
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.login {
  display: flex;
  min-height: 100vh;

  // ---------- 左：品牌区（设计稿 .login__brand：深底 #0B0F19 + 右下主色辐光） ----------
  &__brand {
    position: relative;
    flex: 1 1 54%;
    display: flex;
    align-items: stretch;
    padding: 44px 48px;
    overflow: hidden;
    background: $sidebar-bg;
    color: #fff;

    /* 右下主色辐光（设计稿 ::after） */
    &::after {
      content: '';
      position: absolute;
      right: -90px;
      bottom: -120px;
      width: 380px;
      height: 380px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, $color-primary, transparent 62%);
      opacity: 0.3;
      pointer-events: none;
    }
  }

  &__brand-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    max-width: 460px;
    width: 100%;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  &__logo-mark {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: $color-primary;
    font-size: 15px;
    font-weight: 700;
  }

  &__logo-name {
    display: flex;
    flex-direction: column;
    font-size: 14px;
    font-weight: 620;
    color: $sidebar-text-hover;

    small {
      font-size: 10px;
      letter-spacing: 0.11em;
      color: $sidebar-text;
    }
  }

  &__headline {
    // 设计稿 .login__ttl：28px / 660 / -0.02em / margin:auto 0 0（沉底对齐）
    margin: auto 0 0;
    font-size: 28px;
    line-height: 1.32;
    font-weight: 660;
    letter-spacing: -0.02em;
  }

  &__tagline {
    margin: 11px 0 0;
    max-width: 410px;
    font-size: 13px;
    line-height: 1.7;
    color: $sidebar-text;
  }

  &__features {
    list-style: none;
    margin: 26px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__feature {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 12.5px;
    color: $sidebar-text;
  }

  &__feature-icon {
    width: 19px;
    height: 19px;
    flex: 0 0 19px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.1);
    color: #7fb0ff;
  }

  &__copyright {
    margin: auto 0 0;
    padding-top: 30px;
    font-size: 11px;
    color: $sidebar-text;
    opacity: 0.75;
  }

  // ---------- 右：表单区（设计稿白底居中 340px 栏） ----------
  &__panel {
    flex: 1 1 46%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 38px;
    background: #fff;
  }

  &__form-wrap {
    width: 100%;
    max-width: 340px;
  }

  &__title {
    margin: 0;
    font-size: 21px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: $text-primary;
  }

  &__subtitle {
    margin: 6px 0 22px;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__error {
    margin-bottom: 14px;
    border-radius: $radius-sm;

    :deep(.el-alert__title) {
      font-size: 13px;
      line-height: 1.5;
    }
  }

  &__twofa-hint {
    margin: -6px 0 14px;
    font-size: 12.5px;
    line-height: 1.5;
    color: $text-secondary;
  }

  // 登录主按钮：对齐设计稿 login.html 的内联刻度 `height:38px;font-size:13.5px`
  // （原 46px/15px/字距 .2em 为工程自定，比设计稿大一档 —— 逐页审计补正）
  &__submit {
    width: 100%;
    height: 38px;
    margin-top: 6px;
    font-size: 13.5px;
    font-weight: 500;
  }

  &__back {
    width: 100%;
    margin: 10px 0 0;
    font-size: 13px;
    color: $text-secondary;
  }

  &__captcha-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;

    :deep(.el-input) {
      flex: 1;
    }
  }

  &__hint {
    margin: 20px 0 0;
    font-size: 11.5px;
    line-height: 1.65;
    color: $text-secondary;
  }

  &__demo {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px dashed $border-color;
  }

  &__demo-label {
    display: block;
    margin-bottom: 12px;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__demo-list {
    display: flex;
    gap: 10px;
  }

  &__demo-chip {
    flex: 1;
    padding: 9px 6px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: #fff;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    transition: all $transition-fast;

    strong {
      font-size: 13px;
      color: $text-primary;
      font-weight: 600;
    }

    small {
      font-size: 11.5px;
      color: $text-secondary;
      font-family: Consolas, monospace;
    }

    &:hover {
      border-color: $color-primary;
      background: $color-primary-soft;
      transform: translateY(-1px);

      strong {
        color: $color-primary;
      }
    }
  }
}

// 窄屏：隐藏品牌区，只保留表单
@media (max-width: 1024px) {
  .login {
    &__brand {
      display: none;
    }

    &__panel {
      background: linear-gradient(160deg, $color-primary-50 0%, $bg-paper 45%);
    }
  }
}
</style>
