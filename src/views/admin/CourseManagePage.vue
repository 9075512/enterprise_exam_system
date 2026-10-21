<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search, VideoPlay } from '@element-plus/icons-vue';
import * as api from '@/api/courses';
import type { CourseQuery, CourseStatus, ManagedCourse } from '@/api/courses';
import { courseLessons } from '@/data/courses';
import PageHeader from '@/components/common/PageHeader.vue';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import CourseEditorDrawer from './CourseEditorDrawer.vue';
import CourseCategoriesDialog from './CourseCategoriesDialog.vue';
import CourseVideoPlayer from '@/views/courses/components/CourseVideoPlayer.vue';
import { formatDateTime } from '@/utils/datetime';

const courses = ref<ManagedCourse[]>([]);
const loading = ref(true);
const loadError = ref(false);
const actionError = ref('');
const operation = ref('');
const query = reactive<CourseQuery>({ q: '', status: '', page: 1, pageSize: 12 });
const total = ref(0);
const stats = ref({ draft: 0, published: 0, archived: 0 });
const busy = computed(() => loading.value || !!operation.value);
const editorOpen = ref(false);
const categoriesOpen = ref(false);
const editing = ref<ManagedCourse | null>(null);
const preview = ref<ManagedCourse>();
const previewOpen = ref(false);
const previewId = ref('');
const previewLesson = computed(() => preview.value ? courseLessons(preview.value).find(lesson => lesson.id === previewId.value) : undefined);
const statusLabels: Record<CourseStatus, string> = { draft: '草稿', published: '已上架', archived: '已下架' };
let pending = false;
async function load(): Promise<void> {
  if (operation.value || pending) return;
  pending = true; loading.value = true; loadError.value = false;
  try { const result = await api.listManagedCourses({ ...query }); courses.value = result.list; total.value = result.total; stats.value = result.stats; query.page = result.page; }
  catch { loadError.value = true; }
  finally { loading.value = false; pending = false; }
}
onMounted(load);
function search(): void { query.page = 1; void load(); }
async function edit(course?: ManagedCourse): Promise<void> {
  if (busy.value) return;
  if (!course) { editing.value = null; editorOpen.value = true; return; }
  operation.value = course.id; actionError.value = '';
  try { editing.value = await api.getManagedCourse(course.id); if (editing.value.status === 'published') { actionError.value = '课程已上架，请先下架后编辑'; return; } editorOpen.value = true; }
  catch (error) { actionError.value = (error as Error).message || '课程读取失败，请刷新后重试'; }
  finally { operation.value = ''; }
}
async function showPreview(course: ManagedCourse): Promise<void> {
  if (busy.value) return;
  operation.value = course.id; actionError.value = '';
  try { preview.value = await api.getManagedCourse(course.id); previewId.value = courseLessons(preview.value)[0]?.id ?? ''; previewOpen.value = true; }
  catch { actionError.value = '预览加载失败，请刷新后重试'; }
  finally { operation.value = ''; }
}
async function status(course: ManagedCourse): Promise<void> {
  if (busy.value) return;
  const next = course.status === 'published' ? 'archived' : 'published';
  operation.value = course.id; actionError.value = '';
  try {
    if (next === 'archived') {
      try { await ElMessageBox.confirm(`下架课程“${course.title}”？下架后学员无法打开课程，已有观看记录会保留。`, '下架课程', { confirmButtonText: '确认下架', cancelButtonText: '取消', type: 'warning' }); }
      catch { return; }
    }
    await api.setCourseStatus(course.id, course.revision, next);
    ElMessage.success(next === 'published' ? '课程已上架' : '课程已下架');
    operation.value = ''; await load();
  } catch (error) { actionError.value = (error as Error).message || '状态更新失败，请刷新后重试'; }
  finally { operation.value = ''; }
}
async function remove(course: ManagedCourse): Promise<void> {
  if (busy.value) return;
  operation.value = course.id; actionError.value = '';
  try {
    try { await ElMessageBox.confirm(`确认删除课程“${course.title}”？删除后无法在列表中找回。`, '删除课程', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }); }
    catch { return; }
    await api.deleteCourse(course.id, course.revision); ElMessage.success('课程已删除');
    operation.value = ''; await load();
  } catch (error) { actionError.value = (error as Error).message || '删除失败，请刷新后重试'; }
  finally { operation.value = ''; }
}
function saved(): void { actionError.value = ''; void load(); }
</script>

