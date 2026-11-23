import './helpers/env';

import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { before, test } from 'node:test';

import { db } from '../src/db';
import { app } from '../src/server';
import { deletePolicy, savePolicy } from '../src/features/policies/service';
import { activateServer, createServer, deactivateServer, getAllServers, getCheckConfig, getServer, updateCheckConfig } from '../src/features/servers/service';
import { deleteTemplate, getTemplate, getTemplates, saveTemplate } from '../src/features/templates/service';
import { generateScript } from '../src/features/scripts/service';

const webServer = (id: string) => ({ id, name: id, roles: ['WEB'], products: { WEB: 'Nginx' }, os: 'Linux', ip: '10.0.0.9', processes: [], directories: [] } as any);

let cookie = '';
before(async () => {
  const salt = randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)')
    .run('srvuser', '서버 테스트', salt.toString('hex'), scryptSync('pass1234', salt, 64).toString('hex'));
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'srvuser', password: 'pass1234' } });
  cookie = String(login.headers['set-cookie']).split(';')[0];
});

test('서버: 응답에 예전 호환 필드(type·product)가 없고 enabled가 있다', () => {
  const server = createServer(webServer('NEW-1'));
  assert.equal('type' in server, false);
  assert.equal('product' in server, false);
  assert.equal(getServer('NEW-1')?.enabled, true);
  assert.deepEqual(getServer('NEW-1')?.products, { WEB: 'Nginx' });
});

test('서버: 미사용으로 바꾸면 기본 목록에서 빠지고, includeInactive로는 보인다', () => {
  createServer(webServer('OFF-1'));
  deactivateServer('OFF-1');
  assert.equal(getAllServers().some((s) => s.id === 'OFF-1'), false);
  assert.equal(getAllServers({ includeInactive: true }).find((s) => s.id === 'OFF-1')?.enabled, false);
  assert.equal(getServer('OFF-1')?.enabled, false, '상세 조회는 미사용 서버도 돌려준다');
});

test('서버: 다시 사용하면 점검 설정까지 그대로 돌아온다', () => {
  createServer(webServer('OFF-2'));
  updateCheckConfig('OFF-2', { ...getCheckConfig('OFF-2'), processes: [{ name: 'nginx' }] });
  deactivateServer('OFF-2');
  activateServer('OFF-2');
  assert.deepEqual(getCheckConfig('OFF-2').processes, [{ name: 'nginx' }]);
  assert.equal(getAllServers().some((s) => s.id === 'OFF-2'), true);
});

test('서버: 미사용 서버와 같은 ID로 새로 등록하면 409와 안내 문구', () => {
  createServer(webServer('OFF-3'));
  deactivateServer('OFF-3');
  assert.throws(() => createServer(webServer('OFF-3')), (e: any) => e.status === 409 && /미사용 서버 OFF-3가 있습니다\. 서버 목록에서 \[다시 사용\]을 누르세요\./.test(e.message));
});

test('서버: 할당된 정책을 지워도 서버를 읽을 수 있고 그 역할은 정책 없음', () => {
  const policy = savePolicy({ name: '임시 WEB', os: 'Linux', category: 'WEB', enabled: true, items: [] });
  createServer({ ...webServer('POL-1'), policyIds: { WEB: policy.id } });
  assert.equal(getServer('POL-1')!.policyIds?.WEB, policy.id);
  deletePolicy(policy.id);
  assert.equal(getServer('POL-1')!.policyIds?.WEB, undefined);
  assert.doesNotThrow(() => generateScript('POL-1'));
});

test('API: DELETE /api/servers/:id는 없고, deactivate·activate는 변경 이력을 남긴다', async () => {
  createServer(webServer('API-1'));
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string) => app.inject({ method, url, headers: { cookie } });
  assert.equal((await call('DELETE', '/api/servers/API-1')).statusCode, 404);
  const off = await call('POST', '/api/servers/API-1/deactivate');
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().data.enabled, false);
  assert.equal((await call('GET', '/api/servers')).json().data.some((s: any) => s.id === 'API-1'), false);
  assert.equal((await call('GET', '/api/servers?includeInactive=1')).json().data.some((s: any) => s.id === 'API-1'), true);
  assert.equal((await call('POST', '/api/servers/API-1/activate')).json().data.enabled, true);
  const actions = (db.prepare("SELECT action FROM audit_logs WHERE target_id = 'API-1' ORDER BY id").all() as Array<{ action: string }>).map((row) => row.action);
  assert.deepEqual(actions, ['SERVER_DEACTIVATE', 'SERVER_ACTIVATE']);
});

