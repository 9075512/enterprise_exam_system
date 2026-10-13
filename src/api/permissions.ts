/** 菜单权限 API（v1.5） */
import { get, put } from './http';
import type { MenuPermission, MyMenus } from '@/types';

/** 管理端：完整目录 + 授权（仅 admin） */
export function getMenuPermissions(): Promise<MenuPermission> {
  return get<MenuPermission>('/permissions/menus');
}

/** 管理端：整体替换授权（仅 admin） */
export function updateMenuPermissions(grants: MenuPermission['grants']): Promise<MenuPermission> {
  return put<MenuPermission>('/permissions/menus', { grants });
}

/** 当前用户可见菜单 key（任意角色，菜单渲染用） */
export function getMyMenus(): Promise<MyMenus> {
  return get<MyMenus>('/permissions/my');
}
