import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, query, closePool } from '../db/pool.js';
import { prepareTestDb } from './db.js';
import { migrateRoles } from '../db/rolesMigration.js';
import { parseJsonColumn } from '../utils/json.js';

describe('用户组到角色增量迁移', () => {
  beforeAll(prepareTestDb, 30000);
  afterAll(closePool);

  it('升级旧字段、保留基础身份、圈选名单与包含拒绝规则的数据授权', async () => {
    const conn = await pool.getConnection();
    try {
      await conn.query('ALTER TABLE users DROP FOREIGN KEY fk_users_role');
      await conn.query('ALTER TABLE users DROP COLUMN role_id');
      await conn.query("ALTER TABLE menu_permissions MODIFY role ENUM('admin','author','examinee') NOT NULL");
      await conn.query("UPDATE menu_permissions SET menu_keys = ? WHERE role = 'admin'", [JSON.stringify(['users', 'org-extensions', 'settings', 'permissions'])]);
      await conn.query("INSERT INTO menu_overrides (user_id, menu_key, effect, updated_at) VALUES ('user-admin', 'org-extensions', 'deny', NOW(3))");
      await conn.query("UPDATE users SET status = 'disabled' WHERE id = 'user-lisi'");
      for (const [id, role] of [['legacy-exams', 'examinee'], ['legacy-authors', 'author']]) {
        await conn.query(`INSERT INTO user_groups (id, name, role, description, created_at, updated_at) VALUES (?, ?, ?, '', NOW(3), NOW(3))`, [id, id, role]);
      }
      await conn.query(`INSERT INTO user_group_members (group_id, user_id, created_at) VALUES
        ('legacy-exams', 'user-zhangsan', NOW(3)), ('legacy-exams', 'user-lisi', NOW(3)), ('legacy-authors', 'user-author', NOW(3))`);
      await conn.query(`INSERT INTO subjects (id, name, created_at, updated_at) VALUES ('old-subject', '旧授权科目', NOW(3), NOW(3))`);
      await conn.query(`INSERT INTO subject_grants (id, subject_id, principal_type, principal_id, effect, can_view, can_edit, created_at, updated_at) VALUES
        ('grant-exams', 'old-subject', 'group', 'legacy-exams', 'allow', 1, 0, NOW(3), NOW(3)),
        ('grant-author', 'old-subject', 'group', 'legacy-authors', 'allow', 1, 1, NOW(3), NOW(3)),
        ('grant-deny', 'old-subject', 'user', 'user-zhangsan', 'deny', 1, 0, NOW(3), NOW(3))`);
      await conn.query(`INSERT INTO audience_templates (id, name, description, rules, created_by, created_at, updated_at)
        VALUES ('old-audience', '旧组模板', '', ?, 'user-admin', NOW(3), NOW(3))`, [JSON.stringify({
        departmentIds: [], groupIds: ['legacy-exams'], positionIds: [], includeUserIds: ['user-wangwu'],
        excludeUserIds: ['user-lisi'], includeSubDepartments: true, randomCount: 2,
      })]);
      await migrateRoles(conn);
      const [users] = await conn.query<RowDataPacket[]>('SELECT role, role_id FROM users');
      expect(users.every(u => u.role_id === u.role)).toBe(true);
      const [template] = await conn.query<RowDataPacket[]>("SELECT rules FROM audience_templates WHERE id = 'old-audience'");
      const rules = parseJsonColumn<Record<string, unknown>>(template[0].rules, {});
      expect(rules).not.toHaveProperty('groupIds');
      expect(rules).toMatchObject({ roleIds: [], includeUserIds: expect.arrayContaining(['user-zhangsan', 'user-lisi', 'user-wangwu']), excludeUserIds: ['user-lisi'], randomCount: 2 });
      const [permissions] = await conn.query<RowDataPacket[]>("SELECT menu_keys FROM menu_permissions WHERE role = 'admin'");
      expect(parseJsonColumn(permissions[0].menu_keys, [])).toEqual(['users', 'roles', 'positions', 'settings', 'permissions']);
      const [overrides] = await conn.query<RowDataPacket[]>("SELECT menu_key, effect FROM menu_overrides WHERE user_id = 'user-admin'");
      expect(overrides).toEqual([expect.objectContaining({ menu_key: 'positions', effect: 'deny' })]);
      const [viewers] = await conn.query<RowDataPacket[]>("SELECT user_id FROM bank_view_users WHERE bank_id = 'legacy-old-subject'");
      expect(viewers.map(u => u.user_id).sort()).toEqual(['user-author', 'user-lisi']);
      const [authors] = await conn.query<RowDataPacket[]>("SELECT user_id FROM bank_authors WHERE bank_id = 'legacy-old-subject'");
      expect(authors.map(u => u.user_id)).toEqual(['user-author']);
      const [historicalGroups] = await conn.query<RowDataPacket[]>('SELECT id FROM user_groups');
      expect(historicalGroups).toHaveLength(2);
    } finally { conn.release(); }
  });

  it('重复迁移不覆盖自定义角色、菜单和已展开名单，不重新套用历史组权限', async () => {
    const conn = await pool.getConnection();
    try {
      await conn.query(`INSERT INTO roles (id, name, base_role, description, is_builtin, created_at, updated_at)
        VALUES ('custom-role', '自定义出题人', 'author', '保留配置', 0, NOW(3), NOW(3))`);
      await conn.query("UPDATE users SET role_id = 'custom-role' WHERE id = 'user-author'");
      await conn.query("UPDATE menu_permissions SET menu_keys = '[\"reviews\"]' WHERE role = 'author'");
      await conn.query("INSERT INTO user_group_members (group_id, user_id, created_at) VALUES ('legacy-exams', 'user-wangwu', NOW(3))");
      const [before] = await conn.query<RowDataPacket[]>("SELECT rules FROM audience_templates WHERE id = 'old-audience'");
      await migrateRoles(conn);
      const [after] = await conn.query<RowDataPacket[]>("SELECT rules FROM audience_templates WHERE id = 'old-audience'");
      expect(after[0].rules).toEqual(before[0].rules);
      const [user] = await conn.query<RowDataPacket[]>("SELECT role_id FROM users WHERE id = 'user-author'");
      expect(user[0].role_id).toBe('custom-role');
      const [permissions] = await conn.query<RowDataPacket[]>("SELECT menu_keys FROM menu_permissions WHERE role = 'author'");
      expect(parseJsonColumn(permissions[0].menu_keys, [])).toEqual(['reviews']);
      const viewers = await query<RowDataPacket[]>("SELECT user_id FROM bank_view_users WHERE bank_id = 'legacy-old-subject'");
      expect(viewers.map(u => u.user_id)).not.toContain('user-wangwu');
    } finally { conn.release(); }
  });
});
