<script setup lang="ts">
/**
 * 我的成绩（W3-T1，考生）。records.my 分页，考试名/及格线取本科室可见考试。
 * 关键字按考试名称**服务端**过滤：输入防抖后回到第 1 页重新加载，分页/翻页均带上关键字。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Refresh } from '@element-plus/icons-vue';
import * as examsApi from '@/api/exams';
import * as recordsApi from '@/api/records';
import * as appealsApi from '@/api/appeals';
import { useRequest } from '@/composables/useRequest';
import { usePagination } from '@/composables/usePagination';
import { useSettingsStore } from '@/stores/settings';
import { formatDateTime } from '@/utils/datetime';
import { formatScore } from '@/utils/format';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import DataTablePagination from '@/components/common/DataTablePagination.vue';
import type { ExamMy, ExamRecord } from '@/types';

const router = useRouter();
const settingsStore = useSettingsStore();
const { data: myExams } = useRequest(() => examsApi.my());

const examMap = computed<Record<string, ExamMy>>(() =>
  Object.fromEntries((myExams.value ?? []).map((e) => [e.id, e])),
);

/** 关键字输入（服务端过滤，防抖后生效）。loadFn 闭包实时读取，翻页/改每页条数均携带该值 */
const filterKeyword = ref('');

const {
  list: records,
  page,
  pageSize,
  total,
  loading,
  load,
  onPageChange,
  onSizeChange,
  reset,
} = usePagination<ExamRecord>(
  (p, ps) =>
    recordsApi.my({ page: p, pageSize: ps, keyword: filterKeyword.value.trim() || undefined }),
  settingsStore.settings.defaultPageSize,
);

/* 输入防抖（350ms）：回到第 1 页并重新加载，避免每敲一个字都发请求 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function onKeywordInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    reset();
  }, 350);
}

function onReset(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  filterKeyword.value = '';
  reset();
}

onMounted(() => {
  void settingsStore.load();
  void load();
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

const emptyText = computed(() =>
  filterKeyword.value.trim() ? '没有匹配的成绩记录' : '还没有成绩记录',
);

function examName(examId: string): string {
  return examMap.value[examId]?.name ?? examId;
}

function passScoreOf(examId: string): number | null {
  return examMap.value[examId]?.passScore ?? null;
}

function goDetail(record: ExamRecord): void {
  void router.push(`/score-detail/${record.id}`);
}

/* ------------------------------ 成绩复核申请（v1.7①） ------------------------------ */
const appealVisible = ref(false);
const appealing = ref(false);
const appealRecord = ref<ExamRecord | null>(null);
const appealReason = ref('');

/** 该考试是否开放成绩复核（考试级三态覆盖全局默认） */
function appealEnabledOf(examId: string): boolean {
  const exam = examMap.value[examId];
  return exam ? (exam.allowAppeal ?? settingsStore.settings.appealEnabled) : settingsStore.settings.appealEnabled;
}

function openAppeal(record: ExamRecord): void {
  appealRecord.value = record;
  appealReason.value = '';
  appealVisible.value = true;
}

async function submitAppeal(): Promise<void> {
  if (!appealRecord.value) return;
  appealing.value = true;
  try {
    await appealsApi.apply(appealRecord.value.id, appealReason.value.trim());
    ElMessage.success('复核申请已提交，请等待管理员处理');
    appealVisible.value = false;
    void load();
  } catch {
    // 错误已由拦截器提示（如重复申请 1005）
  } finally {
    appealing.value = false;
  }
}
</script>

<template>
  <div class="my-score">
    <PageHeader title="我的成绩" description="查看已交卷考试的成绩与明细" />

    <LoadingSkeleton v-if="loading && records.length === 0" :rows="5" />

    <el-card v-else class="table-card" shadow="never">
      <div class="table-card__toolbar">
        <div class="table-card__toolbar-filters">
          <el-input
            v-model="filterKeyword"
            class="my-score__filter-keyword"
            placeholder="按考试名称搜索"
            clearable
            :prefix-icon="Search"
            @input="onKeywordInput"
          />
        </div>
        <div class="my-score__filter-actions">
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="records" row-key="id" stripe>
        <el-table-column label="考试名称" min-width="200">
          <template #default="{ row }">{{ examName(row.examId) }}</template>
        </el-table-column>
        <el-table-column label="作答次数" width="90" align="center">
          <template #default="{ row }">第 {{ row.attemptNo }} 次</template>
        </el-table-column>
        <el-table-column label="交卷时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="得分" width="100" align="center">
          <template #default="{ row }">{{ formatScore(row.score) }}</template>
        </el-table-column>
        <el-table-column label="是否及格" width="110" align="center">
          <template #default="{ row }">
            <template v-if="passScoreOf(row.examId) !== null">
              <el-tag
                size="small"
                effect="plain"
                :type="row.score >= (passScoreOf(row.examId) as number) ? 'success' : 'danger'"
              >
                {{ row.score >= (passScoreOf(row.examId) as number) ? '及格' : '不及格' }}
              </el-tag>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row as ExamRecord)">查看明细</el-button>
            <el-button
              v-if="appealEnabledOf((row as ExamRecord).examId)"
              link
              @click="openAppeal(row as ExamRecord)"
            >
              申请复核
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState :text="emptyText" />
        </template>
      </el-table>

      <div class="table-card__pagination">
        <DataTablePagination
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="onPageChange"
          @update:page-size="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="appealVisible" title="申请成绩复核" width="460px">
      <el-alert
        v-if="appealRecord"
        class="my-score__appeal-alert"
        type="info"
        :closable="false"
        show-icon
        :title="examName(appealRecord.examId)"
        :description="`当前成绩：${formatScore(appealRecord.score)} 分 · 每条成绩仅可申请一次`"
      />
      <el-form label-width="80px">
        <el-form-item label="申请说明">
          <el-input
            v-model="appealReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="请说明你对哪道题或哪项判分有疑问（选填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appealVisible = false">取消</el-button>
        <el-button type="primary" :loading="appealing" @click="submitAppeal">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.my-score__filter-keyword {
  width: 260px;
}

.my-score__filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.my-score__appeal-alert {
  margin-bottom: 16px;
}
</style>
