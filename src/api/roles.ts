import { del, get, post, put } from './http';
import type { Role, RoleDefinition } from '@/types';

export interface RolePayload { name: string; baseRole: Role; description: string; menuKeys?: string[] }
export const rolesApi = {
  list: (): Promise<RoleDefinition[]> => get('/roles'),
  create: (data: RolePayload): Promise<RoleDefinition> => post('/roles', data),
  update: (id: string, data: RolePayload): Promise<RoleDefinition> => put(`/roles/${id}`, data),
  remove: (id: string): Promise<null> => del(`/roles/${id}`),
  members: (id: string): Promise<string[]> => get(`/roles/${id}/members`),
  replaceMembers: (id: string, userIds: string[]): Promise<string[]> => put(`/roles/${id}/members`, { userIds }),
};
