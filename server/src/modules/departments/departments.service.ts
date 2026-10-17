import type { SqlExecutor } from '../../db/pool.js';
/**
 * 科室模块 —— 业务逻辑层。
 * 规则（对齐 v1.0 + v1.6③ 多级科室树）：
 *   名称必填且唯一；删除时若存在归属用户或子科室 → 1005；
 *   parent_id 允许挂到任意节点，但禁止自引用与形成环。
 * 导出两个树级联辅助：expandDepartmentIds（子树展开）、getAncestorIds（祖先链）。
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
    parentId: row.parent_id ?? null,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 归一化 parentId（空串视为顶级）。 */
function normalizeParentId(parentId: string | null | undefined): string | null {
  const v = (parentId ?? '').trim();
  return v === '' ? null : v;
}

/** 科室列表。 */
export async function list(): Promise<DepartmentDto[]> {
  const rows = await repo.list();
  return rows.map(mapRow);
}

/**
 * 校验上级科室合法性（供新建/编辑复用）。
 * @param id       当前科室 id（新建时为空）
 * @param parentId 目标上级科室 id（null 表示顶级）
 */
async function assertParentValid(id: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (id && parentId === id) {
    throw badRequest('上级科室不能是自身');
  }
  const parent = await repo.findById(parentId);
  if (!parent) throw badRequest('上级科室不存在或已被删除');

  // 防环：新上级不能是当前科室的（直接或间接）子孙
  if (id) {
    const descendants = await getDescendantIds(id);
    if (descendants.includes(parentId)) {
      throw badRequest('不能将科室挂到其下级科室下（会形成循环）');
    }
  }
}

/** 新建科室。 */
export async function create(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<DepartmentDto> {
  const name = input.name.trim();
  if (!name) throw badRequest('科室名称不能为空');
  if (await repo.findByName(name)) {
    throw conflict('科室名称已存在');
  }
  const parentId = normalizeParentId(input.parentId);
  await assertParentValid(null, parentId);

  const id = genId('dept-');
  await repo.insert({
    id,
    name,
    description: input.description?.trim() ?? '',
    parentId,
    createdAt: nowDb(),
  });
  const created = await repo.findById(id);
  return mapRow(created!);
}

/** 编辑科室。 */
export async function update(
  id: string,
  input: { name: string; description?: string; parentId?: string | null },
): Promise<DepartmentDto> {
  const name = input.name.trim();
  if (!name) throw badRequest('科室名称不能为空');
  const current = await repo.findById(id);
  if (!current) throw notFound('科室不存在或已被删除');
  const duplicate = await repo.findByName(name);
  if (duplicate && duplicate.id !== id) {
    throw conflict('科室名称已存在');
  }
  const parentId = normalizeParentId(input.parentId);
  await assertParentValid(id, parentId);

  await repo.update(id, { name, description: input.description?.trim() ?? '', parentId });
  const updated = await repo.findById(id);
  return mapRow(updated!);
}

/** 删除科室（有归属用户或子科室 → 1005）。 */
export async function remove(id: string): Promise<void> {
  const current = await repo.findById(id);
  if (!current) throw notFound('科室不存在或已被删除');
  const userCount = await countByDepartment(id);
  if (userCount > 0) {
    throw conflict('该科室下存在用户，无法删除，请先转移或删除相关用户');
  }
  const childCount = await repo.countChildren(id);
  if (childCount > 0) {
    throw conflict('该科室下存在子科室，无法删除，请先删除或转移其子科室');
  }
  await repo.remove(id);
}

/** 计算某科室的全部子孙科室 id（不含自身；BFS，防环）。 */
async function getDescendantIds(id: string, exec?: SqlExecutor): Promise<string[]> {
  const all = await repo.list(exec);
  const byParent = new Map<string, string[]>();
  for (const d of all) {
    if (!d.parent_id) continue;
    const arr = byParent.get(d.parent_id) ?? [];
    arr.push(d.id);
    byParent.set(d.parent_id, arr);
  }
  const result: string[] = [];
  const queue = [id];
  const visited = new Set<string>([id]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

/**
 * 展开科室集合：返回原集合 + 全部子孙科室 id（去重）。
 * 用于「考试参与科室按树级联授权」——选中父科室即覆盖其整棵子树。
 */
export async function expandDepartmentIds(ids: string[], exec?: SqlExecutor): Promise<string[]> {
  const result = new Set<string>(ids.filter(Boolean));
  for (const id of ids) {
    if (!id) continue;
    const descendants = await getDescendantIds(id, exec);
    for (const d of descendants) result.add(d);
  }
  return [...result];
}

/**
 * 计算某科室的祖先链（含自身，自近及远），用于考生端考试可见性判断：
 * 若考生科室或任一祖先在被考试选中的科室集合内，即视为参与。
 */
export async function getAncestorIds(departmentId: string, exec?: SqlExecutor): Promise<string[]> {
  if (!departmentId) return [];
  const all = await repo.list(exec);
  const byId = new Map(all.map((d) => [d.id, d]));
  const result: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = departmentId;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    result.push(cur);
    cur = byId.get(cur)!.parent_id ?? null;
  }
  return result;
}
