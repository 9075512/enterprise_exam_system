<script setup lang="ts">
/**
 * 练题登录页（公网 · 强制登录）。
 * 复用公司内网账号（后端只读校验 users）；失败达阈值后展示算术验证码。
 * 微信内置浏览器兼容：显式 viewport、聚焦态处理、localStorage 兜底（见 practiceAuth store）。
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PracticeLayout from '@/layouts/PracticeLayout.vue';
import { usePracticeAuthStore } from '@/stores/practiceAuth';
import * as practiceApi from '@/api/practice';
import type { ApiError } from '@/api/http';

const route = useRoute();
const router = useRouter();
const practiceAuth = usePracticeAuthStore();

const form = reactive({ username: '', password: '', captcha: '' });
const loading = ref(false);
/** 是否已要求验证码（后端返回 1012 时置真） */
const needCaptcha = ref(false);
const captchaId = ref('');
const captchaQuestion = ref('');

/** 拉取一枚新验证码 */
async function loadCaptcha(): Promise<void> {
  try {
    const captcha = await practiceApi.getCaptcha();
    captchaId.value = captcha.captchaId;
    captchaQuestion.value = captcha.question;
    form.captcha = '';
    needCaptcha.value = true;
  } catch {
    // 错误提示已由 http 拦截器统一弹出
  }
}

/** 跳转到登录前目标或练题首页 */
function redirectAfterLogin(): void {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
  const target = redirect.startsWith('/practice') ? redirect : '/practice/home';
  void router.replace(target);
}

/** 提交登录 */
async function handleSubmit(): Promise<void> {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await practiceAuth.login(
      form.username,
      form.password,
      needCaptcha.value ? captchaId.value : undefined,
      needCaptcha.value ? form.captcha : undefined,
    );
    ElMessage.success('登录成功');
    redirectAfterLogin();
  } catch (err) {
    const e = err as ApiError;
    // 1012 = 需要/校验验证码：展示验证码输入并刷新一枚（文案已由 http 拦截器弹出）
    if (e.code === 1012) {
      await loadCaptcha();
    }
    // 其余（凭据错误 1002 / 锁定 1011 / 限流 1010）文案已由 http 拦截器弹出
  } finally {
    loading.value = false;
  }
}

/** 打开页面时若无本地练题会话，守卫已保证停留在此；载入时预取验证码非必需，故按需拉取。 */
</script>

<template>
  <PracticeLayout>
    <div class="login">
      <div class="login__hero">
        <div class="login__logo" aria-hidden="true">练</div>
        <h1 class="login__title">在线练题</h1>
        <p class="login__subtitle">请使用公司账号登录后开始刷题</p>
      </div>

      <div class="login__panel">
        <div class="login__panel-head">账号登录</div>
        <el-form class="login__form" label-position="top" @submit.prevent="handleSubmit">
          <el-form-item label="账号">
            <el-input
              v-model="form.username"
              size="large"
              placeholder="请输入公司账号"
              autocomplete="username"
              clearable
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
            />
          </el-form-item>

          <el-form-item v-if="needCaptcha" label="验证码">
            <div class="login__captcha">
              <el-input
                v-model="form.captcha"
                size="large"
                placeholder="请输入计算结果"
                inputmode="numeric"
                class="login__captcha-input"
              />
              <span class="login__captcha-question">{{ captchaQuestion }}</span>
              <el-button text size="small" class="login__captcha-refresh" @click="loadCaptcha">换一个</el-button>
            </div>
          </el-form-item>

          <el-button class="login__submit" type="primary" size="large" :loading="loading" @click="handleSubmit">
            登 录
          </el-button>
        </el-form>
      </div>

      <p class="login__tip">账号与内网考试系统一致，无需另行注册</p>
    </div>
  </PracticeLayout>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.login {
  padding-top: 16px;

  &__hero {
    text-align: center;
    margin-bottom: 22px;
  }

  &__logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    border-radius: $practice-radius;
    background: $practice-primary;
    color: #fff;
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
  }

  &__title {
    margin: 14px 0 6px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 2px;
    color: $text-primary;
  }

  &__subtitle {
    margin: 0;
    font-size: 13px;
    color: $text-secondary;
  }

  /* 表单区：白卡 + 细边框 + 标题栏 */
  &__panel {
    padding: 0 18px 20px;
    background: #fff;
    border: 1px solid $practice-border;
    border-radius: $practice-radius;
  }

  &__panel-head {
    margin: 0 -18px 18px;
    padding: 14px 18px;
    border-bottom: 1px solid $border-soft;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: $text-primary;
  }

  &__form {
    :deep(.el-form-item__label) {
      padding-bottom: 6px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
      color: $text-secondary;
    }

    :deep(.el-input__wrapper) {
      border-radius: $practice-radius-sm;
      padding: 2px 12px;
      box-shadow: 0 0 0 1px $practice-border inset;
      background: #fff;
      transition: box-shadow $transition-fast;
    }

    :deep(.el-input__wrapper.is-focus) {
      box-shadow: 0 0 0 1px $practice-primary inset, 0 0 0 3px rgba(29, 78, 216, 0.12);
    }

    :deep(.el-input__inner) {
      height: 42px;
      font-size: 15px;
    }

    :deep(.el-form-item) {
      margin-bottom: 16px;
    }
  }

  &__captcha {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  &__captcha-input {
    flex: 1;
    min-width: 0;
  }

  &__captcha-question {
    flex: 0 0 auto;
    padding: 9px 14px;
    border-radius: $practice-radius-sm;
    background: $practice-soft;
    border: 1px solid $practice-border;
    font-size: 15px;
    font-weight: 700;
    color: $practice-primary;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  &__captcha-refresh {
    flex: 0 0 auto;
    color: $practice-primary;
  }

  &__submit {
    width: 100%;
    height: 46px;
    margin-top: 4px;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 3px;
    border: none;
    border-radius: $practice-radius-sm;
    background: $practice-primary;
    transition: background-color $transition-fast;

    &:hover,
    &:active {
      background: $practice-primary-dark;
    }
  }

  &__tip {
    margin: 18px 0 0;
    text-align: center;
    font-size: 12px;
    color: $text-disabled;
  }
}
</style>
