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
  assert.match(template('LINUX-PART-SAVE').content, /\$\{database_check_json:-null\}/);
});

test('이전 버전(v2) SAVE 조각도 새 기본값으로 바뀐다', () => {
  setContent('LINUX-PART-SAVE', fs.readFileSync(path.join(__dirname, 'helpers', 'linux-save-v2.sh'), 'utf8'));
  applyBuiltInUpdates();
  assert.match(template('LINUX-PART-SAVE').content, /\$\{database_check_json:-null\}/);
});

test('이전 버전 Linux DB 실행기는 상태 규칙을 지원하는 새 기본값으로 바뀐다', () => {
  setContent('LINUX-PART-DB_QUERY_RUNNER', fs.readFileSync(path.join(__dirname, 'helpers', 'linux-db-runner-v1.sh'), 'utf8'));
  applyBuiltInUpdates();
  assert.match(template('LINUX-PART-DB_QUERY_RUNNER').content, /@opsbox-status/);
});

test('이전 버전 Windows 조각은 PowerShell 3.0 호환 새 기본값으로 바뀐다', () => {
  const old: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, 'helpers', 'windows-parts-ps5-v1.json'), 'utf8'));
  for (const [id, content] of Object.entries(old)) setContent(id, content);
  applyBuiltInUpdates();
  assert.match(template('WINDOWS-PART-START').content, /PSVersion\.Major -lt 3/);
  for (const id of Object.keys(old)) {
    assert.doesNotMatch(template(id).content, /::new\(|\s-in\s/, `${id}: PS 3.0 호환이 아닌 문법이 남아 있음`);
  }
});

test('기본 Windows 조각은 PS 5 전용 ::new()와, PS 2.0에서 버전 안내 전에 문법 오류를 내는 -in 등을 쓰지 않는다', () => {
  const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'templates.json'), 'utf8'));
  for (const seed of seeds.filter((t: any) => t.os === 'Windows')) {
    assert.doesNotMatch(seed.content, /::new\(|\s-(not)?in\s|^\s*class\s|^\s*using\s/m, `${seed.id}`);
  }
});

test('이전 버전 Windows SAVE 조각은 기본 사용자 항목 상태를 종합에 넣는 새 기본값으로 바뀐다', () => {
  setContent('WINDOWS-PART-SAVE', fs.readFileSync(path.join(__dirname, 'helpers', 'windows-save-v1.ps1'), 'utf8'));
  applyBuiltInUpdates();
  const content = template('WINDOWS-PART-SAVE').content;
  assert.match(content, /\$basicPolicyStatuses = @\(\$basicPolicyOutput \| ForEach-Object \{ \$_\.status \}\)/);
  assert.match(content, /\+ \$rolePolicyStatuses \+ \$basicPolicyStatuses/);
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
