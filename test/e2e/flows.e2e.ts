import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { startApp, type TestApp } from './helpers/app';
import { findBrowser, openSession, settle, type BrowserSession } from './helpers/browser';

/* 핵심 흐름: 화면에서 실제로 눌러 봅니다(데모 데이터). */
const skip = findBrowser() ? false : '브라우저 없음 (OPSBOX_E2E_BROWSER)';
let app: TestApp;
let session: BrowserSession;
let cookie = '';

before(async () => {
  if (skip) return;
  app = await startApp();
  session = await openSession(app.baseUrl);
  session.page.on('dialog', (dialog) => dialog.accept());
  cookie = (await session.page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
});
after(async () => { await session?.browser.close(); await app?.stop(); });

const call = async (method: string, url: string, body?: unknown) => (await fetch(`${app.baseUrl}${url}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json();
const open = async (url: string, wait = 1800) => { await session.page.goto(`${app.baseUrl}${url}`, { waitUntil: 'domcontentloaded' }); await settle(wait); };
const text = (selector: string) => session.page.$eval(selector, (node) => (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim());

test('서버 미사용 → 목록에서 사라짐 → 미사용 포함 → 다시 사용', { skip }, async () => {
  await open('/servers');
  const rowButton = async (id: string) => session.page.evaluateHandle((serverId) => [...document.querySelectorAll('#server-list tr')].find((row) => row.textContent?.startsWith(serverId))?.querySelector('button'), id);
  await (await rowButton('WEB-02')).asElement()!.click();
  await settle(1200);
  assert.doesNotMatch(await text('#server-list'), /WEB-02/);
  await session.page.click('#show-inactive');
  await settle(1200);
  assert.match(await text('#server-list'), /WEB-02 .*미사용/);
  await (await rowButton('WEB-02')).asElement()!.click();
  await settle(1200);
  assert.equal((await call('GET', '/api/servers/WEB-02')).data.enabled, true);
  assert.deepEqual(session.errors, []);
});

test('결과 수집: 잘못된 경로는 오류, 올바른 경로는 저장되고 서버 상세에 표시', { skip }, async () => {
  await open('/settings/result-collection');
  session.allowHttpErrors(true);
  await session.page.$eval('#result-path-linux', (input) => { (input as HTMLInputElement).value = 'relative/dir'; });
  await session.page.click('#result-path-form button[type="submit"]');
  await settle(800);
  assert.match(await text('#result-path-error'), /Linux 절대 경로여야 합니다/);
  session.allowHttpErrors(false);
  await session.page.$eval('#result-path-linux', (input) => { (input as HTMLInputElement).value = '/srv/opsbox/results'; });
  await session.page.click('#result-path-form button[type="submit"]');
  await settle(800);
  assert.equal((await call('GET', '/api/settings/result-paths')).data.linux, '/srv/opsbox/results');
  await open('/settings/server-management?id=WEB-02', 2500);
  assert.match(await text('#server-result-path'), /\/srv\/opsbox\/results \(Linux 기본값\)/);
  assert.deepEqual(session.errors, []);
});

test('서버 상세: 정책 탭에서 저장하면 저장되고, 다시 열어도 값이 남는다', { skip }, async () => {
  await call('POST', '/api/servers', { id: 'E2E-01', name: '흐름 시험', os: 'Linux', ip: '10.9.0.1', roles: ['OTHER'], products: {}, processes: [], directories: [] });
  await open('/settings/server-management?id=E2E-01', 2500);
  await session.page.click('[data-server-tab="policy"]');
  await session.page.click('#btn-add-process');
  await session.page.$eval('.process-row input', (input) => { (input as HTMLInputElement).value = 'sshd'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await session.page.click('#btn-save-policy');
  await settle(1500);
  assert.deepEqual((await call('GET', '/api/servers/E2E-01/check-config')).data.processes, [{ name: 'sshd' }]);
  await open('/settings/server-management?id=E2E-01', 2500);
  assert.equal(await session.page.$eval('.process-row input', (input) => (input as HTMLInputElement).value), 'sshd');
  assert.deepEqual(session.errors, []);
});

test('공통코드에서 OTHER 이름을 바꾸면 대시보드·보고서 목록·서버 목록·보고서 상세에 반영', { skip }, async () => {
  const raw = (await call('GET', '/api/common-codes/manage')).data;
  raw.serverRoles = raw.serverRoles.map((code: { value: string; label: string }) => (code.value === 'OTHER' ? { ...code, label: '기타 장비' } : code));
  await call('PUT', '/api/common-codes', raw);
  await open('/servers');
  assert.match(await text('#server-role-tabs'), /기타 장비/);
  assert.match(await text('#server-list'), /FILE-01 .*기타 장비/);
  await open('/reports');
  assert.match(await text('#server-picker-role-tabs'), /기타 장비 \d+/);
  const reports = (await call('GET', '/api/reports')).data;
  const file = reports.find((report: { serverId: string }) => report.serverId === 'FILE-01').fileName;
  await open(`/reports/detail?serverId=FILE-01&file=${encodeURIComponent(file)}`, 2500);
  assert.match(await text('#report-title'), /역할: 기타 장비/);
  assert.match(await text('#print-role'), /기타 장비/);
  await open('/dashboard');
  const dashboard = await text('#recent-checks');
  assert.doesNotMatch(dashboard, /(^| )기타( |$)/, '예전 이름이 남지 않음');
  assert.match(await text('.fleet-roles'), /기타 장비/, '유형별 서버 수 카드');
  assert.deepEqual(session.errors, []);
});

test('서버 상세: 임계값을 비워 둔 디렉터리가 있어도 정책을 저장할 수 있다(데모 서버)', { skip }, async () => {
  await open('/settings/server-management?id=DB-02', 2500);
  await session.page.click('[data-server-tab="policy"]');
  await session.page.click('#btn-save-policy');
  await settle(1500);
  assert.match(await session.page.evaluate(() => document.body.innerText), /정책이 저장되었습니다/);
  assert.deepEqual((await call('GET', '/api/servers/DB-02/check-config')).data.directories, [{ path: '/var/lib/pgsql/16/data' }]);
  assert.deepEqual(session.errors, []);
});

test('서버 상세: 공통코드를 못 불러와도 화면이 멈추지 않는다(값 그대로 표시)', { skip }, async () => {
  const page = session.page;
  const failCodes = (request: import('puppeteer-core').HTTPRequest) => {
    if (new URL(request.url()).pathname === '/api/common-codes') void request.respond({ status: 503, contentType: 'application/json', body: '{"message":"down"}' });
    else void request.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', failCodes);
  try {
    await open('/settings/server-management?id=DB-02', 2500);
    await page.click('[data-server-tab="policy"]');
    await settle(500);
    const tabs = await page.$$eval('[data-policy-role-tab]', (nodes) => nodes.map((node) => node.getAttribute('data-policy-role-tab')));
    assert.deepEqual(tabs, ['BASIC', 'DB']);
    assert.match(await text('#server-title'), /DB-02/);
  } finally {
    page.off('request', failCodes);
    await page.setRequestInterception(false);
  }
  assert.deepEqual(session.errors.filter((error) => error.startsWith('pageerror')), []);
});

test('보고서 목록: 서버를 고르면 그 서버 보고서만, 주소에 남고 새로고침해도 유지', { skip }, async () => {
  const errorsBefore = session.errors.length; // 앞 테스트가 일부러 낸 오류(공통코드 503)는 빼고 봄
  const serverCells = () => session.page.$$eval('#report-list tbody tr', (rows) => rows.map((row) => row.children[1].textContent || ''));
  const selected = () => text('#server-picker-list .is-selected');
  await open('/reports');
  assert.equal(await selected(), '전체 서버');
  assert.ok(new Set(await serverCells()).size >= 2, '전체 서버는 여러 서버 보고서');
  const hasSummary = () => session.page.evaluate(() => Boolean(document.querySelector('#report-summary, .summary-card')));
  assert.equal(await hasSummary(), false, '요약 카드 없음');
  const item = await session.page.evaluateHandle(() => [...document.querySelectorAll('#server-picker-list .template-list-item')].find((node) => node.textContent?.includes('WEB-01 ·')));
  await item.asElement()!.click();
  await settle(500);
  const cells = await serverCells();
  assert.ok(cells.length > 0 && cells.every((cell) => cell.endsWith('(WEB-01)')), cells.join('|'));
  assert.equal(await session.page.evaluate(() => location.search), '?serverId=WEB-01');
  assert.match(await text('#report-heading'), /대민 포털 WEB #1 · \d+건/);
  assert.equal(await hasSummary(), false, '서버를 골라도 요약 카드 없음');
  await open('/reports?serverId=WEB-01');
  assert.match(await selected(), /WEB-01 ·/);
  await open('/reports?serverId=NO-SUCH');
  assert.equal(await selected(), '전체 서버');
  assert.equal(await session.page.evaluate(() => location.search), '');
  assert.deepEqual(session.errors.slice(errorsBefore), []);
});

test('서버 상세: 정보 수정 창에서 미사용으로 바꾸고, 안내 줄의 [다시 사용]으로 되돌린다', { skip }, async () => {
  const errorsBefore = session.errors.length;
  const page = session.page;
  await open('/settings/server-management?id=WEB-03');
  await page.click('#btn-edit-server');
  await settle(300);
  assert.equal(await page.$eval('#server-modal-deactivate', (node) => (node as HTMLElement).hidden), false, '수정 창에는 미사용 버튼이 보임');
  await page.click('#server-modal-deactivate'); // 확인 창은 before()에서 자동 수락
  await settle(1200);
  assert.equal((await call('GET', '/api/servers/WEB-03')).data.enabled, false);
  assert.equal(await page.$eval('#server-modal', (node) => (node as HTMLDialogElement).open), false, '창이 닫힘');
  assert.equal(await page.$eval('#server-inactive-banner', (node) => (node as HTMLElement).hidden), false, '미사용 안내 줄');
  await page.click('#btn-activate-server');
  await settle(1200);
  assert.notEqual((await call('GET', '/api/servers/WEB-03')).data.enabled, false);
  await page.click('#server-add');
  await settle(300);
  assert.equal(await page.$eval('#server-modal-deactivate', (node) => (node as HTMLElement).hidden), true, '신규 등록 창에는 없음');
  assert.deepEqual(session.errors.slice(errorsBefore), []);
});
