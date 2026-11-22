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
