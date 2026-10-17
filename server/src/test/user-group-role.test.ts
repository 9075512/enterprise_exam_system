import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { closePool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { prepareTestDb } from './db.js';

const admin = signToken({ sub: 'user-admin', role: 'admin', departmentId: '' });
const bearer = { Authorization: `Bearer ${admin}` };

describe('用户组统一维护角色', () => {
  beforeAll(async () => {
    await prepareTestDb();
  }, 30000);

  afterAll(async () => {
    await closePool();
  });

  it('种子数据为三种角色创建默认用户组', async () => {
    const response = await request(app).get('/api/user-groups').set(bearer);
    expect(response.body.code).toBe(0);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'role-group-admin', role: 'admin' }),
      expect.objectContaining({ id: 'role-group-author', role: 'author' }),
      expect.objectContaining({ id: 'role-group-examinee', role: 'examinee' }),
    ]));
  });

  it('新建用户时从所属组派生角色，无需单独提交 role', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(bearer)
      .send({
        username: 'group_author',
        name: '分组出题人',
        groupIds: ['role-group-author'],
      });
    expect(response.body.code).toBe(0);
    expect(response.body.data).toMatchObject({ role: 'author', groupIds: ['role-group-author'] });
  });

  it('拒绝同时选择不同角色的用户组', async () => {
    const response = await request(app)
      .put('/api/users/user-author')
      .set(bearer)
      .send({
        username: 'author',
        name: '王出题',
        departmentId: '',
        groupIds: ['role-group-author', 'role-group-examinee'],
        status: 'active',
      });
    expect(response.body.code).toBe(1001);
    expect(response.body.message).toContain('相同角色');
  });

  it('在用户组中调整成员会同步切换角色并移出原角色组', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(bearer)
      .send({
        username: 'move_by_group',
        name: '通过组调整角色',
        departmentId: 'dept-rd',
        groupIds: ['role-group-author'],
      });
    expect(created.body.code).toBe(0);
    const userId = created.body.data.id as string;

    const examineeGroup = await request(app).get('/api/user-groups').set(bearer);
    const target = examineeGroup.body.data.find((group: { id: string }) => group.id === 'role-group-examinee');
    const updated = await request(app)
      .put('/api/user-groups/role-group-examinee')
      .set(bearer)
      .send({
        name: target.name,
        role: 'examinee',
        description: target.description,
        userIds: [...target.userIds, userId],
      });
    expect(updated.body.code).toBe(0);

    const users = await request(app).get('/api/users').set(bearer);
    const moved = users.body.data.find((user: { id: string }) => user.id === userId);
    expect(moved).toMatchObject({ role: 'examinee', groupIds: ['role-group-examinee'] });
  });
});
