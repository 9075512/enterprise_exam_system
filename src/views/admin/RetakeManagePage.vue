<script setup lang="ts">
/**
 * 补考管理（v1.5，管理员审批）。
 * 按状态 + 考试筛选补考申请，对待审批申请执行「通过 / 驳回」。
 *
 * v1.9④：新增「考试范围」选择器（与路由 `?examId=` 同步）——
 * 可从「考试管理」行操作直达某场考试的补考队列，队列真正对应到每一场考试。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { approveRetake, listRetakes, rejectRetake } from '@/api/retakes';
import { useExamScope } from '@/composables/useExamScope';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ExamScopeSelect from '@/components/common/ExamScopeSelect.vue';
import type { Retake, RetakeStatus } from '@/types';

const STATUS_LABELS: Record<RetakeStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
};

const STATUS_TAG: Record<RetakeStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

type Filter = '' | RetakeStatus;
const filter = ref<Filter>('');

/** 考试范围（与路由 ?examId= 双向同步） */
const { examId } = useExamScope();

const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Retake[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listRetakes({
      status: filter.value || undefined,
      examId: examId.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = data.list;
    total.value = data.total;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

load();

/** 考试范围变化 → 回到第 1 页重查（无论来自选择器还是 URL 直达） */
watch(examId, () => {
  page.value = 1;
  void load();
});

/** 空态文案随筛选范围变化，避免「明明选了某场考试却提示没有申请」造成误解 */
const emptyText = computed(() => (examId.value ? '该考试暂无补考申请' : '暂无补考申请'));

/* ------------------------------ 补考规则（系统设置） ------------------------------ */
const router = useRouter();
const settingsStore = useSettingsStore();

/**
 * 补考规则展示项（对应设计稿「补考规则（系统设置）」卡）。
 *
 * 数据来源：优先取 `useSettingsStore().settings` 中确切存在的字段——
 * - `examDefaultPassScore`：考试默认及格线（低于该分才需补考）
 * - `examDefaultMaxAttempts`：每人默认答题次数上限
 * - `retakeDefaultEnabled`：补考申请全局默认开关
 *
 * ⚠️ 设置中暂无「补考次数上限 / 计分方式 / 排考间隔 / 审批人」等字段，
 * 故此前展示的四条静态文案（2 次 / 取最高分 / 7 天排考）与后端真实判定不符，已移除。
 * 现按后端 `retakes.service` 的真实口径表述：未及格、且答题次数已用尽方可申请；
 * 每场至多一条有效申请（被驳回可重新申请）；成绩以最近一次作答为准（不合并历史最高分）。
 * 本卡只读，不新增任何后端接口或请求（settings 已在应用启动时由布局加载）。
 */
const retakeRules = computed<Array<{ label: string; value: string }>>(() => {
  const s = settingsStore.settings;
  return [
    // —— 行为规则（对齐后端 canApplyRetake / applyRetake 判定） ——
    { label: '补考资格', value: '未及格，且答题次数已用完' },
    { label: '审批方式', value: '管理员逐条审批，通过后可再作答一次' },
    { label: '申请次数', value: '每场至多一条有效申请，被驳回后可重新申请' },
    { label: '补考成绩口径', value: '以最近一次作答成绩为准（不合并历史最高分）' },
    // —— 系统设置项 ——
    { label: '考试默认及格线', value: `${s.examDefaultPassScore} 分` },
    { label: '每人默认答题次数上限', value: `${s.examDefaultMaxAttempts} 次` },
    { label: '补考申请默认开关', value: s.retakeDefaultEnabled ? '已启用' : '未启用' },
  ];
});

function goSettings(): void {
  void router.push('/admin/settings');
}

function handleFilterChange(): void {
  page.value = 1;
  void load();
}

function handlePageChange(p: number): void {
  page.value = p;
  void load();
}

async function handleApprove(row: Retake): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定通过「${row.userName}」对「${row.examName}」的补考申请吗？通过后该考生将获得一次补考机会。`,
      '通过补考',
      { confirmButtonText: '通过', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await approveRetake(row.id);
    ElMessage.success('已通过补考申请');
    void load();
  } catch {
    // 错误已由拦截器提示
  }
}

async function handleReject(row: Retake): Promise<void> {
  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt(
      `请填写驳回「${row.userName}」补考申请的原因`,
      '驳回补考',
      { confirmButtonText: '驳回', cancelButtonText: '取消', inputType: 'textarea', inputValidator: (v) => (v && v.trim() ? true : '请填写驳回原因') },
    );
    reason = (value as string).trim();
  } catch {
    return;
  }
  try {
    await rejectRetake(row.id, reason);
    ElMessage.success('已驳回补考申请');
    void load();
  } catch {
    // 错误已由拦截器提示
  }
}
</script>

<template>
  <div class="retake-manage-page">
    <PageHeader title="补考管理" description="审批考生的补考申请；通过后考生获得一次补考机会" />

    <el-card class="retake-manage-page__panel" shadow="never">
      <div class="retake-manage-page__toolbar">
        <ExamScopeSelect v-model="examId" />
        <el-radio-group v-model="filter" @change="handleFilterChange">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="pending">待审批</el-radio-button>
          <el-radio-button value="approved">已通过</el-radio-button>
          <el-radio-button value="rejected">已驳回</el-radio-button>
        </el-radio-group>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column prop="examName" label="考试名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="userName" label="考生姓名" width="110" show-overflow-tooltip />
        <el-table-column prop="username" label="登录账号" width="130" show-overflow-tooltip />
        <el-table-column prop="departmentName" label="科室" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.departmentName || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as RetakeStatus]" effect="light">
              {{ STATUS_LABELS[row.status as RetakeStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="申请说明 / 驳回原因" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" link @click="handleApprove(row as Retake)">通过</el-button>
              <el-button type="danger" link @click="handleReject(row as Retake)">驳回</el-button>
            </template>
            <span v-else class="retake-manage-page__muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" />
        </template>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        class="retake-manage-page__pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="handlePageChange"
      />
    </el-card>

    <el-card class="retake-manage-page__rules" shadow="never">
      <template #header>
        <div class="retake-manage-page__rules-head">
          <span class="retake-manage-page__rules-title">补考规则</span>
          <el-button class="retake-manage-page__rules-action" link type="primary" @click="goSettings">
            前往设置
          </el-button>
        </div>
      </template>

      <div v-if="retakeRules.length" class="retake-manage-page__rules-list">
        <div v-for="rule in retakeRules" :key="rule.label" class="retake-manage-page__rule">
          <span class="retake-manage-page__rule-k">{{ rule.label }}</span>
          <span class="retake-manage-page__rule-v">{{ rule.value }}</span>
        </div>
      </div>
      <p v-else class="retake-manage-page__rules-empty">补考规则暂未配置，请前往系统设置查看或配置。</p>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.retake-manage-page {
  &__panel {
    border-radius: $radius-lg;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  &__pager {
    margin-top: 16px;
    justify-content: flex-end;
  }

  &__muted {
    color: $text-disabled;
  }

  &__rules {
    margin-top: 16px;
  }

  &__rules-head {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  &__rules-title {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__rules-action {
    margin-left: auto;
  }

  &__rule {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    font-size: 12.5px;
    border-bottom: 1px dashed $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__rule-k {
    color: $text-secondary;
  }

  &__rule-v {
    color: $text-primary;
    font-weight: 600;
    text-align: right;
  }

  &__rules-empty {
    margin: 0;
    font-size: 12.5px;
    color: $text-secondary;
  }
}
</style>
