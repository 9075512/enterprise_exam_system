/**
 * 侧栏菜单分组单测（v1.9 菜单归类整改的回归护栏）。
 *
 * 分组是**纯展示层**结构：本文件只断言「可见菜单 → 分组 → 渲染结构」的映射，
 * 并锁死两条易被后续改动破坏的约定：
 *   1) 分组不改变菜单 key 集合（权限三重同步不破）；
 *   2) 组内仅 1 项时视图会渲染为顶层菜单项（因此分组不得出现「空组」）。
 */
import { describe, it, expect } from 'vitest';
import {
  MENU_GROUP_DEFS,
  getDefaultKeys,
  getMenuGroups,
  getMenuItems,
  groupKeyOf,
  groupOrderOf,
  groupTextOf,
} from './menuConfig';

describe('getMenuGroups · 默认（未下发菜单权限）', () => {
  it('admin 得到 5 个分组，顺序与分组定义一致', () => {
    const groups = getMenuGroups('admin');
    expect(groups.map((g) => g.key)).toEqual(['dashboard', 'resources', 'exam-ops', 'practice-ops', 'system']);
  });

  it('admin 的全部菜单项落在已知分组内（无「其他」组）', () => {
    const groups = getMenuGroups('admin');
    const keys = groups.flatMap((g) => g.items.map((i) => i.key)).sort();
    expect(keys).toEqual([...getDefaultKeys('admin')].sort());
    expect(groups.some((g) => g.key === 'other')).toBe(false);
  });

  it('组内菜单数与归属正确（教学资源 2 / 考试运营 7 / 组织与系统 7）', () => {
    const map = Object.fromEntries(getMenuGroups('admin').map((g) => [g.key, g.items.map((i) => i.key)]));
    expect(map.resources).toEqual(['banks', 'papers']);
    expect(map['exam-ops']).toEqual([
      'exams',
      'retakes',
      'appeals',
      'reviews',
      'scores',
      'content',
      'home-config',
    ]);
    expect(map['practice-ops']).toEqual(['practice-settings']);
    expect(map.system).toEqual([
      'departments',
      'users',
      'permissions',
      'settings',
      'audit',
      'login-logs',
      'maintenance',
    ]);
  });

  it('examinee 只看到考生中心，且组内 5 项（首页 / 我的考试 / 我的成绩 / 我的补考 / 消息中心）', () => {
    const groups = getMenuGroups('examinee');
    expect(groups.map((g) => g.key)).toEqual(['examinee']);
    expect(groups[0].items.map((i) => i.key)).toEqual([
      'home',
      'my-exams',
      'my-scores',
      'my-retakes',
      'exam-messages',
    ]);
  });

  it('author 得到 教学资源(2) + 考试运营(1，仅人工阅卷)', () => {
    const groups = getMenuGroups('author');
    expect(groups.map((g) => g.key)).toEqual(['resources', 'exam-ops']);
    expect(groups[0].items.map((i) => i.key)).toEqual(['banks', 'papers']);
    expect(groups[1].items.map((i) => i.key)).toEqual(['reviews']);
  });
});

describe('getMenuGroups · 后端下发菜单权限时', () => {
  it('按授权 key 过滤，空组被丢弃（不出现只有标题的分组）', () => {
    const groups = getMenuGroups('admin', ['dashboard', 'banks', 'settings']);
    expect(groups.map((g) => g.key)).toEqual(['dashboard', 'resources', 'system']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.find((g) => g.key === 'resources')!.items.map((i) => i.key)).toEqual(['banks']);
  });

  it('授权为空数组 → 无任何分组（不渲染侧栏菜单）', () => {
    expect(getMenuGroups('admin', [])).toEqual([]);
  });

  it('授权含未知 key → 忽略且不产生空组', () => {
    const groups = getMenuGroups('admin', ['not-a-menu', 'exams']);
    expect(groups.map((g) => g.key)).toEqual(['exam-ops']);
  });
});

describe('分组元数据辅助函数', () => {
  it('groupKeyOf：每个合法菜单 key 都能解析到真实分组', () => {
    for (const item of getMenuItems('admin')) {
      expect(MENU_GROUP_DEFS.some((g) => g.key === groupKeyOf(item.key)), item.key).toBe(true);
    }
  });

  it('groupKeyOf：未知 key → other，并被排到末位', () => {
    expect(groupKeyOf('nope')).toBe('other');
    expect(groupOrderOf('other')).toBe(MENU_GROUP_DEFS.length);
    expect(groupTextOf('other')).toBe('其他');
  });

  it('groupOrderOf 单调递增（分组展示顺序稳定）', () => {
    const orders = MENU_GROUP_DEFS.map((g) => groupOrderOf(g.key));
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('兼容性：getMenuItems 扁平结果保持不变', () => {
  it('admin 扁平菜单 key 集合与默认授权一致', () => {
    expect(getMenuItems('admin').map((i) => i.key).sort()).toEqual([...getDefaultKeys('admin')].sort());
  });

  it('每个菜单项都带 group 字段且 path 唯一', () => {
    const items = getMenuItems('admin');
    expect(items.every((i) => typeof i.group === 'string' && i.group.length > 0)).toBe(true);
    expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
  });
});
