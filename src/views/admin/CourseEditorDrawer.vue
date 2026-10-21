<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowUp, Delete, MagicStick, Plus, Upload } from '@element-plus/icons-vue';
import * as api from '@/api/courses';
import type { CourseInput, ManagedCourse } from '@/api/courses';
import type { CourseLesson } from '@/data/courses';
import { formatVideoTime } from '@/data/courses';
import type { ApiError } from '@/api/http';

const props = defineProps<{ modelValue: boolean; course: ManagedCourse | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [course: ManagedCourse] }>();
function blank(): CourseInput { return { title: '', description: '', category: '', cover: '', instructor: '', level: '入门', sortOrder: 0, isDemo: false, chapters: [] }; }
const form = reactive<CourseInput>(blank());
const saving = ref(false);
const generating = ref(false);
const uploading = ref('');
const percent = ref(0);
const saveError = ref('');
const fieldError = ref('');
const activeTab = ref('basic');
const host = ref<HTMLElement>();
const recordId = ref('');
const revision = ref(1);
let baseline = '';
let controller: AbortController | undefined;
const busy = computed(() => saving.value || generating.value || !!uploading.value);
const dirty = computed(() => JSON.stringify(form) !== baseline);
function reset(course: ManagedCourse | null): void {
  const { id, status, revision: version, createdAt, updatedAt, ...content } = course ?? {} as ManagedCourse;
  Object.assign(form, blank(), course ? JSON.parse(JSON.stringify(content)) : {});
  recordId.value = id ?? ''; revision.value = version ?? 1;
  baseline = JSON.stringify(form); saveError.value = ''; fieldError.value = ''; activeTab.value = 'basic';
}
watch(() => props.modelValue, open => { if (open) reset(props.course); else controller?.abort(); }, { immediate: true });
function id(prefix: string): string { return `${prefix}-${crypto.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)}`; }
function addChapter(): void { form.chapters.push({ id: id('chapter'), title: `第${form.chapters.length + 1}章`, lessons: [] }); }
function addLesson(chapterIndex: number): void {
  const lessons = form.chapters[chapterIndex].lessons;
  lessons.push({ id: id('lesson'), title: `第${lessons.length + 1}小节`, description: '', src: '', durationLabel: '00:00' });
}
function move<T>(list: T[], index: number, offset: number): void {
  const target = index + offset;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}
