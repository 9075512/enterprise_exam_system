<script setup lang="ts">
/**
 * 我的考试（W3-T1，考生）。仅显示本科室考试（后端隔离）。
 * 考试状态 / 作答状态筛选（客户端）。开考/续考走后端幂等 start。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import { applyRetake } from '@/api/retakes';
import { useRequest } from '@/composables/useRequest';
import { EXAM_STATUS_LABELS } from '@/constants';
import { formatRange } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import ContentBoard from '@/components/common/ContentBoard.vue';
import type { ExamMy, ExamStatus, RetakeStatus } from '@/types';

const router = useRouter();
const { data: exams, loading, refresh: refreshExams } = useRequest(() => examsApi.my());

/** 补考申请状态文案与标签色 */
const RETAKE_STATUS_LABELS: Record<RetakeStatus, string> = {
  pending: '补考待审批',
  approved: '补考已通过',
  rejected: '补考已驳回',
};
const RETAKE_STATUS_TAG: Record<RetakeStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

/** 作答状态筛选值：pending=待作答（无记录）/ in_progress=答题中 / submitted=已交卷 */
type AnswerFilter = '' | 'pending' | 'in_progress' | 'submitted';

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterStatus = ref<ExamStatus | ''>('');
const filterAnswerStatus = ref<AnswerFilter>('');

const filteredExams = computed<ExamMy[]>(() => {
  const status = filterStatus.value;
  const answer = filterAnswerStatus.value;
  return (exams.value ?? []).filter((exam) => {
    if (status && getExamStatus(exam) !== status) return false;
    if (answer && (exam.recordStatus ?? 'pending') !== answer) return false;
    return true;
  });
});

function resetFilter(): void {
  filterStatus.value = '';
  filterAnswerStatus.value = '';
}

const starting = ref('');

async function handleStart(exam: ExamMy): Promise<void> {
  starting.value = exam.id;
  try {
    const record = await examsApi.start(exam.id);
    void router.push(`/exam/taking/${record.id}`);
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    starting.value = '';
  }
}

function goScores(): void {
  void router.push('/exam/scores');
}

function goMyRetakes(): void {
  void router.push('/exam/retakes');
}

/** 补考申请提交中（记录 examId） */
const applying = ref('');

/** 发起补考申请（仅 canApplyRetake 为 true 时展示入口） */
async function handleApplyRetake(exam: ExamMy): Promise<void> {
  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt(
      `请填写「${exam.name}」的补考申请说明`,
      '申请补考',
      {
        confirmButtonText: '提交申请',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (v) => (v && v.trim() ? true : '请填写申请说明'),
      },
    );
    reason = (value as string).trim();
  } catch {
    return;
  }
  applying.value = exam.id;
  try {
    await applyRetake(exam.id, reason);
    ElMessage.success('补考申请已提交，请等待管理员审批');
    await refreshExams();
  } catch {
    // 错误已由拦截器提示
  } finally {
    applying.value = '';
  }
}

interface ActionState {
  /** 主按钮文案 */
  label: string;
  /** 是否可点击（false 时禁用并展示 tip） */
  enabled: boolean;
  /** 禁用时的悬浮提示 */
  tip: string;
}

/**
 * 操作列主按钮状态：
 * - 时间窗内：进行中「继续考试」；未超次数「开始考试 / 再考一次」；次数用尽禁用
 * - 未开始 / 已结束：沿用既有时间窗提示
 * - 补考：存在「已通过」申请时，可用次数 = maxAttempts + 1
 */
function actionState(row: ExamMy): ActionState {
  const status = getExamStatus(row);
  if (status !== 'ongoing') {
    return {
      label: '开始考试',
      enabled: false,
      tip: status === 'not_started' ? '考试尚未开始' : '考试已结束',
    };
  }
  if (row.recordStatus === 'in_progress') {
    return { label: '继续考试', enabled: true, tip: '' };
  }
  const maxAllowed = row.maxAttempts + (row.retakeStatus === 'approved' ? 1 : 0);
  if (row.attemptsUsed < maxAllowed) {
    return { label: row.attemptsUsed > 0 ? '再考一次' : '开始考试', enabled: true, tip: '' };
  }
  return {
    label: '开始考试',
    enabled: false,
    tip: `答题次数已用完（最多 ${maxAllowed} 次）`,
  };
}
</script>

