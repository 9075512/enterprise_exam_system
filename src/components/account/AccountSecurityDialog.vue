<script setup lang="ts">
/**
 * 账号安全（v1.7③）。
 * 集中管理：密码策略提示 / 两步验证（TOTP）/ 登录设备（会话）。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Key, Lock, Monitor, Refresh } from '@element-plus/icons-vue';
import * as authApi from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';
import type { LoginSession } from '@/types';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const auth = useAuthStore();
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

/* ------------------------------ 密码策略 ------------------------------ */
const policyText = ref('');
const expireDays = ref(0);

/* ------------------------------ 两步验证 ------------------------------ */
const twoFactorEnabled = computed(() => auth.currentUser?.twoFactorEnabled === true);
const setupSecret = ref('');
const setupUrl = ref('');
const setupCode = ref('');
const disablePassword = ref('');
const disableCode = ref('');
const busy = ref(false);

/* 恢复码（v1.8② U2）：明文仅在下发时展示一次 */
const recoveryRemaining = ref(0);
const recoveryCodes = ref<string[]>([]);
const regenPassword = ref('');
const regenCode = ref('');

/* ------------------------------ 登录设备 ------------------------------ */
const sessions = ref<LoginSession[]>([]);
const sessionsLoading = ref(false);

async function loadPolicy(): Promise<void> {
  try {
    const res = await authApi.twoFactorPolicy();
    policyText.value = res.text;
    expireDays.value = res.expireDays;
    recoveryRemaining.value = res.recoveryCodesRemaining;
  } catch {
    policyText.value = '';
  }
}

async function loadSessions(): Promise<void> {
  sessionsLoading.value = true;
  try {
    sessions.value = await authApi.listSessions();
  } catch {
    sessions.value = [];
  } finally {
    sessionsLoading.value = false;
  }
}

watch(visible, (open) => {
  if (!open) return;
  setupSecret.value = '';
  setupUrl.value = '';
  setupCode.value = '';
  disablePassword.value = '';
  disableCode.value = '';
  recoveryCodes.value = [];
  regenPassword.value = '';
  regenCode.value = '';
  void loadPolicy();
  void loadSessions();
});

/* ------------------------------ 两步验证操作 ------------------------------ */

async function startSetup(): Promise<void> {
  busy.value = true;
  try {
    const res = await authApi.setupTwoFactor();
    setupSecret.value = res.secret;
    setupUrl.value = res.otpauthUrl;
  } catch {
    /* 拦截器已提示 */
  } finally {
    busy.value = false;
  }
}

async function confirmEnable(): Promise<void> {
  if (!setupCode.value.trim()) {
    ElMessage.warning('请输入验证器中的 6 位验证码');
    return;
  }
  busy.value = true;
  try {
    const res = await authApi.enableTwoFactor(setupCode.value.trim());
    recoveryCodes.value = res.recoveryCodes;
    recoveryRemaining.value = res.recoveryCodes.length;
    ElMessage.success('两步验证已开启，请立即保存恢复码');
    setupSecret.value = '';
    setupUrl.value = '';
    setupCode.value = '';
    await auth.fetchMe();
  } catch {
    /* 拦截器已提示 */
  } finally {
    busy.value = false;
  }
}

/** 重新生成恢复码（需密码 + 验证码；旧码立即失效，v1.8②）。 */
async function confirmRegenerate(): Promise<void> {
  if (!regenPassword.value || !regenCode.value.trim()) {
    ElMessage.warning('请输入登录密码与验证码');
    return;
  }
  try {
    await ElMessageBox.confirm('重新生成后，此前保存的所有恢复码将立即失效。确认继续？', '重新生成恢复码', {
      type: 'warning',
    });
  } catch {
    return;
  }
  busy.value = true;
  try {
    const res = await authApi.regenerateRecoveryCodes(regenPassword.value, regenCode.value.trim());
    recoveryCodes.value = res.recoveryCodes;
    recoveryRemaining.value = res.recoveryCodes.length;
    regenPassword.value = '';
    regenCode.value = '';
    ElMessage.success('恢复码已重新生成，请立即保存');
  } catch {
    /* 拦截器已提示 */
  } finally {
    busy.value = false;
  }
}

async function copyRecoveryCodes(): Promise<void> {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'));
    ElMessage.success('恢复码已复制');
  } catch {
    ElMessage.warning('复制失败，请手动记录');
  }
}

