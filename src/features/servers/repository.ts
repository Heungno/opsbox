import { db, transaction } from '../../db/connection';
import type { PolicyCategory } from '../policies/types';
import type { ServerRecord, ServerRole, StoredCheckConfig } from './types';

/* 서버 테이블(servers·server_roles·server_policies). 한 서버씩 읽고 씁니다. */

type ServerRow = { id: string; name: string; os: string; ip: string; result_path: string | null; enabled: number; check_config: string };

function attach(rows: ServerRow[]): ServerRecord[] {
  if (!rows.length) return [];
  const roleRows = db.prepare('SELECT server_id, role, product FROM server_roles ORDER BY server_id, position').all() as Array<{ server_id: string; role: string; product: string | null }>;
  const policyRows = db.prepare('SELECT server_id, category, policy_id FROM server_policies').all() as Array<{ server_id: string; category: PolicyCategory; policy_id: string }>;
  return rows.map((row) => {
    const roles = roleRows.filter((entry) => entry.server_id === row.id);
    return {
      id: row.id,
      name: row.name,
      os: row.os,
      ip: row.ip,
      resultPath: row.result_path,
      enabled: Boolean(row.enabled),
      roles: roles.map((entry) => entry.role as ServerRole),
      products: Object.fromEntries(roles.filter((entry) => entry.product !== null).map((entry) => [entry.role, entry.product as string])),
      policyIds: Object.fromEntries(policyRows.filter((entry) => entry.server_id === row.id).map((entry) => [entry.category, entry.policy_id])),
      checkConfig: JSON.parse(row.check_config) as StoredCheckConfig,
    };
  });
}

const SELECT = 'SELECT id, name, os, ip, result_path, enabled, check_config FROM servers';

export function listServerRecords(): ServerRecord[] {
  return attach(db.prepare(`${SELECT} ORDER BY position, id`).all() as unknown as ServerRow[]);
}

export function findServerRecord(id: string): ServerRecord | undefined {
  return attach(db.prepare(`${SELECT} WHERE id = ?`).all(id) as unknown as ServerRow[])[0];
}

/** 있으면 바꾸고(순서·만든 시각 유지), 없으면 맨 뒤에 추가합니다. 역할·정책 할당은 통째로 다시 씁니다. */
export function saveServerRecord(record: ServerRecord) {
  const now = new Date().toISOString();
  transaction(() => {
    const values = [record.name, record.os, record.ip, record.resultPath, record.enabled ? 1 : 0, JSON.stringify(record.checkConfig), now] as const;
    const updated = db.prepare('UPDATE servers SET name = ?, os = ?, ip = ?, result_path = ?, enabled = ?, check_config = ?, updated_at = ? WHERE id = ?').run(...values, record.id);
    if (!Number(updated.changes)) {
      db.prepare(`INSERT INTO servers (id, name, os, ip, result_path, enabled, check_config, updated_at, created_at, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM servers))`).run(record.id, ...values, now);
    }
    db.prepare('DELETE FROM server_roles WHERE server_id = ?').run(record.id);
    const insertRole = db.prepare('INSERT INTO server_roles (server_id, role, product, position) VALUES (?, ?, ?, ?)');
    record.roles.forEach((role, position) => insertRole.run(record.id, role, record.products[role] ?? null, position));
    db.prepare('DELETE FROM server_policies WHERE server_id = ?').run(record.id);
    const insertPolicy = db.prepare('INSERT INTO server_policies (server_id, category, policy_id) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM policies WHERE id = ?)');
    for (const [category, policyId] of Object.entries(record.policyIds)) if (policyId) insertPolicy.run(record.id, category, policyId, policyId);
  });
}

export function setServerEnabled(id: string, enabled: boolean): boolean {
  return Number(db.prepare('UPDATE servers SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, new Date().toISOString(), id).changes) > 0;
}
