export interface CourseLesson { id: string; title: string; description: string; src: string; durationLabel: string }
export interface CourseChapter { id: string; title: string; lessons: CourseLesson[] }
export interface Course { id: string; title: string; description: string; detailHtml?: string; category: string; categoryId?: string; cover: string; instructor: string; level: string; isDemo?: boolean; chapters: CourseChapter[] }

// 保留为测试与可选种子数据，正式页面从课程 API 读取；公开样片不代表正式教学内容。
const flower = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const bunny = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const sintel = 'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4';

export const courses: Course[] = [
  {
    id: 'visual-story', title: '影像观察与视觉叙事', category: '影像表达', cover: '/courses/landscape.svg', instructor: '学习中心', level: '入门',
    description: '从观察一束光开始，认识画面、节奏与故事。在影像中练习发现，让表达更有温度。',
    chapters: [
      { id: 'observe', title: '从观察开始', lessons: [
        { id: 'light', title: '发现日常中的光与色彩', description: '观察花朵样片中光线与色彩的变化，留意画面里的细节。', src: flower, durationLabel: '00:05' },
        { id: 'composition', title: '认识画面的构成', description: '观看动画样片，尝试找出主体、背景和画面的视觉重心。', src: bunny, durationLabel: '09:56' },
      ] },
      { id: 'story', title: '让画面讲述故事', lessons: [
        { id: 'rhythm', title: '感受镜头与叙事节奏', description: '在公开动画样片中观察场景转换与叙事节奏。', src: sintel, durationLabel: '14:48' },
        { id: 'practice', title: '观察练习：回到细节', description: '再看一次花朵短片，记录你第一次没有注意到的细节。', src: flower, durationLabel: '00:05' },
      ] },
    ],
  },
  {
    id: 'nature-colors', title: '自然中的色彩与细节', category: '自然观察', cover: '/courses/flower.svg', instructor: '学习中心', level: '入门',
    description: '放慢脚步，观察自然的细微变化。从色彩、形态到光影，培养自己的观察习惯。',
    chapters: [{ id: 'nature', title: '走近自然的细节', lessons: [
      { id: 'colors', title: '花朵的色彩与形态', description: '观看花朵短片，观察花瓣层次和背景色彩。', src: flower, durationLabel: '00:05' },
      { id: 'details', title: '用观察记录你的发现', description: '重复观察同一段影像，记录光线、颜色与运动细节。', src: flower, durationLabel: '00:05' },
    ] }],
  },
  {
    id: 'animation-language', title: '动画里的故事语言', category: '影像表达', cover: '/courses/story.svg', instructor: '学习中心', level: '进阶',
    description: '跟随角色走进故事，理解场景、动作与情绪如何协作，感受动画的表达方式。',
    chapters: [{ id: 'animation', title: '走进动画世界', lessons: [
      { id: 'characters', title: '角色动作与情绪表达', description: '观看 Big Buck Bunny，观察角色如何通过动作传达情绪。', src: bunny, durationLabel: '09:56' },
      { id: 'scenes', title: '场景与故事氛围', description: '观看 Sintel，观察不同场景怎样营造故事氛围。', src: sintel, durationLabel: '14:48' },
    ] }],
  },
];

export function courseLessons(course: Course): CourseLesson[] { return course.chapters.flatMap(chapter => chapter.lessons); }
export function formatVideoTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
