<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Reading } from '@element-plus/icons-vue';
import { courseLessons, type Course } from '@/data/courses';
import { getCourse } from '@/api/courses';
import { useAuthStore } from '@/stores/auth';
import { useCourseProgress } from '@/composables/useCourseProgress';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import CourseOutline from './components/CourseOutline.vue';
import './courses.scss';

const route = useRoute(); const router = useRouter(); const auth = useAuthStore();
const progress = useCourseProgress(auth.currentUser?.id ?? 'guest', auth.token);
const course = ref<Course>(); const loading = ref(true); const loadError = ref(false);
const tab = ref<'intro' | 'outline'>('intro'); const expanded = ref(false); const coverFailed = ref(false);
const summary = ref<HTMLElement>(); const summaryOverflow = ref(false);
let request: AbortController | undefined; let observer: ResizeObserver | undefined;
function measureSummary(): void { if (summary.value && !expanded.value) summaryOverflow.value = summary.value.scrollHeight > summary.value.clientHeight + 1; }
watch(summary, element => {
  observer?.disconnect();
  if (element && typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measureSummary); observer.observe(element); }
  measureSummary();
}, { flush: 'post' });
watch(expanded, () => void nextTick(measureSummary));
window.addEventListener('resize', measureSummary);
async function load(): Promise<void> {
  request?.abort(); const controller = request = new AbortController();
  loading.value = true; loadError.value = false; course.value = undefined;
  expanded.value = false; summaryOverflow.value = false; coverFailed.value = false; tab.value = 'intro';
  try {
    const [result] = await Promise.all([getCourse(String(route.params.courseId), controller.signal), progress.load()]);
    if (!controller.signal.aborted) course.value = result;
  } catch (error) { if (!controller.signal.aborted) loadError.value = (error as { status?: number }).status !== 404; }
  finally { if (!controller.signal.aborted) loading.value = false; }
}
watch(() => [route.params.courseId, route.query.lesson], () => {
  if (typeof route.query.lesson === 'string') {
    request?.abort();
    void router.replace({ name: 'course-study', params: { courseId: route.params.courseId }, query: route.query, hash: route.hash });
  } else void load();
}, { immediate: true });
onBeforeUnmount(() => { request?.abort(); observer?.disconnect(); window.removeEventListener('resize', measureSummary); });
const lessons = computed(() => course.value ? courseLessons(course.value) : []);
const savedLessons = computed(() => progress.data.value.courses[course.value?.id ?? '']?.lessons ?? {});
const completed = computed(() => lessons.value.filter(item => savedLessons.value[item.id]?.completed).length);
const allCompleted = computed(() => lessons.value.length > 0 && completed.value === lessons.value.length);
const target = computed(() => {
  const available = lessons.value.filter(item => item.src.trim());
  const last = course.value && progress.lastLesson(course.value.id);
  return !allCompleted.value && available.find(item => item.id === last) || available[0];
});
const started = computed(() => !!course.value && (!!progress.lastLesson(course.value.id) || lessons.value.some(item => savedLessons.value[item.id]?.position > 0 || savedLessons.value[item.id]?.completed)));
const actionLabel = computed(() => !target.value ? '暂无可学习小节' : allCompleted.value ? '再次学习' : started.value ? '继续学习' : '开始学习');
function learn(lessonId = target.value?.id): void {
  if (!course.value || !lessons.value.some(item => item.id === lessonId && item.src.trim())) return;
  void router.push({ name: 'course-study', params: { courseId: course.value.id }, query: { lesson: lessonId } });
}
function imageError(event: Event): void {
  if (event.target instanceof HTMLImageElement) { event.target.alt = '图片加载失败，请刷新页面重试'; event.target.classList.add('course-image-failed'); }
}
function changeTab(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); tab.value = event.key === 'Home' ? 'intro' : event.key === 'End' ? 'outline' : tab.value === 'intro' ? 'outline' : 'intro';
  void nextTick(() => document.getElementById(`course-tab-${tab.value}`)?.focus());
}
</script>

