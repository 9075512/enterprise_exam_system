/**
 * 科室模块 —— 数据访问层（SQL 集中在此，参数化查询防注入）。
 * v1.6③ 起支持多级科室树（parent_id 自引用）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { query, runQuery, type SqlExecutor } from '../../db/pool.js';

/** `departments` 表原始行。 */
export interface DepartmentRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  created_at: string;
}

const COLUMNS = 'id, name, description, parent_id, created_at';

/** 全部科室（按 created_at 升序）。 */
export async function list(exec?: SqlExecutor): Promise<DepartmentRow[]> {
  return runQuery<DepartmentRow[]>(exec, `SELECT ${COLUMNS} FROM departments ORDER BY created_at ASC`);
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

/** 统计某科室下的直接子科室数（删除前校验）。 */
export async function countChildren(parentId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM departments WHERE parent_id = ?`,
    [parentId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** 插入科室。 */
export async function insert(row: {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  createdAt: string;
}): Promise<void> {
  await query<RowDataPacket[]>(
    `INSERT INTO departments (id, name, description, parent_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.name, row.description, row.parentId, row.createdAt],
  );
}

/** 更新科室。 */
export async function update(
  id: string,
  row: { name: string; description: string; parentId: string | null },
): Promise<void> {
  await query<RowDataPacket[]>(
    `UPDATE departments SET name = ?, description = ?, parent_id = ? WHERE id = ?`,
    [row.name, row.description, row.parentId, id],
  );
}

/** 删除科室。 */
export async function remove(id: string): Promise<void> {
  await query<RowDataPacket[]>(`DELETE FROM departments WHERE id = ?`, [id]);
}
