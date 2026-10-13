/**
 * 考生首页个性化配置 —— 业务逻辑层（v2.0② 提供默认；v2.0⑥ 起支持按科室配置）。
 *
 * 快捷入口为**固定目录**（key 决定图标与跳转），科室配置只控制「启停 + 文案覆盖」；
 * 推荐练题题库由科室配置显式指定，未配置为空。
 *
 * 生效优先级（v2.0⑥）：
 *   ① 该考生所在科室的配置行（`home_dept_configs.department_id = <科室 id>`）；
 *   ② 全局默认行（`department_id = '*'`）；
 *   ③ 内置默认（全部快捷入口启用、无推荐题库）。
 *
 * **按行覆盖、不做逐项合并**：只要科室存在配置行，该行即为最终生效值（管理员在「首页配置」
 * 页保存时提交的是完整目录，因此行为可预期）；仅当科室无配置行时才整体回退到全局默认行。
 * 行内未提及的目录 key 视为「启用」，保证后续目录扩容时新入口不会静默消失。
 *
 * 安全口径：推荐题库只接受 `allow_practice = 1` 的题库（否则练题端进不去，属于死链）；
 * 解析时再次过滤，防止「配置后被关闭对外练题」留下死链。
 */
import * as repo from './home.repo.js';
import * as banksRepo from '../banks/banks.repo.js';
import * as departmentsRepo from '../departments/departments.repo.js';
import { badRequest } from '../../utils/errors.js';
import { nowDb } from '../../utils/datetime.js';
import type {
  HomeConfigOverviewDto,
  HomeDeptConfigDto,
  HomeRecommendedBankDto,
  HomeShortcutCatalogItemDto,
  HomeShortcutConfigItemDto,
  HomeShortcutDto,
} from '../../types/domain.js';

/** 全局默认行的哨兵科室 id。 */
export const GLOBAL_DEPT_ID = '*';

/** 全局默认行在管理端的展示名。 */
export const GLOBAL_DEPT_NAME = '全局默认';

/** 推荐题库数量上限。 */
export const MAX_RECOMMENDED_BANKS = 6;

/** 快捷入口目录（key / 默认文案 / 默认图标名 / 路由）。 */
export const HOME_SHORTCUT_CATALOG: ReadonlyArray<{
  key: string;
  text: string;
  desc: string;
  path: string;
  icon: string;
}> = [
  { key: 'my-exams', text: '我的考试', desc: '查看并参加本科室考试', path: '/exam/my', icon: 'AlarmClock' },
  { key: 'my-scores', text: '我的成绩', desc: '成绩明细与作答回顾', path: '/exam/scores', icon: 'TrendCharts' },
  { key: 'my-retakes', text: '我的补考', desc: '补考申请与审批进度', path: '/exam/retakes', icon: 'Refresh' },
  { key: 'notifications', text: '消息中心', desc: '系统通知与考试提醒', path: '/notifications', icon: 'Bell' },
];

/** 目录中全部合法 key。 */
const CATALOG_KEYS: readonly string[] = HOME_SHORTCUT_CATALOG.map((c) => c.key);

/** 默认快捷入口（全部启用）。 */
export function defaultShortcuts(): HomeShortcutDto[] {
  return HOME_SHORTCUT_CATALOG.map((s) => ({ ...s, enabled: true }));
}

/** 科室首页配置解析结果。 */
export interface ResolvedHomeProfile {
  shortcuts: HomeShortcutDto[];
  recommendedBanks: HomeRecommendedBankDto[];
}

/* ============================ 解析工具 ============================ */

/** JSON 列安全解析（mysql2 可能回传字符串或已解析对象）。 */
function parseJsonColumn<T>(raw: string | unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

/**
 * 规范化快捷入口配置：只保留目录内 key、去重（后者覆盖）、`text` 去空白。
 * 缺失的目录 key 由 `mergeShortcuts` 补为「启用」，保证目录扩容后新入口不会静默消失。
 */
function normalizeShortcutConfig(raw: string | unknown): HomeShortcutConfigItemDto[] {
  const parsed = parseJsonColumn<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  const map = new Map<string, HomeShortcutConfigItemDto>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const key = String((item as { key?: unknown }).key ?? '');
    if (!CATALOG_KEYS.includes(key)) continue;
    const enabled = Boolean((item as { enabled?: unknown }).enabled);
    const textRaw = (item as { text?: unknown }).text;
    const text = typeof textRaw === 'string' ? textRaw.trim() : '';
    map.set(key, text === '' ? { key, enabled } : { key, enabled, text });
  }
  return [...map.values()];
}

