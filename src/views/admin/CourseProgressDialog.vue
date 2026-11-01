<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import * as api from '@/api/courses';
import * as departmentsApi from '@/api/departments';
import type { Department } from '@/types';
import type { CourseProgressPage, CourseProgressQuery, CourseProgressStatus, CoursePersonReport } from '@/api/courses';
import { buildDepartmentTree } from '@/utils/departmentTree';
import { formatVideoTime } from '@/data/courses';

const props = defineProps<{ modelValue: boolean; courseId: string; courseTitle: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const initialQuery = (): CourseProgressQuery => ({ scope: 'current', keyword: '', departmentId: '', status: '', page: 1, pageSize: 20 });
const query = reactive(initialQuery()); let applied = initialQuery();
const loading = ref(false), exporting = ref(false), error = ref(''), exportError = ref('');
const report = ref<CourseProgressPage>(); const departments = ref<Department[]>([]);
const detail = ref<CoursePersonReport>(), detailOpen = ref(false), detailLoading = ref(false), detailError = ref(''), detailUserId = ref('');
const busy = computed(() => loading.value || exporting.value);
const tree = computed(() => buildDepartmentTree(departments.value));
const statusLabels: Record<CourseProgressStatus, string> = { not_started: '未开始', learning: '学习中', completed: '已完成' };
let generation = 0; let detailGeneration = 0;
function time(value: string): string { return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '—'; }
async function load(loadDepartments = false): Promise<void> {
  const current = ++generation; const request = { ...query }; loading.value = true; error.value = ''; exportError.value = '';
  try {
    const [result, depts] = await Promise.all([api.getCourseProgressReport(props.courseId, request), loadDepartments ? departmentsApi.list() : Promise.resolve(departments.value)]);
    if (current !== generation) return;
    report.value = result; departments.value = depts; query.page = result.page; applied = { ...request, page: result.page };
  } catch (reason) { if (current === generation) error.value = (reason as Error).message || '学习进度加载失败，请重试'; }
  finally { if (current === generation) loading.value = false; }
}
watch(() => [props.modelValue, props.courseId] as const, ([open]) => {
  detailOpen.value = false; detailGeneration++;
  if (open) { Object.assign(query, initialQuery()); report.value = undefined; departments.value = []; void load(true); }
  else generation++;
}, { immediate: true });
function search(): void { query.page = 1; void load(); }
async function showPerson(userId: string): Promise<void> {
  const current = ++detailGeneration; detailUserId.value = userId; detailOpen.value = true; detailLoading.value = true; detailError.value = ''; detail.value = undefined;
  try { const result = await api.getCoursePersonProgress(props.courseId, userId); if (current === detailGeneration) detail.value = result; }
  catch (reason) { if (current === detailGeneration) detailError.value = (reason as Error).message || '小节明细加载失败，请重试'; }
  finally { if (current === detailGeneration) detailLoading.value = false; }
}
async function download(): Promise<void> {
  if (busy.value || !report.value || error.value) return;
  exporting.value = true; exportError.value = '';
  const courseId = props.courseId; const title = props.courseTitle; const request = { ...applied };
  try {
    const blob = await api.exportCourseProgress(courseId, request); const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}-${request.scope === 'current' ? '学习进度' : '历史记录'}.xlsx`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (reason) { exportError.value = (reason as Error).message || '导出失败，请重试'; }
  finally { exporting.value = false; }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="课程学习进度" width="min(1180px, 96vw)" append-to-body destroy-on-close :close-on-click-modal="false" @update:model-value="emit('update:modelValue', $event)">
    <div class="course-report">
      <h3 class="course-report__title">{{ courseTitle }}</h3>
      <el-tabs v-model="query.scope" @tab-change="search"><el-tab-pane label="当前绑定人员" name="current" :disabled="busy" /><el-tab-pane label="历史记录" name="history" :disabled="busy" /></el-tabs>
      <p class="course-report__note">{{ query.scope === 'current' ? '包含当前范围内尚未开始学习的人员；历史公开课程按全部启用考生统计。' : '展示已有记录但已移出当前范围的人员，不计入当前人员完成率。' }} 进度按当前有效小节完成比例统计，时间为北京时间。</p>
      <div class="course-report__filters">
        <el-input v-model.trim="query.keyword" clearable aria-label="搜索学习人员" placeholder="搜索姓名或账号" :disabled="busy" @keyup.enter="search" />
        <el-tree-select v-model="query.departmentId" :data="tree" check-strictly filterable clearable aria-label="学习进度科室筛选" placeholder="全部科室（含下级）" :disabled="busy" @change="search" />
        <el-select v-model="query.status" clearable aria-label="学习状态筛选" placeholder="全部学习状态" :disabled="busy" @change="search"><el-option v-for="(label, value) in statusLabels" :key="value" :label="label" :value="value" /></el-select>
        <el-button type="primary" :disabled="busy" @click="search">查询</el-button><el-button :disabled="busy" @click="load(true)">刷新</el-button><el-button :loading="exporting" :disabled="busy || !report || !!error" @click="download">导出 Excel</el-button>
      </div>
      <el-alert v-if="error || exportError" :title="error || exportError" type="error" :closable="false" show-icon role="alert" />
      <div v-if="loading" v-loading="true" class="course-report__loading" aria-live="polite">正在读取人员与学习记录…</div>
      <div v-else-if="error" class="course-report__retry"><el-button @click="load(true)">重试加载</el-button></div>
      <template v-else-if="report">
        <div class="course-report__stats" aria-label="筛选结果统计"><article><span>总人数</span><strong>{{ report.summary.total }}</strong></article><article><span>未开始</span><strong>{{ report.summary.notStarted }}</strong></article><article><span>学习中</span><strong>{{ report.summary.learning }}</strong></article><article><span>已完成</span><strong>{{ report.summary.completed }}</strong></article><article><span>完成率</span><strong>{{ report.summary.completionRate.toFixed(1) }}%</strong></article></div>
        <el-table :data="report.list" row-key="userId" max-height="420" empty-text="暂无符合条件的人员">
          <el-table-column prop="userName" label="姓名" min-width="100" /><el-table-column prop="username" label="账号" min-width="120" /><el-table-column prop="departmentName" label="当前科室" min-width="130" />
          <el-table-column label="学习状态" min-width="100"><template #default="{ row }"><el-tag :type="row.status === 'completed' ? 'success' : row.status === 'learning' ? 'primary' : 'info'">{{ statusLabels[row.status as CourseProgressStatus] }}</el-tag><small v-if="row.accountStatus !== 'active'"> 账号已停用</small></template></el-table-column>
          <el-table-column label="完成小节" min-width="100"><template #default="{ row }">{{ row.completedLessons }} / {{ row.totalLessons }}</template></el-table-column>
          <el-table-column label="进度" min-width="140"><template #default="{ row }"><el-progress :percentage="row.percent" :format="(value: number) => value.toFixed(1) + '%'" /></template></el-table-column>
          <el-table-column label="最近学习时间" min-width="185"><template #default="{ row }">{{ time(row.lastLearnedAt) }}</template></el-table-column>
          <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="showPerson(row.userId)">小节明细</el-button></template></el-table-column>
        </el-table>
        <el-pagination v-model:current-page="query.page" :total="report.total" :page-size="query.pageSize" layout="total, prev, pager, next" :disabled="busy" @current-change="load()" />
      </template>
    </div>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
    <el-dialog v-model="detailOpen" title="人员小节明细" width="min(960px, 94vw)" append-to-body destroy-on-close>
      <div v-if="detailLoading" v-loading="true" class="course-report__loading">正在读取小节明细…</div>
      <template v-else-if="detailError"><el-alert :title="detailError" type="error" :closable="false" role="alert" /><el-button @click="showPerson(detailUserId)">重试加载</el-button></template>
      <template v-else-if="detail"><p>{{ detail.userName }}（{{ detail.username }}） · {{ detail.departmentName || '无科室' }} · {{ detail.scope === 'current' ? '当前范围' : '历史记录' }}</p>
        <el-table :data="detail.lessons" row-key="lessonId" max-height="480" empty-text="当前课程暂无小节"><el-table-column prop="chapterTitle" label="章节" min-width="120" /><el-table-column prop="lessonTitle" label="小节" min-width="150" /><el-table-column label="状态" min-width="90"><template #default="{ row }">{{ statusLabels[row.status as CourseProgressStatus] }}</template></el-table-column><el-table-column label="播放位置 / 视频时长" min-width="160"><template #default="{ row }">{{ formatVideoTime(row.position) }} / {{ row.duration ? formatVideoTime(row.duration) : '—' }}</template></el-table-column><el-table-column label="最近记录时间" min-width="185"><template #default="{ row }">{{ time(row.lastLearnedAt) }}</template></el-table-column></el-table>
      </template>
      <template #footer><el-button @click="detailOpen = false">关闭明细</el-button></template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.course-report {
  &__title { margin: 0 0 12px; color: $text-primary; font-size: 16px; overflow-wrap: anywhere; }
  &__note { color: $text-secondary; font-size: 12px; line-height: 1.7; }
  &__filters { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; .el-input { width: 200px; } .el-select, .el-tree-select { width: 180px; } .el-button { margin-left: 0; } }
  &__stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 20px 0; article { border: 1px solid $border-color; border-radius: $radius-base; padding: 14px; display: grid; gap: 6px; } span { color: $text-secondary; font-size: 12px; } strong { color: $text-primary; font-size: 22px; font-variant-numeric: tabular-nums; } }
  &__loading, &__retry { min-height: 160px; padding: 24px; }
  .el-pagination { margin-top: 18px; max-width: 100%; flex-wrap: wrap; }
  @media (max-width: 640px) { &__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } &__filters { .el-input, .el-select, .el-tree-select { width: 100%; } } }
}
</style>
