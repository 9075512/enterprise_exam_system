<script setup lang="ts">
import ResponsivePagination from '@/components/common/ResponsivePagination.vue';
/**
 * 补考管理（v1.5，管理员审批）。
 * 按状态 + 考试筛选补考申请，对待审批申请执行「通过 / 驳回」。
 *
 * v1.9④：新增「考试范围」选择器（与路由 `?examId=` 同步）——
 * 可从「考试管理」行操作直达某场考试的补考队列，队列真正对应到每一场考试。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { validateAndFocus } from '@/composables/useFormFocus';
import { approveRetake, listRetakes, rejectRetake } from '@/api/retakes';
import { useExamScope } from '@/composables/useExamScope';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import { usePagination } from '@/composables/usePagination';
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
const approving = ref(false);
const rejecting = ref(false);
const validating = ref(false);
const busy = computed(() => approving.value || rejecting.value || validating.value);
const decisionError = ref('');
const detailVisible = ref(false);
const current = ref<Retake | null>(null);
const rejectMode = ref(false);
const rejectForm = reactive({ reason: '' });
const rejectFormRef = ref<FormInstance>();
const rejectRules: FormRules = { reason: [{ required: true, whitespace: true, message: '请填写驳回原因', trigger: 'blur' }, { max: 255, message: '驳回原因不能超过255个字符', trigger: 'blur' }] };
function openDetail(row: Retake, reject = false): void {
  if (busy.value) return;
  current.value = row;
  rejectMode.value = reject;
  rejectForm.reason = '';
  decisionError.value = '';
  detailVisible.value = true;
  void nextTick(() => rejectFormRef.value?.clearValidate());
}

/** 考试范围（与路由 ?examId= 双向同步） */
const { examId } = useExamScope();

const { list, loading, error, page, pageSize, total, load, clear } = usePagination<Retake>((p, ps) => listRetakes({
  status: filter.value || undefined, examId: examId.value || undefined, page: p, pageSize: ps,
}), 20);

load();

/** 考试范围变化 → 回到第 1 页重查（无论来自选择器还是 URL 直达） */
watch(examId, () => {
  clear();
  page.value = 1;
  void load();
});

/** 空态文案随筛选范围变化，避免「明明选了某场考试却提示没有申请」造成误解 */
const emptyText = computed(() => (examId.value ? '该考试暂无补考申请' : '暂无补考申请'));

/* ------------------------------ 补考规则（系统设置） ------------------------------ */
const router = useRouter();
const settingsStore = useSettingsStore();
const rulesLoading = ref(true);
const rulesError = ref(false);
async function loadRules(): Promise<void> {
  rulesLoading.value = true;
  try { await settingsStore.load(); rulesError.value = !settingsStore.ready; }
  catch { rulesError.value = true; }
  finally { rulesLoading.value = false; }
}
onMounted(() => { void loadRules(); });

/**
 * 补考规则展示项（对应设计稿「补考规则（系统设置）」卡）。
 *
 * 数据来源：优先取 `useSettingsStore().settings` 中确切存在的字段——
 * - `examDefaultPassScore`：考试默认及格线（低于该分才需补考）
 * - `examDefaultMaxAttempts`：每人默认答题次数上限
 * - `retakeDefaultEnabled`：补考申请全局默认开关
 *
 * 资格与有效申请数量按 `retakes.service` 规则表述，报表成绩口径读取 retakeScorePolicy。
 * 设置通过全局 store 的缓存加载；读取成功前用横杠表示配置值，失败可独立重试。
 */
const retakeRules = computed<Array<{ label: string; value: string }>>(() => {
  const s = settingsStore.settings;
  return [
    // —— 行为规则（对齐后端 canApplyRetake / applyRetake 判定） ——
    { label: '补考资格', value: '未及格，且答题次数已用完' },
    { label: '审批方式', value: '管理员逐条审批，通过后可再作答一次' },
    { label: '申请次数', value: '每场至多一条有效申请，被驳回后可重新申请' },
    { label: '补考成绩口径', value: !settingsStore.ready ? '—' : s.retakeScorePolicy === 'highest' ? '报表与导出取每位考生最高分的已交卷答卷' : '报表与导出取每位考生最近一次已交卷答卷' },
    // —— 系统设置项 ——
    { label: '考试默认及格线', value: settingsStore.ready ? `${s.examDefaultPassScore} 分` : '—' },
    { label: '每人默认答题次数上限', value: settingsStore.ready ? `${s.examDefaultMaxAttempts} 次` : '—' },
    { label: '补考申请默认开关', value: !settingsStore.ready ? '—' : s.retakeDefaultEnabled ? '已启用' : '未启用' },
  ];
});