test('미사용 서버는 스크립트를 내려받을 수 없다', () => {
  createServer(webServer('OFF-4'));
  deactivateServer('OFF-4');
  assert.throws(() => generateScript('OFF-4'), (e: any) => e.status === 400 && /미사용 서버는 스크립트를 내려받을 수 없습니다: OFF-4/.test(e.message));
});

const winServer = (id: string, role: 'WEB' | 'WAS', product: string) => ({
  id, name: id, roles: [role], products: { [role]: product }, os: 'Windows', ip: '10.0.0.8', processes: [], directories: [],
  policyIds: { [role]: `windows-${role.toLowerCase()}-default` },
} as any);

test('서버: Windows WEB 엔진 상태에 명령 템플릿을 고르면 정책 기본 조각이 덮어쓰지 않는다', () => {
  const id = 'CMD-WEB-1';
  createServer(winServer(id, 'WEB', 'WebtoB'));
  updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WEB: ['WEB_ENGINE_STATUS'] }, scriptParts: { WEB_ENGINE_STATUS: 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS' } } as any);
  assert.equal(getServer(id)!.scriptParts.WEB_ENGINE_STATUS, 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS');
});

test('서버: 다른 항목용 명령 템플릿이나 중지된 명령 템플릿은 저장 거부', () => {
  const id = 'CMD-WEB-2';
  createServer(winServer(id, 'WEB', 'WebtoB'));
  assert.throws(
    () => updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WEB: ['WEB_ENGINE_STATUS'] }, scriptParts: { WEB_ENGINE_STATUS: 'JEUS6-COMMAND-WAS_ENGINE_STATUS' } } as any),
    (e: any) => e.status === 400 && e.errors?.[0]?.field === 'scriptParts.WEB_ENGINE_STATUS' && /다른 점검 항목용/.test(e.message),
  );
  const original = getTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS')!;
  saveTemplate({ ...original, enabled: false }, original.id);
  try {
    assert.throws(
      () => updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WEB: ['WEB_ENGINE_STATUS'] }, scriptParts: { WEB_ENGINE_STATUS: original.id } } as any),
      (e: any) => e.status === 400 && e.errors?.[0]?.field === 'scriptParts.WEB_ENGINE_STATUS' && /사용할 수 없습니다/.test(e.message),
    );
  } finally {
    saveTemplate({ ...original, enabled: true }, original.id);
  }
});

test('서버: Windows WAS 서버는 WAS 엔진 상태 조각이 없어도 저장된다(명령 템플릿 미선택)', () => {
  const id = 'CMD-WAS-1';
  createServer(winServer(id, 'WAS', 'JEUS'));
  assert.doesNotThrow(() => updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WAS: ['WAS_ENGINE_STATUS'] } } as any));
  assert.ok(getServer(id)!.roleChecks.WAS!.includes('WAS_ENGINE_STATUS'));
});

test('서버: 서버 WAS 제품과 템플릿 제품이 달라도 저장된다', () => {
  const id = 'CMD-WAS-2';
  createServer(winServer(id, 'WAS', 'Apache Tomcat'));
  updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WAS: ['WAS_ENGINE_STATUS'] }, scriptParts: { WAS_ENGINE_STATUS: 'JEUS6-COMMAND-WAS_ENGINE_STATUS' } } as any);
  assert.equal(getServer(id)!.scriptParts.WAS_ENGINE_STATUS, 'JEUS6-COMMAND-WAS_ENGINE_STATUS');
});

test('서버: 서버가 고른 명령 템플릿은 삭제할 수 없고, 고름을 풀면 삭제된다', () => {
  const id = 'CMD-DEL-1';
  const original = getTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS')!;
  saveTemplate({ ...original, id: 'TEST-COMMAND-DEL', name: '삭제 시험' }, undefined);
  const copy = getTemplates({ kind: 'COMMAND' }).find((t) => t.name === '삭제 시험')!;
  createServer(winServer(id, 'WEB', 'WebtoB'));
  updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WEB: ['WEB_ENGINE_STATUS'] }, scriptParts: { WEB_ENGINE_STATUS: copy.id } } as any);
  assert.throws(() => deleteTemplate(copy.id), (e: any) => e.status === 409 && /서버 .*에서 고른 관리 명령 템플릿/.test(e.message));
  assert.ok(getTemplate(copy.id));
  updateCheckConfig(id, { ...getCheckConfig(id), roleChecks: { WEB: ['WEB_ENGINE_STATUS'] }, scriptParts: { WEB_ENGINE_STATUS: 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS' } } as any);
  deleteTemplate(copy.id);
  assert.equal(getTemplate(copy.id), undefined);
});
