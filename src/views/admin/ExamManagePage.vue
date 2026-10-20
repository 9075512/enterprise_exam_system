<script setup lang="ts">
/**
 * 统一考试管理：管理员维护全部考试，出题人仅维护获分配考试的题目。
 * 关键字/状态筛选、两步创建/编辑、题目预览及 PDF 导出。
 *
 * v1.9④：行操作新增「考务」下拉 —— 直达本场考试的补考管理 / 成绩复核 / 人工阅卷队列
 * （通过 `?examId=` 传递范围，三张队列页均支持该参数）。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, Refresh, Monitor, Document, Clock, VideoPlay, CircleCheck, User } from '@element-plus/icons-vue';
import TableActions from '@/components/common/TableActions.vue';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import { useAuthStore } from '@/stores/auth';
import { participantsApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import { useConfirm } from '@/composables/useConfirm';
import { EXAM_STATUS_LABELS } from '@/constants';
import { formatDateTime } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RequestError from '@/components/common/RequestError.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import ExamExceptionDialog from './ExamExceptionDialog.vue';
import type { Department, Exam, ExamParticipant, ExamStatus } from '@/types';

const { confirm } = useConfirm();
const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => auth.hasRole('admin'));

const { data: exams, loading, error, refresh } = useRequest(() => examsApi.list());
const { data: departments } = useRequest(() => isAdmin.value ? departmentsApi.list() : Promise.resolve([] as Department[]));

/* ------------------------------ 筛选（客户端） ------------------------------ */
const filterKeyword = ref('');
const filterStatus = ref<ExamStatus | ''>('');
const statusCards = computed(() => {
  const list = exams.value ?? [];
  return [
    { value: '' as const, label: '全部考试', count: list.length, hint: '考试与题目统一管理', icon: Document },
    { value: 'not_started' as const, label: '未开始', count: list.filter(e => getExamStatus(e) === 'not_started').length, hint: '查看待开始的考试', icon: Clock },
    { value: 'ongoing' as const, label: '进行中', count: list.filter(e => getExamStatus(e) === 'ongoing').length, hint: '关注考试与作答进度', icon: VideoPlay },
    { value: 'ended' as const, label: '已结束', count: list.filter(e => getExamStatus(e) === 'ended').length, hint: '查看成绩与后续考务', icon: CircleCheck },
  ];
});

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

/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路，规范 §9.2） */
const hasFilter = computed<boolean>(() => Boolean(filterKeyword.value.trim() || filterStatus.value));

const departmentNameMap = computed<Record<string, string>>(() =>
  Object.fromEntries((departments.value ?? []).map((d) => [d.id, d.name])),
);

/* ------------------------------ 弹窗 ------------------------------ */
function authorNames(exam: Exam): string { return (exam.authors ?? []).map(a => a.name).join('、') || '未指定'; }
function openCreate(): void { void router.push('/admin/exams/new'); }
function openEdit(exam: Exam): void { void router.push('/admin/exams/' + exam.id + '/edit'); }
function openPreview(exam: Exam): void { void router.push('/admin/exams/' + exam.id + '/preview'); }
async function exportQuestions(exam: Exam, withAnswer: boolean): Promise<void> {
  if (!exam.canReadQuestions) return;
  await downloadPdf(exam, withAnswer ? '答案版' : '考生版', () => examsApi.exportPdf(exam.id, withAnswer));
}

/* ------------------------------ 特殊安排弹窗 ------------------------------ */
const exceptionVisible = ref(false);
const exceptionExam = ref<Exam | null>(null);

function openExceptions(exam: Exam): void {
  exceptionExam.value = exam;
  exceptionVisible.value = true;
}

/** 进入监考监控（v1.7④ T3）。 */
function openMonitor(exam: Exam): void {
  void router.push(`/admin/exams/${exam.id}/monitor`);
}

/** 考务队列：把「补考 / 复核 / 阅卷」按考试维度串起来（v1.9④）。 */
const QUEUE_ROUTES: Record<string, string> = {
  retakes: '/admin/retakes',
  appeals: '/admin/appeals',
  reviews: '/admin/reviews',
};

/** 携带 examId 跳转到对应考务队列页。 */
function openExamQueue(exam: Exam, command: unknown): void {
  const path = QUEUE_ROUTES[String(command)];
  if (!path) return;
  void router.push({ path, query: { examId: exam.id } });
}

