/**
 * 用户批量导入 —— 业务逻辑层（复用试题导入的 preview → commit 两段式）。
 */
import * as repo from './userImport.repo.js';
import type { UserBatchRow } from './userImport.repo.js';
import * as departmentsRepo from '../departments/departments.repo.js';
import * as usersService from './users.service.js';
import * as rolesService from '../roles/roles.service.js';
import { fileInvalid } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';
import { nowDb, fromDbDateSafe } from '../../utils/datetime.js';
import { parseJsonColumn } from '../../utils/json.js';
import { normalizePaging, buildPage } from '../../utils/pagination.js';
import { parseUserWorkbook } from '../../utils/userExcel.js';
import { getSettings } from '../settings/settings.service.js';
import type { Page, RowIssue, UserBatchDto, UserCommitResult, UserPreviewResult, UserValidRow } from '../../types/domain.js';

function mapBatchRow(row: UserBatchRow): UserBatchDto {
  return {
    id: row.id,
    fileName: row.file_name,
    totalRows: Number(row.total_rows),
    successCount: Number(row.success_count),
    failCount: Number(row.fail_count),
    errors: parseJsonColumn<RowIssue[]>(row.errors_json, []),
    operatorId: row.operator_id,
    createdAt: fromDbDateSafe(row.created_at),
  };
}

/** 构建科室名称→id 映射。 */
async function departmentMap(): Promise<Map<string, string>> {
  const deps = await departmentsRepo.list();
  return new Map(deps.map((d) => [d.name, d.id]));
}

/** 角色名称 / id → 绑定角色（id 别名用于兼容旧模板的默认角色值）。 */
async function roleMap(): Promise<Map<string, { id: string; name: string; role: UserValidRow['role'] }>> {
  const roles = await rolesService.list();
  const result = new Map<string, { id: string; name: string; role: UserValidRow['role'] }>();
  for (const definition of roles) {
    const value = { id: definition.id, name: definition.name, role: definition.baseRole };
    result.set(definition.name, value);
    result.set(definition.id, value);
  }
  return result;
}

/** 解析预览。 */
export async function preview(buffer: Buffer): Promise<UserPreviewResult> {
  const [deps, roles, settings] = await Promise.all([departmentMap(), roleMap(), getSettings()]);
  const result = await parseUserWorkbook(buffer, { departments: deps, roles, minPasswordLength: settings.minPasswordLength });
  if (result.totalRows > settings.importMaxRows) {
    throw fileInvalid(`单次导入不得超过 ${settings.importMaxRows} 行（当前共 ${result.totalRows} 行）`);
  }
  return result;
}

/**
 * 确认导入：逐行创建用户（复用 usersService.create，保证账号唯一/密码哈希/考生科室规则一致），
 * 失败行记录错误但不阻断其余行；单事务写入成功行 + 导入批次。
 */
export async function commit(
  input: { fileName: string; validRows: UserValidRow[]; errors: RowIssue[] },
  operatorId: string,
): Promise<UserCommitResult> {
  const [deps, roles] = await Promise.all([departmentMap(), roleMap()]);
  const batchId = genId('ubatch-');
  const totalRows = input.validRows.length + input.errors.length;
  const failIssues: RowIssue[] = [...input.errors];
  let successCount = 0;
  let failCount = input.errors.length;

  for (const vr of input.validRows) {
    try {
      // 服务端二次解析角色与科室（防篡改）。
      const definition = roles.get(vr.roleId);
      if (!definition || definition.name !== vr.roleName || definition.role !== vr.role) throw new Error(`角色『${vr.roleName}』不存在或角色已变更`);
      let departmentId = '';
      if (definition.role === 'examinee') {
        const id = deps.get(vr.departmentName);
        if (!id) throw new Error(`科室『${vr.departmentName}』不存在`);
        departmentId = id;
      }
      await usersService.create({
        username: vr.username,
        name: vr.name,
        roleId: definition.id,
        departmentId,
        email: vr.email,
        password: vr.password,
      }, operatorId);
      successCount += 1;
    } catch (err) {
      failCount += 1;
      failIssues.push({
        row: vr.row,
        column: '',
        value: '',
        reason: err instanceof Error ? err.message : '该行数据不合法',
      });
    }
  }

  await repo.insertBatch({
    id: batchId,
    fileName: input.fileName || '',
    totalRows,
    successCount,
    failCount,
    errors: failIssues,
    operatorId,
    createdAt: nowDb(),
  });

  return { batchId, successCount, failCount, totalRows };
}

/** 用户导入批次历史（分页）。 */
export async function listBatches(page?: number, pageSize?: number): Promise<Page<UserBatchDto>> {
  const paging = normalizePaging(page, pageSize);
  const [rows, total] = await Promise.all([repo.listBatches(paging), repo.countBatches()]);
  return buildPage(rows.map(mapBatchRow), total, paging.page, paging.pageSize);
}
