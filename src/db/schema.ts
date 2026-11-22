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
    shared_path TEXT NOT NULL DEFAULT '',
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
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** 스키마를 최신 버전으로 올립니다. 빈 DB(버전 0)에서 만들었으면 created: true. 트랜잭션은 부르는 쪽에서 엽니다. */
export function migrate(db: DatabaseSync): { created: boolean } {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (current > SCHEMA_VERSION) {
    throw new Error(`이 DB는 더 새 버전의 OpsBox가 만든 것입니다(DB 버전 ${current}, 이 OpsBox ${SCHEMA_VERSION}). OpsBox를 업데이트하세요.`);
  }
  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    db.exec(MIGRATIONS[version - 1]);
    db.exec(`PRAGMA user_version = ${version}`);
  }
  return { created: current === 0 };
}
