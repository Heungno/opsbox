import './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { prepareDatabase } from '../src/db';
import { deletePolicy, getPolicies, getPolicy, savePolicy } from '../src/features/policies/service';

test('정책: 새 DB에는 seeds/policy.json의 정책이 같은 순서로 들어 있다', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seeds', 'policy.json'), 'utf8')).policies;
  assert.deepEqual(getPolicies().map((p) => p.id), seed.map((p: { id: string }) => p.id));
  assert.deepEqual(getPolicy('linux-basic-default')?.items, seed.find((p: { id: string }) => p.id === 'linux-basic-default').items);
});

test('정책: 응답에 호환용 checks 목록을 넣지 않는다', () => {
  assert.equal('checks' in getPolicy('linux-basic-default')!, false);
});

test('정책: 한 건 저장은 다른 정책을 다시 쓰지 않는다', () => {
  const others = getPolicies().filter((p) => p.id !== 'linux-basic-default');
  const target = getPolicy('linux-basic-default')!;
  const position = getPolicies().findIndex((p) => p.id === target.id);
  savePolicy({ ...target, name: '이름 변경' }, target.id);
  assert.equal(getPolicy('linux-basic-default')!.name, '이름 변경');
  assert.deepEqual(getPolicies().filter((p) => p.id !== 'linux-basic-default'), others);
  assert.equal(getPolicies().findIndex((p) => p.id === 'linux-basic-default'), position, '순서 유지');
});

test('정책: 새 정책은 맨 뒤에 추가되고 id를 만든다', () => {
  const saved = savePolicy({ name: '새 WEB 정책', os: 'Linux', category: 'WEB', enabled: true, items: [] });
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.equal(getPolicies().at(-1)?.id, saved.id);
  deletePolicy(saved.id);
  assert.equal(getPolicy(saved.id), undefined);
});

test('정책: 사용자가 지운 기본 정책은 다시 시작해도 되살아나지 않는다', () => {
  deletePolicy('linux-was-default');
  prepareDatabase();
  assert.equal(getPolicy('linux-was-default'), undefined);
});
