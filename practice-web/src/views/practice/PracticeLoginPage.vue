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
const captchaImage = ref('');

/** 拉取一枚新验证码 */
async function loadCaptcha(): Promise<void> {
  try {
    const captcha = await practiceApi.getCaptcha();
    captchaId.value = captcha.captchaId;
    captchaImage.value = captcha.image;
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
  <PracticeLayout bare>
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
                placeholder="请输入图中字符"
                maxlength="6"
                class="login__captcha-input"
              />
              <img
                v-if="captchaImage"
                class="login__captcha-img"
                :src="captchaImage"
                alt="图形验证码"
                @click="loadCaptcha"
              />
              <el-button text size="small" class="login__captcha-refresh" @click="loadCaptcha">
                换一张
              </el-button>
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
  flex: 1;
  display: flex;
  flex-direction: column;
  background: $bg-paper;

  /* 主色 hero：铺满顶部并延伸至状态栏区域（bare 布局下 main 已 flush） */
  &__hero {
    padding: calc(22px + env(safe-area-inset-top)) 22px 38px;
    background: $practice-primary;
    color: #fff;
  }

  &__logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 13px; // radius-exception：设计图 .pl__logo（主色块上的圆角标识）
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
  }

  &__title {
    margin: 16px 0 0;
    font-size: 23px;
    font-weight: 660;
    letter-spacing: -0.02em;
    color: #fff;
  }

  &__subtitle {
    margin: 6px 0 0;
    font-size: 12.5px;
    line-height: 1.6;
    opacity: 0.85;
  }

  /* 表单面板：白底 + 上圆角，负 margin 叠在主色 hero 之上（sheet 形态） */
  &__panel {
    flex: 1;
    margin-top: -16px;
    padding: 20px 22px 26px;
    background: $bg-paper;
    border-radius: 16px 16px 0 0; // radius-exception：设计图 .pl__panel（底部上浮 sheet）
  }

  &__panel-head {
    margin-bottom: 16px;
    font-size: 14px;
    font-weight: 650;
    color: $text-primary;
  }

  &__form {
    :deep(.el-form-item__label) {
      padding-bottom: 6px;
      font-size: 12px;
      font-weight: 560;
      line-height: 1.4;
      color: $text-secondary;
    }

    :deep(.el-input__wrapper) {
      border-radius: $practice-radius-sm;
      padding: 2px 12px;
      box-shadow: 0 0 0 1px $line-strong inset;
      background: $bg-paper;
      transition: box-shadow $transition-fast;
    }

    :deep(.el-input__wrapper.is-focus) {
      box-shadow: 0 0 0 1px $practice-primary inset, 0 0 0 3px rgba($practice-primary, 0.12);
    }

    :deep(.el-input__inner) {
      height: 42px;
      font-size: 15px;
    }

    :deep(.el-form-item) {
      margin-bottom: 14px;
    }
  }

  &__captcha {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
  }

  &__captcha-input {
    flex: 1;
    min-width: 0;
  }

  &__captcha-img {
    flex: 0 0 auto;
    height: 42px;
    width: 104px;
    border-radius: $practice-radius-sm;
    background: $bg-paper;
    border: 1px solid $line-strong;
    cursor: pointer;
  }

  &__captcha-refresh {
    flex: 0 0 auto;
    font-size: 11.5px;
    font-weight: 560;
    color: $practice-primary;
  }

  &__submit {
    width: 100%;
    height: 42px;
    margin-top: 6px;
    font-size: 15px;
    font-weight: 580;
    letter-spacing: 2px;
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
    font-size: 11.5px;
    line-height: 1.65;
    color: $text-secondary;
  }
}
</style>
