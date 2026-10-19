import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { closePool, query, withTransaction } from '../db/pool.js';
import { freezeParticipants } from '../modules/exams/examParticipants.service.js';
import { signToken } from '../middleware/auth.js';
import { prepareTestDb } from './db.js';
import type { RowDataPacket } from 'mysql2/promise';

const bearer = { Authorization: `Bearer ${signToken({ sub: 'user-admin', role: 'admin', departmentId: '' })}` };
const author = { Authorization: `Bearer ${signToken({ sub: 'user-author', role: 'author', departmentId: '' })}` };
let teacherId = '';
let learnerId = '';
let customUserId = '';

describe('可配置角色与成员', () => {
  beforeAll(prepareTestDb, 30000);
  afterAll(closePool);

  it('提供三种内置角色，停用用户组端点；普通用户只读角色', async () => {
    const result = await request(app).get('/api/roles').set(bearer);
    expect(result.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'admin', baseRole: 'admin', isBuiltin: true }),
      expect.objectContaining({ id: 'author', baseRole: 'author', isBuiltin: true }),
      expect.objectContaining({ id: 'examinee', baseRole: 'examinee', isBuiltin: true }),
    ]));
    expect((await request(app).get('/api/user-groups').set(bearer)).status).toBe(404);
    expect((await request(app).get('/api/roles').set(author)).status).toBe(200);
    expect((await request(app).post('/api/roles').set(author).send({ name: '越权', baseRole: 'admin' })).status).toBe(403);
    expect((await request(app).get('/api/roles')).status).toBe(401);
  });

  it('创建独立菜单的自定义角色，拒绝超出基础身份的菜单', async () => {
    const created = await request(app).post('/api/roles').set(bearer).send({ name: '阅卷老师', baseRole: 'author', menuKeys: ['banks', 'reviews'] });
    expect(created.body.code).toBe(0);
    teacherId = created.body.data.id;
    expect(created.body.data.menuKeys).toEqual(['banks', 'reviews']);
    const invalid = await request(app).post('/api/roles').set(bearer).send({ name: '越权角色', baseRole: 'author', menuKeys: ['users'] });
    expect(invalid.body.code).toBe(1001);
    const inherited = await request(app).post('/api/roles').set(bearer).send({ name: '培训考生', baseRole: 'examinee' });
    expect(inherited.body.code).toBe(0);
    learnerId = inherited.body.data.id;
    expect(inherited.body.data.menuKeys).toContain('my-exams');
  });

  it('角色重名、基础身份修改、内置角色重命名与删除均被拒绝', async () => {
    expect((await request(app).post('/api/roles').set(bearer).send({ name: '阅卷老师', baseRole: 'author' })).body.code).toBe(1005);
    expect((await request(app).put(`/api/roles/${teacherId}`).set(bearer).send({ name: '阅卷老师', baseRole: 'admin' })).body.code).toBe(1001);
    expect((await request(app).put('/api/roles/admin').set(bearer).send({ name: '改名', baseRole: 'admin' })).body.code).toBe(1001);
    expect((await request(app).delete('/api/roles/admin').set(bearer)).body.code).toBe(1005);
  });

  it('用户直接选择一个角色，派生基础身份并支持按角色筛选', async () => {
    const created = await request(app).post('/api/users').set(bearer).send({ username: 'role_teacher', name: '阅卷账号', roleId: teacherId, password: 'Teacher123!' });
    expect(created.body.code).toBe(0);
    customUserId = created.body.data.id;
    expect(created.body.data).toMatchObject({ roleId: teacherId, roleName: '阅卷老师', role: 'author' });
    expect(created.body.data).not.toHaveProperty('groupIds');
    const filtered = await request(app).get('/api/users').query({ roleId: teacherId }).set(bearer);
    expect(filtered.body.data.map((u: { id: string }) => u.id)).toEqual([customUserId]);
    expect((await request(app).delete(`/api/roles/${teacherId}`).set(bearer)).body.code).toBe(1005);
    expect((await request(app).post('/api/users').set(bearer).send({ username: 'missing_role', name: '无效角色', roleId: 'missing' })).body.code).toBe(1001);
  });

  it('自定义角色登录使用自身菜单；基础身份继续限制业务接口', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'role_teacher', password: 'Teacher123!' });
    expect(login.body.code).toBe(0);
    const auth = { Authorization: `Bearer ${login.body.data.token}` };
    expect((await request(app).get('/api/permissions/my').set(auth)).body.data.menus).toEqual(['banks', 'reviews']);
    expect((await request(app).get('/api/users').set(auth)).status).toBe(403);
    const updated = await request(app).put(`/api/roles/${teacherId}`).set(bearer).send({ name: '阅卷老师', baseRole: 'author', menuKeys: ['reviews'] });
    expect(updated.body.code).toBe(0);
    expect((await request(app).get('/api/permissions/my').set(auth)).status).toBe(401);
    const again = await request(app).post('/api/auth/login').send({ username: 'role_teacher', password: 'Teacher123!' });
    expect((await request(app).get('/api/permissions/my').set('Authorization', `Bearer ${again.body.data.token}`)).body.data.menus).toEqual(['reviews']);
  });

  it('个人菜单例外仅在基础身份允许范围内生效', async () => {
    expect((await request(app).put(`/api/menu-overrides/${customUserId}`).set(bearer).send({ overrides: [{ menuKey: 'users', effect: 'allow' }] })).body.code).toBe(1001);
    expect((await request(app).put(`/api/menu-overrides/${customUserId}`).set(bearer).send({ overrides: [{ menuKey: 'banks', effect: 'allow' }, { menuKey: 'reviews', effect: 'deny' }] })).body.code).toBe(0);
    const login = await request(app).post('/api/auth/login').send({ username: 'role_teacher', password: 'Teacher123!' });
    const menus = await request(app).get('/api/permissions/my').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(menus.body.data.menus).toEqual(['banks']);
  });

  it('成员分配替换原角色，移出后归入内置角色；不能将无科室成员调成考生', async () => {
    const invalid = await request(app).put(`/api/roles/${learnerId}/members`).set(bearer).send({ userIds: [customUserId] });
    expect(invalid.body.code).toBe(1001);
    const removed = await request(app).put(`/api/roles/${teacherId}/members`).set(bearer).send({ userIds: [] });
    expect(removed.body.code).toBe(0);
    const users = await request(app).get('/api/users').set(bearer);
    expect(users.body.data.find((u: { id: string }) => u.id === customUserId)).toMatchObject({ roleId: 'author', role: 'author' });
    expect((await request(app).put(`/api/roles/${teacherId}/members`).set(bearer).send({ userIds: [customUserId] })).body.code).toBe(0);
    expect((await request(app).put(`/api/roles/${teacherId}/members`).set(bearer).send({ userIds: ['missing-user'] })).body.code).toBe(1001);
  });

  it('用户编辑和角色成员调整均不能移走最后一个启用管理员', async () => {
    const demote = await request(app).put('/api/users/user-admin').set(bearer).send({ username: 'admin', name: '系统管理员', roleId: 'author' });
    expect(demote.body.code).toBe(1005);
    const disable = await request(app).put('/api/users/user-admin').set(bearer).send({ username: 'admin', name: '系统管理员', roleId: 'admin', status: 'disabled' });
    expect(disable.body.code).toBe(1005);
    const members = await request(app).put(`/api/roles/${teacherId}/members`).set(bearer).send({ userIds: [customUserId, 'user-admin'] });
    expect(members.body.code).toBe(1005);
    expect((await request(app).get('/api/users').set(bearer)).body.data.find((u: { id: string }) => u.id === 'user-admin')).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('菜单权限入口支持全部角色，并保护所有管理员角色的必授菜单', async () => {
    const adminRole = await request(app).post('/api/roles').set(bearer).send({ name: '运营管理员', baseRole: 'admin', menuKeys: [] });
    expect(adminRole.body.data.menuKeys).toEqual(expect.arrayContaining(['roles', 'settings', 'permissions']));
    const current = (await request(app).get('/api/permissions/menus').set(bearer)).body.data;
    current.grants[teacherId] = ['banks'];
    const update = await request(app).put('/api/permissions/menus').set(bearer).send({ grants: current.grants });
    expect(update.body.code).toBe(0);
    expect(update.body.data.roles.some((r: { id: string }) => r.id === teacherId)).toBe(true);
    expect(update.body.data.grants[teacherId]).toEqual(['banks']);
    expect((await request(app).delete(`/api/roles/${adminRole.body.data.id}`).set(bearer)).body.code).toBe(0);
  });

  it('角色成员调整后保留已冻结的指定人员名单，空角色可删除', async () => {
    expect((await request(app).put(`/api/roles/${learnerId}/members`).set(bearer).send({ userIds: ['user-zhangsan'] })).body.code).toBe(0);
    await withTransaction(conn => freezeParticipants('exam-demo', { departmentIds: [], includeUserIds: ['user-zhangsan'] }, conn));
    const frozen = await query<RowDataPacket[]>("SELECT user_id, source FROM exam_participants WHERE exam_id = 'exam-demo'");
    expect(frozen).toEqual([expect.objectContaining({ user_id: 'user-zhangsan', source: 'include' })]);
    await request(app).put(`/api/roles/${learnerId}/members`).set(bearer).send({ userIds: [] });
    expect(await query<RowDataPacket[]>("SELECT user_id, source FROM exam_participants WHERE exam_id = 'exam-demo'")).toEqual(frozen);
    expect((await request(app).delete(`/api/roles/${learnerId}`).set(bearer)).body.code).toBe(0);
  });

  it('导入提交时重新校验已删除或被篡改的角色', async () => {
    const valid = { row: 2, username: 'import_stale', name: '导入账号', roleId: learnerId, roleName: '培训考生', role: 'examinee', departmentName: '研发部', departmentId: 'dept-rd', email: '', password: '' };
    const stale = await request(app).post('/api/users/import/commit').set(bearer).send({ fileName: 'roles.xlsx', validRows: [valid], errors: [] });
    expect(stale.body.data).toMatchObject({ successCount: 0, failCount: 1 });
    const tampered = await request(app).post('/api/users/import/commit').set(bearer).send({ fileName: 'roles.xlsx', validRows: [{ ...valid, roleId: teacherId, roleName: '阅卷老师' }], errors: [] });
    expect(tampered.body.data).toMatchObject({ successCount: 0, failCount: 1 });
  });

  it('并发移走管理员时仍保留至少一个启用管理员', async () => {
    const another = await request(app).post('/api/users').set(bearer).send({ username: 'admin_second', name: '第二管理员', roleId: 'admin' });
    const results = await Promise.all([
      request(app).put('/api/users/user-admin').set(bearer).send({ username: 'admin', name: '系统管理员', roleId: 'author' }),
      request(app).put(`/api/users/${another.body.data.id}`).set(bearer).send({ username: 'admin_second', name: '第二管理员', roleId: 'author' }),
    ]);
    expect(results.filter(r => r.body.code === 0)).toHaveLength(1);
    const active = await query<RowDataPacket[]>("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
    expect(active).toHaveLength(1);
  });
});