<template>
  <main class="courses-page course-overview" data-ui-layout="course-overview" data-ui-page="CourseDetailPage">
    <RouterLink to="/exam/courses" class="course-back"><ArrowLeft />全部课程</RouterLink>
    <LoadingSkeleton v-if="loading" :rows="7" />
    <RequestError v-else-if="loadError" text="课程加载失败，请检查网络后重试" @retry="load" />
    <template v-else-if="course">
      <header class="course-overview__hero">
        <div class="course-overview__cover"><img v-if="course.cover && !coverFailed" :src="course.cover" :alt="course.title + '封面'" @error="coverFailed = true"><div v-else class="course-overview__cover-fallback"><Reading /><span>{{ coverFailed ? '封面暂时无法加载' : '课程封面' }}</span></div></div>
        <div class="course-overview__info">
          <div class="courses-eyebrow">{{ course.category || '在线课程' }} · {{ course.level }}</div>
          <h1>{{ course.title }}</h1>
          <p id="course-summary" ref="summary" class="course-overview__summary" :class="{ collapsed: !expanded }">{{ course.description }}</p>
          <button v-if="summaryOverflow || expanded" type="button" class="course-overview__expand" :aria-expanded="expanded" aria-controls="course-summary" @click="expanded = !expanded">{{ expanded ? '收起简介' : '展开简介' }}</button>
          <div class="course-overview__meta"><span>{{ course.instructor || '学习中心' }}</span><span>{{ course.chapters.length }} 章 · {{ lessons.length }} 小节</span><span>已完成 {{ completed }} / {{ lessons.length }}</span></div>
          <div class="course-overview__desktop-action"><button type="button" class="courses-primary" :disabled="!target" @click="learn()">{{ actionLabel }}<ArrowRight v-if="target" /></button><small>学习进度随账号保存</small></div>
        </div>
      </header>
      <p v-if="progress.storageError.value" class="courses-warning" role="alert">{{ progress.storageError.value }} <button type="button" :disabled="progress.loading.value" @click="progress.retry">重新同步</button></p>
      <div class="course-overview__tabs" role="tablist" aria-label="课程内容" @keydown="changeTab">
        <button id="course-tab-intro" type="button" role="tab" :aria-selected="tab === 'intro'" :tabindex="tab === 'intro' ? 0 : -1" aria-controls="course-panel-intro" @click="tab = 'intro'">课程介绍</button>
        <button id="course-tab-outline" type="button" role="tab" :aria-selected="tab === 'outline'" :tabindex="tab === 'outline' ? 0 : -1" aria-controls="course-panel-outline" @click="tab = 'outline'">课程目录<span>{{ lessons.length }}</span></button>
      </div>
      <div class="course-overview__content">
        <section id="course-panel-intro" class="course-rich-detail course-overview__intro" :class="{ 'is-active': tab === 'intro' }" aria-label="课程介绍">
          <h2>课程介绍</h2>
          <div v-if="course.detailHtml" class="rich-text" @error.capture="imageError" v-html="course.detailHtml" />
          <p v-else class="course-overview__plain">{{ course.description || '课程介绍正在完善中，可先查看目录并开始学习。' }}</p>
        </section>
        <aside id="course-panel-outline" class="course-overview__outline" :class="{ 'is-active': tab === 'outline' }" aria-label="课程章节目录"><CourseOutline :course="course" active-id="" :progress="savedLessons" overview @select="learn" /></aside>
      </div>
      <div class="course-overview__mobile-action"><span>已完成 {{ completed }} / {{ lessons.length }} 小节</span><button type="button" class="courses-primary" :disabled="!target" @click="learn()">{{ actionLabel }}<ArrowRight v-if="target" /></button></div>
    </template>
    <div v-else class="courses-empty"><Reading /><h1>没有找到这门课程</h1><p>课程可能已下架，请返回课程列表继续探索。</p><RouterLink to="/exam/courses" class="courses-primary">返回全部课程</RouterLink></div>
  </main>
</template>
