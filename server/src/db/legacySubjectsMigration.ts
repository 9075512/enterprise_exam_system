import type mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';

export async function migrateLegacySubjects(conn: mysql.Connection, changes: string[]): Promise<void> {
  const [subjects] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, name, parent_id, sort_order, status, created_at, updated_at FROM subjects ORDER BY created_at, id`,
  );
  const [banksBefore] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT b.id, b.name, b.category, b.parent_id, b.allow_practice, b.created_by,
            (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id) AS question_count
       FROM question_banks b`,
  );
  const report: Record<string, unknown> = {
    migrationKey: 'subject-to-bank-tree-v1',
    matched: [] as unknown[],
    createdDirectories: [] as unknown[],
    categoryDirectories: [] as unknown[],
    conflicts: [] as unknown[],
    unresolvedGrants: [] as unknown[],
    generatedAt: new Date().toISOString(),
  };
  const matched = report.matched as Array<Record<string, unknown>>;
  const createdDirectories = report.createdDirectories as Array<Record<string, unknown>>;
  const conflicts = report.conflicts as Array<Record<string, unknown>>;
  const byParent = new Map<string, string[]>();
  for (const subject of subjects) {
    if (!subject.parent_id) continue;
    const ids = byParent.get(String(subject.parent_id)) ?? [];
    ids.push(String(subject.id));
    byParent.set(String(subject.parent_id), ids);
  }
  const bankBySubject = new Map<string, string>();
  const claimedBankIds = new Set<string>();
  for (const subject of subjects) {
    const subjectId = String(subject.id);
    const candidates = banksBefore.filter((b) => String(b.created_by) !== 'legacy-migration' && String(b.name) === String(subject.name));
    const isLeaf = !(byParent.get(subjectId)?.length);
    const candidateId = candidates.length === 1 ? String(candidates[0].id) : '';
    const reusable = isLeaf && candidates.length === 1 && !claimedBankIds.has(candidateId);
    if (reusable) {
      bankBySubject.set(subjectId, candidateId);
      claimedBankIds.add(candidateId);
      matched.push({ subjectId, bankId: candidateId, name: String(subject.name) });
      continue;
    }
    if (candidates.length > 1) {
      conflicts.push({ subjectId, name: String(subject.name), bankIds: candidates.map((b) => String(b.id)) });
    } else if (isLeaf && candidateId && claimedBankIds.has(candidateId)) {
      conflicts.push({ subjectId, name: String(subject.name), bankIds: [candidateId], reason: 'bank-already-matched' });
    }
    const stableId = `legacy-${subjectId}`.slice(0, 64);
    await conn.query(
      `INSERT IGNORE INTO question_banks
        (id, name, description, category, allow_practice, parent_id, sort_order, status,
         permission_mode, view_all, include_child_departments, created_by, created_at, updated_at)
       VALUES (?, ?, '', 'legacy', 0, NULL, ?, ?, 'inherit', 0, 1, 'legacy-migration', ?, ?)`,
      [stableId, String(subject.name), Number(subject.sort_order ?? 0), String(subject.status ?? 'active'), subject.created_at, subject.updated_at],
    );
    bankBySubject.set(subjectId, stableId);
    createdDirectories.push({ subjectId, bankId: stableId, name: String(subject.name), reason: isLeaf ? 'unmatched-leaf' : 'directory' });
  }
  for (const subject of subjects) {
    const bankId = bankBySubject.get(String(subject.id));
    const parentBankId = subject.parent_id ? bankBySubject.get(String(subject.parent_id)) ?? null : null;
    if (!bankId) continue;
    await conn.query(
      `UPDATE question_banks SET parent_id = ?, sort_order = ?, status = ?, updated_at = GREATEST(updated_at, ?)
        WHERE id = ?`,
      [parentBankId, Number(subject.sort_order ?? 0), String(subject.status ?? 'active'), subject.updated_at, bankId],
    );
  }

  // 老题库未匹配科目时，按历史 category 生成根目录归组；无法判断的保留根级并写报告。
  const usedBanks = new Set(bankBySubject.values());
  const categoryDirectories = report.categoryDirectories as Array<Record<string, unknown>>;
  for (const bank of banksBefore) {
    const bankId = String(bank.id);
    // 迁移器自己生成的目录不能再次按 category 归组，否则重复执行时会产生目录套目录，
    // 极端情况下还会尝试把 legacy 分类目录挂到自身。
    if (usedBanks.has(bankId) || bank.parent_id || String(bank.created_by) === 'legacy-migration') continue;
    const category = String(bank.category ?? '').trim();
    if (!category || category === '未分类') {
      conflicts.push({ bankId, name: String(bank.name), reason: 'no-subject-or-category' });
      continue;
    }
    const hash = createHash('sha1').update(category).digest('hex').slice(0, 24);
    const dirId = `legacy-category-${hash}`;
    await conn.query(
      `INSERT IGNORE INTO question_banks
        (id, name, description, category, allow_practice, parent_id, sort_order, status,
         permission_mode, view_all, include_child_departments, created_by, created_at, updated_at)
       VALUES (?, ?, '', 'legacy', 0, NULL, 0, 'active', 'inherit', 0, 1, 'legacy-migration', NOW(3), NOW(3))`,
      [dirId, category],
    );
    await conn.query(`UPDATE question_banks SET parent_id = ? WHERE id = ? AND parent_id IS NULL`, [dirId, bankId]);
    categoryDirectories.push({ category, bankId: dirId, childBankId: bankId });
  }

  // 迁移旧数据时保留既有权限语义：已有编辑人继续可编辑；旧开放练题库视为全员可浏览。
  await conn.query(`UPDATE question_banks b SET b.permission_mode = 'override'
    WHERE b.permission_mode = 'inherit' AND (b.allow_practice = 1 OR EXISTS (SELECT 1 FROM bank_authors ba WHERE ba.bank_id = b.id))`);
  await conn.query(`UPDATE question_banks SET view_all = 1 WHERE allow_practice = 1 AND permission_mode = 'override'`);

  // 将旧 grants 的最终结果展开为具体用户；deny 会在旧算法中扣除。
  const [users] = await conn.query<mysql.RowDataPacket[]>(`SELECT id, role, department_id, position_id FROM users`);
  const [memberships] = await conn.query<mysql.RowDataPacket[]>(`SELECT group_id, user_id FROM user_group_members`);
  const groupsByUser = new Map<string, Set<string>>();
  for (const row of memberships) {
    const set = groupsByUser.get(String(row.user_id)) ?? new Set<string>();
    set.add(String(row.group_id)); groupsByUser.set(String(row.user_id), set);
  }
  const [grants] = await conn.query<mysql.RowDataPacket[]>(`SELECT subject_id, principal_type, principal_id, effect, can_view, can_edit FROM subject_grants`);
  const unresolvedGrants = report.unresolvedGrants as Array<Record<string, unknown>>;
  for (const grant of grants) {
    const type = String(grant.principal_type);
    const id = String(grant.principal_id);
    const matchedUser = users.some((user) => {
      if (type === 'user') return String(user.id) === id;
      if (type === 'role') return String(user.role) === id;
      if (type === 'position') return String(user.position_id ?? '') === id;
      if (type === 'group') return groupsByUser.get(String(user.id))?.has(id) === true;
      return false;
    });
    if (!matchedUser) unresolvedGrants.push({
      subjectId: String(grant.subject_id), principalType: type, principalId: id,
      effect: String(grant.effect), reason: 'no-active-user-resolved',
    });
  }
  const subjectParent = new Map(subjects.map((s) => [String(s.id), s.parent_id ? String(s.parent_id) : null]));
  const hasPermission = (user: mysql.RowDataPacket, subjectId: string, action: 'view' | 'edit'): boolean => {
    const lineage: string[] = []; let cursor: string | null = subjectId; const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) { seen.add(cursor); lineage.push(cursor); cursor = subjectParent.get(cursor) ?? null; }
    const principals = new Set([`role:${String(user.role)}`, `user:${String(user.id)}`]);
    if (user.position_id) principals.add(`position:${String(user.position_id)}`);
    for (const gid of groupsByUser.get(String(user.id)) ?? []) principals.add(`group:${gid}`);
    const applies = (g: mysql.RowDataPacket) => Boolean(Number(action === 'view' ? g.can_view : g.can_edit));
    if (grants.some((g) => lineage.includes(String(g.subject_id)) && String(g.principal_type) === 'user' && String(g.principal_id) === String(user.id) && String(g.effect) === 'deny' && applies(g))) return false;
    for (const sid of lineage) {
      const level = grants.filter((g) => String(g.subject_id) === sid && applies(g) && principals.has(`${String(g.principal_type)}:${String(g.principal_id)}`));
      if (level.some((g) => String(g.principal_type) === 'user' && String(g.effect) === 'allow')) return true;
      if (level.some((g) => String(g.effect) === 'deny')) return false;
      if (level.some((g) => String(g.effect) === 'allow')) return true;
    }
    return false;
  };
  for (const subject of subjects) {
    const bankId = bankBySubject.get(String(subject.id));
    if (!bankId) continue;
    const viewers = users.filter((u) => hasPermission(u, String(subject.id), 'view'));
    const editors = users.filter((u) => (String(u.role) === 'author' || String(u.role) === 'admin') && hasPermission(u, String(subject.id), 'edit'));
    if (viewers.length || editors.length) await conn.query(`UPDATE question_banks SET permission_mode = 'override' WHERE id = ?`, [bankId]);
    for (const user of viewers) await conn.query(`INSERT IGNORE INTO bank_view_users (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, String(user.id)]);
    for (const user of editors) if (String(user.role) === 'author') await conn.query(`INSERT IGNORE INTO bank_authors (bank_id, user_id, created_at) VALUES (?, ?, NOW(3))`, [bankId, String(user.id)]);
  }

  await conn.query(
    `INSERT INTO bank_tree_migration_reports (migration_key, report_json, updated_at) VALUES ('subject-to-bank-tree-v1', ?, NOW(3))
     ON DUPLICATE KEY UPDATE report_json = VALUES(report_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify(report)],
  );
  if (subjects.length > 0) changes.push('legacy subjects -> question_banks tree (idempotent)');
}
