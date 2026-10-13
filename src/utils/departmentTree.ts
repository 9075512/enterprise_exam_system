/**
 * 科室树工具（v1.6③ 多级科室）。
 * 从扁平的科室列表构建 el-tree-select 可用的树结构，并提供子孙计算。
 */
import type { Department } from '@/types';

/** el-tree-select 节点结构。 */
export interface DepartmentTreeNode {
  value: string;
  label: string;
  children?: DepartmentTreeNode[];
}

/** 按 parentId 分组（顶级 parentId 为 null）。 */
function groupByParent(departments: Department[]): Map<string | null, Department[]> {
  const map = new Map<string | null, Department[]>();
  for (const d of departments) {
    const key = d.parentId ?? null;
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }
  return map;
}

/** 构建科室树（根为顶级科室，子级按需嵌套）。 */
export function buildDepartmentTree(departments: Department[]): DepartmentTreeNode[] {
  const byParent = groupByParent(departments);
  const build = (parentId: string | null): DepartmentTreeNode[] => {
    const list = byParent.get(parentId) ?? [];
    return list.map((d) => {
      const children = build(d.id);
      const node: DepartmentTreeNode = { value: d.id, label: d.name };
      if (children.length > 0) node.children = children;
      return node;
    });
  };
  return build(null);
}

/** 计算某科室的全部子孙科室 id（不含自身；BFS 防环）。 */
export function getDescendantIds(departments: Department[], id: string): string[] {
  const byParent = groupByParent(departments);
  const result: string[] = [];
  const visited = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/** 科室 id → 名称映射（表格回显上级科室名等）。 */
export function buildDepartmentNameMap(departments: Department[]): Record<string, string> {
  return Object.fromEntries(departments.map((d) => [d.id, d.name]));
}
