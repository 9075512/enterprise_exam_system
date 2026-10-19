<script setup lang="ts">
import ResponsivePagination from '@/components/common/ResponsivePagination.vue';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import * as appealsApi from '@/api/appeals';
import * as recordsApi from '@/api/records';
import { APPEAL_STATUS_LABELS, APPEAL_STATUS_OPTIONS, APPEAL_STATUS_TAG_TYPES } from '@/constants';
import { useExamScope } from '@/composables/useExamScope';
import { useConfirm } from '@/composables/useConfirm';
import { useRequest } from '@/composables/useRequest';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ExamScopeSelect from '@/components/common/ExamScopeSelect.vue';
import type { AppealStatus, ScoreAppeal } from '@/types';

const { examId } = useExamScope();
const { confirm } = useConfirm();
const filter = ref<'' | AppealStatus>('');
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const loadError = ref(false);
const total = ref<number | null>(null);
const list = ref<ScoreAppeal[]>([]);
let listRequest = 0;
onScopeDispose(() => { listRequest += 1; });

async function load(): Promise<void> {
  const request = ++listRequest;
  loading.value = true;
  loadError.value = false;
  list.value = [];
  total.value = null;
  try {
    const result = await appealsApi.list({ status: filter.value || undefined, examId: examId.value || undefined, page: page.value, pageSize });
    if (request !== listRequest) return;
    // 审批后最后一页可能为空，回到仍然存在的页码重查。
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
    if (page.value > lastPage) { page.value = lastPage; void load(); return; }
    list.value = result.list;
    total.value = result.total;
  } catch {
    if (request === listRequest) loadError.value = true;
  } finally {
    if (request === listRequest) loading.value = false;
  }
}
watch([examId, filter], () => { page.value = 1; void load(); });
void load();

const detailVisible = ref(false);
const activeAppeal = ref<ScoreAppeal | null>(null);
const { data: record, loading: recordLoading, error: recordError, run: loadRecord } = useRequest(
  () => recordsApi.detail(activeAppeal.value!.recordId), [], { immediate: false, keepPreviousData: false },
);
const decision = ref<'approved' | 'rejected'>('approved');
const newScore = ref<number | undefined>();
const comment = ref('');
const submitting = ref(false);
const fullScore = computed(() => record.value?.paperSnapshot.totalScore);

function openDetail(row: ScoreAppeal): void {
  activeAppeal.value = row;
  newScore.value = row.originalScore;
  comment.value = '';
  decision.value = 'approved';
  detailVisible.value = true;
  void loadRecord();
}
const timeline = computed(() => {
  const a = activeAppeal.value;
  if (!a) return [];
  return [
    { title: '提交复核申请', detail: `${formatDateTime(a.appliedAt)} · ${a.userName}`, tone: '' },
    a.status === 'pending'
      ? { title: '等待管理员复核', detail: '核对原答卷与评分依据后处理', tone: 'pending' }
      : { title: a.status === 'approved' ? '复核通过' : '复核驳回 · 维持原分', detail: `${a.reviewedAt ? formatDateTime(a.reviewedAt) : '时间未记录'} · ${a.reviewedBy || '管理员'}${a.reviewComment ? ` · ${a.reviewComment}` : ''}`, tone: a.status },
  ];
});

async function submitDecision(): Promise<void> {
  const a = activeAppeal.value;
  if (!a || a.status !== 'pending' || submitting.value) return;
  const approve = decision.value === 'approved';
  if (approve && (recordLoading.value || recordError.value || fullScore.value === undefined)) {
    ElMessage.warning('请先加载原答卷，核对本卷满分与评分依据'); return;
  }
  if (approve && (newScore.value === undefined || !Number.isFinite(newScore.value) || newScore.value < 0 || newScore.value > fullScore.value!)) {
    ElMessage.warning('调整后分数必须在 0 与本卷满分之间'); return;
  }
  if (!approve && !comment.value.trim()) { ElMessage.warning('请填写驳回原因'); return; }
  submitting.value = true;
  try {
    const score = Number(newScore.value);
    const note = comment.value.trim();
    const accepted = await confirm(
      `考生：${a.userName}（${a.username}）\n考试：${a.examName}\n${approve ? `通过复核，成绩由 ${formatScore(a.originalScore)} 分调整为 ${formatScore(score)} 分（本卷满分 ${formatScore(fullScore.value!)} 分）` : '驳回复核，保留原成绩'}\n处理说明：${note || '未填写'}`,
      { title: '确认复核处理', confirmButtonText: approve ? '确认通过并更新成绩' : '确认驳回', type: 'warning' },
    );
    if (!accepted) return;
    if (approve) await appealsApi.approve(a.id, score, note);
    else await appealsApi.reject(a.id, note);
    ElMessage.success(approve ? '复核已通过，成绩已更新' : '已驳回复核申请');
    detailVisible.value = false;
    await load();
  } catch {
    // 失败保留抽屉与输入内容，错误由统一拦截器提示。
  } finally { submitting.value = false; }
}
function onPageChange(value: number): void { page.value = value; void load(); }
</script>

