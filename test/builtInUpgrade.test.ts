import './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { applyBuiltInUpdates, db } from '../src/db/database';

/*
 * 이미 쓰고 있는 DB 업그레이드: 예전 기본값 그대로인 템플릿만 새 기본값으로 바꾸고,
 * Linux WEB·WAS 정책에 빠진 역할별 항목을 채웁니다.
 */
const OLD_SAVE = fs.readFileSync(path.join(__dirname, 'helpers', 'linux-save-v1.sh'), 'utf8');

const template = (id: string) => JSON.parse((db.prepare('SELECT data FROM templates WHERE id = ?').get(id) as { data: string }).data);
const setContent = (id: string, content: string) => db.prepare('UPDATE templates SET data = ? WHERE id = ?').run(JSON.stringify({ ...template(id), content }), id);
const policyItems = (id: string) => JSON.parse((db.prepare('SELECT data FROM policies WHERE id = ?').get(id) as { data: string }).data).items.map((item: { id: string }) => item.id);

test('고치지 않은 예전 Linux SAVE 조각은 새 기본값으로 바뀐다', () => {
  setContent('LINUX-PART-SAVE', OLD_SAVE);
  applyBuiltInUpdates();
  assert.match(template('LINUX-PART-SAVE').content, /\$\{was_items_json:-\}/);
});

test('사용자가 고친 SAVE 조각은 그대로 둔다', () => {
  const edited = `${OLD_SAVE}\n# 사용자 수정`;
  setContent('LINUX-PART-SAVE', edited);
  applyBuiltInUpdates();
  assert.equal(template('LINUX-PART-SAVE').content, edited);
});

test('Linux WEB·WAS 정책에 빠진 역할별 항목을 한 번만 채운다', () => {
  for (const id of ['linux-web-default', 'linux-was-default']) {
    const row = db.prepare('SELECT data FROM policies WHERE id = ?').get(id) as { data: string };
    const policy = JSON.parse(row.data);
    policy.items = policy.items.slice(0, 1);
    db.prepare('UPDATE policies SET data = ? WHERE id = ?').run(JSON.stringify(policy), id);
  }
  db.prepare("DELETE FROM settings WHERE key = 'migration_linux_role_items_v1'").run();
  applyBuiltInUpdates();
  assert.deepEqual(policyItems('linux-web-default'), ['WEB_ENGINE_STATUS', 'WEB_WAS_CONNECTION', 'WEB_REQUEST_VOLUME', 'WEB_LOG']);
  assert.equal(policyItems('linux-was-default').length, 8);

  // 이미 적용한 뒤에는 사용자가 지운 항목을 다시 넣지 않음
  const row = db.prepare("SELECT data FROM policies WHERE id = 'linux-was-default'").get() as { data: string };
  const policy = JSON.parse(row.data);
  policy.items = policy.items.filter((item: { id: string }) => item.id !== 'WAS_LOG');
  db.prepare("UPDATE policies SET data = ? WHERE id = 'linux-was-default'").run(JSON.stringify(policy));
  applyBuiltInUpdates();
  assert.equal(policyItems('linux-was-default').includes('WAS_LOG'), false);
});