/** 规范化推荐题库 id 列表（去重、保序、剔空）。 */
function normalizeBankIds(raw: string | unknown): string[] {
  const parsed = parseJsonColumn<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const item of parsed) {
    const id = String(item ?? '').trim();
    if (id !== '' && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 目录 × 配置 → 最终下发给前端的快捷入口（顺序恒按目录）。 */
export function mergeShortcuts(configs: HomeShortcutConfigItemDto[]): HomeShortcutDto[] {
  const map = new Map(configs.map((c) => [c.key, c]));
  return HOME_SHORTCUT_CATALOG.map((c) => {
    const cfg = map.get(c.key);
    const text = cfg?.text?.trim();
    return {
      key: c.key,
      text: text && text !== '' ? text : c.text,
      desc: c.desc,
      path: c.path,
      icon: c.icon,
      enabled: cfg ? cfg.enabled : true,
    };
  });
}

/**
 * 题库 id 列表 → 推荐题库 DTO（保序、过滤已关闭对外练题 / 已删除的题库）。
 * @param isGlobal 全局默认行（用于生成推荐理由文案）
 */
async function resolveRecommendedBanks(
  bankIds: string[],
  isGlobal: boolean,
): Promise<HomeRecommendedBankDto[]> {
  if (bankIds.length === 0) return [];
  const rows = await banksRepo.list();
  const byId = new Map(rows.map((b) => [String(b.id), b]));
  const out: HomeRecommendedBankDto[] = [];
  for (const id of bankIds) {
    const bank = byId.get(id);
    if (!bank) continue;
    if (!Number(bank.allow_practice)) continue;
    out.push({
      bankId: id,
      bankName: String(bank.name),
      questionCount: Number(bank.question_count ?? 0),
      reason: isGlobal ? '全员推荐' : '本科室推荐',
    });
  }
  return out;
}

/** 把配置行还原为管理端 DTO（含题库与修改人详情）。 */
async function toConfigDto(
  row: repo.HomeDeptConfigRow,
  deptName: string,
  userName: string | null,
): Promise<HomeDeptConfigDto> {
  const isGlobal = row.department_id === GLOBAL_DEPT_ID;
  const shortcuts = normalizeShortcutConfig(row.shortcuts);
  const bankIds = normalizeBankIds(row.recommended_banks);
  return {
    departmentId: row.department_id,
    departmentName: isGlobal ? GLOBAL_DEPT_NAME : deptName,
    isGlobal,
    shortcuts,
    recommendedBankIds: bankIds,
    recommendedBanks: await resolveRecommendedBanks(bankIds, isGlobal),
    updatedBy: row.updated_by ?? null,
    updatedByName: userName,
    updatedAt: row.updated_at ?? null,
  };
}

/* ============================ 考生侧解析 ============================ */

/**
 * 解析某科室的首页配置：科室行 → 全局默认行 → 内置默认。
 * 科室 id 为空（未分配科室）时直接走全局默认。
 */
export async function resolveHomeProfile(departmentId: string): Promise<ResolvedHomeProfile> {
  const own = departmentId ? await repo.getDeptConfig(departmentId) : null;
  const row = own ?? (await repo.getDeptConfig(GLOBAL_DEPT_ID));
  if (!row) return { shortcuts: defaultShortcuts(), recommendedBanks: [] };

  const isGlobal = row.department_id === GLOBAL_DEPT_ID;
  const bankIds = normalizeBankIds(row.recommended_banks);
  const [shortcuts, recommendedBanks] = await Promise.all([
    Promise.resolve(mergeShortcuts(normalizeShortcutConfig(row.shortcuts))),
    resolveRecommendedBanks(bankIds, isGlobal),
  ]);
  return { shortcuts, recommendedBanks };
}

/* ============================ 管理端读写 ============================ */

/** 科室树扁平化 + 路径名（「研发部 / 前端组」），供管理端下拉选择。 */
function flattenDepartments(rows: departmentsRepo.DepartmentRow[]): Array<{ id: string; name: string }> {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard < 16) {
      parts.unshift(String(cur.name));
      cur = cur.parent_id ? byId.get(String(cur.parent_id)) : undefined;
      guard += 1;
    }
    return parts.join(' / ');
  };
  return rows.map((r) => ({ id: String(r.id), name: pathOf(String(r.id)) }));
}

