import './helpers/env';

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { db, prepareDatabase, transaction } from '../src/db';
import { migrate, SCHEMA_VERSION } from '../src/db/schema';
import { upgradeSeeds } from '../src/db/seed';
import { fromTables } from '../src/features/common-codes/codec';
import { readTables, replaceTables } from '../src/features/common-codes/repository';
import { findPolicy, upsertPolicy } from '../src/features/policies/repository';
import { findTemplate, removeTemplate, upsertTemplate } from '../src/features/templates/repository';

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

/* 버전 3: 기존 DB(버전 2)에 명령 템플릿 기본값을 더하는 업그레이드. 모듈 DB(test 환경의 임시 DB)를 버전 2처럼 되돌려 prepareDatabase를 다시 실행 */
function downgradeToVersion2() {
  transaction(() => {
    removeTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS');
    removeTemplate('LINUX-PART-COMMAND_RUNNER');
    removeTemplate('WINDOWS-PART-COMMAND_RUNNER');
    for (const id of ['linux-was-default', 'windows-was-default']) {
      const policy = findPolicy(id)!;
      upsertPolicy({ ...policy, items: policy.items.filter((item) => item.id !== 'WAS_ENGINE_STATUS') });
    }
    const tables = readTables();
    tables.rows = tables.rows.filter((row) => !(row.category === 'templateKinds' && row.value === 'COMMAND') && !(row.category === 'scriptItems' && ['WAS_ENGINE_STATUS', 'COMMAND_RUNNER'].includes(row.value))
      && !(row.category === 'rolePolicies' && row.value === 'WAS_ENGINE_STATUS'));
    replaceTables(tables);
    db.exec('PRAGMA user_version = 2');
  });
}

test('버전 3: 기존 DB에 명령 템플릿·WAS 엔진 상태를 더하고, 사용자가 고친 같은 ID 템플릿은 그대로', () => {
  const jeus = findTemplate('JEUS6-COMMAND-WAS_ENGINE_STATUS')!;
  upsertTemplate({ ...jeus, content: '# 내가 고침' });
  downgradeToVersion2();
  assert.equal(findTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS'), undefined);
  prepareDatabase();
  assert.equal(findTemplate('JEUS6-COMMAND-WAS_ENGINE_STATUS')!.content, '# 내가 고침');
  assert.equal(findTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS')!.kind, 'COMMAND');
  assert.equal(findPolicy('linux-was-default')!.items[0].id, 'WAS_ENGINE_STATUS');
  assert.equal(findPolicy('windows-was-default')!.items[0].id, 'WAS_ENGINE_STATUS');
  const codes = fromTables(readTables());
  assert.ok((codes.templateKinds as Array<{ value: string }>).some((c) => c.value === 'COMMAND'));
  assert.ok((codes.scriptItems as Array<{ value: string }>).some((c) => c.value === 'WAS_ENGINE_STATUS'));
  assert.ok((codes.scriptItems as Array<{ value: string }>).some((c) => c.value === 'COMMAND_RUNNER'));
  assert.equal(findTemplate('LINUX-PART-COMMAND_RUNNER')!.item, 'COMMAND_RUNNER');
  assert.equal(findTemplate('WINDOWS-PART-COMMAND_RUNNER')!.os, 'Windows');
  assert.ok((codes.rolePolicies as Record<string, string[]>).WAS.includes('WAS_ENGINE_STATUS'));
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
});

test('버전 3: 두 번 올려도 항목이 겹치지 않는다', () => {
  upgradeSeeds(2);
  upgradeSeeds(2);
  const ids = findPolicy('linux-was-default')!.items.map((item) => item.id);
  assert.equal(ids.filter((id) => id === 'WAS_ENGINE_STATUS').length, 1);
  const codes = fromTables(readTables());
  assert.equal((codes.rolePolicies as Record<string, string[]>).WAS.filter((id) => id === 'WAS_ENGINE_STATUS').length, 1);
  assert.equal((codes.scriptItems as Array<{ value: string }>).filter((c) => c.value === 'WAS_ENGINE_STATUS').length, 1);
});
