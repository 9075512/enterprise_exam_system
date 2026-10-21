import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { defineComponent, onBeforeUnmount } from 'vue';
import ListPage from './CourseListPage.vue';
import DetailPage from './CourseDetailPage.vue';
import StudyPage from './CourseStudyPage.vue';
import { useCourseProgress } from '@/composables/useCourseProgress';
import { courses } from '@/data/courses';
import type { SavedProgress, ProgressWrite } from '@/api/courseProgress';
const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('@/api/courses', () => ({ listCourses: api.list, getCourse: api.get }));
const cloudApi = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), select: vi.fn(), migrate: vi.fn() }));
vi.mock('@/api/courseProgress', () => ({ getCourseProgress: cloudApi.get, saveCourseProgress: cloudApi.save, selectCourseLesson: cloudApi.select, importCourseProgress: cloudApi.migrate }));
let cloud: SavedProgress;

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { id: 'learner' } }) }));
const player = defineComponent({
  name: 'CourseVideoPlayer', props: ['courseId', 'lessonId', 'initialPosition'], emits: ['progress', 'ended'],
  setup(props, { emit }) { onBeforeUnmount(() => emit('progress', props.courseId, props.lessonId, { position: 3, duration: 5, completed: false })); },
  template: '<div class="test-player" />',
});
let wrapper: VueWrapper | undefined;
let router: Router;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear(); vi.clearAllMocks();
  cloud = { version: 1, courses: {} };
  cloudApi.get.mockImplementation(async () => structuredClone(cloud));
  cloudApi.select.mockImplementation(async (courseId: string, lessonId: string) => { (cloud.courses[courseId] ??= { lessons: {} }).lastLessonId = lessonId; });
  cloudApi.save.mockImplementation(async (courseId: string, lessonId: string, body: ProgressWrite) => { const result = { ...body, revision: 1, updatedAt: Date.now() }; (cloud.courses[courseId] ??= { lessons: {} }).lessons[lessonId] = result; return result; });
  api.list.mockResolvedValue(courses);
  api.get.mockImplementation(async (id: string) => { const course = courses.find(item => item.id === id); if (!course) throw Object.assign(new Error('not found'), { status: 404 }); return course; });
});
afterEach(async () => { wrapper?.unmount(); wrapper = undefined; await flushPromises(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function render(path: string) {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/exam/courses', component: ListPage },
    { path: '/exam/courses/:courseId', name: 'course-detail', component: DetailPage },
    { path: '/exam/courses/:courseId/learn', name: 'course-study', component: StudyPage },
  ] });
  await router.push(path); await router.isReady();
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], stubs: {
    CourseVideoPlayer: player,
    LoadingSkeleton: true,
    RequestError: { name: 'RequestError', props: ['text'], emits: ['retry'], template: '<div>{{ text }}<button @click="$emit(\'retry\')">重新加载</button></div>' },
    ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /></section>' },
  } } });
  await flushPromises();
  return wrapper;
}
describe('课程列表和章节学习流程', () => {
  it('介绍页开始学习进入首节，学习页可返回介绍且不重复显示图文', async () => {
    const page = await render('/exam/courses/visual-story');
    expect(page.get('.course-overview__desktop-action button').text()).toBe('开始学习');
    await page.get('.course-overview__desktop-action button').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/exam/courses/visual-story/learn');
    expect(page.getComponent(player).props()).toMatchObject({ lessonId: 'light', initialPosition: 0 });
    expect(page.find('.course-rich-detail').exists()).toBe(false);
    await page.get('.course-study-back a').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/exam/courses/visual-story');
    expect(page.findComponent(player).exists()).toBe(false);
  });
  it('介绍页继续学习使用数据库最后有效小节，目录可直达指定小节', async () => {
    cloud.courses['visual-story'] = { lastLessonId: 'composition', lessons: { composition: { position: 45, duration: 100, completed: false, updatedAt: 1 } } };
    const page = await render('/exam/courses/visual-story');
    expect(page.get('.course-overview__desktop-action button').text()).toBe('继续学习');
    expect(cloudApi.select).not.toHaveBeenCalled();
    await page.get('.course-overview__desktop-action button').trigger('click'); await flushPromises();
    expect(page.getComponent(player).props()).toMatchObject({ lessonId: 'composition', initialPosition: 45 });
    await router.push('/exam/courses/visual-story'); await flushPromises();
    await page.findAll('.course-overview__outline .course-outline__lessons button')[0].trigger('click'); await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('light');
  });
  it('全部完成后再次学习从首节开始，保留完成标记；旧最后小节失效时回退首节', async () => {
    cloud.courses['nature-colors'] = { lastLessonId: 'color-detail', lessons: Object.fromEntries(courses[1].chapters.flatMap(c => c.lessons).map(l => [l.id, { position: 5, duration: 5, completed: true, updatedAt: 1 }])) };
    const page = await render('/exam/courses/nature-colors');
    expect(page.get('.course-overview__desktop-action button').text()).toBe('再次学习');
    await page.get('.course-overview__desktop-action button').trigger('click'); await flushPromises();
    expect(page.getComponent(player).props()).toMatchObject({ lessonId: 'colors', initialPosition: 0 });
    expect(page.text()).toContain('已完成');
    cloud.courses['visual-story'] = { lastLessonId: 'removed', lessons: {} };
    await router.push('/exam/courses/visual-story'); await flushPromises();
    await page.get('.course-overview__desktop-action button').trigger('click'); await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('light');
  });
  it('旧小节链接兼容跳转，保留参数，非法小节回退到有效小节', async () => {
    const page = await render('/exam/courses/visual-story?lesson=composition&from=old');
    expect(router.currentRoute.value.path).toBe('/exam/courses/visual-story/learn');
    expect(router.currentRoute.value.query.from).toBe('old');
    expect(page.getComponent(player).props('lessonId')).toBe('composition');
    await router.push('/exam/courses/visual-story?lesson=removed'); await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('composition');
  });
  it('无图文回退原简介，无有效小节仍展示介绍并禁用学习，空目录不出现NaN', async () => {
    api.get.mockResolvedValueOnce({ ...courses[0], detailHtml: '', chapters: [] });
    const page = await render('/exam/courses/visual-story');
    expect(page.get('.course-overview__plain').text()).toBe(courses[0].description);
    expect(page.get('.course-overview__desktop-action button').attributes('disabled')).toBeDefined();
    expect(page.text()).not.toContain('NaN'); expect(cloudApi.select).not.toHaveBeenCalled();
  });
  it('介绍加载失败可重试，进度同步失败仍能查看课程和重试同步', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const page = await render('/exam/courses/visual-story');
    expect(page.text()).toContain('课程加载失败');
    cloudApi.get.mockRejectedValueOnce(new Error('offline'));
    page.getComponent({ name: 'RequestError' }).vm.$emit('retry'); await flushPromises();
    expect(page.text()).toContain(courses[0].title); expect(page.get('[role="alert"]').text()).toContain('同步失败');
    await page.get('.courses-warning button').trigger('click'); await flushPromises();
    expect(page.find('.courses-warning').exists()).toBe(false);
  });
  it('三行简介可展开收起，图片失败提示，介绍/目录支持键盘切换', async () => {
    api.get.mockResolvedValueOnce({ ...courses[0], detailHtml: '<p>图文</p><img src="/broken.png">' });
    const page = await render('/exam/courses/visual-story');
    const summary = page.get('#course-summary').element;
    Object.defineProperties(summary, { scrollHeight: { value: 120 }, clientHeight: { value: 60 } });
    window.dispatchEvent(new Event('resize')); await flushPromises();
    await page.get('.course-overview__expand').trigger('click');
    expect(page.get('#course-summary').classes()).not.toContain('collapsed');
    await page.get('.course-overview__expand').trigger('click'); expect(page.get('#course-summary').classes()).toContain('collapsed');
    await page.get('.course-overview__cover img').trigger('error'); expect(page.text()).toContain('封面暂时无法加载');
    await page.get('.rich-text img').trigger('error'); expect(page.get('.rich-text img').attributes('alt')).toContain('图片加载失败');
    await page.get('#course-tab-intro').trigger('keydown', { key: 'ArrowRight' });
    expect(page.get('#course-tab-outline').attributes('aria-selected')).toBe('true');
    expect(page.get('#course-panel-outline').classes()).toContain('is-active');
  });
  it('介绍页首屏可见图文入口，浏览介绍及展开目录不加载视频、不选择或保存小节', async () => {
    api.get.mockResolvedValueOnce({ ...courses[0], detailHtml: '<h2>学习目标</h2><p><strong>安全知识</strong></p>' });
    const page = await render('/exam/courses/visual-story');
    expect(page.get('.course-rich-detail h2').text()).toBe('课程介绍');
    expect(page.get('.course-rich-detail .rich-text strong').text()).toBe('安全知识');
    expect(page.findComponent(player).exists()).toBe(false);
    await page.get('#course-tab-outline').trigger('click');
    await page.get('.course-overview__outline summary').trigger('click');
    expect(cloudApi.select).not.toHaveBeenCalled(); expect(cloudApi.save).not.toHaveBeenCalled();
  });
  it('列表有封面、标题与简介，支持搜索、分类及空态恢复', async () => {
    const page = await render('/exam/courses');
    expect(page.findAll('.course-card')).toHaveLength(3);
    expect(page.get('img').attributes('alt')).toContain('封面');
    await page.get('input').setValue('自然');
    expect(page.findAll('.course-card')).toHaveLength(1);
    await page.get('input').setValue('不存在的课程');
    expect(page.text()).toContain('暂时没有找到课程');
    await page.get('.courses-empty button').trigger('click');
    expect(page.findAll('.course-card')).toHaveLength(3);
    await page.findAll('.courses-filters button').find(button => button.text() === '自然观察')!.trigger('click');
    expect(page.findAll('.course-card')).toHaveLength(1);
    expect(page.get('.course-card').attributes('href')).toBe('/exam/courses/nature-colors');
  });
  it('无显式小节参数时自动恢复最后小节和播放位置', async () => {
    const progress = useCourseProgress('learner');
    progress.select('visual-story', 'composition');
    progress.save('visual-story', 'composition', { position: 45, duration: 596, completed: false });
    const page = await render('/exam/courses/visual-story/learn');
    expect(page.getComponent(player).props()).toMatchObject({ courseId: 'visual-story', lessonId: 'composition', initialPosition: 45 });
    expect(page.text()).toContain('00:45');
    expect(router.currentRoute.value.query.lesson).toBe('composition');
  });
  it('目录切节、切课时旧视频补存到原小节，抽屉选择后收起，返回课程仍可续播', async () => {
    const page = await render('/exam/courses/visual-story/learn');
    await page.get('.course-mobile-directory').trigger('click');
    expect(page.find('[role="dialog"]').exists()).toBe(true);
    await page.get('[role="dialog"] button').trigger('click');
    expect(page.find('[role="dialog"]').exists()).toBe(false);
    await page.findAll('.course-desktop-directory button')[1].trigger('click');
    await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('composition');
    const stored = useCourseProgress('learner');
    expect(stored.lesson('visual-story', 'light')?.position).toBe(3);
    expect(stored.lesson('visual-story', 'composition')).toBeUndefined();
    expect(stored.lastLesson('visual-story')).toBe('composition');
    await router.push('/exam/courses/nature-colors/learn'); await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('colors');
    expect(useCourseProgress('learner').lesson('visual-story', 'composition')?.position).toBe(3);
    expect(useCourseProgress('learner').lesson('nature-colors', 'colors')).toBeUndefined();
    await router.push('/exam/courses/visual-story/learn'); await flushPromises();
    expect(page.getComponent(player).props()).toMatchObject({ lessonId: 'composition', initialPosition: 3 });
  });
  it('播放结束更新目录和课程完成状态，重看已完成小节从头播放', async () => {
    const page = await render('/exam/courses/nature-colors/learn');
    page.getComponent(player).vm.$emit('progress', 'nature-colors', 'colors', { position: 5, duration: 5, completed: true });
    page.getComponent(player).vm.$emit('ended'); await flushPromises();
    expect(page.text()).toContain('本小节已完成');
    expect(page.get('.course-completed').text()).toBe('已完成');
    await page.findAll('.course-desktop-directory button')[1].trigger('click'); await flushPromises();
    await page.findAll('.course-desktop-directory button')[0].trigger('click'); await flushPromises();
    expect(page.getComponent(player).props('initialPosition')).toBe(0);
    expect(useCourseProgress('learner').lesson('nature-colors', 'colors')?.completed).toBe(true);
  });
  it('不存在的课程显示明确的返回入口', async () => {
    const page = await render('/exam/courses/missing');
    expect(page.text()).toContain('没有找到这门课程');
    expect(page.get('.courses-empty a').attributes('href')).toBe('/exam/courses');
  });
  it('接口加载失败提供重试，无已上架课程时显示真实空态', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    const page = await render('/exam/courses');
    expect(page.text()).toContain('课程加载失败');
    api.list.mockResolvedValueOnce([]);
    page.getComponent({ name: 'RequestError' }).vm.$emit('retry'); await flushPromises();
    expect(page.text()).toContain('暂无已上架课程'); expect(page.findAll('.course-card')).toHaveLength(0);
  });
  it('切换课程后迟到的请求不会覆盖当前课程', async () => {
    let resolve!: (course: typeof courses[number]) => void;
    api.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const page = await render('/exam/courses/visual-story/learn');
    await router.push('/exam/courses/nature-colors/learn'); await flushPromises();
    expect(page.text()).toContain('自然中的色彩与细节');
    resolve(courses[0]); await flushPromises();
    expect(page.getComponent(player).props('courseId')).toBe('nature-colors');
  });
  it('已删除小节的历史完成记录不计入当前课程的完成数', async () => {
    const progress = useCourseProgress('learner');
    progress.save('nature-colors', 'removed-lesson', { position: 5, duration: 5, completed: true });
    const page = await render('/exam/courses');
    const card = page.findAll('.course-card').find(item => item.text().includes('自然中的色彩与细节'))!;
    expect(card.text()).not.toContain('已完成 1');
  });
});
