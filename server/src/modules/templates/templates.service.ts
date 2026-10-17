import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool.js';
import type { AudienceTemplateDto, AudienceTemplateRulesDto, PaperTemplateDto } from '../../types/domain.js';
import { fromDbDateSafe, nowDb } from '../../utils/datetime.js';
import { notFound } from '../../utils/errors.js';
import { genId } from '../../utils/id.js';

interface TemplateRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  config?: string | Record<string, unknown>;
  rules?: string | AudienceTemplateRulesDto;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function jsonValue<T>(value: string | T): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

export async function listPaperTemplates(user: { id: string; role: string }): Promise<PaperTemplateDto[]> {
  const rows = await query<TemplateRow[]>(
    `SELECT id, name, description, config, created_by, created_at, updated_at
     FROM paper_templates ${user.role === 'admin' ? '' : 'WHERE created_by = ?'} ORDER BY updated_at DESC`,
    user.role === 'admin' ? [] : [user.id],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, config: jsonValue(r.config ?? {}), createdBy: r.created_by, createdAt: fromDbDateSafe(r.created_at), updatedAt: fromDbDateSafe(r.updated_at) }));
}

export async function savePaperTemplate(id: string | null, input: { name: string; description?: string; config: Record<string, unknown> }, user: { id: string; role: string }): Promise<PaperTemplateDto> {
  const now = nowDb();
  if (id) {
    const result = await query<ResultSetHeader>(
      `UPDATE paper_templates SET name = ?, description = ?, config = ?, updated_at = ?
       WHERE id = ? AND (? = 'admin' OR created_by = ?)`,
      [input.name.trim(), input.description?.trim() ?? '', JSON.stringify(input.config), now, id, user.role, user.id],
    );
    if (!result.affectedRows) throw notFound('组卷模板不存在');
  } else {
    id = genId('ptpl-');
    await query<ResultSetHeader>(
      `INSERT INTO paper_templates (id, name, description, config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name.trim(), input.description?.trim() ?? '', JSON.stringify(input.config), user.id, now, now],
    );
  }
  return (await listPaperTemplates(user)).find((item) => item.id === id)!;
}

export async function removePaperTemplate(id: string, user: { id: string; role: string }): Promise<void> {
  const result = await query<ResultSetHeader>(`DELETE FROM paper_templates WHERE id = ? AND (? = 'admin' OR created_by = ?)`, [id, user.role, user.id]);
  if (!result.affectedRows) throw notFound('组卷模板不存在');
}

export async function listAudienceTemplates(user: { id: string; role: string }): Promise<AudienceTemplateDto[]> {
  const rows = await query<TemplateRow[]>(
    `SELECT id, name, description, rules, created_by, created_at, updated_at
     FROM audience_templates ${user.role === 'admin' ? '' : 'WHERE created_by = ?'} ORDER BY updated_at DESC`,
    user.role === 'admin' ? [] : [user.id],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, rules: jsonValue(r.rules ?? {} as AudienceTemplateRulesDto), createdBy: r.created_by, createdAt: fromDbDateSafe(r.created_at), updatedAt: fromDbDateSafe(r.updated_at) }));
}

export async function saveAudienceTemplate(id: string | null, input: { name: string; description?: string; rules: AudienceTemplateRulesDto }, user: { id: string; role: string }): Promise<AudienceTemplateDto> {
  const now = nowDb();
  if (id) {
    const result = await query<ResultSetHeader>(
      `UPDATE audience_templates SET name = ?, description = ?, rules = ?, updated_at = ?
       WHERE id = ? AND (? = 'admin' OR created_by = ?)`,
      [input.name.trim(), input.description?.trim() ?? '', JSON.stringify(input.rules), now, id, user.role, user.id],
    );
    if (!result.affectedRows) throw notFound('抽考模板不存在');
  } else {
    id = genId('atpl-');
    await query<ResultSetHeader>(
      `INSERT INTO audience_templates (id, name, description, rules, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name.trim(), input.description?.trim() ?? '', JSON.stringify(input.rules), user.id, now, now],
    );
  }
  return (await listAudienceTemplates(user)).find((item) => item.id === id)!;
}

export async function removeAudienceTemplate(id: string, user: { id: string; role: string }): Promise<void> {
  const result = await query<ResultSetHeader>(`DELETE FROM audience_templates WHERE id = ? AND (? = 'admin' OR created_by = ?)`, [id, user.role, user.id]);
  if (!result.affectedRows) throw notFound('抽考模板不存在');
}
