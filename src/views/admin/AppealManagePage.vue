<script setup lang="ts">
/**
 * 成绩复核管理（v1.7①，管理员）。
 * 按状态 + 考试筛选复核申请，对待复核申请执行「通过（改分）」或「驳回」。
 *
 * v1.9④：新增「考试范围」选择器（与路由 `?examId=` 同步）——
 * 可从「考试管理」行操作直达某场考试的复核队列。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as appealsApi from '@/api/appeals';
import { APPEAL_STATUS_LABELS, APPEAL_STATUS_OPTIONS, APPEAL_STATUS_TAG_TYPES } from '@/constants';
import { useExamScope } from '@/composables/useExamScope';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ExamScopeSelect from '@/components/common/ExamScopeSelect.vue';
import type { AppealStatus, ScoreAppeal } from '@/types';

const filter = ref<'' | AppealStatus>('');

/** 考试范围（与路由 ?examId= 双向同步） */
const { examId } = useExamScope();

const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<ScoreAppeal[]>([]);
/** 当前聚焦的复核申请（「复核处理 · 成绩变更史」卡展示对象，默认列表首条） */
const activeAppealId = ref('');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await appealsApi.list({
      status: filter.value || undefined,
      examId: examId.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = data.list;
    total.value = data.total;
    // 保持有效选中：列表刷新后若当前选中项已不在（换筛选/被处理），回退到首条
    if (!list.value.some((item) => item.id === activeAppealId.value)) {
      activeAppealId.value = list.value[0]?.id ?? '';
    }
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

void load();

const activeAppeal = computed<ScoreAppeal | null>(
  () => list.value.find((item) => item.id === activeAppealId.value) ?? null,
);

/** 成绩变更条目：原分 → 新分（未处理时为「待定」），全部由 ScoreAppeal 已有字段派生 */
const scoreChange = computed<{ from: string; to: string | null; tone: string } | null>(() => {
  const appeal = activeAppeal.value;
  if (!appeal) return null;
  let tone = '';
  if (appeal.newScore !== null) {
    if (appeal.newScore > appeal.originalScore) tone = 'is-up';
    else if (appeal.newScore < appeal.originalScore) tone = 'is-down';
  }
  return {
    from: formatScore(appeal.originalScore),
    to: appeal.newScore !== null ? formatScore(appeal.newScore) : null,
    tone,
  };
});

/**
 * 处理时间线：由申请状态 + 申请/复核时间 + 复核人 + 复核意见派生，
 * 数据源为页面已有列表，不新增任何请求。
 */
const changeTimeline = computed<Array<{ title: string; detail: string; tone: string }>>(() => {
  const appeal = activeAppeal.value;
  if (!appeal) return [];
  const nodes: Array<{ title: string; detail: string; tone: string }> = [
    {
      title: '提交复核申请',
      detail: `${formatDateTime(appeal.appliedAt)} · 考试端${appeal.reason ? ` · ${appeal.reason}` : ''}`,
      tone: appeal.status === 'pending' ? 'is-on' : '',
    },
  ];
  if (appeal.status === 'pending') {
    nodes.push({ title: '等待管理员复核', detail: '尚未处理', tone: 'is-on' });
  } else {
    nodes.push({
      title: appeal.status === 'approved' ? '复核通过 · 已调整成绩' : '复核驳回 · 维持原分',
      detail: `${appeal.reviewedAt ? formatDateTime(appeal.reviewedAt) : '—'} · ${appeal.reviewedBy || '管理员'}${
        appeal.reviewComment ? ` · ${appeal.reviewComment}` : ''
      }`,
      tone: appeal.status === 'approved' ? 'is-done' : 'is-err',
    });
  }
  return nodes;
});

/** 行点击 → 切换变更史展示对象；行焦点用 inset 2px 主色条表达 */
function handleAppealRowClick(row: ScoreAppeal): void {
  activeAppealId.value = row.id;
}

function appealRowClassName({ row }: { row: ScoreAppeal }): string {
  return row.id === activeAppealId.value ? 'is-active-appeal' : '';
}

/** 考试范围变化 → 回到第 1 页重查 */
watch(examId, () => {
  page.value = 1;
  void load();
});

/** 空态文案随筛选范围变化 */
const emptyText = computed(() => (examId.value ? '该考试暂无复核申请' : '暂无复核申请'));

function handleFilterChange(): void {
  page.value = 1;
  void load();
}

function handlePageChange(p: number): void {
  page.value = p;
  void load();
}

/* ------------------------------ 通过（改分） ------------------------------ */
const approveVisible = ref(false);
const approving = ref(false);
const approveRow = ref<ScoreAppeal | null>(null);
const newScore = ref<number>(0);
const approveComment = ref('');

function openApprove(row: ScoreAppeal): void {
  approveRow.value = row;
  newScore.value = row.originalScore;
  approveComment.value = '';
  approveVisible.value = true;
}

async function submitApprove(): Promise<void> {
  if (!approveRow.value) return;
  approving.value = true;
  try {
    await appealsApi.approve(approveRow.value.id, Number(newScore.value), approveComment.value.trim());
    ElMessage.success('复核已通过，成绩已更新');
    approveVisible.value = false;
    void load();
  } catch {
    // 错误已由拦截器提示
  } finally {
    approving.value = false;
  }
}

/* ------------------------------ 驳回 ------------------------------ */
const rejectVisible = ref(false);
const rejecting = ref(false);
const rejectRow = ref<ScoreAppeal | null>(null);
const rejectComment = ref('');

function openReject(row: ScoreAppeal): void {
  rejectRow.value = row;
  rejectComment.value = '';
  rejectVisible.value = true;
}

async function submitReject(): Promise<void> {
  if (!rejectRow.value) return;
  if (!rejectComment.value.trim()) {
    ElMessage.warning('请填写复核意见');
    return;
  }
  rejecting.value = true;
  try {
    await appealsApi.reject(rejectRow.value.id, rejectComment.value.trim());
    ElMessage.success('已驳回复核申请');
    rejectVisible.value = false;
    void load();
  } catch {
    // 错误已由拦截器提示
  } finally {
    rejecting.value = false;
  }
}
</script>

<template>
  <div class="appeal-manage-page">
    <PageHeader title="成绩复核" description="处理考生提交的成绩复核申请；通过后可直接调整最终成绩" />

    <el-card class="appeal-manage-page__panel" shadow="never">
      <div class="appeal-manage-page__toolbar">
        <ExamScopeSelect v-model="examId" />
        <el-radio-group v-model="filter" @change="handleFilterChange">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="opt in APPEAL_STATUS_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-table
        v-loading="loading"
        :data="list"
        row-key="id"
        stripe
        :row-class-name="appealRowClassName"
        @row-click="handleAppealRowClick"
      >
        <el-table-column prop="examName" label="考试名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="userName" label="考生姓名" width="110" show-overflow-tooltip />
        <el-table-column prop="username" label="登录账号" width="130" show-overflow-tooltip />
        <el-table-column prop="departmentName" label="科室" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.departmentName || '—' }}</template>
        </el-table-column>
        <el-table-column label="原分/新分" width="120" align="center">
          <template #default="{ row }">
            {{ formatScore(row.originalScore) }}
            <template v-if="row.newScore !== null"> → {{ formatScore(row.newScore) }}</template>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="APPEAL_STATUS_TAG_TYPES[row.status as AppealStatus]" effect="light">
              {{ APPEAL_STATUS_LABELS[row.status as AppealStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="申请说明 / 复核意见" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reviewComment || row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column class-name="table-actions-cell" label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" link @click="openApprove(row as ScoreAppeal)">通过</el-button>
              <el-button type="danger" link @click="openReject(row as ScoreAppeal)">驳回</el-button>
            </template>
            <span v-else class="appeal-manage-page__muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" />
        </template>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        class="appeal-manage-page__pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="handlePageChange"
      />
    </el-card>

    <el-card class="appeal-manage-page__review" shadow="never">
      <template #header>
        <div class="appeal-manage-page__review-head">
          <span class="appeal-manage-page__review-title">复核处理</span>
          <span v-if="activeAppeal" class="appeal-manage-page__review-sub">
            {{ activeAppeal.userName }} · {{ activeAppeal.examName }}
          </span>
          <el-tag
            v-if="activeAppeal"
            class="appeal-manage-page__review-tag"
            :type="APPEAL_STATUS_TAG_TYPES[activeAppeal.status]"
            effect="light"
          >
            {{ APPEAL_STATUS_LABELS[activeAppeal.status] }}
          </el-tag>
        </div>
      </template>

      <template v-if="activeAppeal && scoreChange">
        <div class="appeal-manage-page__change">
          <span class="appeal-manage-page__change-k">成绩变更</span>
          <span class="appeal-manage-page__change-v">
            <b class="appeal-manage-page__score">{{ scoreChange.from }}</b>
            <span class="appeal-manage-page__arrow">→</span>
            <b v-if="scoreChange.to !== null" class="appeal-manage-page__score" :class="scoreChange.tone">
              {{ scoreChange.to }}
            </b>
            <b v-else class="appeal-manage-page__score appeal-manage-page__score--pending">待定</b>
          </span>
        </div>

        <div class="appeal-manage-page__timeline">
          <div
            v-for="(node, index) in changeTimeline"
            :key="index"
            class="appeal-manage-page__tl"
            :class="node.tone"
          >
            <div class="appeal-manage-page__tl-t">{{ node.title }}</div>
            <div class="appeal-manage-page__tl-d">{{ node.detail }}</div>
          </div>
        </div>
      </template>
      <p v-else class="appeal-manage-page__review-empty">
        暂无复核记录，选中上方列表中的申请即可查看成绩变更史。
      </p>
    </el-card>

    <el-dialog v-model="approveVisible" title="复核通过（调整成绩）" width="460px">
      <el-alert
        v-if="approveRow"
        class="appeal-manage-page__alert"
        type="info"
        :closable="false"
        show-icon
        :title="`${approveRow.userName} · ${approveRow.examName}`"
        :description="`原成绩 ${formatScore(approveRow.originalScore)} 分`"
      />
      <el-form label-width="90px">
        <el-form-item label="调整后分数">
          <el-input-number v-model="newScore" :min="0" :max="1000" :precision="1" :step="1" />
        </el-form-item>
        <el-form-item label="复核意见">
          <el-input v-model="approveComment" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="submitApprove">确认通过</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rejectVisible" title="驳回复核申请" width="460px">
      <el-form label-width="90px">
        <el-form-item label="复核意见">
          <el-input
            v-model="rejectComment"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="请说明驳回原因（必填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejecting" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.appeal-manage-page {
  &__panel {
    border-radius: $radius-lg;

    // 行级焦点：inset 2px 主色条（业务层禁用 3px 强调条与投影）
    :deep(.is-active-appeal td.el-table__cell:first-child) {
      box-shadow: inset 2px 0 0 $color-primary;
    }
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

  &__alert {
    margin-bottom: 16px;
  }

  &__muted {
    color: $text-disabled;
  }

  &__review {
    margin-top: 16px;
  }

  &__review-head {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  &__review-title {
    flex-shrink: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__review-sub {
    min-width: 0;
    font-size: 11.5px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__review-tag {
    margin-left: auto;
    flex: 0 0 auto;
  }

  &__change {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 14px;
    border-radius: $radius-xs;
    background: $color-primary-soft;
    box-shadow: inset 2px 0 0 $color-primary;
  }

  &__change-k {
    font-size: 12px;
    color: $text-secondary;
  }

  &__change-v {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  &__score {
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
    font-variant-numeric: tabular-nums;

    &.is-up {
      color: $color-success-text;
    }

    &.is-down {
      color: $color-error-text;
    }

    &--pending {
      font-size: 13px;
      color: $color-warning-text;
    }
  }

  &__arrow {
    color: $text-secondary;
  }

  &__timeline {
    position: relative;
    padding-left: 20px;

    &::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 5px;
      bottom: 5px;
      width: 1.5px;
      background: $line-strong;
    }
  }

  &__tl {
    position: relative;
    padding-bottom: 14px;

    &:last-child {
      padding-bottom: 0;
    }

    &::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 3px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: $bg-paper;
      border: 2px solid $line-strong;
    }

    &.is-on::before {
      background: $color-primary;
      border-color: $color-primary;
    }

    &.is-done::before {
      background: $color-success;
      border-color: $color-success;
    }

    &.is-err::before {
      background: $color-error;
      border-color: $color-error;
    }
  }

  &__tl-t {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
  }

  &__tl-d {
    margin-top: 2px;
    font-size: 11.5px;
    color: $text-secondary;
  }

  &__review-empty {
    margin: 0;
    font-size: 12.5px;
    color: $text-secondary;
  }
}
</style>
