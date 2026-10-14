<script setup lang="ts">
/**
 * 首页配置（v2.0⑥）—— 考试端考生首页的科室级个性化。
 *
 * 可配置内容：
 *   1) 快捷入口：固定目录（我的考试 / 我的成绩 / 我的补考 / 消息中心）的**启停 + 文案覆盖**；
 *   2) 推荐练题题库：下发给该科室考生的推荐题库（仅可选已开放对外练题的题库）。
 *
 * 生效优先级（服务端权威口径）：
 *   本科室配置行 → 全局默认行（`*`） → 内置默认（全部启用、无推荐题库）。
 *   科室一旦保存配置，该配置即**整体生效**（不做逐项合并），页面对未配置科室会提示
 *   「当前继承全局默认」，避免管理员误以为已在科室级生效。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getConfigs, saveConfig, resetConfig } from '@/api/home';
import { list as listBanks } from '@/api/banks';
import PageHeader from '@/components/common/PageHeader.vue';
import { formatDateTime } from '@/utils/datetime';
import type { HomeConfigOverview, HomeDeptConfig, HomeShortcutConfigItem, QuestionBank } from '@/types';

/** 全局默认行哨兵 id（与后端 GLOBAL_DEPT_ID 一致） */
const GLOBAL_ID = '*';

const loading = ref(true);
const saving = ref(false);
const resetting = ref(false);
const overview = ref<HomeConfigOverview | null>(null);
const banks = ref<QuestionBank[]>([]);

/** 当前编辑目标（'*' = 全局默认） */
const selectedDept = ref<string>(GLOBAL_ID);

const form = reactive<{ shortcuts: HomeShortcutConfigItem[]; recommendedBankIds: string[] }>({
  shortcuts: [],
  recommendedBankIds: [],
});

/** 载入时的快照（脏检查用） */
let snapshot = '';

/* ------------------------------ 派生 ------------------------------ */

const catalog = computed(() => overview.value?.catalog ?? []);

const configOf = computed<HomeDeptConfig | null>(
  () => overview.value?.configs.find((c) => c.departmentId === selectedDept.value) ?? null,
);

/** 当前目标是否已有落库配置 */
const configured = computed<boolean>(() => configOf.value !== null);

/** 当前编辑的是否全局默认行 */
const isGlobalTarget = computed<boolean>(() => selectedDept.value === GLOBAL_ID);

const dirty = computed<boolean>(() => JSON.stringify(payload()) !== snapshot);

/** 可选题库：仅「已开放对外练题」的题库（与后端校验口径一致，避免保存被拒） */
const bankOptions = computed<QuestionBank[]>(() => banks.value.filter((b) => b.allowPractice));

/** 至少启用一个快捷入口（后端同口径校验） */
const enabledCount = computed<number>(() => form.shortcuts.filter((s) => s.enabled).length);

/** 预览：服务端实际会下发的快捷入口（含文案覆盖回落） */
const previewShortcuts = computed<Array<{ key: string; text: string; enabled: boolean }>>(() =>
  catalog.value.map((c) => {
    const cfg = form.shortcuts.find((s) => s.key === c.key);
    const text = (cfg?.text ?? '').trim();
    return { key: c.key, text: text === '' ? c.text : text, enabled: cfg ? cfg.enabled : true };
  }),
);

/** 预览：推荐题库（含题库名与题量；已被关闭对外练题的会被服务端过滤，这里同样提示） */
const previewBanks = computed<Array<{ bankId: string; bankName: string; questionCount: number }>>(() =>
  form.recommendedBankIds.map((id) => {
    const b = banks.value.find((x) => x.id === id);
    return {
      bankId: id,
      bankName: b ? b.name : `已删除题库（${id}）`,
      questionCount: b ? b.questionCount : 0,
    };
  }),
);

/* ------------------------------ 数据加载 ------------------------------ */

onMounted(() => {
  void loadAll();
});

