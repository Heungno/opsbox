import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { PAGES } from '../../src/shared/pages';
import { startApp, type TestApp } from './helpers/app';
import { findBrowser, openSession, settle } from './helpers/browser';

/*
 * 안전망: 모든 화면을 로그인한 상태로 열어 페이지 오류·콘솔 오류가 없는지 확인합니다.
 * (화면 JS를 고치다 생기는 "열자마자 터지는" 고장을 잡습니다)
 */
const browserPath = findBrowser();
const skip = browserPath ? false : '브라우저 없음 (OPSBOX_E2E_BROWSER)';
let app: TestApp;

before(async () => { if (!skip) app = await startApp(); });
after(async () => { await app?.stop(); });

test('모든 화면이 로그인 후 오류 없이 열린다', { skip }, async () => {
  const session = await openSession(app.baseUrl);
  try {
    const cookie = (await session.page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const reports = (await (await fetch(`${app.baseUrl}/api/reports`, { headers: { cookie } })).json()).data;
    const firstReport = reports.find((report: { serverId: string }) => report.serverId === 'WEB-01');
    const extraQuery: Record<string, string> = {
      '/reports/detail': `?serverId=WEB-01&file=${encodeURIComponent(firstReport.fileName)}`,
      '/settings/server-management': '?id=WEB-01',
    };
    const failures: string[] = [];
    for (const page of PAGES) {
      const url = `${page.paths[0]}${extraQuery[page.paths[0]] ?? ''}`;
      session.errors.length = 0;
      await session.page.goto(`${app.baseUrl}${url}`, { waitUntil: 'domcontentloaded' });
      await settle();
      const title = await session.page.title();
      if (!title.startsWith('OpsBox |')) failures.push(`${url}: 제목 "${title}"`);
      if (new URL(session.page.url()).pathname === '/login') failures.push(`${url}: 로그인 화면으로 이동함`);
      for (const error of session.errors) failures.push(`${url}: ${error}`);
    }
    // 서버 상세는 역할마다 그리는 부분이 달라 DB·WEB+WAS·미사용 서버도 엽니다.
    for (const id of ['DB-01', 'DB-02', 'APP-01', 'BATCH-01']) {
      const url = `/settings/server-management?id=${id}`;
      session.errors.length = 0;
      await session.page.goto(`${app.baseUrl}${url}`, { waitUntil: 'domcontentloaded' });
      await settle(2000);
      for (const error of session.errors) failures.push(`${url}: ${error}`);
    }
    assert.deepEqual(failures, []);
  } finally {
    await session.browser.close();
  }
});

test('로그인하지 않으면 화면이 로그인으로 보낸다', { skip }, async () => {
  const session = await openSession(app.baseUrl, { login: false });
  try {
    await session.page.goto(`${app.baseUrl}/servers`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(session.page.url()).pathname, '/login');
  } finally {
    await session.browser.close();
  }
});
