import './index'; // 새 스키마(공통코드 등) 준비
import { DB_PATH, db, transaction } from './connection';

export { DB_PATH, db, transaction };

/*
 * 아직 새 스키마(src/db/schema.ts)로 옮기지 않은 테이블 (재구성 중: 사용자·변경 이력)
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    display_name TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

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
`);