/** 下载恢复码为 .txt（明文仅本次可下载）。 */
function downloadRecoveryCodes(): void {
  const header = `两步验证恢复码（${auth.currentUser?.username ?? ''}）\n每个恢复码仅可使用一次，请妥善离线保存。\n\n`;
  const blob = new Blob([header + recoveryCodes.value.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'two-factor-recovery-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function dismissRecoveryCodes(): void {
  recoveryCodes.value = [];
}

async function confirmDisable(): Promise<void> {
  if (!disablePassword.value || !disableCode.value.trim()) {
    ElMessage.warning('请输入登录密码与验证码');
    return;
  }
  busy.value = true;
  try {
    await authApi.disableTwoFactor(disablePassword.value, disableCode.value.trim());
    ElMessage.success('两步验证已关闭');
    disablePassword.value = '';
    disableCode.value = '';
    await auth.fetchMe();
  } catch {
    /* 拦截器已提示 */
  } finally {
    busy.value = false;
  }
}

async function copySecret(): Promise<void> {
  try {
    await navigator.clipboard.writeText(setupSecret.value);
    ElMessage.success('密钥已复制');
  } catch {
    ElMessage.warning('复制失败，请手动记录');
  }
}

/* ------------------------------ 设备操作 ------------------------------ */

async function revokeOne(row: LoginSession): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认下线「${describeAgent(row.userAgent)}」这台设备？`,
      '下线设备',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await authApi.revokeSession(row.id);
    ElMessage.success('该设备已下线');
    await loadSessions();
  } catch {
    /* 拦截器已提示 */
  }
}

async function revokeOthers(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认下线除当前设备外的全部设备？', '下线其他设备', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res = await authApi.revokeOtherSessions();
    ElMessage.success(res.count > 0 ? `已下线 ${res.count} 台设备` : '没有其他在线设备');
    await loadSessions();
  } catch {
    /* 拦截器已提示 */
  }
}

/** UA 简要描述（取浏览器/系统关键词，避免整串过长）。 */
function describeAgent(ua: string): string {
  if (!ua) return '未知设备';
  const os = /Windows NT/i.test(ua)
    ? 'Windows'
    : /Macintosh|Mac OS X/i.test(ua)
      ? 'macOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad/i.test(ua)
          ? 'iOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '未知系统';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : '浏览器';
  return `${os} · ${browser}`;
}
</script>

<template>
  <el-dialog v-model="visible" title="账号安全" width="720px" top="6vh">
    <div class="security">
      <!-- 密码策略 -->
      <el-card class="security__card" shadow="never">
        <template #header>
          <span class="security__title"><el-icon><Key /></el-icon> 密码策略</span>
        </template>
        <p class="security__desc">
          当前策略：{{ policyText || '加载中…' }}
        </p>
        <p class="security__desc">
          {{
            expireDays > 0
              ? `密码有效期为 ${expireDays} 天，超期登录时会提示修改。`
              : '密码未设置有效期。'
          }}
        </p>
        <p class="security__hint">如需修改密码，请使用右上角头像菜单中的「修改密码」。</p>
      </el-card>

      <!-- 两步验证 -->
      <el-card class="security__card" shadow="never">
        <template #header>
          <span class="security__title">
            <el-icon><Lock /></el-icon> 两步验证（TOTP）
            <el-tag class="security__state" size="small" :type="twoFactorEnabled ? 'success' : 'info'">
              {{ twoFactorEnabled ? '已开启' : '未开启' }}
            </el-tag>
          </span>
        </template>

        <template v-if="!twoFactorEnabled">
          <p class="security__desc">
            开启后，登录需在密码之外再输入验证器 App（如 Google Authenticator、微软
            Authenticator）生成的 6 位动态验证码。
          </p>

          <div class="security__actions">
            <el-button type="primary" :loading="busy" @click="startSetup">
              {{ setupSecret ? '重新生成密钥' : '开启两步验证' }}
            </el-button>
          </div>

          <div v-if="setupSecret" class="security__setup">
            <ol class="security__steps">
              <li>在验证器 App 中手动添加账号，密钥如下（或导入下方链接）：</li>
            </ol>
            <div class="security__secret">
              <code>{{ setupSecret }}</code>
              <el-button text :icon="CopyDocument" @click="copySecret">复制</el-button>
            </div>
            <el-input v-model="setupUrl" class="security__uri" readonly>
              <template #prepend>otpauth</template>
            </el-input>
            <p class="security__hint">添加完成后，在下方输入 App 当前显示的 6 位验证码以确认开启。</p>
            <div class="security__confirm">
              <el-input v-model="setupCode" class="security__code" placeholder="6 位验证码" maxlength="6" />
              <el-button type="primary" :loading="busy" @click="confirmEnable">确认开启</el-button>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="security__desc">
            两步验证已开启。关闭需校验登录密码与当前验证码。
          </p>
          <p class="security__desc">
            恢复码剩余
            <el-tag size="small" :type="recoveryRemaining > 3 ? 'info' : 'warning'">
              {{ recoveryRemaining }} / 10
            </el-tag>
            ；每个恢复码仅可使用一次，用于手机丢失时登录。用尽或疑似泄露可重新生成。
          </p>
          <div class="security__confirm">
            <el-input
              v-model="disablePassword"
              class="security__code"
              type="password"
              show-password
              placeholder="登录密码"
            />
            <el-input v-model="disableCode" class="security__code" placeholder="6 位验证码" maxlength="6" />
            <el-button type="danger" :loading="busy" @click="confirmDisable">关闭两步验证</el-button>
          </div>

          <el-divider class="security__divider" />
          <p class="security__desc">重新生成恢复码（需密码 + 验证码，旧码立即失效）：</p>
          <div class="security__confirm">
            <el-input
              v-model="regenPassword"
              class="security__code"
              type="password"
              show-password
              placeholder="登录密码"
            />
            <el-input v-model="regenCode" class="security__code" placeholder="6 位验证码" maxlength="6" />
            <el-button :loading="busy" @click="confirmRegenerate">重新生成</el-button>
          </div>
        </template>

        <!-- 恢复码明文（仅下发时展示一次，v1.8② U2） -->
        <div v-if="recoveryCodes.length > 0" class="security__recovery">
          <el-alert type="warning" :closable="false" show-icon>
            以下恢复码<strong>仅本次显示</strong>，请立即复制或下载并离线保存；每个恢复码只能使用一次。
          </el-alert>
          <div class="security__recovery-actions">
            <el-button text :icon="CopyDocument" @click="copyRecoveryCodes">复制全部</el-button>
            <el-button text @click="downloadRecoveryCodes">下载 .txt</el-button>
            <el-button text type="danger" @click="dismissRecoveryCodes">我已保存，关闭</el-button>
          </div>
          <div class="security__recovery-list">
            <code v-for="c in recoveryCodes" :key="c">{{ c }}</code>
          </div>
        </div>
      </el-card>

      <!-- 登录设备 -->
      <el-card class="security__card" shadow="never">
        <template #header>
          <span class="security__title"><el-icon><Monitor /></el-icon> 登录设备</span>
          <div class="security__header-actions">
            <el-button text :icon="Refresh" @click="loadSessions">刷新</el-button>
            <el-button text type="danger" @click="revokeOthers">下线其他设备</el-button>
          </div>
        </template>

        <el-table v-loading="sessionsLoading" :data="sessions" size="small" row-key="id">
          <el-table-column label="设备" min-width="160">
            <template #default="{ row }">
              {{ describeAgent(row.userAgent) }}
              <el-tag v-if="row.current" class="security__current" size="small" type="success">当前</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="150" />
          <el-table-column label="最后活跃" width="170">
            <template #default="{ row }">{{ formatDateTime(row.lastSeenAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="!row.current" type="danger" link @click="revokeOne(row as LoginSession)">
                下线
              </el-button>
              <span v-else class="security__dash">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <span class="security__hint">暂无有效登录设备</span>
          </template>
        </el-table>
      </el-card>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.security {
  display: flex;
  flex-direction: column;
  gap: 14px;

  &__card {
    border: 1px solid $border-color;

    :deep(.el-card__header) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
    }
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  &__state {
    margin-left: 6px;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__desc {
    margin: 0 0 8px;
    font-size: 13px;
    color: $text-secondary;
    line-height: 1.6;
  }

  &__hint {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__actions {
    margin: 10px 0 4px;
  }

  &__setup {
    margin-top: 8px;
    padding: 12px;
    border: 1px dashed $border-color;
    border-radius: $radius-sm;
    background: $bg-page;
  }

  &__steps {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: 13px;
    color: $text-secondary;
  }

  &__secret {
    display: flex;
    align-items: center;
    gap: 8px;

    code {
      flex: 1;
      padding: 8px 10px;
      font-family: Consolas, monospace;
      font-size: 14px;
      letter-spacing: 0.08em;
      background: #fff;
      border: 1px solid $border-color;
      border-radius: $radius-sm;
      word-break: break-all;
    }
  }

  &__uri {
    margin-top: 8px;
  }

  &__confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  &__code {
    width: 180px;
  }

  &__current {
    margin-left: 6px;
  }

  &__dash {
    color: $text-secondary;
  }

  &__divider {
    margin: 14px 0 10px;
  }

  &__recovery {
    margin-top: 12px;
    padding: 12px;
    border: 1px dashed $border-color;
    border-radius: $radius-sm;
    background: $bg-page;
  }

  &__recovery-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 8px 0;
  }

  &__recovery-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;

    code {
      padding: 6px 10px;
      font-family: Consolas, monospace;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-align: center;
      background: #fff;
      border: 1px solid $border-color;
      border-radius: $radius-sm;
    }
  }
}
</style>