<template>
  <div data-ui-layout="list" data-ui-page="AppealManagePage" class="appeal-manage-page page">
    <PageHeader title="成绩复核" description="核对原答卷、评分依据和申请说明，记录每一次成绩变更">
      <template #actions><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></template>
    </PageHeader>
    <el-card class="appeal-manage-page__panel" shadow="never">
      <el-tabs v-model="filter" class="appeal-manage-page__tabs">
        <el-tab-pane label="全部申请" name="" />
        <el-tab-pane v-for="opt in APPEAL_STATUS_OPTIONS" :key="opt.value" :label="opt.label" :name="opt.value" />
      </el-tabs>
      <div class="appeal-manage-page__toolbar">
        <ExamScopeSelect v-model="examId" />
        <p class="appeal-manage-page__scope">{{ examId ? '当前考试' : '全部考试' }} · {{ filter ? APPEAL_STATUS_LABELS[filter] : '全部状态' }} · 共 {{ total ?? '—' }} 条申请</p>
      </div>
      <el-alert v-if="loadError" type="error" :closable="false" show-icon title="复核申请加载失败">
        <el-button type="primary" link @click="load">保留当前筛选并重试</el-button>
      </el-alert>
      <el-table v-else v-loading="loading" :data="list" row-key="id" @row-click="openDetail">
        <el-table-column label="申请人" min-width="170">
          <template #default="{ row }"><div class="appeal-manage-page__person"><span class="appeal-manage-page__avatar">{{ row.userName?.slice(0, 1) }}</span><div><strong>{{ row.userName }}</strong><small>{{ row.departmentName || '未分配科室' }} · {{ row.username }}</small></div></div></template>
        </el-table-column>
        <el-table-column label="考试 / 申请说明" min-width="240">
          <template #default="{ row }"><strong class="appeal-manage-page__exam">{{ row.examName }}</strong><p class="appeal-manage-page__reason" :title="row.reason">{{ row.reason || '未填写申请说明' }}</p></template>
        </el-table-column>
        <el-table-column label="原分 / 复核后" min-width="130" align="right">
          <template #default="{ row }">{{ formatScore(row.originalScore) }}<span v-if="row.newScore !== null"> → {{ formatScore(row.newScore) }}</span><small class="appeal-manage-page__unit">分</small></template>
        </el-table-column>
        <el-table-column label="申请时间" width="165"><template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="APPEAL_STATUS_TAG_TYPES[row.status as AppealStatus]" effect="light">{{ APPEAL_STATUS_LABELS[row.status as AppealStatus] }}</el-tag></template></el-table-column>
        <el-table-column class-name="table-actions-cell" label="操作" width="125" fixed="right">
          <template #default="{ row }"><el-button type="primary" link @click.stop="openDetail(row as ScoreAppeal)">{{ row.status === 'pending' ? '查看并处理' : '查看详情' }}</el-button></template>
        </el-table-column>
        <template #empty><EmptyState v-if="!loading" :text="examId || filter ? '当前范围暂无复核申请' : '暂无复核申请'" /></template>
      </el-table>
      <ResponsivePagination v-if="total !== null && total > pageSize" class="appeal-manage-page__pager" layout="total, prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPageChange" />
    </el-card>

    <el-drawer v-model="detailVisible" title="复核申请详情" size="560px" append-to-body :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
      <template v-if="activeAppeal">
        <div class="appeal-detail__heading"><span class="appeal-detail__id">{{ activeAppeal.id }}</span><el-tag :type="APPEAL_STATUS_TAG_TYPES[activeAppeal.status]">{{ APPEAL_STATUS_LABELS[activeAppeal.status] }}</el-tag></div>
        <h3 class="appeal-detail__title">{{ activeAppeal.examName }}</h3>
        <p class="appeal-detail__meta">{{ activeAppeal.userName }} · {{ activeAppeal.username }} · {{ activeAppeal.departmentName || '未分配科室' }}</p>
        <div class="appeal-detail__scores"><div><span>申请时原成绩</span><strong>{{ formatScore(activeAppeal.originalScore) }}<small> 分</small></strong></div><div><span>{{ activeAppeal.newScore !== null ? '复核后成绩' : '本卷满分' }}</span><strong>{{ activeAppeal.newScore !== null ? formatScore(activeAppeal.newScore) : fullScore !== undefined ? formatScore(fullScore) : '—' }}<small> 分</small></strong></div></div>
        <h4>申请说明</h4><p class="appeal-detail__quote">{{ activeAppeal.reason || '未填写申请说明' }}</p>
        <h4>原答卷与评分依据</h4>
        <el-skeleton v-if="recordLoading" :rows="2" animated />
        <el-alert v-else-if="recordError" type="error" :closable="false" title="原答卷加载失败"><el-button type="primary" link @click="loadRecord">重新加载原答卷</el-button></el-alert>
        <div v-else-if="record" class="appeal-detail__quote">本次作答 {{ record.paperSnapshot.questions.length }} 道题，卷面满分 {{ formatScore(record.paperSnapshot.totalScore) }} 分。<br>当前答卷总分 {{ formatScore(record.score) }} 分，交卷时间 {{ formatDateTime(record.submittedAt) }}。<br><router-link :to="`/score-detail/${activeAppeal.recordId}`">查看完整答卷、逐题得分与评分细则 →</router-link></div>
        <h4>处理时间线</h4><ol class="appeal-detail__timeline"><li v-for="node in timeline" :key="node.title" :class="node.tone"><strong>{{ node.title }}</strong><p>{{ node.detail }}</p></li></ol>
        <el-form v-if="activeAppeal.status === 'pending'" label-position="top" :disabled="submitting" class="appeal-detail__form">
          <el-form-item label="处理结论"><el-radio-group v-model="decision"><el-radio-button value="approved">通过复核</el-radio-button><el-radio-button value="rejected">驳回复核</el-radio-button></el-radio-group></el-form-item>
          <el-form-item v-if="decision === 'approved'" label="调整后分数" required><el-input-number v-model="newScore" :min="0" :max="fullScore" :precision="1" :disabled="recordLoading || !!recordError || fullScore === undefined" aria-label="调整后分数" /><p class="appeal-detail__hint">按本次答卷的冻结快照核对满分，提交前再次确认成绩影响。</p></el-form-item>
          <el-form-item :label="decision === 'approved' ? '复核意见' : '驳回原因'" :required="decision === 'rejected'"><el-input v-model="comment" type="textarea" :rows="4" maxlength="500" show-word-limit :placeholder="decision === 'approved' ? '说明评分核对依据（选填）' : '请说明驳回原因（必填）'" /></el-form-item>
        </el-form>
        <div v-else-if="activeAppeal.reviewComment" class="appeal-detail__quote"><strong>复核意见</strong><p>{{ activeAppeal.reviewComment }}</p></div>
      </template>
      <template #footer><el-button :disabled="submitting" @click="detailVisible = false">关闭</el-button><el-button v-if="activeAppeal?.status === 'pending'" :type="decision === 'approved' ? 'primary' : 'danger'" :loading="submitting" @click="submitDecision">核对并提交</el-button></template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.appeal-manage-page {
  &__panel { overflow: hidden; :deep(> .el-card__body) { padding: 0; } }
  &__tabs { padding: 0 22px; :deep(.el-tabs__header) { margin-bottom: 0; } }
  &__toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 18px 22px; }
  &__scope { margin: 0; font-size: 12px; color: $text-secondary; }
  &__person { display: flex; align-items: center; gap: 10px; strong { font-weight: 500; } small { display: block; margin-top: 4px; color: $text-secondary; font-size: 12px; } }
  &__avatar { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: $radius-sm; color: $color-primary; background: $color-primary-soft; }
  &__exam { color: $text-primary; font-size: 13px; font-weight: 500; }
  &__reason { margin: 5px 0 0; color: $text-secondary; font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  &__unit { margin-left: 4px; color: $text-secondary; }
  &__pager { justify-content: flex-end; margin: 0; padding: 18px 22px; border-top: 1px solid $border-color; }
}
.appeal-detail {
  &__heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  &__id { color: $text-secondary; font-size: 12px; overflow-wrap: anywhere; }
  &__title { margin: 20px 0 6px; font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; }
  &__meta { margin: 0; font-size: 12px; color: $text-secondary; overflow-wrap: anywhere; }
  &__scores { display: flex; gap: 40px; margin: 22px 0; padding: 18px; border-radius: $radius-sm; background: $bg-page; span { display: block; font-size: 12px; color: $text-secondary; } strong { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; } small { font-size: 12px; font-weight: 400; } }
  &__quote { padding: 15px; background: $color-table-head; border-radius: $radius-sm; color: $text-body; font-size: 13px; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; a { display: inline-block; margin-top: 12px; color: $color-primary; } }
  &__timeline { list-style: none; margin: 18px 0 24px 5px; padding-left: 20px; border-left: 1px solid $border-color; li { position: relative; padding-bottom: 20px; &::before { content: ''; position: absolute; left: -25px; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: $color-primary-border; } &:last-child { padding-bottom: 0; } &.pending::before { background: $color-primary; } &.approved::before { background: $color-success; } &.rejected::before { background: $color-error; } } strong { font-size: 13px; font-weight: 500; } p { color: $text-secondary; font-size: 12px; margin: 4px 0 0; overflow-wrap: anywhere; } }
  &__form { border-top: 1px solid $border-color; padding-top: 22px; }
  &__hint { width: 100%; margin: 8px 0 0; color: $text-secondary; font-size: 12px; }
}
@media (max-width: 700px) {
  .appeal-manage-page__panel :deep(.el-table-fixed-column--right) { position: static !important; }
  .appeal-manage-page__toolbar { padding: 16px; }
}
@media (max-width: 900px) {
  .appeal-detail__scores { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; strong { font-size: 22px; overflow-wrap: anywhere; } }
  .appeal-detail__form :deep(.el-radio-button__inner) { display: inline-flex; align-items: center; min-height: 44px; }
}
</style>
