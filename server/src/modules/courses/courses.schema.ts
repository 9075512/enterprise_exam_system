import { z } from 'zod';
import { sanitizeRichText } from '../../utils/richText.js';

export function validCourseUrl(value: string): boolean {
  if (!value) return true;
  if (/^\/(?:courses\/|api\/(?:courses\/media\/|attachments\/))[^\s\\<>]+$/.test(value) && !value.includes('..')) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
const mediaUrl = z.string().trim().max(2048).refine(validCourseUrl, '请填写有效的 HTTP(S) 地址或本站上传资源地址');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, '课程、章节及小节标识不合法');
export const courseCoverSchema = z.object({
  title: z.string().trim().min(1, '请先填写课程标题').max(120).refine(value => !!value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim(), '请先填写课程标题'),
  category: z.string().trim().max(50).default(''),
  instructor: z.string().trim().max(80).default(''),
});
export type CourseCoverInput = z.infer<typeof courseCoverSchema>;
export const courseBodySchema = z.object({
  title: z.string().trim().min(1, '请输入课程标题').max(120),
  description: z.string().trim().max(2000).default(''),
  detailHtml: z.string().max(20000).default('').transform(value => sanitizeRichText(value, { maxLength: 20000, maxImages: 10, maxImageBytes: 2 * 1024 * 1024 })),
  category: z.string().trim().max(50).default(''),
  categoryId: z.string().regex(/^[a-zA-Z0-9_-]{0,64}$/).default(''),
  cover: mediaUrl.default(''),
  instructor: z.string().trim().max(80).default(''),
  level: z.enum(['入门', '进阶', '高级']).default('入门'),
  sortOrder: z.number().int().min(0).max(99999).default(0),
  isDemo: z.boolean().default(false),
  chapters: z.array(z.object({
    id, title: z.string().trim().min(1, '请输入章节标题').max(120),
    lessons: z.array(z.object({
      id, title: z.string().trim().min(1, '请输入小节标题').max(120), description: z.string().trim().max(2000).default(''),
      src: mediaUrl.default(''), durationLabel: z.string().regex(/^\d{2,3}:[0-5]\d$/, '时长格式应为 分钟:秒，如 05:30').default('00:00'),
    })).max(100),
  })).max(50).default([]),
}).superRefine((course, context) => {
  const chapterIds = course.chapters.map(chapter => chapter.id);
  const lessonIds = course.chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.id));
  if (new Set(chapterIds).size !== chapterIds.length || new Set(lessonIds).size !== lessonIds.length) context.addIssue({ code: 'custom', message: '章节或小节标识重复，请重新添加' });
});
export type CourseInput = z.infer<typeof courseBodySchema>;
export interface ManagedCourse extends CourseInput { id: string; status: 'draft' | 'published' | 'archived'; revision: number; createdAt: string; updatedAt: string }
export const courseUpdateSchema = z.object({ revision: z.number().int().positive(), course: courseBodySchema });
export const courseStatusSchema = z.object({ revision: z.number().int().positive(), status: z.enum(['draft', 'published', 'archived']) });
export const courseIdSchema = z.object({ id });
export const courseRevisionSchema = z.object({ revision: z.coerce.number().int().positive() });
export const courseListSchema = z.object({
  q: z.string().trim().max(120).default(''), status: z.enum(['', 'draft', 'published', 'archived']).default(''),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type CourseListQuery = z.infer<typeof courseListSchema>;
export const courseCategorySchema = z.object({ name: z.string().trim().min(1, '请输入分类名称').max(50), sortOrder: z.number().int().min(0).max(99999).default(0) });
export type CourseCategoryInput = z.infer<typeof courseCategorySchema>;
export const courseCategoryUpdateSchema = courseCategorySchema.extend({ revision: z.number().int().positive() });
export const lessonSelectionSchema = z.object({ lessonId: id });
export const courseLessonIdSchema = z.object({ courseId: id, lessonId: id });
const playback = z.object({ position: z.number().finite().min(0).max(604800), duration: z.number().finite().positive().max(604800), completed: z.boolean() });
export const courseProgressSchema = playback.extend({ revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), clientId: id, sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).refine(value => value.position <= value.duration, '播放位置不能超过视频时长');
export type CourseProgressInput = z.infer<typeof courseProgressSchema>;
export const courseProgressImportSchema = z.object({ lessons: z.array(playback.extend({ courseId: id, lessonId: id, selected: z.boolean().default(false) }).refine(value => value.position <= value.duration, '播放位置不能超过视频时长')).max(500) });