<template>
  <div class="my-exam">
    <PageHeader title="我的考试" description="仅显示你所在科室的考试">
      <template #actions>
        <el-button @click="goMyRetakes">我的补考</el-button>
      </template>
    </PageHeader>

    <!-- 公告与轮播（v1.9⑥；无生效内容时组件自身不渲染） -->
    <ContentBoard scope="exam" />

    <LoadingSkeleton v-if="loading && !exams" :rows="5" />

    <EmptyState v-else-if="!exams || exams.length === 0" text="暂无分配给本科室的考试" />

    <el-card v-else class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-select v-model="filterStatus" class="my-exam__filter-item" placeholder="全部考试状态" clearable>
            <el-option label="全部考试状态" value="" />
            <el-option :label="EXAM_STATUS_LABELS.not_started" value="not_started" />
            <el-option :label="EXAM_STATUS_LABELS.ongoing" value="ongoing" />
            <el-option :label="EXAM_STATUS_LABELS.ended" value="ended" />
          </el-select>
          <el-select v-model="filterAnswerStatus" class="my-exam__filter-item" placeholder="全部作答状态" clearable>
            <el-option label="全部作答状态" value="" />
            <el-option label="待作答" value="pending" />
            <el-option label="答题中" value="in_progress" />
            <el-option label="已交卷" value="submitted" />
          </el-select>
        </div>
        <div class="my-exam__filter-actions">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredExams" row-key="id" stripe>
        <el-table-column prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="时间窗" min-width="320">
          <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
        </el-table-column>
        <el-table-column label="时长" width="90" align="center">
          <template #default="{ row }">{{ row.durationMinutes }} 分</template>
        </el-table-column>
        <el-table-column label="及格线" width="90" align="center">
          <template #default="{ row }">{{ row.passScore }}</template>
        </el-table-column>
        <el-table-column label="作答次数" width="130" align="center">
          <template #default="{ row }">
            已考 {{ (row as ExamMy).attemptsUsed }} / {{ (row as ExamMy).maxAttempts }} 次
          </template>
        </el-table-column>
        <el-table-column label="考试状态" width="110" align="center">
          <template #default="{ row }">
            <StatusTag :status="getExamStatus(row as ExamMy)" />
          </template>
        </el-table-column>
        <el-table-column label="我的状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="(row as ExamMy).recordStatus === 'in_progress'" type="warning" size="small" effect="plain">
              进行中
            </el-tag>
            <el-tag v-else-if="(row as ExamMy).recordStatus === 'submitted'" type="success" size="small" effect="plain">
              已交卷
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="补考" width="130" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="(row as ExamMy).retakeStatus"
              :type="RETAKE_STATUS_TAG[(row as ExamMy).retakeStatus as RetakeStatus]"
              size="small"
              effect="light"
            >
              {{ RETAKE_STATUS_LABELS[(row as ExamMy).retakeStatus as RetakeStatus] }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <div class="my-exam__actions">
              <el-tooltip
                v-if="!actionState(row as ExamMy).enabled"
                :content="actionState(row as ExamMy).tip"
              >
                <span><el-button disabled>{{ actionState(row as ExamMy).label }}</el-button></span>
              </el-tooltip>

              <el-button
                v-else
                type="primary"
                :loading="starting === (row as ExamMy).id"
                @click="handleStart(row as ExamMy)"
              >
                {{ actionState(row as ExamMy).label }}
              </el-button>

              <el-button
                v-if="(row as ExamMy).attemptsUsed > 0"
                type="primary"
                link
                @click="goScores"
              >
                查看成绩
              </el-button>

              <el-button
                v-if="(row as ExamMy).canApplyRetake"
                type="warning"
                link
                :loading="applying === (row as ExamMy).id"
                @click="handleApplyRetake(row as ExamMy)"
              >
                申请补考
              </el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState text="没有匹配的考试" />
        </template>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.my-exam__filter-item {
  width: 160px;
}

.my-exam__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.my-exam__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
