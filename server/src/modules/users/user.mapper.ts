/**
 * 用户行 → DTO 映射（auth / users 模块共用，避免重复实现）。
 * - department_id 为 NULL 时映射为 ''（与前端类型一致）；
 * - departmentName 取自 JOIN departments 的科室名，无科室为 ''；
 * - created_at 经 fromDbDate 转 ISO 8601；
 * - 绝不输出 password_hash。
 */
import type { RowDataPacket } from 'mysql2/promise';
import { fromDbDateSafe } from '../../utils/datetime.js';
import type { Role, UserDto, UserStatus } from '../../types/domain.js';

/** `users` 表原始行结构（含 JOIN departments 取出的科室名）。 */
export interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: Role;
  department_id: string | null;
  department_name: string | null;
  email: string | null;
  status: UserStatus;
  /** 密码最后修改时间（v1.7③） */
  password_changed_at: string | null;
  /** 是否已开启两步验证（v1.7③） */
  two_factor_enabled: number;
  created_at: string;
}

/** 映射为对外 DTO（剔除 password_hash 与 2FA 密钥）。 */
export function mapUserRow(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? '',
    departmentName: row.department_name ?? '',
    email: row.email ?? '',
    status: row.status,
    twoFactorEnabled: Number(row.two_factor_enabled ?? 0) === 1,
    passwordChangedAt: fromDbDateSafe(row.password_changed_at),
    createdAt: fromDbDateSafe(row.created_at),
  };
}
