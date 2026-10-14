<script setup lang="ts">
/**
 * 登录页（v1.2 视觉升级；v1.7③ 增图形验证码与两步验证）。
 * 左右分栏 —— 左侧品牌区（渐变 + 能力清单），右侧登录表单。
 * 登录成功按 route.query.redirect 或角色首页跳转。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Checked, Collection, Lock, TrendCharts, User } from '@element-plus/icons-vue';
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

/** 品牌能力清单 */
const features = [
  { icon: Collection, title: '题库与组卷', desc: 'Excel 批量导入，多题库组合生成试卷' },
  { icon: Checked, title: '在线答题', desc: '倒计时防切屏，断点续答自动暂存' },
  { icon: TrendCharts, title: '成绩报表', desc: '自动判分，多维度统计分析' },
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
  return '/exam/my';
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
    <!-- 左：品牌区 -->
    <section class="login__brand">
      <div class="login__brand-inner">
        <div class="login__logo">
          <span class="login__logo-mark">考</span>
          <span class="login__logo-name">{{ settingsStore.publicSettings.systemName }}</span>
        </div>

        <h1 v-if="settingsStore.publicSettings.loginSlogan" class="login__headline">
          {{ settingsStore.publicSettings.loginSlogan }}
        </h1>
        <p class="login__tagline">题库组卷 · 在线答题 · 自动判分 · 成绩报表，一体化闭环</p>

        <ul class="login__features">
          <li v-for="f in features" :key="f.title" class="login__feature">
            <span class="login__feature-icon">
              <el-icon :size="18"><component :is="f.icon" /></el-icon>
            </span>
            <span class="login__feature-text">
              <strong>{{ f.title }}</strong>
              <small>{{ f.desc }}</small>
            </span>
          </li>
        </ul>

        <p v-if="settingsStore.publicSettings.copyright" class="login__copyright">
          {{ settingsStore.publicSettings.copyright }}
        </p>
      </div>

      <span class="login__deco login__deco--a" aria-hidden="true"></span>
      <span class="login__deco login__deco--b" aria-hidden="true"></span>
      <span class="login__deco login__deco--c" aria-hidden="true"></span>
    </section>

    <!-- 右：表单区 -->
    <section class="login__panel">
      <div class="login__form-wrap">
        <h2 class="login__title">{{ step === 'twofa' ? '两步验证' : '欢迎登录' }}</h2>
        <p class="login__subtitle">
          {{ step === 'twofa' ? '请输入验证器 App 中的 6 位动态验证码，或使用恢复码' : '请使用企业账号登录系统' }}
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
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              :prefix-icon="User"
              placeholder="请输入用户名"
              clearable
              autocomplete="username"
              @input="clearError"
              @keyup.enter="handleSubmit"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              :prefix-icon="Lock"
              placeholder="请输入密码"
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

  // ---------- 左：品牌区 ----------
  &__brand {
    position: relative;
    flex: 1 1 54%;
    display: flex;
    align-items: center;
    padding: 48px 6vw;
    overflow: hidden;
    background: $gradient-brand;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(1200px 420px at 12% 8%, rgba(255, 255, 255, 0.16), transparent 60%),
        radial-gradient(900px 500px at 92% 96%, rgba(15, 23, 42, 0.28), transparent 62%);
      pointer-events: none;
    }
  }

  &__brand-inner {
    position: relative;
    z-index: 1;
    max-width: 460px;
    color: #fff;
    // 预留版权行空间：版权行绝对定位于容器底部，避免与能力清单重叠
    padding-bottom: 64px;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 46px;
  }

  &__logo-mark {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(4px);
    font-size: 19px;
    font-weight: 700;
  }

  &__logo-name {
    font-size: 15.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    opacity: 0.94;
  }

  &__headline {
    margin: 0 0 14px;
    font-size: 38px;
    line-height: 1.28;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  &__tagline {
    margin: 0 0 40px;
    font-size: 14.5px;
    opacity: 0.84;
  }

  &__features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &__feature {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  &__feature-icon {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
  }

  &__feature-text {
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
      font-size: 14.5px;
      font-weight: 600;
    }

    small {
      font-size: 12.5px;
      opacity: 0.8;
    }
  }

  &__copyright {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 26px;
    margin: 0;
    font-size: 12px;
    opacity: 0.6;
    text-align: center;
  }

  &__deco {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;

    &--a {
      width: 300px;
      height: 300px;
      right: -90px;
      top: -110px;
      background: rgba(255, 255, 255, 0.09);
    }
    &--b {
      width: 190px;
      height: 190px;
      right: 130px;
      bottom: -70px;
      background: rgba(255, 255, 255, 0.07);
    }
    &--c {
      width: 90px;
      height: 90px;
      right: 42%;
      top: 58%;
      background: rgba(255, 255, 255, 0.06);
    }
  }

  // ---------- 右：表单区 ----------
  &__panel {
    flex: 1 1 46%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    background: $bg-paper;
  }

  &__form-wrap {
    width: 100%;
    max-width: 352px;
  }

  &__title {
    margin: 0 0 8px;
    font-size: 25px;
    font-weight: 700;
    color: $text-primary;
  }

  &__subtitle {
    margin: 0 0 30px;
    font-size: 13.5px;
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

  &__demo {
    margin-top: 30px;
    padding-top: 22px;
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
