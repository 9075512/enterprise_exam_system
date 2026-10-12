/**
 * 科室模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';

/** `departments` 表原始行。 */
export interface DepartmentRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

const COLUMNS = 'id, name, description, created_at';

/** 全部科室（按 created_at 升序）。 */
export async function list(): Promise<DepartmentRow[]> {
  return query<DepartmentRow[]>(`SELECT ${COLUMNS} FROM departments ORDER BY created_at ASC`);
}

/** 按 id 查询。 */
export async function findById(id: string): Promise<DepartmentRow | null> {
  const rows = await query<DepartmentRow[]>(`SELECT ${COLUMNS} FROM departments WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** 按名称查询（唯一性检查）。 */
export async function findByName(name: string): Promise<DepartmentRow | null> {
  const rows = await query<DepartmentRow[]>(
    `SELECT ${COLUMNS} FROM departments WHERE name = ? LIMIT 1`,
    [name],
  );
  return rows[0] ?? null;
}

/** 插入科室。 */
export async function insert(row: {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO departments (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
    [row.id, row.name, row.description, row.createdAt],
  );
}

/** 更新科室。 */
export async function update(id: string, row: { name: string; description: string }): Promise<void> {
  await query<RowDataPacket[]>(`UPDATE departments SET name = ?, description = ? WHERE id = ?`, [
    row.name,
    row.description,
    id,
  ]);
}

/** 删除科室。 */
export async function remove(id: string): Promise<void> {
  await query<RowDataPacket[]>(`DELETE FROM departments WHERE id = ?`, [id]);
}