const deleting = ref(false);
const exporting = ref(false);
const operationError = ref('');
const exportLabel = ref('');
const detailVisible = ref(false);
const detailExam = ref<Exam | null>(null);
function openDetails(exam: Exam): void { detailExam.value = exam; detailVisible.value = true; }
async function downloadPdf(exam: Exam, kind: string, request: () => Promise<Blob>): Promise<void> {
  if (exporting.value || deleting.value) return;
  exporting.value = true;
  operationError.value = '';
  exportLabel.value = `正在生成「${exam.name}」${kind} PDF…`;
  let url = '';
  try {
    const blob = await request();
    url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = exam.name.replace(/[\\/:*?"<>|]/g, '_') + `-${kind}.pdf`; a.click();
  } catch { operationError.value = `「${exam.name}」${kind}导出失败，可从原入口重试。`; }
  finally { if (url) URL.revokeObjectURL(url); exporting.value = false; exportLabel.value = ''; }
}
const rosterVisible = ref(false);
const rosterExam = ref<Exam | null>(null);
const { data: roster, loading: rosterLoading, error: rosterError, refresh: refreshRoster } = useRequest(
  () => rosterVisible.value && rosterExam.value ? participantsApi.list(rosterExam.value.id) : Promise.resolve([] as ExamParticipant[]),
  [rosterVisible, rosterExam], { immediate: false, keepPreviousData: false },
);
const participantSources: Record<ExamParticipant['source'], string> = { department: '科室范围', template: '人员模板', include: '指定人员', legacy: '原有名单' };

function openRoster(exam: Exam): void {
  if (!isAdmin.value) return;
  detailVisible.value = false;
  rosterExam.value = exam;
  rosterVisible.value = true;
}

async function exportTickets(exam: Exam): Promise<void> {
  if (!isAdmin.value) return;
  await downloadPdf(exam, '准考证', () => participantsApi.ticketsPdf(exam.id));
}

async function handleDelete(exam: Exam): Promise<void> {
  if (!isAdmin.value || deleting.value || exporting.value) return;
  deleting.value = true;
  operationError.value = '';
  try {
    const ok = await confirm(`确定删除考试「${exam.name}」吗？已产生成绩记录的考试无法删除`, {
      title: '删除考试',
      confirmButtonText: '确认删除',
      type: 'warning',
    });
    if (!ok) return;

    await examsApi.remove(exam.id);
    ElMessage.success('考试已删除');
    void refresh();
  } catch {
    operationError.value = '删除失败，当前考试列表已保留，请核对后重试。';
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div data-ui-layout="list" data-ui-page="ExamManagePage" class="exam-page">
    <PageHeader title="考试管理" :description="isAdmin ? '统一配置考试、题目、参与人员和出题人' : '维护分配给你的考试题目'">
      <template #actions>
        <el-button v-if="isAdmin" type="primary" :disabled="deleting" :icon="Plus" @click="openCreate">新建考试</el-button>
      </template>
    </PageHeader>

    <p v-if="exams && !error" class="admin-scope">当前账号可管理考试范围 · {{ loading ? '正在刷新，以下为上次成功数据' : '已返回 ' + exams.length + ' 场' }} · 状态统计不受下方名称筛选影响</p>
    <p v-if="exportLabel || operationError" class="exam-page__operation" :class="{ 'is-error': operationError }" role="status">{{ operationError || exportLabel }}</p>
    <div v-if="exams && !error" class="exam-page__overview" role="group" aria-label="按考试状态筛选">
      <button v-for="card in statusCards" :key="card.value" :disabled="deleting" type="button" class="exam-page__stat" :class="{ 'is-active': filterStatus === card.value }" :aria-pressed="filterStatus === card.value" @click="filterStatus = card.value">
        <span class="exam-page__stat-icon" :class="card.value"><el-icon><component :is="card.icon" /></el-icon></span>
        <span class="exam-page__stat-content"><span class="exam-page__stat-label">{{ card.label }}</span><strong>{{ card.count }}<small>场</small></strong></span>
        <span class="exam-page__stat-hint">{{ card.hint }}</span>
      </button>
    </div>

    <LoadingSkeleton v-if="loading && !exams" :rows="5" />

    <el-alert v-else-if="error" type="error" :closable="false" show-icon title="考试列表加载失败，当前不能确认考试数量">
      <el-button type="primary" link @click="refresh">重试</el-button>
    </el-alert>

    <EmptyState
      v-else-if="!exams || exams.length === 0"
      :text="isAdmin ? '还没有考试，先创建一场考试' : '暂无分配给你的考试'"
      :action-text="isAdmin ? '新建考试' : undefined"
      @action="openCreate"
    />

    <el-card v-else class="table-card exam-page__list" shadow="never">
      <div class="exam-page__toolbar">
        <div class="exam-page__list-heading"><h3>{{ filterStatus ? EXAM_STATUS_LABELS[filterStatus] : '考试列表' }}</h3><span class="exam-page__result-count">{{ filteredExams.length }} 场</span></div>
        <div class="exam-page__filter-actions">
          <el-input v-model="filterKeyword" :disabled="deleting" class="exam-page__filter-keyword" placeholder="搜索考试名称" aria-label="搜索考试名称" clearable :prefix-icon="Search" />
          <el-button :disabled="deleting || !hasFilter" @click="resetFilter">重置</el-button>
          <span class="exam-page__toolbar-divider" aria-hidden="true" />
          <TableDensityToggle />
          <el-tooltip content="刷新列表" placement="top"><el-button :icon="Refresh" :disabled="deleting" :loading="loading" aria-label="刷新考试列表" @click="refresh()" /></el-tooltip>
        </div>
      </div>

      <p class="exam-page__scroll-hint">点击考试名称查看详情；左右滑动查看其他操作</p>
      <el-table v-loading="loading" :data="filteredExams" row-key="id" class="exam-page__table">
        <el-table-column label="考试信息" min-width="230">
          <template #default="{ row }">
            <div class="exam-page__exam-heading"><span class="exam-page__exam-icon" aria-hidden="true"><el-icon><Document /></el-icon></span><el-button link type="primary" class="exam-page__exam-name" :title="row.name" @click="openDetails(row as Exam)">{{ row.name }}</el-button></div>
            <div class="exam-page__question-summary"><span><b>{{ row.questionCount ?? 0 }}</b> 题</span><span><b>{{ row.totalScore ?? 0 }}</b> 分</span><span>{{ row.passScore }} 分及格</span></div>
          </template>
        </el-table-column>
        <el-table-column label="考试安排" width="205">
          <template #default="{ row }"><div class="exam-page__time"><span><small>起</small>{{ formatDateTime(row.startTime) }}</span><span><small>止</small>{{ formatDateTime(row.endTime) }}</span></div><div class="exam-page__row-meta">{{ row.durationMinutes }} 分钟<span>·</span>{{ row.examMode === 'open' ? '开卷' : '闭卷' }}<span>·</span>最多 {{ row.maxAttempts }} 次</div></template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="参与范围" min-width="135">
          <template #default="{ row }"><div class="exam-page__departments"><el-tag v-for="deptId in row.departmentIds.slice(0, 2)" :key="deptId" size="small" type="info" effect="plain">{{ departmentNameMap[deptId] || deptId }}</el-tag><span v-if="row.departmentIds.length > 2">+{{ row.departmentIds.length - 2 }}</span><span v-if="!row.departmentIds.length">指定人员 / 模板</span></div><div v-if="row.includeUserIds?.length" class="exam-page__row-meta">另指定 {{ row.includeUserIds.length }} 人</div></template>
        </el-table-column>
        <el-table-column label="出题人" min-width="110" show-overflow-tooltip><template #default="{ row }"><span class="exam-page__authors" :class="{ 'is-empty': !row.authors?.length }"><el-icon aria-hidden="true"><User /></el-icon><span>{{ authorNames(row as Exam) }}</span></span></template></el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag :status="getExamStatus(row as Exam)" />
            <div v-if="row.questionsLocked" class="exam-page__lock-note">题目已锁定</div>
          </template>
        </el-table-column>
        <el-table-column class-name="table-actions-cell" label="操作" :width="isAdmin ? 184 : 164" fixed="right">
          <template #default="{ row }">
            <TableActions :loading="deleting || exporting">
              <el-button type="primary" link :disabled="deleting || (!isAdmin && !row.canEditQuestions)" :title="row.questionEditReason" @click="openEdit(row as Exam)">{{ isAdmin ? '编辑' : '维护题目' }}</el-button>
              <el-button v-if="isAdmin" :disabled="deleting" link :icon="Monitor" @click="openMonitor(row as Exam)">监控</el-button>
              <template #more>
                <el-dropdown-item :disabled="!row.canReadQuestions" @click="openPreview(row as Exam)">题目预览</el-dropdown-item>
                <el-dropdown-item :disabled="!row.canReadQuestions" @click="exportQuestions(row as Exam, false)">导出考生版 PDF</el-dropdown-item>
                <el-dropdown-item :disabled="!row.canReadQuestions" @click="exportQuestions(row as Exam, true)">导出答案版 PDF</el-dropdown-item>
                <el-dropdown-item v-if="!isAdmin && row.questionEditReason" disabled>{{ row.questionEditReason }}</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="openExceptions(row as Exam)">特殊安排</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="openRoster(row as Exam)">生效名单</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="exportTickets(row as Exam)">导出准考证</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="openExamQueue(row as Exam, 'retakes')">补考管理</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="openExamQueue(row as Exam, 'appeals')">成绩复核</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" @click="openExamQueue(row as Exam, 'reviews')">人工阅卷</el-dropdown-item>
                <el-dropdown-item v-if="isAdmin" divided class="is-danger" @click="handleDelete(row as Exam)">删除</el-dropdown-item>
              </template>
            </TableActions>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            :text="hasFilter ? '没有匹配的考试' : '暂无可展示的考试'"
            :filtered="hasFilter"
            :action-text="isAdmin ? '新建考试' : undefined"
            @clear="resetFilter"
            @action="openCreate"
          />
        </template>
      </el-table>
      <div class="exam-page__list-footer"><span>{{ hasFilter ? `筛选结果 ${filteredExams.length} 场 / 全部 ${exams.length} 场` : `共 ${exams.length} 场考试` }}</span><el-button v-if="hasFilter" type="primary" link @click="resetFilter">清空筛选</el-button></div>
    </el-card>

    <ExamExceptionDialog v-model="exceptionVisible" :exam="exceptionExam" />
    <el-drawer v-model="detailVisible" title="考试详情" size="720px" append-to-body destroy-on-close data-ui-role="detail">
      <template v-if="detailExam">
        <section class="exam-detail__context"><h3>{{ detailExam.name }}</h3><StatusTag :status="getExamStatus(detailExam)" /><p v-if="detailExam.questionsLocked">题目已锁定</p></section>
        <dl class="exam-detail__meta"><div><dt>开始时间</dt><dd>{{ formatDateTime(detailExam.startTime) }}</dd></div><div><dt>结束时间</dt><dd>{{ formatDateTime(detailExam.endTime) }}</dd></div><div><dt>时长 / 方式</dt><dd>{{ detailExam.durationMinutes }} 分钟 · {{ detailExam.examMode === 'open' ? '开卷' : '闭卷' }}</dd></div><div><dt>答题次数上限</dt><dd>{{ detailExam.maxAttempts }} 次</dd></div><div><dt>题量 / 总分</dt><dd>{{ detailExam.questionCount ?? '—' }} 题 / {{ detailExam.totalScore ?? '—' }} 分</dd></div><div><dt>及格线</dt><dd>{{ detailExam.passScore }} 分</dd></div><div><dt>出题人</dt><dd>{{ authorNames(detailExam) }}</dd></div><div v-if="isAdmin"><dt>参与科室</dt><dd>{{ detailExam.departmentIds.map(id => departmentNameMap[id] || id).join('、') || '指定人员 / 模板' }}</dd></div><div v-if="isAdmin"><dt>另指定人员</dt><dd>{{ detailExam.includeUserIds?.length ?? '—' }} 人</dd></div></dl>
        <p v-if="detailExam.questionEditReason" class="admin-scope">{{ detailExam.questionEditReason }}</p>
      </template>
      <template #footer><div class="exam-detail__actions"><el-button @click="detailVisible = false">关闭</el-button><el-button v-if="detailExam?.canReadQuestions" @click="openPreview(detailExam)">题目预览</el-button><el-button v-if="isAdmin && detailExam" @click="openRoster(detailExam)">生效名单</el-button><el-button v-if="detailExam" type="primary" :disabled="deleting || (!isAdmin && !detailExam.canEditQuestions)" @click="openEdit(detailExam)">{{ isAdmin ? '编辑考试' : '维护题目' }}</el-button></div></template>
    </el-drawer>
    <el-dialog v-model="rosterVisible" title="考试生效名单" class="exam-roster-dialog" width="800px" destroy-on-close append-to-body>
      <div class="admin-detail-block exam-roster__context"><strong>{{ rosterExam?.name }}</strong><p class="admin-scope">当前考试生效人员 · {{ rosterLoading ? '加载中…' : rosterError ? '人数未知' : `${roster?.length ?? 0} 人` }}</p></div>
      <RequestError v-if="rosterError" text="生效名单加载失败" @retry="refreshRoster" />
      <div v-else v-loading="rosterLoading" class="exam-roster"><article v-for="person in roster ?? []" :key="person.userId" class="exam-roster__person"><h3>{{ person.userName }}</h3><dl><div><dt>登录账号</dt><dd>{{ person.username }}</dd></div><div><dt>准考证号</dt><dd>{{ person.admissionNo || '—' }}</dd></div><div><dt>科室</dt><dd>{{ person.departmentName || '—' }}</dd></div><div><dt>来源</dt><dd>{{ participantSources[person.source] ?? person.source }}</dd></div></dl></article><EmptyState v-if="!rosterLoading && !roster?.length" text="该考试暂无生效人员" /></div>
      <template #footer><el-button @click="rosterVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-page {
  &__operation { padding: 12px 16px; border-radius: $radius-base; background: $color-primary-soft; color: $color-primary; overflow-wrap: anywhere; &.is-error { background: $color-error-bg; color: $color-error-text; } }
  max-width: 1520px;
  min-width: 0;
  margin: 0 auto;

  &__overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  &__stat {
    position: relative;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: center;
    gap: 12px 16px;
    padding: 20px;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    background: $bg-paper;
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: border-color $transition-fast, background-color $transition-fast;

    &:hover { border-color: $color-primary-border; background: $color-table-hover; }
    &:focus-visible { outline: 2px solid $color-primary; outline-offset: 3px; }
    &.is-active { border-color: $color-primary-border; background: $color-primary-soft; }
    box-shadow: $shadow-card;
    strong { display: block; margin-top: 6px; color: $text-primary; font-size: 28px; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
    small { margin-left: 7px; color: $text-secondary; font-size: 12px; font-weight: 400; }
  }

  &__stat-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: $radius-base; background: $color-primary-50; color: $color-primary-dark; font-size: 20px;
    &.not_started { background: $color-warning-bg; color: $color-warning-text; }
    &.ongoing { background: $color-success-bg; color: $color-success-text; }
    &.ended { background: $color-neutral-bg; color: $text-secondary; }
  }
  &__stat-label { color: $text-body; font-size: 13px; }
  &__stat-hint { grid-column: 1 / -1; color: $text-secondary; font-size: 12px; line-height: 1.5; }

  &__list { overflow: hidden; :deep(> .el-card__body) { padding: 0; } }
  &__toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 20px; }
  &__list-heading { display: flex; align-items: center; gap: 10px; h3 { margin: 0; color: $text-primary; font-size: 15px; font-weight: 600; } }
  &__result-count { padding: 3px 8px; border-radius: $radius-xs; background: $bg-page; color: $text-secondary; font-size: 12px; font-variant-numeric: tabular-nums; }
  &__filter-keyword { width: 240px; }
  &__filter-actions { display: flex; align-items: center; gap: 8px; min-width: 0; :deep(.el-button + .el-button) { margin-left: 0; } }
  &__toolbar-divider { width: 1px; height: 20px; margin: 0 4px; background: $border-color; }
  &__scroll-hint { display: none; }

  &__table {
    :deep(th.el-table__cell:first-child > .cell), :deep(td.el-table__cell:first-child > .cell) { padding-left: 20px; }
    :deep(.table-actions-cell > .cell) { padding-right: 16px; }
    :deep(.el-table__body .cell) { padding-top: 6px; padding-bottom: 6px; }
    :deep(.table-actions) { gap: 10px; }
  }
  &__exam-heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
  &__exam-icon { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: $radius-sm; background: $bg-page; color: $color-primary-dark; font-size: 15px; }
  &__exam-name { min-width: 0; overflow: hidden; color: $text-primary; font-size: 13px; font-weight: 600; line-height: 1.6; text-overflow: ellipsis; white-space: nowrap; }
  &__question-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 8px; color: $text-secondary; font-size: 12px; line-height: 1.6; b { color: $text-body; font-weight: 500; font-variant-numeric: tabular-nums; } }
  &__row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 7px; color: $text-secondary; font-size: 12px; line-height: 1.6; }
  &__time { display: grid; gap: 4px; color: $text-body; font-size: 12px; font-variant-numeric: tabular-nums; span { display: flex; align-items: center; gap: 8px; white-space: nowrap; } small { color: $text-secondary; font-size: 12px; } }
  &__departments { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; color: $text-secondary; font-size: 12px; :deep(.el-tag) { --el-tag-text-color: #{$text-body}; --el-tag-border-color: #{$border-color}; --el-tag-bg-color: #{$color-table-head}; max-width: 100%; } }
  &__authors { display: flex; align-items: center; gap: 6px; color: $text-body; font-size: 12px; .el-icon { flex-shrink: 0; color: $text-secondary; } > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } &.is-empty { color: $text-secondary; } }
  &__lock-note { margin-top: 5px; color: $text-secondary; font-size: 12px; line-height: 1.5; }
  &__list-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 48px; padding: 10px 20px; background: $color-table-head; color: $text-secondary; font-size: 12px; }
}