function goSettings(): void {
  void router.push('/admin/settings');
}

function handleFilterChange(): void {
  if (busy.value) return;
  clear();
  page.value = 1;
  void load();
}

function handlePageChange(p: number): void {
  if (busy.value) return;
  page.value = p;
  void load();
}

async function handleApprove(row: Retake): Promise<void> {
  if (busy.value || row.status !== 'pending') return;
  approving.value = true;
  decisionError.value = '';
  try {
    try { await ElMessageBox.confirm(
      `确定通过「${row.userName}」对「${row.examName}」的补考申请吗？通过后该考生将获得一次补考机会。`,
      '通过补考',
      { confirmButtonText: '通过', cancelButtonText: '取消', type: 'warning' },
    ); } catch { return; }
    await approveRetake(row.id);
    detailVisible.value = false;
    ElMessage.success('已通过补考申请');
    void load();
  } catch {
    decisionError.value = '本次审批失败，请核对申请状态后重试。';
  } finally {
    approving.value = false;
  }
}

async function handleReject(row: Retake): Promise<void> {
  if (row.status !== 'pending') return;
  openDetail(row, true);
}
async function submitReject(): Promise<void> {
  if (busy.value || !current.value || current.value.status !== 'pending' || !rejectFormRef.value) return;
  const id = current.value.id;
  validating.value = true;
  let valid = false;
  try { valid = await validateAndFocus(rejectFormRef.value); }
  finally { validating.value = false; }
  if (!valid) return;
  rejecting.value = true;
  decisionError.value = '';
  try {
    await rejectRetake(id, rejectForm.reason.trim());
    detailVisible.value = false;
    ElMessage.success('已驳回补考申请');
    void load();
  } catch {
    decisionError.value = '驳回失败，原因已保留，请重试。';
  } finally {
    rejecting.value = false;
  }
}
</script>

