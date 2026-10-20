<script setup lang="ts">
/**
 * 账号安全（v1.7③）。
 * 集中管理：密码策略提示 / 两步验证（TOTP）/ 登录设备（会话）。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Key, Lock, Monitor, Refresh } from '@element-plus/icons-vue';
import * as authApi from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';
import type { LoginSession } from '@/types';
import { useRequest } from '@/composables/useRequest';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const auth = useAuthStore();
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => { if (!busy.value && !devicesBusy.value) emit('update:modelValue', v); },
});

/* ------------------------------ 密码策略 ------------------------------ */
const { data: policy, loading: policyLoading, error: policyError, refresh: loadPolicy } = useRequest(
  () => visible.value ? authApi.twoFactorPolicy() : Promise.resolve(null),
  [visible], { immediate: props.modelValue, keepPreviousData: false },
);

/* ------------------------------ 两步验证 ------------------------------ */
const twoFactorEnabled = computed(() => auth.currentUser?.twoFactorEnabled === true);
const setupSecret = ref('');
const setupUrl = ref('');
const setupCode = ref('');
const disablePassword = ref('');
const disableCode = ref('');
const busy = ref(false);

/* 恢复码（v1.8② U2）：明文仅在下发时展示一次 */
const recoveryRemaining = ref<number | null>(null);
watch(policy, (value) => { recoveryRemaining.value = value?.recoveryCodesRemaining ?? null; });
const recoveryCodes = ref<string[]>([]);
const regenPassword = ref('');
const regenCode = ref('');

/* ------------------------------ 登录设备 ------------------------------ */
const devicesBusy = ref(false);
const operationBusy = computed(() => busy.value || devicesBusy.value);
const securityError = ref('');
const devicesError = ref('');
const securityErrorRef = ref<HTMLElement>();
const devicesErrorRef = ref<HTMLElement>();
async function showActionError(section: 'security' | 'devices', message: string): Promise<void> {
  if (section === 'security') securityError.value = message; else devicesError.value = message;
  await nextTick();
  (section === 'security' ? securityErrorRef.value : devicesErrorRef.value)?.focus();
}
const { data: sessions, loading: sessionsLoading, error: sessionsError, refresh: loadSessions } = useRequest(
  () => visible.value ? authApi.listSessions() : Promise.resolve([] as LoginSession[]),
  [visible], { immediate: props.modelValue, keepPreviousData: false },
);

watch(visible, () => {
  securityError.value = '';
  devicesError.value = '';
  setupSecret.value = '';
  setupUrl.value = '';
  setupCode.value = '';
  disablePassword.value = '';
  disableCode.value = '';
  recoveryCodes.value = [];
  regenPassword.value = '';
  regenCode.value = '';
});

/* ------------------------------ 两步验证操作 ------------------------------ */

async function startSetup(): Promise<void> {
  if (operationBusy.value) return;
  securityError.value = '';
  busy.value = true;
  try {
    const res = await authApi.setupTwoFactor();
    setupSecret.value = res.secret;
    setupUrl.value = res.otpauthUrl;
  } catch {
    await showActionError('security', '密钥生成失败，请重试。');
  } finally {
    busy.value = false;
  }
}

async function confirmEnable(): Promise<void> {
  if (operationBusy.value) return;
  securityError.value = '';
  if (!setupCode.value.trim()) {
    await showActionError('security', '请输入验证器中的 6 位验证码');
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
    await showActionError('security', '开启两步验证失败，验证码已保留，请核对后重试。');
  } finally {
    busy.value = false;
  }
}