@media (max-width: 1100px) {
  .exam-page__stat { gap: 12px; padding: 16px; }
  .exam-page__filter-actions { flex-wrap: wrap; }
}
@media (max-width: 900px) {
  .exam-page__overview { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
  .exam-page__toolbar { align-items: flex-start; }
}
@media (max-width: 600px) {
  .exam-page__stat { grid-template-columns: 32px minmax(0, 1fr); gap: 10px; padding: 14px; strong { font-size: 24px; } }
  .exam-page__stat-icon { width: 32px; height: 32px; font-size: 18px; }
  .exam-page__stat-hint { display: none; }
  .exam-page__toolbar { gap: 12px; padding: 16px; }
  .exam-page__filter-actions { width: 100%; }
  .exam-page__filter-keyword { flex: 1 1 180px; width: auto; }
  .exam-page__toolbar-divider { display: none; }
  .exam-page__scroll-hint { display: block; margin: 0; padding: 0 16px 12px; color: $text-secondary; font-size: 12px; }
  // Element Plus 以 !important 固定操作列；手机端取消固定，留出完整的名称阅读空间。
  .exam-page__table :deep(.el-table-fixed-column--right) { position: static !important; }
  .exam-page__table :deep(.el-table-fixed-column--right::before) { display: none; }
  .exam-page__list-footer { padding-right: 16px; padding-left: 16px; }
}
.exam-detail__context { padding: 16px; background: $bg-page; border: 1px solid $border-color; border-radius: $radius-lg; margin-bottom: 20px; h3 { margin: 0 0 12px; overflow-wrap: anywhere; } }
.exam-detail__meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; margin: 0; dt { color: $text-secondary; font-size: 12px; } dd { margin: 4px 0 0; overflow-wrap: anywhere; } }
.exam-detail__actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.exam-roster__context { overflow-wrap: anywhere; }
.exam-roster { min-height: 100px; max-height: 480px; overflow-y: auto; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
.exam-roster__person { min-width: 0; padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; h3 { margin: 0 0 12px; font-size: 14px; overflow-wrap: anywhere; } dl { margin: 0; display: grid; gap: 10px; } dt { color: $text-secondary; font-size: 12px; } dd { margin: 4px 0 0; overflow-wrap: anywhere; } }
@media(max-width: 900px) { .exam-roster { max-height: none; grid-template-columns: minmax(0,1fr); } .exam-detail__actions { width: 100%; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } .exam-detail__actions :deep(.el-button.el-button) { margin: 0; } }
@media(max-width: 480px) { .exam-detail__meta { grid-template-columns: minmax(0,1fr); } }
</style>
