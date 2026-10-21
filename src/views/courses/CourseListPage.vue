<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Collection, Search, VideoPlay } from '@element-plus/icons-vue';
import { courseLessons, type Course } from '@/data/courses';
import { listCourses } from '@/api/courses';
import RequestError from '@/components/common/RequestError.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import { useCourseProgress } from '@/composables/useCourseProgress';
import { useAuthStore } from '@/stores/auth';
import './courses.scss';

const auth = useAuthStore();
const progress = useCourseProgress(auth.currentUser?.id ?? 'guest');
const query = ref('');
const category = ref('全部课程');
const courses = ref<Course[]>([]);
const loading = ref(true);
const loadError = ref(false);
async function load(): Promise<void> {
  loading.value = true; loadError.value = false;
  try { courses.value = await listCourses(); } catch { loadError.value = true; } finally { loading.value = false; }
}
onMounted(load);
const categories = computed(() => ['全部课程', ...new Set(courses.value.map(course => course.category)), '学习中', '已完成']);
function count(id: string): number { const course = courses.value.find(item => item.id === id); return course ? courseLessons(course).filter(lesson => progress.lesson(id, lesson.id)?.completed).length : 0; }
const filtered = computed(() => courses.value.filter(course => {
  const total = courseLessons(course).length;
  const matchesCategory = category.value === '全部课程' || category.value === course.category
    || category.value === '学习中' && !!progress.lastLesson(course.id) && count(course.id) < total
    || category.value === '已完成' && count(course.id) === total;
  return matchesCategory && `${course.title} ${course.description}`.includes(query.value.trim());
}));
const studied = computed(() => courses.value.filter(course => !!progress.lastLesson(course.id)).length);
const finished = computed(() => courses.value.filter(course => courseLessons(course).length > 0 && count(course.id) === courseLessons(course).length).length);
const recent = computed(() => courses.value.filter(course => !!progress.lastLesson(course.id)).sort((a, b) => {
  const latest = (id: string) => Math.max(0, ...Object.values(progress.data.value.courses[id]?.lessons ?? {}).map(lesson => lesson.updatedAt));
  return latest(b.id) - latest(a.id);
})[0]);
</script>

<template>
  <main class="courses-page" data-ui-layout="course-list" data-ui-page="CourseListPage">
    <div class="courses-kicker"><span /> LEARNING SPACE <span class="courses-kicker__line" /></div>
    <section class="courses-hero">
      <div><span class="courses-eyebrow">学有所获，每天进步一点</span><h1>把好奇，变成你的下一项能力<span>。</span></h1><p>找到感兴趣的课程，按自己的节奏，开启一段新的学习旅程。</p>
        <RouterLink v-if="recent" :to="`/exam/courses/${recent.id}`" class="courses-primary">继续上次学习 <ArrowRight /></RouterLink>
        <a v-else href="#course-library" class="courses-primary">探索课程 <ArrowRight /></a>
      </div>
      <div class="courses-hero__art" aria-hidden="true"><div class="hero-orbit" /><div class="hero-book"><span>LEARN<br>ONE THING<br><b>NEW.</b></span><i>每天，向前一点 ↗</i></div><span class="hero-spark">✦</span><span class="hero-caption">A LITTLE EVERY DAY</span></div>
    </section>
    <section class="courses-stats" aria-label="学习概览">
      <div><span class="stat-mark"><Collection /></span><span><strong>{{ loading || loadError ? '—' : courses.length.toString().padStart(2, '0') }}</strong><small>可学课程</small></span></div>
      <div><span class="stat-mark blue"><VideoPlay /></span><span><strong>{{ studied.toString().padStart(2, '0') }}</strong><small>已开始学习</small></span></div>
      <div><span class="stat-mark green">✓</span><span><strong>{{ finished.toString().padStart(2, '0') }}</strong><small>已完成课程</small></span></div>
      <p>保持专注，好好享受学习的过程。<small>观看记录自动保存在当前浏览器</small></p>
    </section>
    <p v-if="progress.storageError.value" class="courses-warning" role="alert">{{ progress.storageError.value }}</p>
    <section id="course-library" class="courses-library">
      <div class="courses-section-head"><div><h2>发现好课程 <span>为每一份好奇找到方向</span></h2></div><label class="courses-search"><Search /><input v-model="query" aria-label="搜索课程" placeholder="搜索你感兴趣的课程…" type="search"></label></div>
      <div class="courses-filters" aria-label="课程筛选"><button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button><span>{{ filtered.length }} 门课程</span></div>
      <LoadingSkeleton v-if="loading" :rows="5" />
      <RequestError v-else-if="loadError" text="课程加载失败，请检查网络后重试" @retry="load" />
      <div v-else-if="filtered.length" class="courses-grid">
        <RouterLink v-for="course in filtered" :key="course.id" :to="`/exam/courses/${course.id}`" class="course-card">
          <div class="course-card__cover"><img :src="course.cover" :alt="course.title + '封面'" loading="lazy"><span class="course-card__category">{{ course.category }}</span><span class="course-card__play"><VideoPlay /></span><span class="course-card__level">{{ course.level }}<template v-if="course.isDemo"> · 演示课程</template></span></div>
          <div class="course-card__body"><div class="course-card__meta">{{ course.instructor }}<span>{{ courseLessons(course).length }} 小节</span></div><h3>{{ course.title }}</h3><p>{{ course.description }}</p>
            <div class="course-card__progress"><span :style="{ width: `${count(course.id) / courseLessons(course).length * 100}%` }" /></div>
            <div class="course-card__bottom"><small>{{ count(course.id) ? `已完成 ${count(course.id)} / ${courseLessons(course).length} 小节` : progress.lastLesson(course.id) ? '学习中，继续你的探索' : '准备好开始了吗？' }}</small><span>{{ count(course.id) === courseLessons(course).length ? '再次学习' : progress.lastLesson(course.id) ? '继续学习' : '开始学习' }} <ArrowRight /></span></div>
          </div>
        </RouterLink>
      </div>
      <div v-else class="courses-empty"><Search /><h3>{{ courses.length ? '暂时没有找到课程' : '暂无已上架课程' }}</h3><p>{{ courses.length ? '试试其他关键词，或查看全部课程。' : '课程准备好后会在这里展示，请稍后再来。' }}</p><button v-if="courses.length" class="courses-secondary" @click="query = ''; category = '全部课程'">查看全部课程</button></div>
    </section>
    <footer class="courses-footer"><span>✦ 让学习成为日常</span><p>观看记录仅保存在本浏览器，清除数据后将重置。</p></footer>
  </main>
</template>
