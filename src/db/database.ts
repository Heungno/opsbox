import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../shared/logger';
import './index'; // 새 스키마(공통코드 등) 준비
import { DB_PATH, db, transaction } from './connection';

export { DB_PATH, db, transaction };

/*
 * OpsBox 테이블·시드 (재구성 중: 기능별로 src/db/schema.ts·seed.ts로 옮겨 가는 중)
 *
 * - 테이블이 비어 있으면 seeds/*.json 으로 채웁니다.
 */

const SEED_DIR = path.join(process.cwd(), 'seeds');
/** Codespaces 설정(.devcontainer/setup.cjs)이 만드는 servers.json·user.json (재구성 중 임시, Task 7에서 정리) */
const DATA_DIR = path.join(process.cwd(), 'data');

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
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

/*
 * 목록형 데이터 (servers)
 * 각 행에 JSON 한 건을 저장하고 position으로 순서를 유지합니다.
 */
export type CollectionTable = 'servers';

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
  const file = path.join(['servers.json', 'user.json'].includes(fileName) ? DATA_DIR : SEED_DIR, fileName);
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

seedFromJsonFiles();
