/**
 * 科室模块 —— 业务逻辑层。
 * 规则（对齐 v1.0 departmentService）：名称必填且唯一；删除时若存在归属用户 → 1005 中文提示。
 */
import * as repo from './departments.repo.js';
import { countByDepartment } from '../users/users.repo.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import type { DepartmentRow } from './departments.repo.js';
import type { DepartmentDto } from '../../types/domain.js';

/** 行 → DTO。 */
function mapRow(row: DepartmentRow): DepartmentDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 科室列表。 */
export async function list(): Promise<DepartmentDto[]> {
  const rows = await repo.list();
  return rows.map(mapRow);
}

/** 新建科室。 */
export async function create(input: { name: string; description?: string }): Promise<DepartmentDto> {
  const name = input.name.trim();
  if (!name) throw badRequest('科室名称不能为空');
  if (await repo.findByName(name)) {
    throw conflict('科室名称已存在');
  }
  const id = genId('dept-');
  await repo.insert({
    id,
    name,
    description: input.description?.trim() ?? '',
    createdAt: nowDb(),
  });
  const created = await repo.findById(id);
  return mapRow(created!);
}

/** 编辑科室。 */
export async function update(
  id: string,
  input: { name: string; description?: string },
): Promise<DepartmentDto> {
  const name = input.name.trim();
  if (!name) throw badRequest('科室名称不能为空');
  const current = await repo.findById(id);
  if (!current) throw notFound('科室不存在或已被删除');
  const duplicate = await repo.findByName(name);
  if (duplicate && duplicate.id !== id) {
    throw conflict('科室名称已存在');
  }
  await repo.update(id, { name, description: input.description?.trim() ?? '' });
  const updated = await repo.findById(id);
  return mapRow(updated!);
}

/** 删除科室（有归属用户 → 1005）。 */
export async function remove(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('科室不存在或已被删除');
  const userCount = await countByDepartment(id);
  if (userCount > 0) {
    throw conflict('该科室下存在用户，无法删除，请先转移或删除相关用户');
  }
  await repo.remove(id);
}
