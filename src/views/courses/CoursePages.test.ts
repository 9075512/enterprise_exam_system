import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { defineComponent, onBeforeUnmount } from 'vue';
import ListPage from './CourseListPage.vue';
import DetailPage from './CourseDetailPage.vue';
import { useCourseProgress } from '@/composables/useCourseProgress';
import { courses } from '@/data/courses';
const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('@/api/courses', () => ({ listCourses: api.list, getCourse: api.get }));

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { id: 'learner' } }) }));
const player = defineComponent({
  name: 'CourseVideoPlayer', props: ['courseId', 'lessonId', 'initialPosition'], emits: ['progress', 'ended'],
  setup(props, { emit }) { onBeforeUnmount(() => emit('progress', props.courseId, props.lessonId, { position: 3, duration: 5, completed: false })); },
  template: '<div class="test-player" />',
});
let wrapper: VueWrapper | undefined;
let router: Router;
beforeEach(() => {
  localStorage.clear();
  api.list.mockResolvedValue(courses);
  api.get.mockImplementation(async (id: string) => { const course = courses.find(item => item.id === id); if (!course) throw Object.assign(new Error('not found'), { status: 404 }); return course; });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); });
async function render(path: string) {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/exam/courses', component: ListPage },
    { path: '/exam/courses/:courseId', component: DetailPage },
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
    const page = await render('/exam/courses/visual-story');
    expect(page.getComponent(player).props()).toMatchObject({ courseId: 'visual-story', lessonId: 'composition', initialPosition: 45 });
    expect(page.text()).toContain('00:45');
    expect(router.currentRoute.value.query.lesson).toBe('composition');
  });
  it('目录切节、切课时旧视频补存到原小节，抽屉选择后收起，返回课程仍可续播', async () => {
    const page = await render('/exam/courses/visual-story');
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
    await router.push('/exam/courses/nature-colors'); await flushPromises();
    expect(page.getComponent(player).props('lessonId')).toBe('colors');
    expect(useCourseProgress('learner').lesson('visual-story', 'composition')?.position).toBe(3);
    expect(useCourseProgress('learner').lesson('nature-colors', 'colors')).toBeUndefined();
    await router.push('/exam/courses/visual-story'); await flushPromises();
    expect(page.getComponent(player).props()).toMatchObject({ lessonId: 'composition', initialPosition: 3 });
  });
  it('播放结束更新目录和课程完成状态，重看已完成小节从头播放', async () => {
    const page = await render('/exam/courses/nature-colors');
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
    const page = await render('/exam/courses/visual-story');
    await router.push('/exam/courses/nature-colors'); await flushPromises();
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