/** 快捷入口固定目录（管理端勾选列表用）。 */
export function shortcutCatalog(): HomeShortcutCatalogItemDto[] {
  return HOME_SHORTCUT_CATALOG.map((c) => ({ ...c }));
}

/** 管理端「首页配置」总览。 */
export async function getConfigOverview(): Promise<HomeConfigOverviewDto> {
  const [deptRows, configRows, globalProfile] = await Promise.all([
    departmentsRepo.list(),
    repo.listDeptConfigs(),
    resolveHomeProfile(''),
  ]);

  const departments = flattenDepartments(deptRows);
  const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));
  const operatorIds = configRows.map((r) => r.updated_by ?? '').filter((v) => v !== '');
  const operators = await repo.listUserNames(operatorIds);
  const operatorMap = new Map(operators.map((u) => [u.id, u.name]));

  const configs = await Promise.all(
    configRows.map((r) =>
      toConfigDto(r, deptNameMap.get(r.department_id) ?? '已删除科室', operatorMap.get(r.updated_by ?? '') ?? null),
    ),
  );

  return {
    catalog: shortcutCatalog(),
    departments,
    configs,
    globalShortcuts: globalProfile.shortcuts,
    globalRecommendedBanks: globalProfile.recommendedBanks,
  };
}

/** 校验科室 id：'*' 或真实存在的科室。 */
async function assertDepartmentValid(departmentId: string): Promise<void> {
  if (departmentId === GLOBAL_DEPT_ID) return;
  const dept = await departmentsRepo.findById(departmentId);
  if (!dept) throw badRequest('科室不存在或已被删除');
}

/** 校验快捷入口配置：key 合法、至少保留一个启用项。 */
function assertShortcutsValid(shortcuts: HomeShortcutConfigItemDto[]): void {
  for (const s of shortcuts) {
    if (!CATALOG_KEYS.includes(s.key)) throw badRequest(`存在未知快捷入口：${s.key}`);
  }
  if (!shortcuts.some((s) => s.enabled)) throw badRequest('至少保留一个快捷入口');
}

/** 校验推荐题库：数量上限、题库存在且已开放对外练题。 */
async function assertBanksValid(bankIds: string[]): Promise<void> {
  if (bankIds.length > MAX_RECOMMENDED_BANKS) {
    throw badRequest(`推荐题库最多 ${MAX_RECOMMENDED_BANKS} 个`);
  }
  if (bankIds.length === 0) return;
  const rows = await banksRepo.list();
  const byId = new Map(rows.map((b) => [String(b.id), b]));
  for (const id of bankIds) {
    const bank = byId.get(id);
    if (!bank) throw badRequest(`题库不存在：${id}`);
    if (!Number(bank.allow_practice)) throw badRequest(`题库「${bank.name}」未开放对外练题，不能作为推荐`);
  }
}

/** 保存（新增或覆盖）某科室的首页配置。 */
export async function saveConfig(
  departmentId: string,
  input: { shortcuts: HomeShortcutConfigItemDto[]; recommendedBankIds: string[] },
  operatorId: string,
): Promise<HomeDeptConfigDto> {
  await assertDepartmentValid(departmentId);
  const shortcuts = input.shortcuts.map((s) => ({
    key: s.key,
    enabled: Boolean(s.enabled),
    ...(s.text && s.text.trim() !== '' ? { text: s.text.trim() } : {}),
  }));
  assertShortcutsValid(shortcuts);
  const bankIds = [...new Set(input.recommendedBankIds.map((v) => String(v).trim()).filter((v) => v !== ''))];
  await assertBanksValid(bankIds);

  await repo.upsertDeptConfig(departmentId, shortcuts, bankIds, operatorId, nowDb());

  const isGlobal = departmentId === GLOBAL_DEPT_ID;
  const dept = isGlobal ? null : await departmentsRepo.findById(departmentId);
  const row = await repo.getDeptConfig(departmentId);
  const operators = await repo.listUserNames([operatorId]);
  return toConfigDto(
    row ?? ({ department_id: departmentId, shortcuts: [], recommended_banks: [], updated_by: operatorId, updated_at: null } as repo.HomeDeptConfigRow),
    dept ? String(dept.name) : GLOBAL_DEPT_NAME,
    operators[0]?.name ?? null,
  );
}

/** 删除某科室配置（回到全局默认）。 */
export async function resetConfig(departmentId: string): Promise<void> {
  await assertDepartmentValid(departmentId);
  await repo.deleteDeptConfig(departmentId);
}
