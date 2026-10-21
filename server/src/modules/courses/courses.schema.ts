import { z } from 'zod';

export function validCourseUrl(value: string): boolean {
  if (!value) return true;
  if (/^\/(?:courses\/|api\/(?:courses\/media\/|attachments\/))[^\s\\<>]+$/.test(value) && !value.includes('..')) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
const mediaUrl = z.string().trim().max(2048).refine(validCourseUrl, '请填写有效的 HTTP(S) 地址或本站上传资源地址');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, '课程、章节及小节标识不合法');
export const courseBodySchema = z.object({
  title: z.string().trim().min(1, '请输入课程标题').max(120),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(50).default(''),
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
