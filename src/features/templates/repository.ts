import { db, transaction } from '../../db/connection';
import type { ManagedTemplate, TemplateVersion } from './types';

/* 템플릿·이전 버전 테이블. 한 건씩 읽고 씁니다. */

export const MAX_HISTORY_PER_TEMPLATE = 50;

type TemplateRow = {
  id: string; name: string; kind: string; os: string | null; role: string | null; product: string | null; dbms: string | null; item: string | null;
  uses_query_template: number | null; enabled: number; content: string; generated: string | null; updated_at: string;
};

const COLUMNS = 'id, name, kind, os, role, product, dbms, item, uses_query_template, enabled, content, generated, updated_at';

/** 값이 없는 키는 넣지 않습니다(API 응답 모양 유지). */
function toTemplate(row: TemplateRow): ManagedTemplate {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    ...(row.os === null ? {} : { os: row.os }),
    ...(row.role === null ? {} : { role: row.role }),
    ...(row.product === null ? {} : { product: row.product }),
    ...(row.dbms === null ? {} : { dbms: row.dbms }),
    ...(row.item === null ? {} : { item: row.item }),
    ...(row.uses_query_template === null ? {} : { usesQueryTemplate: Boolean(row.uses_query_template) }),
    enabled: Boolean(row.enabled),
    content: row.content,
    updatedAt: row.updated_at,
    ...(row.generated === null ? {} : { generated: JSON.parse(row.generated) }),
  } as ManagedTemplate;
}

const params = (t: ManagedTemplate) => [
  t.name, t.kind, t.os ?? null, t.role ?? null, t.product ?? null, t.dbms ?? null, t.item ?? null,
  t.usesQueryTemplate === undefined ? null : t.usesQueryTemplate ? 1 : 0,
  t.enabled === false ? 0 : 1, t.content, t.generated ? JSON.stringify(t.generated) : null, t.updatedAt,
];

export function listTemplates(): ManagedTemplate[] {
  return (db.prepare(`SELECT ${COLUMNS} FROM templates ORDER BY position, id`).all() as unknown as TemplateRow[]).map(toTemplate);
}

export function findTemplate(id: string): ManagedTemplate | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM templates WHERE id = ?`).get(id) as unknown as TemplateRow | undefined;
  return row ? toTemplate(row) : undefined;
}

/** 있으면 내용을 바꾸고(순서 유지), 없으면 맨 뒤에 추가합니다. */
export function upsertTemplate(template: ManagedTemplate) {
  const updated = db.prepare(`UPDATE templates SET name = ?, kind = ?, os = ?, role = ?, product = ?, dbms = ?, item = ?, uses_query_template = ?, enabled = ?, content = ?, generated = ?, updated_at = ? WHERE id = ?`)
    .run(...params(template), template.id);
  if (Number(updated.changes)) return;
  db.prepare(`INSERT INTO templates (${COLUMNS}, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM templates))`)
    .run(template.id, ...params(template));
}

export function removeTemplate(id: string): boolean {
  return Number(db.prepare('DELETE FROM templates WHERE id = ?').run(id).changes) > 0;
}

/** 최신 버전부터 */
export function listVersions(templateId: string): TemplateVersion[] {
  return (db.prepare('SELECT id, saved_at, snapshot FROM template_versions WHERE template_id = ? ORDER BY saved_at DESC, rowid DESC').all(templateId) as Array<{ id: string; saved_at: string; snapshot: string }>)
    .map((row) => ({ versionId: row.id, savedAt: row.saved_at, template: JSON.parse(row.snapshot) }));
}

/** 바뀌기 전 내용을 이전 버전으로 남깁니다. 가장 최근 버전과 내용이 같으면 남기지 않고, 템플릿마다 최근 50개만 둡니다. */
export function addVersion(template: ManagedTemplate) {
  const latest = listVersions(template.id)[0];
  if (latest?.template.content === template.content) return;
  transaction(() => {
    db.prepare('INSERT INTO template_versions (id, template_id, saved_at, snapshot) VALUES (?, ?, ?, ?)')
      .run(`VER-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, template.id, new Date().toISOString(), JSON.stringify(template));
    db.prepare(`DELETE FROM template_versions WHERE template_id = ? AND id NOT IN (
      SELECT id FROM template_versions WHERE template_id = ? ORDER BY saved_at DESC, rowid DESC LIMIT ${MAX_HISTORY_PER_TEMPLATE})`).run(template.id, template.id);
  });
}
