import './helpers/env';

import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { before, test } from 'node:test';

import { db } from '../src/db/database';
import { app } from '../src/server';
import { isDetached } from '../src/services/checkBuilder/templates';
import { getPolicies, savePolicy } from '../src/features/policies/service';
import { getTemplate, saveTemplate } from '../src/features/templates/service';
import { createServer, getServer, updateCheckConfig } from '../src/services/serverService';

/*
 * 점검 만들기 API: 준비된 점검 목록, 생성될 스크립트 미리보기, 폼 기준 다시 만들기
 */
let cookie = '';
before(async () => {
  const salt = randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)')
    .run('apiuser', 'API 사용자', salt.toString('hex'), scryptSync('pass1234', salt, 64).toString('hex'));
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'apiuser', password: 'pass1234' } });
  cookie = String(login.headers['set-cookie']).split(';')[0];
});
const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie } });

test('로그인하지 않으면 점검 만들기 API를 쓸 수 없다', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/check-builder/presets?os=Linux' })).statusCode, 401);
});

test('OS별 준비된 점검 목록을 명령과 함께 돌려준다', async () => {
  const response = await call('GET', '/api/check-builder/presets?os=Windows');
  assert.equal(response.statusCode, 200);
  const presets = response.json().data;
  assert.equal(presets.length, 8);
  assert.ok(presets.every((preset: any) => preset.os === 'Windows'));
  assert.equal((await call('GET', '/api/check-builder/presets?os=Mac')).statusCode, 400);
});

test('미리보기는 잘못된 폼 데이터에 필드별 오류를 돌려준다', async () => {
  const response = await call('POST', '/api/check-builder/preview', { os: 'Linux', role: 'BASIC', itemName: 'x', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo 1', warning: 90, critical: 80 } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.equal(response.json().errors[0].field, 'spec.warning');
});

test('미리보기는 저장하지 않고 생성될 스크립트를 돌려준다', async () => {
  const response = await call('POST', '/api/check-builder/preview', { os: 'Windows', role: 'WEB', itemName: 'Paging', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: 'windows.pagefile' } });
  assert.equal(response.statusCode, 200);
  assert.match(response.json().data.content, /^# 점검 만들기 · Paging/);
  assert.match(response.json().data.content, /OpsBoxCb1-Item-PREVIEW/);
  assert.equal((await call('POST', '/api/check-builder/preview', { os: 'Linux', role: 'NOPE', itemName: 'x', spec: {} })).statusCode, 400);
});

test('다시 만들기는 직접 편집된 생성 조각을 폼 기준으로 되돌리고 감사 로그를 남긴다', async () => {
  const policy = getPolicies().find((entry) => entry.id === 'linux-basic-default')!;
  const itemId = 'CUSTOM_API0000000000001';
  savePolicy({ ...policy, items: [...policy.items, { id: itemId, name: 'Swap', enabled: true, executor: { type: 'CHECK_BUILDER', options: { builder: { version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap' } } }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } }] } as any, policy.id);
  const templateId = `GEN-${itemId}-LINUX`;
  const current = getTemplate(templateId)!;
  saveTemplate({ ...current, content: `${current.content}\n# 수정` }, templateId);
  assert.equal(isDetached(getTemplate(templateId)!), true);

  const response = await call('POST', `/api/policies/linux-basic-default/items/${itemId}/regenerate`);
  assert.equal(response.statusCode, 200);
  assert.equal(isDetached(getTemplate(templateId)!), false);
  const audit = db.prepare("SELECT summary FROM audit_logs WHERE action = 'TEMPLATE_UPDATE' AND target_id = ?").all(templateId) as { summary: string }[];
  assert.equal(audit.length, 1);
  assert.match(audit[0].summary, /점검 만들기 스크립트 다시 만들기: Swap/);
});

test('점검 만들기 항목이 아니면 다시 만들 수 없다', async () => {
  assert.equal((await call('POST', '/api/policies/linux-basic-default/items/CPU/regenerate')).statusCode, 400);
  assert.equal((await call('POST', '/api/policies/no-such/items/CPU/regenerate')).statusCode, 404);
});

test('템플릿 목록은 생성 조각의 상태(자동 생성·직접 편집됨)를 알려 준다', async () => {
  const templateId = 'GEN-CUSTOM_API0000000000001-LINUX';
  const list = async () => (await call('GET', '/api/templates')).json().data as any[];
  assert.equal((await list()).find((entry) => entry.id === templateId).generatedState, 'GENERATED');
  assert.equal((await list()).find((entry) => entry.id === 'LINUX-PART-CPU').generatedState, undefined);
  const current = getTemplate(templateId)!;
  saveTemplate({ ...current, content: `${current.content}\n# 또 수정` }, templateId);
  assert.equal((await list()).find((entry) => entry.id === templateId).generatedState, 'DETACHED');
});

test('원격 포트 대상 목록은 서버 저장 시 호스트:포트 형식을 확인한다', () => {
  const policy = getPolicies().find((entry) => entry.id === 'linux-basic-default')!;
  const itemId = 'CUSTOM_API0000000000002';
  savePolicy({ ...policy, items: [...policy.items, { id: itemId, name: '원격 포트', enabled: true, executor: { type: 'CHECK_BUILDER', options: { builder: { version: 1, type: 'REMOTE_PORT', presetId: null } } }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } }] } as any, policy.id);
  createServer({ id: 'LNX-TARGET', name: 't', type: 'OTHER', roles: ['OTHER'], os: 'Linux', ip: '10.0.0.60', sharedPath: '', policyIds: { BASIC: 'linux-basic-default' }, processes: [], directories: [] } as any);
  const save = (targets: string) => updateCheckConfig('LNX-TARGET', { ...getServer('LNX-TARGET'), rolePolicySettings: { [itemId]: { inputs: { targets } } } } as any);
  assert.throws(() => save('db01:70000'), (error: any) => error.errors?.some((entry: any) => entry.field === `rolePolicySettings.${itemId}.inputs.targets` && /db01:70000/.test(entry.message)));
  assert.throws(() => save('no-port'), (error: any) => error.status === 400);
  save('db01:1433\n[fe80::1]:22\n10.0.0.1:443');
  assert.match(String(getServer('LNX-TARGET')!.rolePolicySettings?.[itemId]?.inputs?.targets), /db01:1433/);
});
