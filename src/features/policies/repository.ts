import { db } from '../../db/connection';
import type { Policy } from './types';

/* 점검 정책 테이블. 한 건씩 읽고 씁니다. 점검 항목(items)은 화면에서 통째로 다루므로 JSON 열 하나에 둡니다. */

type PolicyRow = { id: string; name: string; os: string; category: Policy['category']; enabled: number; items: string };

const toPolicy = (row: PolicyRow): Policy => ({ id: row.id, name: row.name, os: row.os, category: row.category, enabled: Boolean(row.enabled), items: JSON.parse(row.items) });

export function listPolicies(): Policy[] {
  return (db.prepare('SELECT id, name, os, category, enabled, items FROM policies ORDER BY position, id').all() as unknown as PolicyRow[]).map(toPolicy);
}

export function findPolicy(id: string): Policy | undefined {
  const row = db.prepare('SELECT id, name, os, category, enabled, items FROM policies WHERE id = ?').get(id) as unknown as PolicyRow | undefined;
  return row ? toPolicy(row) : undefined;
}

/** 있으면 바꾸고(순서 유지), 없으면 맨 뒤에 추가합니다. */
export function upsertPolicy(policy: Policy) {
  const now = new Date().toISOString();
  const values = [policy.name, policy.os, policy.category, policy.enabled ? 1 : 0, JSON.stringify(policy.items), now] as const;
  const updated = db.prepare('UPDATE policies SET name = ?, os = ?, category = ?, enabled = ?, items = ?, updated_at = ? WHERE id = ?').run(...values, policy.id);
  if (Number(updated.changes)) return;
  db.prepare('INSERT INTO policies (id, name, os, category, enabled, items, updated_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM policies))')
    .run(policy.id, ...values);
}

export function removePolicy(id: string): boolean {
  return Number(db.prepare('DELETE FROM policies WHERE id = ?').run(id).changes) > 0;
}
