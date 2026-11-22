import type { DatabaseSync } from 'node:sqlite';

/*
 * DB 스키마와 버전(PRAGMA user_version)
 *
 * MIGRATIONS[i]가 버전 i+1로 올리는 SQL입니다. 새 버전이 필요하면 배열 끝에 추가하세요(앞의 것은 고치지 않음).
 * 시작할 때 현재 버전보다 뒤의 것만 차례로 실행합니다.
 */
const MIGRATIONS: string[] = [
  /* 1: 초기 스키마 */ `
  CREATE TABLE common_code_categories (
    category TEXT PRIMARY KEY,
    shape TEXT NOT NULL CHECK (shape IN ('LIST', 'GROUPS', 'META')),
    group_keys TEXT,                      -- GROUPS: 그룹 이름 목록(JSON, 순서 그대로). 코드가 없는 빈 그룹도 남깁니다
    position INTEGER NOT NULL
  );
  CREATE TABLE common_codes (
    category TEXT NOT NULL REFERENCES common_code_categories(category) ON DELETE CASCADE,
    group_key TEXT NOT NULL DEFAULT '',
    value TEXT NOT NULL,
    label TEXT,
    enabled INTEGER,
    sort_order INTEGER,
    extra TEXT,
    position INTEGER NOT NULL,
    PRIMARY KEY (category, group_key, value)
  );
  CREATE TABLE common_code_overrides (
    meta_key TEXT PRIMARY KEY,
    enabled INTEGER,
    sort_order INTEGER,
    label TEXT
  );

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    os TEXT,
    role TEXT,
    product TEXT,
    dbms TEXT,
    item TEXT,
    uses_query_template INTEGER,          -- 값이 없던 템플릿은 NULL (응답에 키를 넣지 않음)
    enabled INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    generated TEXT,                       -- 점검 만들기 생성 정보(JSON) 또는 NULL
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- 템플릿 이전 버전. 템플릿을 지워도 남깁니다(지우기 전 내용을 되살릴 수 있게) → 외래키 없음
  CREATE TABLE template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    snapshot TEXT NOT NULL
  );
  CREATE INDEX idx_template_versions_template ON template_versions (template_id, saved_at DESC);

  CREATE TABLE policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    os TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('BASIC', 'WEB', 'WAS', 'DB')),
    enabled INTEGER NOT NULL DEFAULT 1,
    items TEXT NOT NULL,                  -- PolicyItem[] (JSON)
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    os TEXT NOT NULL,
    ip TEXT NOT NULL,
    result_path TEXT,                     -- 이 서버만 다른 결과 저장 경로(대상 서버가 보는 경로), 없으면 OS별 기본값
    enabled INTEGER NOT NULL DEFAULT 1,   -- 0이면 미사용(지우지 않고 보고서는 남김)
    check_config TEXT NOT NULL,           -- 점검 설정(JSON): 프로세스·포트 목록, 항목별 입력값 등
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE server_roles (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    product TEXT,
    position INTEGER NOT NULL,
    PRIMARY KEY (server_id, role)
  );
  -- 정책을 지우면 그 정책을 쓰던 서버의 할당만 풀립니다.
  CREATE TABLE server_policies (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('BASIC', 'WEB', 'WAS', 'DB')),
    policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, category)
  );

  -- 점검 결과. 서버를 미사용으로 바꿔도 남깁니다(보고서·복원용) → server_id에 외래키 없음
  CREATE TABLE check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    check_date TEXT NOT NULL,             -- YYYY-MM-DD HH:MM:SS (결과 파일의 collectedAt)
    hostname TEXT,
    status TEXT NOT NULL CHECK (status IN ('Healthy', 'Warning', 'Critical', 'NotCollected')),
    cpu REAL,
    memory REAL,
    disk REAL,
    file_hash TEXT NOT NULL UNIQUE,       -- 원본 SHA-256 (같은 파일은 한 번만)
    raw_json TEXT NOT NULL,
    backup_path TEXT,
    imported_at TEXT NOT NULL
  );
  CREATE INDEX idx_check_results_server_date ON check_results (server_id, check_date DESC);
  CREATE INDEX idx_check_results_server_file ON check_results (server_id, file_name);

  -- 단일 설정 값 (결과 저장 경로 기본값 등). 없으면 기본값을 씁니다.
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- scripts/create-user.cjs가 OpsBox보다 먼저 같은 정의로 만들 수 있어 IF NOT EXISTS
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    display_name TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,                     -- UTC ISO 시각
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    summary TEXT NOT NULL,
    changes TEXT,                         -- 바뀐 항목(JSON)
    detail TEXT,                          -- 추가 정보(JSON)
    ip TEXT,
    request_id TEXT
  );
  CREATE INDEX idx_audit_logs_at ON audit_logs (at DESC);
  CREATE INDEX idx_audit_logs_action ON audit_logs (action, at DESC);

  CREATE TABLE result_import_errors (
    source_path TEXT PRIMARY KEY,
    server_id TEXT,
    message TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** 스키마를 최신 버전으로 올립니다. 빈 DB(버전 0)에서 만들었으면 created: true. 트랜잭션은 부르는 쪽에서 엽니다. */
export function migrate(db: DatabaseSync): { created: boolean } {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (current > SCHEMA_VERSION) {
    throw new Error(`이 DB는 더 새 버전의 OpsBox가 만든 것입니다(DB 버전 ${current}, 이 OpsBox ${SCHEMA_VERSION}). OpsBox를 업데이트하세요.`);
  }
  if (current === 0) {
    // 버전 표시가 없는데 테이블이 있으면 재구성 전 OpsBox가 만든 DB입니다.
    // (users는 scripts/create-user.cjs가 먼저 만들 수 있어 제외)
    const existing = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'users'").all() as Array<{ name: string }>).map((row) => row.name);
    if (existing.length) {
      throw new Error(`이전 버전 OpsBox가 만든 DB입니다(테이블: ${existing.slice(0, 5).join(', ')}). 이 버전에서는 열 수 없으니, DB 파일(opsbox.db, opsbox.db-wal, opsbox.db-shm)을 백업한 뒤 지우고 다시 시작하세요. 새 DB에는 기본 템플릿·정책이 다시 들어갑니다.`);
    }
  }
  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    db.exec(MIGRATIONS[version - 1]);
    db.exec(`PRAGMA user_version = ${version}`);
  }
  return { created: current === 0 };
}