async function canDiscard(): Promise<boolean> {
  if (busy.value) return false;
  if (!dirty.value) return true;
  try { await ElMessageBox.confirm('当前修改尚未保存，确认放弃这些修改？', '未保存的课程', { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }); return true; }
  catch { return false; }
}
async function close(): Promise<void> { if (await canDiscard()) emit('update:modelValue', false); }
async function beforeClose(done: () => void): Promise<void> { if (await canDiscard()) done(); }
onBeforeRouteLeave(async () => !props.modelValue || await canDiscard());
onBeforeUnmount(() => controller?.abort());
async function save(): Promise<void> {
  if (busy.value) return;
  fieldError.value = ''; saveError.value = '';
  if (!form.title.trim()) { activeTab.value = 'basic'; fieldError.value = '请输入课程标题'; await nextTick(); host.value?.querySelector<HTMLInputElement>('[aria-label="课程标题"]')?.focus(); return; }
  if (form.chapters.some(chapter => !chapter.title.trim() || chapter.lessons.some(lesson => !lesson.title.trim()))) { activeTab.value = 'chapters'; fieldError.value = '请填写所有章节和小节标题'; return; }
  saving.value = true;
  try {
    const input = JSON.parse(JSON.stringify(form)) as CourseInput;
    const result = recordId.value ? await api.updateCourse(recordId.value, revision.value, input) : await api.createCourse(input);
    baseline = JSON.stringify(form); emit('update:modelValue', false); emit('saved', result);
    ElMessage.success('课程已保存；上架后学员即可查看');
  } catch (error) { saveError.value = (error as Error).message || '保存失败，填写内容已保留，请重试'; }
  finally { saving.value = false; }
}
async function reload(): Promise<void> {
  if (!recordId.value || !await canDiscard()) return;
  saving.value = true;
  try { reset(await api.getManagedCourse(recordId.value)); }
  catch { saveError.value = '重新加载失败，当前填写内容已保留'; }
  finally { saving.value = false; }
}
async function generateCover(): Promise<void> {
  if (busy.value || form.cover.trim()) return;
  fieldError.value = ''; saveError.value = '';
  if (!form.title.trim()) {
    fieldError.value = '请先填写课程标题，再生成封面';
    await nextTick(); host.value?.querySelector<HTMLInputElement>('[aria-label="课程标题"]')?.focus(); return;
  }
  generating.value = true;
  const request = controller = new AbortController();
  try {
    const result = await api.generateCourseCover({ title: form.title, category: form.category, instructor: form.instructor }, request.signal);
    if (!request.signal.aborted && props.modelValue) { form.cover = result.url; ElMessage.success('封面已生成，保存课程后生效'); }
  } catch (error) {
    if (props.modelValue) saveError.value = request.signal.aborted ? '生成已取消，可以重新生成' : (error as Error).message || '封面生成失败，请重试';
  } finally { generating.value = false; if (controller === request) controller = undefined; }
}
async function videoDuration(file: File): Promise<string> {
  return new Promise(resolve => {
    const media = document.createElement('video'); const url = URL.createObjectURL(file);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; const duration = media.duration; clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute('src'); URL.revokeObjectURL(url); resolve(Number.isFinite(duration) ? formatVideoTime(duration) : '00:00'); };
    const timer = setTimeout(finish, 5000); media.preload = 'metadata'; media.onloadedmetadata = finish; media.onerror = finish; media.src = url;
  });
}
async function upload(event: Event, lesson?: CourseLesson): Promise<void> {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
  if (!file || busy.value) return;
  const types = lesson ? ['video/mp4', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp'];
  const maxMb = lesson ? 200 : 8;
  if (!types.includes(file.type) || file.size > maxMb * 1024 * 1024 || !file.size) { saveError.value = `请选择有效的${lesson ? 'MP4 / WebM 视频' : 'JPG / PNG / WebP 封面'}，不超过${maxMb}MB`; return; }
  uploading.value = lesson?.id ?? 'cover'; percent.value = 0; saveError.value = ''; controller = new AbortController();
  try {
    const duration = lesson ? await videoDuration(file) : '';
    if (controller.signal.aborted) return;
    const result = await api.uploadCourseMedia(file, controller.signal, value => { percent.value = value; });
    if (lesson) { lesson.src = result.url; if (duration !== '00:00') lesson.durationLabel = duration; } else form.cover = result.url;
  } catch (error) { saveError.value = controller.signal.aborted ? '上传已取消，可以重新选择文件' : (error as ApiError).message || '上传失败，请重试'; }
  finally { uploading.value = ''; controller = undefined; }
}
</script>

<template>
  <el-drawer :model-value="modelValue" :title="recordId ? '编辑课程' : '新增课程'" size="min(880px, 100%)" destroy-on-close class="course-editor-drawer" :before-close="beforeClose" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="$emit('update:modelValue', $event)">
    <div ref="host" class="course-editor">
      <el-alert v-if="saveError" :title="saveError" type="error" :closable="false" show-icon role="alert" />
      <el-alert v-if="fieldError" :title="fieldError" type="warning" :closable="false" show-icon role="alert" />
      <el-alert v-if="uploading" :title="`正在上传${uploading === 'cover' ? '封面' : '视频'} ${percent}% · 完成传输后请等待处理`" type="info" :closable="false"><el-button size="small" @click="controller?.abort()">取消上传</el-button></el-alert>
      <el-alert v-if="generating" title="正在生成课程封面…" type="info" :closable="false" role="status"><el-button size="small" @click="controller?.abort()">取消生成</el-button></el-alert>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-form label-position="top" :disabled="busy" @submit.prevent="save">
            <el-form-item label="课程标题" required><el-input v-model="form.title" aria-label="课程标题" maxlength="120" show-word-limit placeholder="为课程起一个清晰的名字" /></el-form-item>
            <div class="course-editor__two"><el-form-item label="课程分类"><el-input v-model="form.category" aria-label="课程分类" maxlength="50" placeholder="如：临床护理、岗位培训" /></el-form-item><el-form-item label="讲师"><el-input v-model="form.instructor" aria-label="讲师" maxlength="80" placeholder="讲师姓名或教学团队" /></el-form-item></div>
            <el-form-item label="课程简介"><el-input v-model="form.description" aria-label="课程简介" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="介绍课程内容、学习目标和适合人群" /></el-form-item>
            <el-form-item label="课程封面"><div class="course-editor__cover"><img v-if="form.cover" :src="form.cover" alt="课程封面预览"><div v-else class="course-editor__cover-empty">暂无封面</div><div><div class="course-editor__cover-actions"><label class="course-upload" :class="{ disabled: busy }"><Upload />上传封面<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" aria-label="上传课程封面" @change="upload($event)"></label><el-button :icon="MagicStick" :loading="generating" :disabled="busy || !!form.cover.trim()" @click="generateCover">生成封面</el-button></div><p>JPG / PNG / WebP，最大8MB，建议16:9</p><p>{{ form.cover.trim() ? '已保留当前封面；清空下方地址后可重新生成。' : '填写课程标题，可一键生成同款深色封面。' }}</p></div></div><el-input v-model="form.cover" aria-label="封面地址" placeholder="也可填写可访问的 HTTP(S) 图片地址" /></el-form-item>
            <div class="course-editor__two"><el-form-item label="课程难度"><el-select v-model="form.level" aria-label="课程难度"><el-option v-for="level in ['入门', '进阶', '高级']" :key="level" :label="level" :value="level" /></el-select></el-form-item><el-form-item label="展示排序"><el-input-number v-model="form.sortOrder" aria-label="展示排序" :min="0" :max="99999" :precision="0" /><small>数字越小，展示越靠前</small></el-form-item></div>
            <el-form-item><el-checkbox v-model="form.isDemo">标记为演示课程</el-checkbox></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="章节与视频" name="chapters">
          <p class="course-editor__hint">调整标题和顺序会保留学习记录；更换视频后，该小节按新内容重新记录进度。草稿可暂不填写视频。</p>
          <section v-for="(chapter, ci) in form.chapters" :key="chapter.id" class="course-editor__chapter">
            <div class="course-editor__chapter-head"><span>{{ String(ci + 1).padStart(2, '0') }}</span><el-input v-model="chapter.title" :aria-label="`章节${ci + 1}标题`" :disabled="busy" maxlength="120" placeholder="章节标题" /><el-button :icon="ArrowUp" :disabled="busy || ci === 0" :aria-label="`上移章节${ci + 1}`" @click="move(form.chapters, ci, -1)" /><el-button :icon="ArrowDown" :disabled="busy || ci === form.chapters.length - 1" :aria-label="`下移章节${ci + 1}`" @click="move(form.chapters, ci, 1)" /><el-button :icon="Delete" :disabled="busy" :aria-label="`删除章节${ci + 1}`" @click="form.chapters.splice(ci, 1)" /></div>
            <article v-for="(lesson, li) in chapter.lessons" :key="lesson.id" class="course-editor__lesson">
              <div class="course-editor__lesson-head"><strong>小节 {{ ci + 1 }}.{{ li + 1 }}</strong><el-button text :icon="ArrowUp" :disabled="busy || li === 0" :aria-label="`上移小节${ci + 1}.${li + 1}`" @click="move(chapter.lessons, li, -1)" /><el-button text :icon="ArrowDown" :disabled="busy || li === chapter.lessons.length - 1" :aria-label="`下移小节${ci + 1}.${li + 1}`" @click="move(chapter.lessons, li, 1)" /><el-button text type="danger" :disabled="busy" :aria-label="`删除小节${ci + 1}.${li + 1}`" @click="chapter.lessons.splice(li, 1)">移除</el-button></div>
              <el-form label-position="top" :disabled="busy"><el-form-item label="小节标题" required><el-input v-model="lesson.title" :aria-label="`小节${ci + 1}.${li + 1}标题`" maxlength="120" /></el-form-item><el-form-item label="小节说明"><el-input v-model="lesson.description" :aria-label="`小节${ci + 1}.${li + 1}说明`" type="textarea" :rows="2" maxlength="2000" /></el-form-item><el-form-item label="视频地址"><el-input v-model="lesson.src" :aria-label="`小节${ci + 1}.${li + 1}视频地址`" placeholder="上传视频，或填写可播放的 HTTP(S) 视频地址" /></el-form-item></el-form>
              <div class="course-editor__video-row"><label class="course-upload" :class="{ disabled: busy }"><Upload />上传视频<input type="file" accept="video/mp4,video/webm" :disabled="busy" :aria-label="`上传小节${ci + 1}.${li + 1}视频`" @change="upload($event, lesson)"></label><label class="course-editor__duration">展示时长<el-input v-model="lesson.durationLabel" :disabled="busy" :aria-label="`小节${ci + 1}.${li + 1}时长`" placeholder="05:30" maxlength="6" /></label></div><small>MP4 / WebM，最大200MB；上传后会尝试读取时长。</small>
            </article>
            <el-button :icon="Plus" :disabled="busy || chapter.lessons.length >= 100" @click="addLesson(ci)">添加小节</el-button>
          </section>
          <div v-if="!form.chapters.length" class="course-editor__empty">还没有章节，先为课程添加第一章。</div>
          <el-button :icon="Plus" :disabled="busy || form.chapters.length >= 50" @click="addChapter">添加章节</el-button>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer><div class="course-editor__footer"><span>{{ recordId ? '保存修改后，可返回列表上架' : '新课程将保存为草稿' }}</span><el-button v-if="recordId && saveError" :disabled="busy" @click="reload">重新加载</el-button><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="saving" :disabled="generating || !!uploading" @click="save">{{ recordId ? '保存修改' : '保存草稿' }}</el-button></div></template>
  </el-drawer>
</template>

<style lang="scss">
@use '@/styles/variables.scss' as *;
.course-editor-drawer { .el-drawer__header { margin-bottom: 0; padding-bottom: 16px; border-bottom: 1px solid $border-color; } .el-drawer__body { padding-top: 16px; } .el-drawer__footer { border-top: 1px solid $border-color; } }
.course-editor {
  .el-alert { margin-bottom: 12px; } .el-form-item { margin-bottom: 20px; } .el-input-number { width: 100%; } .el-select { width: 100%; }
  &__two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  &__cover { width: 100%; display: flex; align-items: center; gap: 20px; margin-bottom: 12px; img, &-empty { width: 180px; aspect-ratio: 16 / 9; border-radius: $radius-base; object-fit: cover; background: $bg-page; } p { color: $text-secondary; font-size: 11px; } &-empty { display: grid; place-items: center; color: $text-disabled; font-size: 12px; } }
  &__cover-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; .el-button { margin-left: 0; } }
  &__chapter { padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; margin-bottom: 16px; background: $bg-page; }
  &__chapter-head { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; > span { color: $text-secondary; font-variant-numeric: tabular-nums; } .el-input { flex: 1; min-width: 0; } .el-button { padding: 8px; margin-left: 0; } }
  &__lesson { border: 1px solid $border-color; border-radius: $radius-base; background: $bg-paper; padding: 16px; margin-bottom: 14px; }
  &__lesson-head { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; strong { font-size: 12px; margin-right: auto; } .el-button { padding: 6px; margin: 0; } }
  &__video-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  &__duration { display: flex; align-items: center; gap: 8px; font-size: 12px; color: $text-secondary; .el-input { width: 90px; } }
  &__hint, small { display: block; color: $text-secondary; font-size: 11px; line-height: 1.8; }
  &__empty { padding: 35px 10px; text-align: center; color: $text-secondary; }
  &__footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; > span { color: $text-secondary; font-size: 11px; margin-right: auto; } .el-button { margin-left: 0; } }
}
.course-upload { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 6px 14px; border: 1px solid $border-color; border-radius: $radius-base; font-size: 12px; background: white; color: $color-primary; cursor: pointer; svg { width: 16px; } input { position: absolute; width: 1px; height: 1px; opacity: 0; } &:focus-within { outline: 2px solid $color-primary; outline-offset: 2px; } &.disabled { opacity: .45; cursor: default; } }
@media (max-width: 600px) { .course-editor { &__two { grid-template-columns: minmax(0, 1fr); gap: 0; } &__cover { flex-direction: column; align-items: flex-start; gap: 8px; img, &-empty { width: 100%; max-width: 300px; } } &__chapter { padding: 12px; } &__chapter-head { flex-wrap: wrap; .el-input { flex-basis: calc(100% - 32px); } .el-button { min-width: 44px; height: 44px; } } &__lesson { padding: 12px; } &__lesson-head .el-button { min-width: 40px; min-height: 44px; } &__footer { flex-wrap: wrap; > span { width: 100%; text-align: left; } .el-button { min-height: 44px; } } } .course-upload { min-height: 44px; } }
</style>
