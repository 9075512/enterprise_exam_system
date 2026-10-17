import { describe, expect, it } from 'vitest';
import { effectiveAccessFor, effectiveStatusFor, permissionsFor, type AccessRows } from './bankAccess.service.js';
import type { BankRowWithCount } from './banks.repo.js';

function row(id: string, parentId: string | null, mode: 'inherit' | 'override', status: 'active' | 'disabled' = 'active'): BankRowWithCount {
  return {
    id, name: id, description: '', category: '未分类', allow_practice: 0,
    parent_id: parentId, sort_order: 0, status, permission_mode: mode,
    view_all: id === 'root' ? 1 : 0, include_child_departments: 1,
    created_by: 'admin', created_at: '2026-01-01 00:00:00.000', updated_at: '2026-01-01 00:00:00.000',
    question_count: 0, child_count: 0,
  } as BankRowWithCount;
}

describe('科目题库权限继承', () => {
  const rows = [row('root', null, 'override'), row('child', 'root', 'inherit'), row('leaf', 'child', 'override')];
  const access: AccessRows = {
    departments: new Map([['root', ['dept-root']], ['leaf', ['dept-leaf']]]),
    users: new Map([['root', ['user-root']], ['leaf', ['user-leaf']]]),
    editors: new Map([['root', ['author-root']], ['leaf', ['author-leaf']]]),
  };

  it('继承节点使用最近的上级 override 整组配置', () => {
    const result = effectiveAccessFor('child', rows, access);
    expect(result.sourceBankId).toBe('root');
    expect(result.viewAll).toBe(true);
    expect(result.departmentIds).toEqual(['dept-root']);
    expect(result.editorIds).toEqual(['author-root']);
  });

  it.each(['admin', 'author', 'examinee'] as const)('viewAll 允许 %s 预览', async (role) => {
    const result = await permissionsFor('root', { id: `${role}-user`, role }, rows, access);
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(role === 'admin');
  });

  it('子节点 override 完整替换继承配置', () => {
    const result = effectiveAccessFor('leaf', rows, access);
    expect(result.sourceBankId).toBe('leaf');
    expect(result.viewAll).toBe(false);
    expect(result.userIds).toEqual(['user-leaf']);
    expect(result.userIds).not.toContain('user-root');
  });

  it('任一祖先停用会让后代有效状态停用', () => {
    const disabledRows = [row('root', null, 'override', 'disabled'), row('child', 'root', 'inherit')];
    expect(effectiveStatusFor('child', disabledRows)).toBe('disabled');
  });

  it('没有 override 祖先时默认无人浏览', () => {
    const result = effectiveAccessFor('child', [row('root', null, 'inherit'), row('child', 'root', 'inherit')], access);
    expect(result.sourceBankId).toBeNull();
    expect(result.viewAll).toBe(false);
    expect(result.userIds).toEqual([]);
  });
});
