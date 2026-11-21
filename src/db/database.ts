import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { logger } from '../logger';

/*
 * OpsBox SQLite 저장소
 *
 * - DB 파일: OPSBOX_DB_PATH 또는 data/opsbox.db
 * - 처음 실행 시(테이블이 비어 있을 때) 기존 data/*.json 파일을 DB로 옮깁니다.
 *   이후에는 DB가 원본이며 JSON 파일은 초기값(시드)으로만 쓰입니다.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
export const DB_PATH = process.env.OPSBOX_DB_PATH || path.join(DATA_DIR, 'opsbox.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS template_history (
    template_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    display_name TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    check_date TEXT,
    status TEXT,
    cpu REAL,
    memory REAL,
    disk REAL,
    file_hash TEXT NOT NULL UNIQUE,
    raw_json TEXT NOT NULL,
    backup_path TEXT,
    imported_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_check_results_server_date ON check_results (server_id, check_date DESC);
  CREATE INDEX IF NOT EXISTS idx_check_results_server_file ON check_results (server_id, file_name);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    summary TEXT NOT NULL,
    changes TEXT,
    detail TEXT,
    ip TEXT,
    request_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs (at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action, at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (username COLLATE NOCASE, at DESC);

  CREATE TABLE IF NOT EXISTS result_import_errors (
    source_path TEXT PRIMARY KEY,
    server_id TEXT,
    message TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );
`);

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/*
 * 목록형 데이터 (servers, policies, templates)
 * 각 행에 JSON 한 건을 저장하고 position으로 순서를 유지합니다.
 */
export type CollectionTable = 'servers' | 'policies' | 'templates';

