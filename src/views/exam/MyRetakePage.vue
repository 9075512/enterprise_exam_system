<script setup lang="ts">
/**
 * 我的补考（v1.5，考生）。查看本人补考申请及其审批状态，并可直接发起补考申请。
 *
 * v3.1 方向 C（设计稿 p-exam-retakes 重排）：
 * 页头下补四张统计卡（可申请 / 待审批 / 已通过 / 已驳回），
 * 申请记录改「卡头状态筛选 + 表格 + 分页」；
 * 右侧列新增「申请补考」表单卡与「补考规则」说明卡（表单动作复用既有 applyRetake 接口）。
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { CircleCheck, CircleClose, Clock, InfoFilled, Refresh } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import { applyRetake, listMyRetakes } from '@/api/retakes';
import { useRequest } from '@/composables/useRequest';
import { formatDateTime } from '@/utils/datetime';
import EmptyState from '@/components/common/EmptyState.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import StatCard from '@/components/common/StatCard.vue';
import type { ExamMy, Retake, RetakeStatus } from '@/types';

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

const loading = ref(false);
const list = ref<Retake[]>([]);

const { data: myExams, refresh: refreshExams } = useRequest(() => examsApi.my());

/** 可发起补考申请的考试（后端已按「未及格 + 未申请过 + 未超期」判定） */
const eligibleExams = computed<ExamMy[]>(() => (myExams.value ?? []).filter((e) => e.canApplyRetake));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listMyRetakes(1, 100);
    list.value = data.list;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

void load();

/* ------------------------------ 状态筛选 + 分页 ------------------------------ */
type FilterKey = '' | RetakeStatus;
const filterStatus = ref<FilterKey>('');
const PAGE_SIZE = 10;
const page = ref(1);

const filtered = computed<Retake[]>(() =>
  filterStatus.value ? list.value.filter((r) => r.status === filterStatus.value) : list.value,
);
const paged = computed<Retake[]>(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const totalPages = computed<number>(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));

function onFilterChange(): void {
  page.value = 1;
}

/** 空态「清空筛选」 */
function clearFilter(): void {
  filterStatus.value = '';
  onFilterChange();
}

/** 统计卡口径 */
const counts = computed(() => {
  const stat = { pending: 0, approved: 0, rejected: 0 };
  for (const r of list.value) {
    if (r.status === 'pending') stat.pending += 1;
    else if (r.status === 'approved') stat.approved += 1;
    else stat.rejected += 1;
  }
  return { eligible: eligibleExams.value.length, ...stat };
});

/* ------------------------------ 申请补考 ------------------------------ */
const applyExamId = ref('');
const applyReason = ref('');
const applying = ref(false);

function resetApply(): void {
  applyExamId.value = '';
  applyReason.value = '';
}

async function submitApply(): Promise<void> {
  if (!applyExamId.value) {
    ElMessage.warning('请选择需要补考的考试');
    return;
  }
  if (!applyReason.value.trim()) {
    ElMessage.warning('请填写申请说明');
    return;
  }
  applying.value = true;
  try {
    await applyRetake(applyExamId.value, applyReason.value.trim());
    ElMessage.success('补考申请已提交，请等待管理员审批');
    resetApply();
    await Promise.all([load(), refreshExams()]);
  } catch {
    // 错误已由拦截器提示
  } finally {
    applying.value = false;
  }
}

/** 补考规则（静态说明，与设计稿文案一致） */
const RULES = [
  { k: '申请时限', v: '成绩发布后 5 个工作日内' },
  { k: '申请次数', v: '每场考试限 1 次' },
  { k: '补考成绩', v: '以补考实测分数记录，及格即通过' },
  { k: '缺考处理', v: '需说明原因，审批通过后方可补考' },
];
</script>

