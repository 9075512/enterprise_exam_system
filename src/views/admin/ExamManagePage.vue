<script setup lang="ts">
/**
 * 考试管理（W3-T2，管理员）。
 * 关键字/状态筛选（客户端）+ 列表 + 新建/编辑弹窗 + 删除（有成绩记录 → 后端 1005）。
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import * as papersApi from '@/api/papers';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { EXAM_STATUS_LABELS } from '@/constants';
import { formatDateTime, formatRange } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import ExamFormDialog from './ExamFormDialog.vue';
import ExamExceptionDialog from './ExamExceptionDialog.vue';
import type { Exam, ExamStatus } from '@/types';

const { confirm } = useConfirm();

const { data: exams, loading, refresh } = useRequest(() => examsApi.list());
const { data: papers } = useRequest(() => papersApi.list());
const { data: departments } = useRequest(() => departmentsApi.list());

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterKeyword = ref('');
const filterStatus = ref<ExamStatus | ''>('');

const filteredExams = computed<Exam[]>(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  const status = filterStatus.value;
  return (exams.value ?? []).filter((exam) => {
    if (kw && !exam.name.toLowerCase().includes(kw)) return false;
    if (status && getExamStatus(exam) !== status) return false;
    return true;
  });
});

function resetFilter(): void {
  filterKeyword.value = '';
  filterStatus.value = '';
}

const paperNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((papers.value ?? []).map((p) => [p.id, p.name])),
);
const departmentNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((departments.value ?? []).map((d) => [d.id, d.name])),
);

/* ------------------------------ 弹窗 ------------------------------ */
const dialogVisible = ref(false);
const editingExam = ref<Exam | null>(null);

function openCreate(): void {
  editingExam.value = null;
  dialogVisible.value = true;
}

function openEdit(exam: Exam): void {
  editingExam.value = exam;
  dialogVisible.value = true;
}

/* ------------------------------ 特殊安排弹窗 ------------------------------ */
const exceptionVisible = ref(false);
const exceptionExam = ref<Exam | null>(null);

function openExceptions(exam: Exam): void {
  exceptionExam.value = exam;
  exceptionVisible.value = true;
}

const deleting = ref(false);

async function handleDelete(exam: Exam): Promise<void> {
  const ok = await confirm(`确定删除考试「${exam.name}」吗？已产生成绩记录的考试无法删除`, {
    title: '删除考试',
    confirmButtonText: '确认删除',
    type: 'warning',
  });
  if (!ok) return;

  deleting.value = true;
  try {
    await examsApi.remove(exam.id);
    ElMessage.success('考试已删除');
    void refresh();
  } catch {
    // 1005 等错误已由拦截器提示；不刷新
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="exam-page">
    <PageHeader title="考试管理" description="发布考试，指定试卷与参与科室">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建考试</el-button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !exams" :rows="5" />

    <EmptyState v-else-if="!exams || exams.length === 0" text="还没有考试，点击右上角新建考试" />

    <el-card v-else class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-select v-model="filterStatus" class="exam-page__filter-item" placeholder="全部状态" clearable>
            <el-option label="全部状态" value="" />
            <el-option :label="EXAM_STATUS_LABELS.not_started" value="not_started" />
            <el-option :label="EXAM_STATUS_LABELS.ongoing" value="ongoing" />
            <el-option :label="EXAM_STATUS_LABELS.ended" value="ended" />
          </el-select>
          <el-input
            v-model="filterKeyword"
            class="exam-page__filter-keyword"
            placeholder="按考试名称搜索"
            clearable
            :prefix-icon="Search"
          />
        </div>
        <div class="exam-page__filter-actions">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredExams" row-key="id" stripe>
        <el-table-column prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="试卷名" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ paperNameMap[row.paperId] || row.paperId }}</template>
        </el-table-column>
        <el-table-column label="参与科室" min-width="200">
          <template #default="{ row }">
            <el-tag
              v-for="deptId in row.departmentIds"
              :key="deptId"
              class="exam-page__dept-tag"
              size="small"
              type="info"
              effect="plain"
            >
              {{ departmentNameMap[deptId] || deptId }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间窗" min-width="320">
          <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
        </el-table-column>
        <el-table-column label="时长" width="90" align="center">
          <template #default="{ row }">{{ row.durationMinutes }} 分</template>
        </el-table-column>
        <el-table-column label="及格线" width="90" align="center">
          <template #default="{ row }">{{ row.passScore }}</template>
        </el-table-column>
        <el-table-column label="答题次数" width="90" align="center">
          <template #default="{ row }">{{ row.maxAttempts }} 次</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <StatusTag :status="getExamStatus(row as Exam)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row as Exam)">编辑</el-button>
            <el-button link @click="openExceptions(row as Exam)">特殊安排</el-button>
            <el-button type="danger" link @click="handleDelete(row as Exam)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState text="没有匹配的考试" />
        </template>
      </el-table>
    </el-card>

    <ExamFormDialog
      v-model:visible="dialogVisible"
      :exam="editingExam"
      :papers="papers || []"
      :departments="departments || []"
      @saved="refresh"
    />

    <ExamExceptionDialog v-model="exceptionVisible" :exam="exceptionExam" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-page__dept-tag {
  margin: 0 4px 4px 0;
}

.exam-page__filter-item {
  width: 140px;
}

.exam-page__filter-keyword {
  width: 240px;
}

.exam-page__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