export function readCollection<T>(table: CollectionTable): T[] {
  const rows = db.prepare(`SELECT data FROM ${table} ORDER BY position, id`).all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function writeCollection<T>(table: CollectionTable, items: T[], idOf: (item: T) => string) {
  transaction(() => {
    db.prepare(`DELETE FROM ${table}`).run();
    const insert = db.prepare(`INSERT INTO ${table} (id, position, data) VALUES (?, ?, ?)`);
    items.forEach((item, index) => insert.run(idOf(item), index, JSON.stringify(item)));
  });
}

/* 단일 문서형 데이터 (공통코드 등) */
export function readSetting<T>(key: string): T | undefined {
  const row = db.prepare('SELECT data FROM settings WHERE key = ?').get(key) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : undefined;
}

export function writeSetting(key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(key, JSON.stringify(value));
}

/*
 * 기존 JSON 파일 → DB 최초 이관
 */
function readJsonFile(fileName: string): unknown {
  const file = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function isEmpty(table: string) {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count === 0;
}

function seedFromJsonFiles() {
  const seeded: string[] = [];

  if (isEmpty('servers')) {
    const servers = readJsonFile('servers.json');
    if (Array.isArray(servers) && servers.length) {
      writeCollection('servers', servers, (server: any) => String(server.basicInfo?.id ?? server.id));
      seeded.push(`servers ${servers.length}건`);
    }
  }

  if (isEmpty('policies')) {
    const parsed = readJsonFile('policy.json') as any;
    const policies = Array.isArray(parsed) ? parsed : parsed?.policies;
    if (Array.isArray(policies) && policies.length) {
      writeCollection('policies', policies, (policy: any) => String(policy.id));
      seeded.push(`policies ${policies.length}건`);
    }
  }

  if (isEmpty('templates')) {
    const templates = readJsonFile('templates.json');
    if (Array.isArray(templates) && templates.length) {
      // 같은 id가 중복된 경우 뒤의 것을 버립니다 (기존 서비스 동작과 동일).
      const seen = new Set<string>();
      const unique = templates.filter((template: any) => !seen.has(template.id) && seen.add(template.id));
      writeCollection('templates', unique, (template: any) => String(template.id));
      seeded.push(`templates ${unique.length}건`);
    }
  }

  if (isEmpty('template_history')) {
    const history = readJsonFile('template-history.json') as Record<string, unknown[]> | undefined;
    if (history && typeof history === 'object') {
      const insert = db.prepare('INSERT INTO template_history (template_id, data) VALUES (?, ?)');
      transaction(() => Object.entries(history).forEach(([id, versions]) => insert.run(id, JSON.stringify(versions))));
      if (Object.keys(history).length) seeded.push(`template history ${Object.keys(history).length}건`);
    }
  }

  if (readSetting('common_codes') === undefined) {
    const codes = readJsonFile('common-codes.json');
    if (codes && typeof codes === 'object') {
      writeSetting('common_codes', codes);
      seeded.push('common codes');
    }
  }

  if (isEmpty('users')) {
    const parsed = readJsonFile('user.json') as { users?: any[] } | undefined;
    if (Array.isArray(parsed?.users) && parsed.users.length) {
      const insert = db.prepare('INSERT INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)');
      transaction(() => parsed.users!.forEach((user) => insert.run(user.username, user.displayName ?? null, user.passwordSalt, user.passwordHash)));
      seeded.push(`users ${parsed.users.length}건`);
    }
  }

  if (seeded.length) logger.info({ dbPath: DB_PATH, seeded }, 'JSON 데이터를 SQLite로 옮겼습니다');
}

/*
 * 기존 DB 업그레이드 (이미 쓰고 있는 설치본에 새 기본값 추가)
 *
 * 템플릿·정책은 DB가 비어 있을 때만 JSON에서 채우므로, 새 버전에서 추가된 기본 템플릿은
 * 기존 DB에 들어가지 않습니다. 여기서 "한 번도 넣은 적 없는" 기본 템플릿만 추가합니다.
 * - 이미 넣었던 기본 템플릿 id는 settings.builtin_template_ids 에 기록해 두므로,
 *   사용자가 지운 기본 템플릿을 다시 살리지 않습니다.
 * - 사용자가 고친 템플릿·정책은 덮어쓰지 않습니다.
 */
const BUILTIN_TEMPLATE_IDS_KEY = 'builtin_template_ids';
/** 이 기록이 생기기 전(이전 버전)에 이미 시드된 것으로 볼 템플릿을 고르는 기준: Linux 조각은 새로 추가된 것 */
const isTemplateAddedLater = (id: string) => id.startsWith('LINUX-PART-');

function addNewBuiltInTemplates(): string[] {
  const templates = readJsonFile('templates.json');
  if (!Array.isArray(templates)) return [];
  const builtInIds = templates.map((template: any) => String(template.id));
  const recorded = readSetting<string[]>(BUILTIN_TEMPLATE_IDS_KEY);
  const alreadyOffered = new Set(recorded ?? builtInIds.filter((id) => !isTemplateAddedLater(id)));
  const existing = new Set((db.prepare('SELECT id FROM templates').all() as Array<{ id: string }>).map((row) => row.id));
  const added: string[] = [];
  transaction(() => {
    let position = (db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM templates').get() as { max: number }).max;
    const insert = db.prepare('INSERT INTO templates (id, position, data) VALUES (?, ?, ?)');
    for (const template of templates as any[]) {
      const id = String(template.id);
      if (alreadyOffered.has(id) || existing.has(id)) continue;
      insert.run(id, ++position, JSON.stringify(template));
      added.push(id);
    }
  });
  writeSetting(BUILTIN_TEMPLATE_IDS_KEY, [...new Set([...alreadyOffered, ...builtInIds])]);
  return added;
}

/** Linux 기본 점검 정책에 프로세스·디렉터리·파일·포트·HTTP 항목 추가 (한 번만 실행) */
const LINUX_BASIC_ITEMS_MIGRATION = 'migration_linux_basic_items_v1';

function addLinuxBasicPolicyItems(): string[] {
  if (readSetting(LINUX_BASIC_ITEMS_MIGRATION)) return [];
  const row = db.prepare("SELECT data FROM policies WHERE id = 'linux-basic-default'").get() as { data: string } | undefined;
  const parsed = readJsonFile('policy.json') as any;
  const seedPolicy = (Array.isArray(parsed) ? parsed : parsed?.policies)?.find((policy: any) => policy.id === 'linux-basic-default');
  const added: string[] = [];
  if (row && seedPolicy) {
    const policy = JSON.parse(row.data);
    const have = new Set((policy.items ?? []).map((item: any) => item.id));
    for (const item of seedPolicy.items ?? []) {
      if (['PROCESS', 'DIRECTORY', 'FILE_SIZE', 'PORT', 'HTTP'].includes(item.id) && !have.has(item.id)) {
        policy.items = [...(policy.items ?? []), item];
        added.push(item.id);
      }
    }
    if (added.length) {
      db.prepare("UPDATE policies SET data = ? WHERE id = 'linux-basic-default'").run(JSON.stringify(policy));
    }
  }
  writeSetting(LINUX_BASIC_ITEMS_MIGRATION, { appliedAt: new Date().toISOString(), added });
  return added;
}

function applyBuiltInUpdates() {
  const templates = addNewBuiltInTemplates();
  const policyItems = addLinuxBasicPolicyItems();
  if (templates.length || policyItems.length) {
    logger.info({ templates, linuxBasicPolicyItems: policyItems }, '새 버전의 기본 템플릿·정책 항목을 추가했습니다');
  }
}

seedFromJsonFiles();
applyBuiltInUpdates();