<template>
  <div class="my-retake">
    <PageHeader title="我的补考" description="查看补考申请与审批结果 · 未及格考试可在发布后 5 个工作日内申请">
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新状态</el-button>
      </template>
    </PageHeader>

    <!-- 统计卡（设计稿 p-exam-retakes） -->
    <div class="my-retake__stats">
      <StatCard label="可申请补考" :value="counts.eligible" unit="场" tone="warning" :icon="Clock" />
      <StatCard label="待审批" :value="counts.pending" unit="项" tone="warning" :icon="Clock" />
      <StatCard label="已通过" :value="counts.approved" unit="项" tone="success" :icon="CircleCheck" />
      <StatCard label="已驳回" :value="counts.rejected" unit="项" :icon="CircleClose" />
    </div>

    <el-card class="my-retake__panel" shadow="never">
      <template #header>
        <h3 class="my-retake__panel-title">补考申请记录</h3>
        <el-select
          v-model="filterStatus"
          class="my-retake__filter"
          placeholder="全部状态"
          @change="onFilterChange"
        >
          <el-option label="全部状态" value="" />
          <el-option label="待审批" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
      </template>

      <el-table v-loading="loading" :data="paged" row-key="id" stripe>
        <el-table-column label="考试名称" min-width="200">
          <template #default="{ row }">
            <div class="my-retake__exam">{{ row.examName }}</div>
            <div class="my-retake__exam-sub">申请于 {{ formatDateTime(row.appliedAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as RetakeStatus]" effect="light">
              {{ STATUS_LABELS[row.status as RetakeStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批时间" width="170">
          <template #default="{ row }">{{ row.reviewedAt ? formatDateTime(row.reviewedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="说明 / 驳回原因" min-width="220">
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <template #empty>
          <EmptyState
            :text="filterStatus ? '没有该状态的补考申请' : '暂无补考申请'"
            :filtered="Boolean(filterStatus)"
            @clear="clearFilter"
          />
        </template>
      </el-table>

      <div v-if="filtered.length > PAGE_SIZE" class="my-retake__pager">
        <span class="my-retake__pager-info">共 {{ filtered.length }} 条</span>
        <button type="button" class="my-retake__pg" :disabled="page <= 1" aria-label="上一页" @click="page -= 1">
          ‹
        </button>
        <span class="my-retake__pg is-on">{{ page }}</span>
        <span class="my-retake__pg-text">/ {{ totalPages }}</span>
        <button
          type="button"
          class="my-retake__pg"
          :disabled="page >= totalPages"
          aria-label="下一页"
          @click="page += 1"
        >
          ›
        </button>
      </div>
    </el-card>

    <div class="my-retake__row">
      <!-- 申请补考 -->
      <el-card class="my-retake__card" shadow="never">
        <template #header>
          <h3 class="my-retake__card-title">申请补考</h3>
        </template>

        <div class="my-retake__field">
          <label>选择考试 <span class="my-retake__req">*</span></label>
          <el-select v-model="applyExamId" class="my-retake__select" placeholder="请选择需要补考的考试" clearable>
            <el-option v-for="exam in eligibleExams" :key="exam.id" :label="exam.name" :value="exam.id" />
          </el-select>
          <span class="my-retake__hint">
            仅列出你本人可申请补考的考试（未及格、且未申请过）
          </span>
        </div>

        <div class="my-retake__field">
          <label>申请说明 <span class="my-retake__req">*</span></label>
          <el-input
            v-model="applyReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="请说明需要补考的原因，如缺席、设备故障、成绩复核后仍未及格等"
          />
        </div>

        <div class="my-retake__tip">
          <el-icon class="my-retake__tip-icon"><InfoFilled /></el-icon>
          <div>
            补考由管理员审批并统一安排场次，审批结果会通过<b>消息中心</b>通知你；每场考试<b>仅可申请一次</b>补考。
          </div>
        </div>

        <div class="my-retake__form-act">
          <el-button @click="resetApply">重置</el-button>
          <el-button type="primary" :loading="applying" @click="submitApply">提交补考申请</el-button>
        </div>
      </el-card>

      <div class="my-retake__side">
        <el-card class="my-retake__card" shadow="never">
          <template #header>
            <h3 class="my-retake__card-title">补考规则</h3>
          </template>
          <div class="my-retake__desc">
            <div v-for="rule in RULES" :key="rule.k" class="my-retake__desc-row">
              <span class="my-retake__desc-k">{{ rule.k }}</span>
              <span class="my-retake__desc-v">{{ rule.v }}</span>
            </div>
          </div>
        </el-card>

        <div class="my-retake__tip my-retake__tip--warn">
          <el-icon class="my-retake__tip-icon"><Clock /></el-icon>
          <div>低于及格线的成绩才能申请补考；申请后请留意审批结果，逾期不再受理。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.my-retake {
  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  &__panel {
    margin-bottom: 16px;
  }

  &__panel-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__filter {
    width: 140px;
    margin-left: auto;
  }

  &__exam {
    font-weight: 560;
    color: $text-primary;
  }

  &__exam-sub {
    margin-top: 2px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__pager {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
  }

  &__pager-info {
    margin-right: auto;
    font-size: 12px;
    color: $text-secondary;
  }

  &__pg {
    min-width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: $radius-xs;
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: $text-secondary;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $color-neutral-bg;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.is-on {
      background: $color-primary;
      border-color: $color-primary;
      color: #fff;
    }
  }

  &__pg-text {
    font-size: 12px;
    color: $text-secondary;
  }

  /* 申请补考 + 补考规则 */
  &__row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  &__side {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__card-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 620;
    color: $text-primary;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 12px;

    label {
      font-size: 12px;
      font-weight: 580;
      color: $text-secondary;
    }
  }

  &__select {
    width: 100%;
  }

  &__req {
    color: $color-error-text;
  }

  &__hint {
    font-size: 11px;
    color: $text-secondary;
  }

  &__tip {
    display: flex;
    gap: 9px;
    padding: 10px 12px;
    border-radius: $radius-sm;
    background: $color-info-bg;
    font-size: 12px;
    line-height: 1.55;
    color: $color-info-text;

    b {
      font-weight: 650;
    }

    &--warn {
      background: $color-warning-bg;
      color: $color-warning-text;
    }
  }

  &__tip-icon {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  &__form-act {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  &__desc-row {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid $border-color;
    font-size: 12.5px;

    &:last-child {
      border-bottom: none;
    }
  }

  &__desc-k {
    color: $text-secondary;
  }

  &__desc-v {
    color: $text-primary;
  }

  @media (max-width: 1080px) {
    &__row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
