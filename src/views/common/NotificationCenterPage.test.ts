import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import Notifications from './NotificationCenterPage.vue';

const api = vi.hoisted(() => ({ list: vi.fn(), unread: vi.fn(), read: vi.fn(), all: vi.fn() }));
vi.mock('@/api/notifications', () => ({ listNotifications: api.list, getUnreadCount: api.unread, markRead: api.read, markAllRead: api.all }));
let wrapper: VueWrapper;
const items = (count: number) => Array.from({ length: count }, (_, i) => ({ id: String(i + 1), title: `考试通知${i + 1}`, content: `正文${i + 1}`, type: 'publish', isRead: false, createdAt: new Date().toISOString() }));
function render() { wrapper = mount(Notifications, { attachTo: document.body, global: { plugins: [ElementPlus] } }); }
function button(text: string) { return wrapper.findAll('button').find(b => b.text().trim() === text)!; }
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue({ list: items(21), total: 140 });
  api.unread.mockResolvedValue({ unreadCount: 38 });
  api.read.mockResolvedValue(null); api.all.mockResolvedValue(null);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('消息中心分类、分页和状态', () => {
  it('加载期间显示骨架与未知统计，不提前显示空状态', async () => {
    let resolve!: (value: unknown) => void;
    api.list.mockReturnValue(new Promise(done => { resolve = done; }));
    render(); await flushPromises();
    expect(wrapper.find('[role="status"]').attributes('aria-label')).toBe('正在加载消息');
    expect(wrapper.text()).not.toContain('暂无消息');
    expect(wrapper.findAll('.stat-card__value').every(card => card.text().includes('—'))).toBe(true);
    resolve({ list: [], total: 0 }); await flushPromises();
    expect(wrapper.text()).toContain('暂无消息');
  });

  it('分类仅作用于已加载消息，全量统计保留服务端口径', async () => {
    render(); await flushPromises();
    expect(api.list).toHaveBeenCalledWith(1, 100);
    expect(wrapper.text()).toContain('已加载 21 / 140 条消息');
    expect(wrapper.text()).toContain('分类筛选、分页和今日新增仅基于已加载消息');
    expect(wrapper.findAll('.stat-card__value').map(card => card.text())).toEqual(['38条', '21条', '140条']);
    await button('未读 21').trigger('click');
    expect(button('未读 21').attributes('aria-pressed')).toBe('true');
    expect(button('全部 21').attributes('aria-pressed')).toBe('false');
  });

  it('未读最后一页读完后回到有效页，保留其他未读消息', async () => {
    render(); await flushPromises();
    await button('未读 21').trigger('click');
    await wrapper.get('button[aria-label="下一页"]').trigger('click');
    expect(wrapper.findAll('.notif__item')).toHaveLength(1);
    await wrapper.get('.notif__item').trigger('click'); await flushPromises();
    expect(api.read).toHaveBeenCalledWith('21');
    expect(wrapper.findAll('.notif__item')).toHaveLength(20);
    expect(wrapper.text()).toContain('未读 20');
    expect(document.body.textContent).toContain('正文21');
  });

  it('已读请求失败保留未读消息和数量', async () => {
    api.read.mockRejectedValue(new Error('offline'));
    render(); await flushPromises();
    await wrapper.get('.notif__item').trigger('click'); await flushPromises();
    expect(wrapper.get('.notif__item').classes()).toContain('is-unread');
    expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('38条');
  });

  it('连续打开同一条未读消息仅请求一次，未读统计只扣减一次', async () => {
    let resolve!: (value: null) => void;
    api.read.mockReturnValue(new Promise(done => { resolve = done; }));
    render(); await flushPromises();
    await wrapper.get('.notif__item').trigger('click');
    await wrapper.get('.notif__item').trigger('click');
    expect(api.read).toHaveBeenCalledTimes(1);
    resolve(null); await flushPromises();
    expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('37条');
    expect(wrapper.get('.notif__item').classes()).not.toContain('is-unread');
  });

  it('全部已读等待期间不重复提交，失败后可重试', async () => {
    let reject!: (error: Error) => void;
    api.all.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    render(); await flushPromises();
    await button('全部已读').trigger('click'); await button('全部已读').trigger('click');
    expect(api.all).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await flushPromises();
    expect(button('全部已读').classes()).not.toContain('is-loading');
    expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('38条');
    await button('全部已读').trigger('click'); await flushPromises();
    expect(api.all).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.notif__item.is-unread')).toHaveLength(0);
    expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('0条');
  });
});

it('单条失败在详情内可重试，处理中禁止刷新和全部已读', async () => {
  let reject!: (error: Error) => void;
  api.read.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(); await flushPromises(); await wrapper.get('.notif__item').trigger('click');
  expect(button('刷新').attributes('disabled')).toBeDefined();
  expect(button('全部已读').attributes('disabled')).toBeDefined();
  reject(new Error('offline')); await flushPromises();
  expect(document.body.textContent).toContain('标记已读失败，消息仍保留未读');
  [...document.querySelectorAll<HTMLButtonElement>('.el-drawer button')].find(b => b.textContent?.trim() === '重试标记已读')!.click(); await flushPromises();
  expect(api.read).toHaveBeenCalledTimes(2);
  expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('37条');
  expect(document.body.textContent).not.toContain('标记已读失败，消息仍保留未读');
});

it('全部标记期间打开详情不会再单独扣减，全部成功后同步详情状态', async () => {
  let finish!: (value: null) => void;
  api.all.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(); await flushPromises(); await button('全部已读').trigger('click');
  await wrapper.get('.notif__item').trigger('click');
  expect(api.read).not.toHaveBeenCalled();
  finish(null); await flushPromises();
  expect(wrapper.findAll('.stat-card__value')[0]!.text()).toBe('0条');
  expect([...document.querySelectorAll('.el-drawer button')].some(b => b.textContent?.trim() === '标记已读')).toBe(false);
});

it('刷新沿用同一消息ID的新详情，失败与加载分类数不冒充零', async () => {
  api.list.mockRejectedValueOnce(new Error('offline'));
  render(); await flushPromises(); expect(button('全部 —').exists()).toBe(true);
  await button('刷新').trigger('click'); await flushPromises();
  await wrapper.get('.notif__item').trigger('click'); await flushPromises();
  const updated = items(21); updated[0] = { ...updated[0]!, title: '已更新的通知', content: '新的完整正文', isRead: true };
  api.list.mockResolvedValueOnce({ list: updated, total: 140 });
  await button('刷新').trigger('click'); await flushPromises();
  expect(document.body.textContent).toContain('新的完整正文');
});
