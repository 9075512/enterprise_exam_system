<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, CircleCheckFilled, Fold, Lock, Reading } from '@element-plus/icons-vue';
import { courseLessons, formatVideoTime, type Course } from '@/data/courses';
import { getCourse } from '@/api/courses';
import type { ApiError } from '@/api/http';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import { useAuthStore } from '@/stores/auth';
import { useCourseProgress, type PlaybackProgress } from '@/composables/useCourseProgress';
import CourseOutline from './components/CourseOutline.vue';
import CourseVideoPlayer from './components/CourseVideoPlayer.vue';
import './courses.scss';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const progress = useCourseProgress(auth.currentUser?.id ?? 'guest');
const course = ref<Course>();
const loading = ref(true);
const loadError = ref(false);
let request: AbortController | undefined;
async function load(): Promise<void> {
  request?.abort(); const controller = request = new AbortController();
  loading.value = true; loadError.value = false; course.value = undefined;
  try { const result = await getCourse(String(route.params.courseId), controller.signal); if (!controller.signal.aborted) course.value = result; }
  catch (error) { if (!controller.signal.aborted) loadError.value = (error as ApiError).status !== 404; }
  finally { if (!controller.signal.aborted) loading.value = false; }
}
watch(() => route.params.courseId, load, { immediate: true });
onBeforeUnmount(() => request?.abort());
const lessons = computed(() => course.value ? courseLessons(course.value) : []);
const selectedId = ref('');
const drawerOpen = ref(false);
const ended = ref(false);
const initialPosition = ref(0);
const lesson = computed(() => lessons.value.find(item => item.id === selectedId.value));
const index = computed(() => lessons.value.findIndex(item => item.id === selectedId.value));
const chapter = computed(() => course.value?.chapters.find(item => item.lessons.some(section => section.id === selectedId.value)));
const savedLessons = computed(() => progress.data.value.courses[course.value?.id ?? '']?.lessons ?? {});
const completedCount = computed(() => lessons.value.filter(item => savedLessons.value[item.id]?.completed).length);
function select(id: string): void {
  if (!course.value || !lessons.value.some(item => item.id === id)) return;
  drawerOpen.value = false;
  if (selectedId.value === id) return;
  const saved = progress.lesson(course.value.id, id);
  initialPosition.value = saved?.completed ? 0 : saved?.position ?? 0;
  selectedId.value = id;
  ended.value = false;
  progress.select(course.value.id, id);
  void router.replace({ query: { ...route.query, lesson: id } });
}
watch(() => course.value?.id, () => {
  selectedId.value = '';
  const fromQuery = typeof route.query.lesson === 'string' ? route.query.lesson : '';
  const savedId = course.value ? progress.lastLesson(course.value.id) : '';
  const target = lessons.value.find(item => item.id === fromQuery) ?? lessons.value.find(item => item.id === savedId) ?? lessons.value[0];
  if (target) select(target.id);
}, { immediate: true });
watch(() => route.query.lesson, id => { if (typeof id === 'string' && id !== selectedId.value) select(id); });
function onProgress(courseId: string, lessonId: string, value: PlaybackProgress): void { progress.save(courseId, lessonId, value); }
</script>

<template>
  <main class="courses-page course-detail" data-ui-layout="course-study" data-ui-page="CourseDetailPage">
    <RouterLink to="/exam/courses" class="course-back"><ArrowLeft />全部课程</RouterLink>
    <LoadingSkeleton v-if="loading" :rows="7" />
    <RequestError v-else-if="loadError" text="课程加载失败，请检查网络后重试" @retry="load" />
    <template v-else-if="course && lesson">
      <div class="course-detail__heading"><div><div class="courses-eyebrow">{{ course.category }} <span> / </span> {{ course.level }}课程</div><h1>{{ course.title }}</h1><p>{{ course.description }}</p></div><span class="course-detail__badge"><Reading />{{ lessons.length }} 小节 · 自主学习</span></div>
      <p v-if="progress.storageError.value" class="courses-warning" role="alert">{{ progress.storageError.value }}</p>
      <div class="course-study-grid">
        <section class="course-study-main" aria-label="课程学习">
          <CourseVideoPlayer :key="`${course.id}:${lesson.id}`" :course-id="course.id" :lesson-id="lesson.id" :src="lesson.src" :title="lesson.title" :poster="course.cover" :initial-position="initialPosition" :demo="course.isDemo" @progress="onProgress" @ended="ended = true" />
          <div class="course-playback-note"><span><Lock />正常倍速播放 · 不支持拖动跳播</span><span>观看进度自动保存</span></div>
          <button class="course-mobile-directory" type="button" :aria-expanded="drawerOpen" @click="drawerOpen = true"><Fold /><span>课程目录<small>已完成 {{ completedCount }} / {{ lessons.length }} 小节</small></span><ArrowRight /></button>
          <article class="course-lesson-info"><div class="course-lesson-info__eyebrow">{{ chapter?.title }}<span>第 {{ index + 1 }} / {{ lessons.length }} 小节</span></div><h2>{{ lesson.title }}<span v-if="savedLessons[lesson.id]?.completed" class="course-completed"><CircleCheckFilled />已完成</span></h2><p>{{ lesson.description }}</p>
            <p v-if="initialPosition > 0" class="course-resume-note">已恢复上次观看位置 {{ formatVideoTime(initialPosition) }}，点击播放继续学习。</p>
            <div v-if="ended" class="course-ended" role="status"><CircleCheckFilled /><span>{{ index < lessons.length - 1 ? '本小节已完成，继续下一段探索吧。' : completedCount === lessons.length ? '这门课程已全部学完，期待你的下一次探索。' : '本小节已完成，可在目录中继续学习其他小节。' }}</span></div>
            <div class="course-lesson-actions"><button class="courses-secondary" type="button" :disabled="index === 0" @click="select(lessons[index - 1].id)"><ArrowLeft />上一小节</button><span>学习的每一步，都值得记录</span><button class="courses-primary" type="button" :disabled="index >= lessons.length - 1" @click="select(lessons[index + 1].id)">下一小节<ArrowRight /></button></div>
          </article>
          <aside class="course-learning-tip"><span>✦</span><div><strong>给自己一段专注的时间</strong><p>观看结束后，小节会自动标记为已完成。离开、刷新或切换课程，都可以回来继续。</p></div></aside>
        </section>
        <aside class="course-desktop-directory" aria-label="课程章节目录"><CourseOutline :course="course" :active-id="selectedId" :progress="savedLessons" @select="select" /></aside>
      </div>
      <el-drawer v-model="drawerOpen" title="课程目录" direction="btt" size="78%" append-to-body class="course-directory-drawer"><CourseOutline :course="course" :active-id="selectedId" :progress="savedLessons" @select="select" /></el-drawer>
      <footer class="courses-footer"><p v-if="course.isDemo">演示素材：MDN CC0 花朵短片、Blender Foundation 的 Big Buck Bunny / Sintel 公开样片。课程结构用于功能演示。</p><p>记录保存在当前账号的本地浏览器中，不支持跨设备同步。</p></footer>
    </template>
    <div v-else class="courses-empty"><Reading /><h1>没有找到这门课程</h1><p>课程可能已下架，请返回课程列表继续探索。</p><RouterLink to="/exam/courses" class="courses-primary">返回全部课程</RouterLink></div>
  </main>
</template>