<template>
  <main class="course-manage admin-page" data-ui-layout="course-manage" data-ui-page="CourseManagePage">
    <PageHeader title="课程管理" description="维护课程内容和章节视频，上架后同步展示到学员的在线看课页面"><template #actions><el-button :disabled="busy" @click="categoriesOpen = true">维护分类</el-button><el-button type="primary" :icon="Plus" :disabled="busy" @click="edit()">新增课程</el-button></template></PageHeader>
    <section class="course-manage__stats" aria-label="课程统计"><article v-for="(label, key) in statusLabels" :key="key"><span>{{ label }}</span><strong>{{ loading || loadError ? '—' : stats[key] }}</strong><small>{{ key === 'published' ? '学员可见' : key === 'draft' ? '继续完善内容' : '可编辑后重新上架' }}</small></article></section>
    <el-card class="course-manage__list" shadow="never">
      <div class="course-manage__toolbar"><el-input v-model="query.q" aria-label="搜索课程" :prefix-icon="Search" clearable placeholder="搜索课程标题、分类" :disabled="busy" @keyup.enter="search" /><el-select v-model="query.status" aria-label="课程状态筛选" placeholder="全部状态" :disabled="busy" @change="search"><el-option label="全部状态" value="" /><el-option v-for="(label, key) in statusLabels" :key="key" :label="label" :value="key" /></el-select><el-button type="primary" :disabled="busy" @click="search">查询</el-button><el-button :icon="Refresh" :loading="loading" :disabled="!!operation" @click="load">刷新</el-button><span>{{ loading ? '加载中' : loadError ? '数量未知' : `共 ${total} 门课程` }}</span></div>
      <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon role="alert" />
      <LoadingSkeleton v-if="loading" :rows="5" />
      <RequestError v-else-if="loadError" text="课程列表加载失败，已保存的课程不会丢失" @retry="load" />
      <template v-else>
        <div v-if="!courses.length" class="course-manage__empty"><VideoPlay /><h3>{{ query.q || query.status ? '没有符合条件的课程' : '创建你的第一门课程' }}</h3><p>完善课程信息、添加章节与视频，再上架供学员学习。</p><el-button v-if="query.q || query.status" @click="query.q = ''; query.status = ''; search()">清空筛选</el-button><el-button v-else type="primary" :disabled="busy" @click="edit()">新增课程</el-button></div>
        <div v-else class="course-manage__rows">
          <article v-for="course in courses" :key="course.id" class="course-manage__row">
            <img v-if="course.cover" :src="course.cover" :alt="course.title + '封面'" class="course-manage__cover"><div v-else class="course-manage__cover course-manage__cover--empty"><VideoPlay /></div>
            <div class="course-manage__info"><div><h3>{{ course.title }}</h3><el-tag :type="course.status === 'published' ? 'success' : course.status === 'draft' ? 'info' : 'warning'" size="small">{{ statusLabels[course.status] }}</el-tag></div><p>{{ course.description || '尚未填写课程简介' }}</p><small>{{ course.category || '未分类' }} · {{ course.instructor || '未填讲师' }} · {{ course.chapters.length }} 章 {{ courseLessons(course).length }} 节 · 排序 {{ course.sortOrder }}<span>更新于 {{ formatDateTime(course.updatedAt) }}</span></small></div>
            <div class="course-manage__actions"><el-button :disabled="busy" @click="showPreview(course)">预览</el-button><el-button :disabled="busy || course.status === 'published'" :title="course.status === 'published' ? '请先下架课程再编辑' : '编辑课程和章节视频'" @click="edit(course)">编辑</el-button><el-button :type="course.status === 'published' ? 'warning' : 'primary'" plain :disabled="busy" @click="status(course)">{{ course.status === 'published' ? '下架' : '上架' }}</el-button><el-button type="danger" text :disabled="busy || course.status === 'published'" @click="remove(course)">删除</el-button></div>
          </article>
        </div>
        <el-pagination v-if="total" v-model:current-page="query.page" :page-size="query.pageSize" :total="total" layout="prev, pager, next" :disabled="busy" @current-change="load" />
      </template>
    </el-card>
    <CourseEditorDrawer v-model="editorOpen" :course="editing" @saved="saved" />
    <CourseCategoriesDialog v-model="categoriesOpen" @changed="saved" />
    <el-dialog v-model="previewOpen" title="课程预览" width="min(880px, 94vw)" destroy-on-close append-to-body class="course-preview-dialog">
      <template v-if="preview"><h2>{{ preview.title }}</h2><p>{{ preview.description || '暂无课程简介' }}</p><section v-if="preview.detailHtml" aria-label="课程详情预览"><h3>课程详情</h3><div class="rich-text" v-html="preview.detailHtml" /></section><el-select v-if="courseLessons(preview).length" v-model="previewId" aria-label="选择预览小节"><el-option v-for="lesson in courseLessons(preview)" :key="lesson.id" :label="lesson.title" :value="lesson.id" /></el-select><CourseVideoPlayer v-if="previewLesson?.src" :key="previewId" :course-id="preview.id" :lesson-id="previewId" :src="previewLesson.src" :title="previewLesson.title" :poster="preview.cover" :initial-position="0" :demo="preview.isDemo" /><el-empty v-else description="当前小节尚未配置视频，可在编辑中添加" /><p class="course-manage__preview-note">当前为管理预览，不记录学员观看进度。视频播放还取决于资源可用性与浏览器支持。</p></template>
      <template #footer><el-button @click="previewOpen = false">关闭预览</el-button></template>
    </el-dialog>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.course-manage {
  &__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-bottom: 24px; article { background: $bg-paper; border: 1px solid $border-color; border-radius: $radius-lg; padding: 20px 24px; display: grid; gap: 4px; } span { color: $text-secondary; font-size: 12px; } strong { color: $text-primary; font-size: 28px; font-variant-numeric: tabular-nums; font-weight: 600; } small { color: $text-secondary; font-size: 11px; } }
  &__toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; .el-input { max-width: 300px; } .el-select { width: 150px; } > span { margin-left: auto; font-size: 12px; color: $text-secondary; } .el-button { margin-left: 0; } }
  &__row { display: flex; align-items: center; gap: 20px; padding: 22px 0; border-bottom: 1px solid $border-color; }
  &__cover { width: 150px; height: 88px; border-radius: $radius-base; object-fit: cover; flex-shrink: 0; background: $bg-page; &--empty { display: grid; place-items: center; svg { width: 30px; color: $text-disabled; } } }
  &__info { flex: 1; min-width: 0; > div { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; } h3 { font-size: 15px; margin: 0; } p { font-size: 12px; margin: 8px 0; color: $text-secondary; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } small { display: block; font-size: 10px; color: $text-secondary; span { display: block; margin-top: 4px; } } }
  &__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; max-width: 150px; .el-button { margin: 0; font-size: 12px; } }
  &__empty { display: grid; justify-items: center; padding: 65px 16px; color: $text-secondary; > svg { width: 40px; color: $color-primary; } h3 { color: $text-primary; font-size: 17px; margin-bottom: 0; } p { font-size: 12px; } }
  .el-pagination { justify-content: flex-end; margin-top: 20px; }
  &__preview-note { color: $text-secondary; font-size: 11px; }
}
:global(.course-preview-dialog .el-select) { width: 100%; margin-bottom: 16px; }
@media (max-width: 760px) { .course-manage { &__row { flex-wrap: wrap; gap: 14px; } &__cover { width: 110px; height: 75px; } &__info { flex-basis: calc(100% - 125px); } &__actions { max-width: none; width: 100%; .el-button { flex: 1; min-height: 44px; } } &__toolbar { .el-input { max-width: none; width: 100%; } .el-select { flex: 1; } > span { width: 100%; } } &__stats { gap: 8px; article { padding: 14px 12px; } strong { font-size: 24px; } small { font-size: 10px; } } } }
</style>