/** 重新生成恢复码（需密码 + 验证码；旧码立即失效，v1.8②）。 */
async function confirmRegenerate(): Promise<void> {
  if (operationBusy.value) return;
  securityError.value = '';
  if (!regenPassword.value || !regenCode.value.trim()) {
    await showActionError('security', '请输入登录密码与验证码');
    return;
  }
  busy.value = true;
  try {
    await ElMessageBox.confirm('重新生成后，此前保存的所有恢复码将立即失效。确认继续？', '重新生成恢复码', {
      type: 'warning',
    });
  } catch {
    busy.value = false;
    return;
  }
  try {
    const res = await authApi.regenerateRecoveryCodes(regenPassword.value, regenCode.value.trim());
    recoveryCodes.value = res.recoveryCodes;
    recoveryRemaining.value = res.recoveryCodes.length;
    regenPassword.value = '';
    regenCode.value = '';
    ElMessage.success('恢复码已重新生成，请立即保存');
  } catch {
    await showActionError('security', '恢复码生成失败，本次输入已保留，原有恢复码状态以服务端校验为准。');
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
  if (operationBusy.value) return;
  securityError.value = '';
  if (!disablePassword.value || !disableCode.value.trim()) {
    await showActionError('security', '请输入登录密码与验证码');
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
    await showActionError('security', '关闭两步验证失败，本次输入已保留，请核对后重试。');
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
  if (operationBusy.value || sessionsLoading.value || sessionsError.value || row.current) return;
  devicesError.value = '';
  devicesBusy.value = true;
  try {
    await ElMessageBox.confirm(
      `确认下线「${describeAgent(row.userAgent)}」这台设备？`,
      '下线设备',
      { type: 'warning' },
    );
  } catch {
    devicesBusy.value = false;
    return;
  }
  try {
    await authApi.revokeSession(row.id);
    ElMessage.success('该设备已下线');
    await loadSessions();
  } catch {
    await showActionError('devices', '设备下线失败，请重试。');
  } finally { devicesBusy.value = false; }
}

async function revokeOthers(): Promise<void> {
  if (operationBusy.value || sessionsLoading.value || sessionsError.value || !sessions.value?.some(s => !s.current)) return;
  devicesError.value = '';
  devicesBusy.value = true;
  try {
    await ElMessageBox.confirm('确认下线除当前设备外的全部设备？', '下线其他设备', {
      type: 'warning',
    });
  } catch {
    devicesBusy.value = false;
    return;
  }
  try {
    const res = await authApi.revokeOtherSessions();
    ElMessage.success(res.count > 0 ? `已下线 ${res.count} 台设备` : '没有其他在线设备');
    await loadSessions();
  } catch {
    await showActionError('devices', '其他设备下线失败，请重试。');
  } finally { devicesBusy.value = false; }
}

/** UA 简要描述（取浏览器/系统关键词，避免整串过长）。 */
function describeAgent(ua: string): string {
  if (!ua) return '未知设备';
  const os = /iPhone|iPad/i.test(ua) ? 'iOS'
    : /Windows NT/i.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
    : /Android/i.test(ua) ? 'Android'
    : /Linux/i.test(ua) ? 'Linux' : '未知系统';
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
  <el-dialog class="account-dialog" v-model="visible" title="账号安全" width="800px" top="6vh" append-to-body :close-on-click-modal="!busy && !devicesBusy" :close-on-press-escape="!busy && !devicesBusy" :show-close="!busy && !devicesBusy">
    <div class="security">
      <!-- 密码策略 -->
      <el-card class="security__card" shadow="never">
        <template #header>
          <span class="security__title"><el-icon><Key /></el-icon> 密码策略</span>
        </template>
        <RequestError v-if="policyError" text="密码策略与恢复码数量加载失败" @retry="loadPolicy" />
        <p v-else-if="policyLoading" class="security__desc">正在加载账号安全策略…</p>
        <p v-else class="security__desc">当前策略：{{ policy?.text || '—' }}</p>
        <p v-if="policy" class="security__desc">
          {{
            policy.expireDays > 0
              ? `密码有效期为 ${policy.expireDays} 天，超期登录时会提示修改。`
              : '密码未设置有效期。'
          }}
        </p>
        <p class="security__hint">可在个人中心或头像菜单中选择「修改密码」。</p>
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

        <div v-if="securityError" ref="securityErrorRef" class="account-dialog__error" role="alert" tabindex="-1"><el-alert :title="securityError" type="error" :closable="false" show-icon /></div>
        <template v-if="!twoFactorEnabled">
          <p class="security__desc">
            开启后，登录需在密码之外再输入验证器 App（如 Google Authenticator、微软
            Authenticator）生成的 6 位动态验证码。
          </p>

          <div class="security__actions">
            <el-button type="primary" :loading="busy" :disabled="devicesBusy" @click="startSetup">
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
              <el-input v-model="setupCode" class="security__code" :disabled="operationBusy" placeholder="6 位验证码" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
              <el-button type="primary" :loading="busy" :disabled="devicesBusy" @click="confirmEnable">确认开启</el-button>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="security__desc">
            两步验证已开启。关闭需校验登录密码与当前验证码。
          </p>
          <p class="security__desc">
            恢复码剩余
            <el-tag size="small" :type="recoveryRemaining === null || recoveryRemaining > 3 ? 'info' : 'warning'">
              {{ recoveryRemaining ?? '—' }} / 10
            </el-tag>
            ；每个恢复码仅可使用一次，用于手机丢失时登录。用尽或疑似泄露可重新生成。
          </p>
          <div class="security__confirm">
            <el-input
              v-model="disablePassword"
              :disabled="operationBusy"
              autocomplete="current-password"
              class="security__code"
              type="password"
              show-password
              placeholder="登录密码"
            />
            <el-input v-model="disableCode" class="security__code" :disabled="operationBusy" placeholder="6 位验证码" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
            <el-button type="danger" :loading="busy" :disabled="devicesBusy" @click="confirmDisable">关闭两步验证</el-button>
          </div>

          <el-divider class="security__divider" />
          <p class="security__desc">重新生成恢复码（需密码 + 验证码，旧码立即失效）：</p>
          <div class="security__confirm">
            <el-input
              v-model="regenPassword"
              :disabled="operationBusy"
              autocomplete="current-password"
              class="security__code"
              type="password"
              show-password
              placeholder="登录密码"
            />
            <el-input v-model="regenCode" class="security__code" :disabled="operationBusy" placeholder="6 位验证码" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
            <el-button :loading="busy" :disabled="devicesBusy" @click="confirmRegenerate">重新生成</el-button>
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
            <el-button text :icon="Refresh" :loading="sessionsLoading" :disabled="operationBusy" @click="loadSessions">刷新</el-button>
            <el-button text type="danger" :loading="devicesBusy" :disabled="operationBusy || sessionsLoading || Boolean(sessionsError) || !sessions?.some(s => !s.current)" @click="revokeOthers">下线其他设备</el-button>
          </div>
        </template>

        <p class="security__hint">当前账号的有效登录会话 · {{ sessionsLoading ? '加载中…' : sessionsError ? '数量未知' : `${sessions?.length ?? 0} 台设备` }}</p>
        <div v-if="devicesError" ref="devicesErrorRef" class="account-dialog__error" role="alert" tabindex="-1"><el-alert :title="devicesError" type="error" :closable="false" show-icon /></div>
        <RequestError v-if="sessionsError" text="登录设备加载失败" @retry="loadSessions" />
        <el-table v-else class="security__devices-table" v-loading="sessionsLoading || devicesBusy" :data="sessions ?? []" row-key="id">
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
          <el-table-column class-name="table-actions-cell" label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="!row.current" type="danger" link :disabled="operationBusy || sessionsLoading" @click="revokeOne(row as LoginSession)">
                下线
              </el-button>
              <span v-else class="security__dash">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState text="暂无有效登录设备" />
          </template>
        </el-table>
        <div v-if="!sessionsError" class="security__devices-cards" v-loading="sessionsLoading || devicesBusy">
          <article v-for="row in sessions ?? []" :key="row.id" class="security__device">
            <div class="security__device-head"><strong>{{ describeAgent(row.userAgent) }}</strong><el-tag v-if="row.current" size="small" type="success">当前设备</el-tag></div>
            <dl><dt>IP</dt><dd>{{ row.ip || '—' }}</dd><dt>最后活跃</dt><dd>{{ formatDateTime(row.lastSeenAt) }}</dd></dl>
            <el-button v-if="!row.current" type="danger" plain :disabled="operationBusy || sessionsLoading" @click="revokeOne(row)">下线设备</el-button>
          </article>
          <EmptyState v-if="!sessionsLoading && !sessions?.length" text="暂无有效登录设备" />
        </div>
      </el-card>
    </div>
    <template #footer><el-button :disabled="busy || devicesBusy" @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.security {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;

  &__card {
    border: 1px solid $border-color;

    :deep(.el-card__header) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px 20px;
    }
  }

  &__title {
    display: inline-flex;
    flex-wrap: wrap;
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
      min-width: 0;
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

  &__devices-cards { display: none; }
  &__device { min-width: 0; padding: 12px; border: 1px solid $border-color; border-radius: $radius-base; }
  &__device-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; strong { overflow-wrap: anywhere; } }
  &__device dl { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 8px; margin: 12px 0; font-size: 13px; line-height: 1.6; }
  &__device dt { color: $text-secondary; }
  &__device dd { margin: 0; overflow-wrap: anywhere; }
  &__device .el-button { width: 100%; min-height: 44px; }
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
    flex-wrap: wrap;
    margin: 8px 0;
  }

  &__recovery-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;

    code {
      overflow-wrap: anywhere;
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
  @media (max-width: 600px) {
    gap: 16px;
    &__card :deep(.el-card__header), &__card :deep(.el-card__body) { padding: 16px; }
    &__code { width: 100%; }
    &__devices-table { display: none; }
    &__devices-cards { display: grid; gap: 12px; }
    &__header-actions { flex-wrap: wrap; width: 100%; gap: 8px; }
    &__header-actions .el-button, &__recovery-actions .el-button { min-height: 44px; margin: 0; }
    &__confirm .el-button { width: 100%; min-height: 44px; }
    &__recovery-list { grid-template-columns: minmax(0, 1fr); }
    &__secret { flex-wrap: wrap; }
    &__secret code { flex-basis: 100%; }
    &__confirm .el-button { margin-left: 0; }
  }
}
</style>
