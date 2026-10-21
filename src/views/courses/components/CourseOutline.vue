<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, CircleCheckFilled, VideoPlay } from '@element-plus/icons-vue';
import { courseLessons, type Course } from '@/data/courses';
import type { LessonProgress } from '@/composables/useCourseProgress';
const props = defineProps<{ course: Course; activeId: string; progress: Record<string, LessonProgress>; overview?: boolean }>();
defineEmits<{ select: [id: string] }>();
const lessons = computed(() => courseLessons(props.course));
const completed = computed(() => lessons.value.filter(lesson => props.progress[lesson.id]?.completed).length);
const percent = computed(() => lessons.value.length ? Math.round(completed.value / lessons.value.length * 100) : 0);
</script>

<template>
  <div class="course-outline">
    <div class="course-outline__head"><h2>课程目录 <span>{{ lessons.length }} 小节</span></h2><p>已完成 {{ completed }} / {{ lessons.length }} 小节<span>{{ percent }}%</span></p><div class="course-outline__progress"><i :style="{ width: `${percent}%` }" /></div></div>
    <p v-if="!lessons.length" class="course-outline__foot">暂无可学习小节</p>
    <details v-for="(chapter, index) in course.chapters" :key="chapter.id" :open="chapter.lessons.some(lesson => lesson.id === activeId) || overview && index === 0">
      <summary><span class="chapter-number">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ chapter.title }}<small>{{ chapter.lessons.length }} 小节</small></span><ArrowDown /></summary>
      <div class="course-outline__lessons">
        <button v-for="lesson in chapter.lessons" :key="lesson.id" type="button" :disabled="overview && !lesson.src.trim()" :class="{ active: lesson.id === activeId }" :aria-current="lesson.id === activeId ? 'true' : undefined" @click="$emit('select', lesson.id)">
          <CircleCheckFilled v-if="progress[lesson.id]?.completed" class="lesson-complete" /><VideoPlay v-else />
          <span>{{ lesson.title }}<small>{{ lesson.durationLabel }}<em>{{ progress[lesson.id]?.completed ? '已完成' : lesson.id === activeId ? '当前小节' : progress[lesson.id]?.position ? '学习中' : '未开始' }}</em></small></span>
        </button>
      </div>
    </details>
    <p class="course-outline__foot">每一次专注，都是向前一步。</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.course-outline { background: white; border: 1px solid $border-color; border-radius: $radius-lg; overflow: hidden; }
.course-outline__head { padding: 22px; border-bottom: 1px solid #edf0f5; }
h2 { display: flex; justify-content: space-between; align-items: center; margin: 0 0 18px; font-size: 16px; }
h2 span { color: #77859a; font-size: 12px; font-weight: 400; }
.course-outline__head p { display: flex; justify-content: space-between; margin: 0 0 9px; font-size: 12px; color: #66758a; }
.course-outline__head p span { color: $color-primary; }
.course-outline__progress { height: 5px; overflow: hidden; background: #eef2f8; border-radius: 5px; }
.course-outline__progress i { display: block; height: 100%; background: $color-primary; border-radius: inherit; }
details { border-bottom: 1px solid #edf0f5; }
summary { display: flex; align-items: center; gap: 10px; padding: 20px 18px; list-style: none; cursor: pointer; font-size: 13px; font-weight: 600; }
summary::-webkit-details-marker { display: none; }
summary small { display: block; color: #8490a2; font-size: 11px; font-weight: 400; margin-top: 3px; }
summary > svg { margin-left: auto; width: 14px; flex-shrink: 0; transition: transform .2s; }
details[open] summary > svg { transform: rotate(180deg); }
.chapter-number { color: #9aa6b7; font-size: 11px; font-variant-numeric: tabular-nums; }
.course-outline__lessons { padding: 0 10px 12px; }
.course-outline__lessons button { display: flex; align-items: flex-start; gap: 10px; text-align: left; width: 100%; padding: 13px 12px; border: 0; border-radius: 8px; background: transparent; color: #536176; cursor: pointer; font-family: inherit; font-size: 12px; line-height: 1.6; }
.course-outline__lessons button:hover { background: #f5f8fd; }
.course-outline__lessons button.active { background: #edf4ff; color: $color-primary; }
.course-outline__lessons button > svg { flex-shrink: 0; width: 17px; margin-top: 2px; }
.course-outline__lessons button > span { flex: 1; }
.course-outline__lessons small { display: flex; gap: 16px; margin-top: 7px; color: #7c899b; font-size: 11px; }
.course-outline__lessons em { font-style: normal; }
.course-outline__lessons .lesson-complete { color: #16a075; }
.course-outline__foot { margin: 0; padding: 22px 10px; font-size: 11px; text-align: center; color: #8b97a8; }
button:focus-visible, summary:focus-visible { outline: 2px solid $color-primary; outline-offset: -2px; }
</style>