<template>
  <div data-ui-layout="list" data-ui-page="RetakeManagePage" class="retake-manage-page">
    <PageHeader title="补考管理" description="审批考生的补考申请；通过后考生获得一次补考机会"><template #actions><el-button :icon="Refresh" :disabled="busy" :loading="loading" @click="load">刷新申请</el-button></template></PageHeader>

    <el-card class="retake-manage-page__panel" data-ui-role="table" shadow="never">
      <div class="retake-manage-page__toolbar">
        <ExamScopeSelect v-model="examId" :disabled="busy" />
        <el-radio-group v-model="filter" :disabled="busy" @change="handleFilterChange">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="pending">待审批</el-radio-button>
          <el-radio-button value="approved">已通过</el-radio-button>
          <el-radio-button value="rejected">已驳回</el-radio-button>
        </el-radio-group>
      </div>

      <p class="admin-scope">当前考试与审批状态范围 · {{ loading ? '正在加载' : error ? '数量未知' : total + ' 条申请' }} · 点击考试名称查看完整申请</p>
      <p v-if="decisionError && !detailVisible" class="retake-manage-page__decision-error" role="status">{{ decisionError }}</p>
      <RequestError v-if="error" text="补考申请加载失败" @retry="load" />
      <el-table v-else v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="考试名称" min-width="200"><template #default="{ row }"><el-button link type="primary" class="retake-manage-page__exam-name" :disabled="busy" @click="openDetail(row as Retake)">{{ row.examName }}</el-button></template></el-table-column>
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
        <el-table-column class-name="table-actions-cell" label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="primary" link :disabled="busy" @click="handleApprove(row as Retake)">通过</el-button>
              <el-button type="danger" link :disabled="busy" @click="handleReject(row as Retake)">驳回</el-button>
            </template>
            <el-button v-else link type="primary" :disabled="busy" @click="openDetail(row as Retake)">查看详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" />
        </template>
      </el-table>

      <ResponsivePagination
        v-if="!error && total > pageSize"
        class="retake-manage-page__pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :disabled="busy"
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

      <RequestError v-if="rulesError" text="补考设置加载失败，配置值暂未知" @retry="loadRules" />
      <p v-else-if="rulesLoading" class="retake-manage-page__rules-empty" role="status">补考设置加载中</p>
      <div v-if="retakeRules.length" class="retake-manage-page__rules-list">
        <div v-for="rule in retakeRules" :key="rule.label" class="retake-manage-page__rule">
          <span class="retake-manage-page__rule-k">{{ rule.label }}</span>
          <span class="retake-manage-page__rule-v">{{ rule.value }}</span>
        </div>
      </div>
      <p v-else class="retake-manage-page__rules-empty">补考规则暂未配置，请前往系统设置查看或配置。</p>
    </el-card>

    <el-drawer v-model="detailVisible" title="补考申请详情" class="retake-detail" size="720px" append-to-body destroy-on-close :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" data-ui-role="editor">
      <template v-if="current">
        <section class="retake-detail__context"><small>考试名称</small><h3>{{ current.examName }}</h3><el-tag :type="STATUS_TAG[current.status]">{{ STATUS_LABELS[current.status] }}</el-tag></section>
        <dl class="retake-detail__meta">
          <div><dt>考生</dt><dd>{{ current.userName }}</dd></div><div><dt>登录账号</dt><dd>{{ current.username }}</dd></div>
          <div><dt>科室</dt><dd>{{ current.departmentName || '未分配' }}</dd></div><div><dt>申请时间</dt><dd>{{ formatDateTime(current.appliedAt) }}</dd></div>
          <div><dt>审批时间</dt><dd>{{ current.reviewedAt ? formatDateTime(current.reviewedAt) : '尚未审批' }}</dd></div><div v-if="current.reviewedBy"><dt>审批人标识</dt><dd>{{ current.reviewedBy }}</dd></div>
        </dl>
        <section class="retake-detail__reason"><h3>申请说明 / 驳回原因</h3><p>{{ current.reason || '未填写说明' }}</p></section>
        <el-form v-if="rejectMode && current.status === 'pending'" ref="rejectFormRef" :model="rejectForm" :rules="rejectRules" :disabled="rejecting" label-position="top">
          <el-form-item label="驳回原因" prop="reason"><el-input v-model="rejectForm.reason" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" maxlength="255" show-word-limit placeholder="请说明驳回原因，提交失败后可继续修改重试" /></el-form-item>
        </el-form>
        <p v-if="decisionError" class="retake-manage-page__decision-error" role="status">{{ decisionError }}</p>
      </template>
      <template #footer>
        <el-button :disabled="busy" @click="detailVisible = false">{{ rejectMode ? '取消' : '关闭' }}</el-button>
        <template v-if="current?.status === 'pending'">
          <el-button v-if="rejectMode" type="danger" :loading="rejecting || validating" :disabled="approving" @click="submitReject">确认驳回</el-button>
          <template v-else><el-button type="danger" :disabled="busy" @click="rejectMode = true">驳回申请</el-button><el-button type="primary" :loading="approving" :disabled="rejecting || validating" @click="handleApprove(current)">通过申请</el-button></template>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.retake-manage-page {
  &__decision-error { margin: 12px 0; color: $color-error-text; font-size: 13px; overflow-wrap: anywhere; }
  &__exam-name { max-width: 100%; height: auto; text-align: left; white-space: normal; :deep(span) { white-space: normal; overflow-wrap: anywhere; } }
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
.retake-detail { &__context, &__reason { padding: 16px; margin-bottom: 20px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; h3 { margin: 0 0 10px; font-size: 14px; overflow-wrap: anywhere; } p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; } small { display: block; margin-bottom: 6px; color: $text-secondary; } } &__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 0 0 20px; dt { color: $text-secondary; font-size: 12px; } dd { margin: 4px 0 0; overflow-wrap: anywhere; } } :deep(.el-drawer__footer) { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; .el-button { margin: 0; } } }
@media(max-width: 900px) { .retake-manage-page__rule { align-items: flex-start; } .retake-manage-page__rule-k { flex: 0 0 40%; } .retake-manage-page__rule-v { min-width: 0; overflow-wrap: anywhere; } .retake-manage-page__toolbar :deep(.el-radio-group) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; } .retake-manage-page__toolbar :deep(.el-radio-button__inner) { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: center; } }
@media(max-width: 480px) { .retake-detail__meta { grid-template-columns: minmax(0, 1fr); } }
</style>