async function loadAll(): Promise<void> {
  loading.value = true;
  try {
    const [ov, bankList] = await Promise.all([getConfigs(), listBanks()]);
    overview.value = ov;
    banks.value = bankList;
    applyTarget(selectedDept.value);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

/**
 * 把编辑表单切到某个目标科室。
 * 已有配置 → 用配置值；未配置 → 展示**当前实际继承**的值（科室继承全局默认；
 * 全局默认未配置时回落内置默认「全部启用」），并只读提示尚未落库。
 */
function applyTarget(deptId: string): void {
  const ov = overview.value;
  const cfg = ov?.configs.find((c) => c.departmentId === deptId) ?? null;

  const shortcuts: HomeShortcutConfigItem[] = catalog.value.map((c) => {
    const hit = cfg?.shortcuts.find((s) => s.key === c.key);
    if (hit) return { key: c.key, enabled: hit.enabled, ...(hit.text ? { text: hit.text } : {}) };
    if (!cfg && deptId !== GLOBAL_ID) {
      // 未配置的科室：按全局默认的**生效值**预填（保存后才真正独立）
      const inherited = ov?.globalShortcuts.find((s) => s.key === c.key);
      if (inherited) return { key: c.key, enabled: inherited.enabled };
    }
    // 全局默认未配置 / 行内未提及该 key → 内置默认启用
    return { key: c.key, enabled: true };
  });

  const recommendedBankIds = cfg
    ? [...cfg.recommendedBankIds]
    : deptId !== GLOBAL_ID
      ? (ov?.globalRecommendedBanks ?? []).map((b) => b.bankId)
      : [];

  form.shortcuts = shortcuts;
  form.recommendedBankIds = recommendedBankIds;
  snapshot = JSON.stringify(payload());
}

/** 表单切换目标（选择科室下拉）。 */
function onTargetChange(deptId: string): void {
  applyTarget(deptId);
}

function payload(): { shortcuts: HomeShortcutConfigItem[]; recommendedBankIds: string[] } {
  return {
    shortcuts: form.shortcuts.map((s) => {
      const text = (s.text ?? '').trim();
      return { key: s.key, enabled: s.enabled, ...(text === '' ? {} : { text }) };
    }),
    recommendedBankIds: [...form.recommendedBankIds],
  };
}

/* ------------------------------ 操作 ------------------------------ */

async function handleSave(): Promise<void> {
  if (enabledCount.value === 0) {
    ElMessage.warning('至少保留一个快捷入口');
    return;
  }
  saving.value = true;
  try {
    await saveConfig(selectedDept.value, payload());
    ElMessage.success(isGlobalTarget.value ? '全局默认已保存' : '科室配置已保存，考生首页即时生效');
    await loadAll();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    saving.value = false;
  }
}

async function handleReset(row?: HomeDeptConfig): Promise<void> {
  const deptId = row ? row.departmentId : selectedDept.value;
  const name = row ? row.departmentName : isGlobalTarget.value ? '全局默认' : currentTargetName();
  try {
    await ElMessageBox.confirm(
      `将删除「${name}」的首页配置，该范围回到${deptId === GLOBAL_ID ? '内置默认（全部快捷入口启用、无推荐题库）' : '全局默认'}。`,
      '重置配置',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  resetting.value = true;
  try {
    await resetConfig(deptId);
    ElMessage.success('已重置');
    await loadAll();
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    resetting.value = false;
  }
}

/** 从「已配置」表格点「编辑」：切到该科室。 */
function editRow(row: unknown): void {
  const cfg = row as HomeDeptConfig;
  selectedDept.value = cfg.departmentId;
  applyTarget(cfg.departmentId);
}

function currentTargetName(): string {
  if (isGlobalTarget.value) return '全局默认';
  return overview.value?.departments.find((d) => d.id === selectedDept.value)?.name ?? selectedDept.value;
}

/** 目录默认文案（输入框 placeholder） */
function catalogText(key: string): string {
  return catalog.value.find((c) => c.key === key)?.text ?? '';
}

function catalogDesc(key: string): string {
  return catalog.value.find((c) => c.key === key)?.desc ?? '';
}

function formatAt(v: string | null): string {
  return v ? formatDateTime(v) : '-';
}
</script>

<template>
  <div class="home-config-page">
    <PageHeader
      title="首页配置"
      description="按科室下发考试端首页的快捷入口与推荐练题题库；未单独配置的科室继承「全局默认」"
    >
      <template #actions>
        <el-button :disabled="!dirty" @click="applyTarget(selectedDept)">放弃修改</el-button>
        <el-button
          v-if="configured"
          :loading="resetting"
          @click="handleReset()"
        >
          重置为{{ isGlobalTarget ? '内置默认' : '全局默认' }}
        </el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="handleSave">
          保存配置
        </el-button>
      </template>
    </PageHeader>

    <!-- ============ 1. 选择配置范围 ============ -->
    <el-card v-loading="loading" class="home-config-page__panel" shadow="never">
      <template #header>
        <div class="home-config-page__head">
          <span class="home-config-page__head-title">配置范围</span>
          <span class="home-config-page__head-meta">
            已配置
            <b>{{ overview?.configs.length ?? 0 }}</b>
            项
          </span>
        </div>
      </template>

      <div class="home-config-page__target">
        <el-select
          :model-value="selectedDept"
          class="home-config-page__select"
          filterable
          @update:model-value="(v: string) => { selectedDept = v; onTargetChange(v); }"
        >
          <el-option label="全局默认（所有未单独配置的科室）" :value="GLOBAL_ID" />
          <el-option
            v-for="d in overview?.departments ?? []"
            :key="d.id"
            :label="d.name"
            :value="d.id"
          />
        </el-select>

        <el-tag v-if="configured" type="success" size="small" effect="plain">已配置</el-tag>
        <el-tag v-else-if="isGlobalTarget" type="info" size="small" effect="plain">使用内置默认</el-tag>
        <el-tag v-else type="warning" size="small" effect="plain">继承全局默认（未落库）</el-tag>

        <span v-if="dirty" class="home-config-page__dirty">有未保存的修改</span>
      </div>

      <el-alert
        v-if="!configured && !isGlobalTarget"
        class="home-config-page__alert"
        type="info"
        show-icon
        :closable="false"
        title="当前显示的是「全局默认」的生效值"
        description="保存后，该科室将拥有独立配置（整体覆盖全局默认，不做逐项合并）；不保存则继续跟随全局默认的后续调整。"
      />
      <el-alert
        v-else-if="!configured && isGlobalTarget"
        class="home-config-page__alert"
        type="info"
        show-icon
        :closable="false"
        title="尚未配置全局默认，当前使用内置默认（全部快捷入口启用、无推荐题库）"
      />
    </el-card>

    <!-- ============ 2. 快捷入口 ============ -->
    <el-card v-loading="loading" class="home-config-page__panel" shadow="never">
      <template #header>
        <div class="home-config-page__head">
          <span class="home-config-page__head-title">快捷入口</span>
          <span class="home-config-page__head-meta">
            已启用
            <b>{{ enabledCount }}</b>
            / {{ catalog.length }}
          </span>
        </div>
      </template>

      <el-alert
        class="home-config-page__alert"
        type="info"
        show-icon
        :closable="false"
        title="入口本身为固定目录（跳转与图标由系统决定）"
        description="这里只能控制「是否显示」与「显示文案」；文案留空即使用目录默认文案。至少保留一个入口。"
      />

      <div v-for="c in catalog" :key="c.key" class="home-config-page__row">
        <div class="home-config-page__row-main">
          <el-switch
            v-model="form.shortcuts.find((s) => s.key === c.key)!.enabled"
            active-text="显示"
            inactive-text="隐藏"
          />
          <div class="home-config-page__row-text">
            <span class="home-config-page__row-name">{{ c.text }}</span>
            <span class="home-config-page__row-desc">{{ c.desc }}</span>
          </div>
        </div>
        <el-input
          v-model="form.shortcuts.find((s) => s.key === c.key)!.text"
          class="home-config-page__input"
          maxlength="12"
          show-word-limit
          clearable
          :placeholder="`文案覆盖（默认：${catalogText(c.key)}）`"
          :disabled="!form.shortcuts.find((s) => s.key === c.key)!.enabled"
        />
      </div>
    </el-card>

    <!-- ============ 3. 推荐练题题库 ============ -->
    <el-card v-loading="loading" class="home-config-page__panel" shadow="never">
      <template #header>
        <div class="home-config-page__head">
          <span class="home-config-page__head-title">推荐练题题库</span>
          <span class="home-config-page__head-meta">最多 6 个 · 仅可选已开放对外练题的题库</span>
        </div>
      </template>

      <el-select
        v-model="form.recommendedBankIds"
        class="home-config-page__bank-select"
        multiple
        filterable
        clearable
        collapse-tags
        collapse-tags-tooltip
        :multiple-limit="6"
        placeholder="不推荐任何题库"
      >
        <el-option
          v-for="b in bankOptions"
          :key="b.id"
          :label="`${b.name}（${b.questionCount} 题）`"
          :value="b.id"
        />
      </el-select>
      <p class="home-config-page__hint">
        仅「已开放对外练题」的题库会出现在选项中；若题库后续被关闭对外练题，考生首页会自动摘除该推荐（不留死链）。
      </p>

      <div v-if="bankOptions.length === 0 && !loading" class="home-config-page__empty">
        当前没有可用题库。请先在「练题端设置 → 练题题库（对外开放）」中开启至少一个题库。
      </div>
    </el-card>

    <!-- ============ 4. 生效预览 ============ -->
    <el-card class="home-config-page__panel" shadow="never">
      <template #header>
        <div class="home-config-page__head">
          <span class="home-config-page__head-title">
            生效预览 · {{ currentTargetName() }}
          </span>
          <span class="home-config-page__head-meta">保存后考生首页将展示以下内容</span>
        </div>
      </template>

      <div class="home-config-page__preview-label">快捷入口</div>
      <div class="home-config-page__preview-entries">
        <div
          v-for="s in previewShortcuts.filter((x) => x.enabled)"
          :key="s.key"
          class="home-config-page__entry"
        >
          {{ s.text }}
        </div>
        <span v-if="previewShortcuts.filter((x) => x.enabled).length === 0" class="home-config-page__hint">
          未启用任何快捷入口（保存会被拒绝）
        </span>
      </div>

      <div class="home-config-page__preview-label">推荐练题题库</div>
      <div class="home-config-page__preview-entries">
        <div v-for="b in previewBanks" :key="b.bankId" class="home-config-page__entry">
          {{ b.bankName }} · {{ b.questionCount }} 题
        </div>
        <span v-if="previewBanks.length === 0" class="home-config-page__hint">不推荐任何题库</span>
      </div>
    </el-card>

    <!-- ============ 5. 已配置清单 ============ -->
    <el-card v-loading="loading" class="home-config-page__panel" shadow="never">
      <template #header>
        <div class="home-config-page__head">
          <span class="home-config-page__head-title">已配置清单</span>
          <span class="home-config-page__head-meta">未出现在此列表的科室均继承「全局默认」</span>
        </div>
      </template>

      <el-table
        :data="overview?.configs ?? []"
        row-key="departmentId"
        stripe
        size="small"
        empty-text="暂无科室级配置"
      >
        <el-table-column label="配置范围" min-width="200">
          <template #default="{ row }">
            <span>{{ row.departmentName }}</span>
            <el-tag v-if="row.isGlobal" class="home-config-page__tag" type="primary" size="small" effect="plain">
              全局
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="快捷入口" width="150" align="center">
          <template #default="{ row }">
            {{ row.shortcuts.filter((s: HomeShortcutConfigItem) => s.enabled).length }} /
            {{ catalog.length }} 个启用
          </template>
        </el-table-column>
        <el-table-column label="推荐题库" min-width="200">
          <template #default="{ row }">
            <span v-if="row.recommendedBanks.length === 0" class="home-config-page__hint">—</span>
            <el-tag
              v-for="b in row.recommendedBanks"
              v-else
              :key="b.bankId"
              class="home-config-page__tag"
              type="info"
              size="small"
              effect="plain"
            >
              {{ b.bankName }}（{{ b.questionCount }}）
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后修改" width="220">
          <template #default="{ row }">
            <span>{{ row.updatedByName || row.updatedBy || '-' }}</span>
            <span class="home-config-page__hint"> · {{ formatAt(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="editRow(row)">编辑</el-button>
            <el-button link type="danger" :loading="resetting" @click="handleReset(row as HomeDeptConfig)">
              重置
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.home-config-page {
  &__panel {
    margin-bottom: 18px;
    border-radius: $radius-lg;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  &__head-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  &__head-meta {
    font-size: 12.5px;
    color: $text-secondary;

    b {
      color: $color-primary;
      font-variant-numeric: tabular-nums;
    }
  }

  &__alert {
    margin-bottom: 16px;
  }

  &__target {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__select {
    width: 360px;
    max-width: 100%;
  }

  &__dirty {
    font-size: 12.5px;
    color: $color-warning-text;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__row-main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  &__row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__row-name {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__row-desc {
    font-size: 12.5px;
    color: $text-secondary;
  }

  &__input {
    width: 260px;
    flex: none;
  }

  &__bank-select {
    width: 100%;
    max-width: 520px;
  }

  &__hint {
    margin: 8px 0 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: $text-secondary;
  }

  &__empty {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-page;
    font-size: 13px;
    color: $text-secondary;
  }

  &__preview-label {
    margin: 4px 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;

    &:not(:first-child) {
      margin-top: 18px;
    }
  }

  &__preview-entries {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  &__entry {
    padding: 8px 14px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-page;
    font-size: 13px;
    color: $text-primary;
  }

  &__tag {
    margin-left: 6px;
  }
}
</style>
