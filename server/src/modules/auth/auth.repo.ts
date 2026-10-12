/**
 * 鉴权模块 —— 数据访问层。
 * users 表的 SQL 统一在 users.repo 维护，此处仅做「鉴权语义」的委托导出，避免重复实现。
 */
export {
  findByUsername,
  findForLogin,
  findById,
  updatePasswordHash,
} from '../users/users.repo.js';
export type { LoginUserRow } from '../users/users.repo.js';
