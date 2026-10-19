import { migrateLegacySubjects } from './legacySubjectsMigration.js';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { defaultGrants } from '../modules/permissions/menuCatalog.js';
import { parseJsonColumn } from '../utils/json.js';

export const BUILTIN_ROLES = [
  { id: 'admin', name: '管理员', description: '维护系统、组织与考试运营' },
  { id: 'author', name: '出题人', description: '维护授权题库、考试与阅卷' },
  { id: 'examinee', name: '考生', description: '参加考试与练题' },
] as const;

export async function seedBuiltinRoles(conn: Connection): Promise<void> {
  for (const role of BUILTIN_ROLES) {
    await conn.query(`INSERT IGNORE INTO roles (id, name, base_role, description, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, NOW(3), NOW(3))`, [role.id, role.name, role.id, role.description]);
    await conn.query(`INSERT IGNORE INTO menu_permissions (role, menu_keys, updated_by, updated_at)
      VALUES (?, ?, '', NOW(3))`, [role.id, JSON.stringify(defaultGrants()[role.id])]);
  }
}

/** Runs after the legacy subject -> bank permission migration, before legacy memberships are retired. */
export async function migrateRoles(conn: Connection): Promise<void> {
  const [completed] = await conn.query<RowDataPacket[]>("SELECT migration_key FROM bank_tree_migration_reports WHERE migration_key = 'roles-v1'");
  const [columns] = await conn.query<RowDataPacket[]>(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id'`);
  if (!columns.length) await conn.query('ALTER TABLE users ADD COLUMN role_id VARCHAR(64) NULL AFTER role');
  const [permissionColumn] = await conn.query<RowDataPacket[]>(`SELECT DATA_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_permissions' AND COLUMN_NAME = 'role'`);
  if (permissionColumn[0]?.DATA_TYPE === 'enum') await conn.query('ALTER TABLE menu_permissions MODIFY role VARCHAR(64) NOT NULL');
  await seedBuiltinRoles(conn);
  await conn.beginTransaction();
  try {
    if (!completed.length) await migrateLegacySubjects(conn, []);
    await conn.query('UPDATE users SET role_id = role WHERE role_id IS NULL OR role_id = \'\'');
    const [permissions] = await conn.query<RowDataPacket[]>('SELECT role, menu_keys FROM menu_permissions FOR UPDATE');
    for (const row of permissions) {
      const previous = parseJsonColumn<string[]>(row.menu_keys, []);
      if (!previous.includes('org-extensions')) continue;
      const keys = [...new Set(previous.flatMap(k => k === 'org-extensions' ? ['roles', 'positions'] : [k]))];
      await conn.query('UPDATE menu_permissions SET menu_keys = ? WHERE role = ?', [JSON.stringify(keys), row.role]);
    }
    // Preserve the former organization-menu exception for the independent positions page.
    // Role management is now an administrator-required menu and cannot inherit a denial.
    await conn.query(`INSERT IGNORE INTO menu_overrides (user_id, menu_key, effect, updated_at)
      SELECT user_id, 'positions', effect, updated_at FROM menu_overrides WHERE menu_key = 'org-extensions'`);
    await conn.query("DELETE FROM menu_overrides WHERE menu_key = 'org-extensions'");
    await conn.query("INSERT IGNORE INTO bank_tree_migration_reports (migration_key, report_json, updated_at) VALUES ('roles-v1', ?, NOW(3))", [JSON.stringify({ completedAt: new Date().toISOString(), policy: 'base-identity-and-snapshot-audiences' })]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
  const [nullable] = await conn.query<RowDataPacket[]>(`SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id'`);
  if (nullable[0]?.IS_NULLABLE === 'YES') await conn.query('ALTER TABLE users MODIFY role_id VARCHAR(64) NOT NULL');
  const [foreignKeys] = await conn.query<RowDataPacket[]>(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_role'`);
  if (!foreignKeys.length) await conn.query('ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE');
}
