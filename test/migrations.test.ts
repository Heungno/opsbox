import './helpers/env';

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate, SCHEMA_VERSION } from '../src/db/schema';

/* 버전 1로 만든 기존 DB에 새 기본값(공통코드 auditTargets)을 넣는 마이그레이션 */
test('마이그레이션 2: 기존 DB에 auditTargets를 healthStatuses 다음에 넣고, 이미 있으면 건드리지 않는다', () => {
  const db = new DatabaseSync(':memory:');
  // 버전 1까지만 올린 DB를 흉내: 버전 1 스키마 + 공통코드 두 분류
  const v1 = new DatabaseSync(':memory:');
  migrate(v1);
  assert.equal(SCHEMA_VERSION >= 2, true);
  db.exec((v1.prepare("SELECT group_concat(sql, ';') AS sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").get() as { sql: string }).sql);
  db.exec(`
    INSERT INTO common_code_categories (category, shape, position) VALUES ('healthStatuses', 'LIST', 0), ('policyCategories', 'LIST', 1);
    INSERT INTO common_codes (category, value, label, position) VALUES ('healthStatuses', 'Healthy', '정상', 0), ('policyCategories', 'BASIC', '기본', 1);
    DELETE FROM common_code_categories WHERE category = 'auditTargets';
    PRAGMA user_version = 1;
  `);
  migrate(db);
  const categories = (db.prepare('SELECT category FROM common_code_categories ORDER BY position').all() as Array<{ category: string }>).map((row) => row.category);
  assert.deepEqual(categories, ['healthStatuses', 'auditTargets', 'policyCategories']);
  const settings = db.prepare("SELECT label FROM common_codes WHERE category = 'auditTargets' AND value = 'SETTINGS'").get() as { label: string };
  assert.equal(settings.label, '설정');
});

test('마이그레이션 2: 빈 DB(새로 만드는 중)에서는 아무것도 넣지 않는다(시드가 넣음)', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM common_code_categories').get() as { c: number }).c, 0);
});
