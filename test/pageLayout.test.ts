import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAGES, composePage } from '../src/shared/pages';
import { app } from '../src/server';
import { createSession, createUser, sessionCookie } from '../src/services/authService';

createUser('tester', '테스터', 'tester-password-1');

/*
 * 공통 레이아웃(사이드바 + 본문)을 서버에서 끼워 보내는지 확인
 */
const LAYOUT = `<!-- 설명 {{page-content}} -->
<div class="layout"><aside id="sidebar">
  <a href="/dashboard" data-menu="dashboard">대시보드</a>
  <button id="settings-menu-toggle" class="settings-menu-toggle{{settings-active}}" aria-expanded="{{settings-expanded}}">설정</button>
  <div id="settings-submenu" class="sidebar-submenu"{{settings-hidden}}>
    <a href="/settings/audit-logs" data-menu="audit-logs">변경 이력</a>
  </div>
  <span id="current-user-avatar">{{user-initial}}</span><strong id="current-user-name">{{user-name}}</strong>
</aside><main><div id="page-content">{{page-content}}</div></main></div>`;

const PAGE = `<body>
  <template id="page-content-template"><h1>본문</h1><template id="row"><tr></tr></template><p>$& 그대로</p></template>
  <template id="after">뒤 template</template>
  <script type="module" src="/x.js"></script>
</body>`;

test('본문 template을 레이아웃 안에 넣고, 안쪽 template과 뒤쪽 template은 그대로 둔다', () => {
  const html = composePage(PAGE, LAYOUT, 'dashboard', { username: 'kim', displayName: '김운영' });
  assert.doesNotMatch(html, /page-content-template|\{\{/);
  assert.doesNotMatch(html, /<!--/, '레이아웃 설명 주석은 보내지 않음');
  assert.match(html, /<div id="page-content"><h1>본문<\/h1><template id="row"><tr><\/tr><\/template><p>\$& 그대로<\/p><\/div>/);
  assert.match(html, /<\/div>\n {2}<template id="after">뒤 template<\/template>\n {2}<script/);
});

test('현재 메뉴를 강조하고, 설정 하위 메뉴면 설정 그룹을 펼친다', () => {
  const dashboard = composePage(PAGE, LAYOUT, 'dashboard');
  assert.match(dashboard, /data-menu="dashboard" class="active" aria-current="page"/);
  assert.match(dashboard, /class="settings-menu-toggle" aria-expanded="false"/);
  assert.match(dashboard, /class="sidebar-submenu" hidden>/);

  const audit = composePage(PAGE, LAYOUT, 'audit-logs');
  assert.match(audit, /data-menu="audit-logs" class="active" aria-current="page"/);
  assert.doesNotMatch(audit, /data-menu="dashboard" class/);
  assert.match(audit, /class="settings-menu-toggle active" aria-expanded="true"/);
  assert.match(audit, /class="sidebar-submenu">/);
});

test('사용자 이름은 HTML로 해석되지 않게 바꿔 넣는다', () => {
  const html = composePage(PAGE, LAYOUT, 'dashboard', { username: 'x', displayName: '<img src=x onerror=alert(1)>' });
  assert.match(html, /<span id="current-user-avatar">&#60;<\/span><strong id="current-user-name">&#60;img src=x onerror=alert\(1\)&#62;<\/strong>/);
  assert.match(composePage(PAGE, LAYOUT, 'dashboard'), /<strong id="current-user-name">알 수 없음<\/strong>/);
});

test('본문 template이나 메뉴가 없으면 조용히 깨진 화면 대신 오류를 낸다', () => {
  assert.throws(() => composePage('<body></body>', LAYOUT, 'dashboard'), /page-content-template/);
  assert.throws(() => composePage(PAGE, LAYOUT, 'no-such-menu'), /no-such-menu/);
});

test('모든 화면이 실제 layout.html·페이지 파일로 조립되고, 원본 페이지 파일은 바로 열리지 않는다', async () => {
  const cookie = sessionCookie(createSession('tester'), false).split(';')[0];
  for (const page of PAGES) {
    for (const url of page.paths) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      assert.equal(response.statusCode, 200, url);
      assert.match(String(response.headers['content-type']), /^text\/html/, url);
      const body = response.body;
      assert.equal(body.match(/<aside id="sidebar"/g)?.length, 1, `${url}: 사이드바 1개`);
      assert.equal(body.match(/id="page-content"/g)?.length, 1, `${url}: 본문 자리 1개`);
      assert.doesNotMatch(body, /page-content-template|\{\{[a-z-]+\}\}/, url);
      assert.equal(body.match(/<main\b/g)?.length, 1, `${url}: main 1개`);
      assert.match(body, new RegExp(`data-menu="${page.menu}" class="active" aria-current="page"`), url);
      assert.match(body, /<strong id="current-user-name" title="테스터">테스터<\/strong>/, url);
    }
    const raw = await app.inject({ method: 'GET', url: `/${page.file}`, headers: { cookie } });
    assert.equal(raw.statusCode, 404, `/${page.file}`);
  }
  assert.equal((await app.inject({ method: 'GET', url: '/shared/fragments/layout.html', headers: { cookie } })).statusCode, 404);
});

test('로그인하지 않으면 화면 대신 로그인으로 보낸다', async () => {
  for (const url of ['/dashboard', '/dashboard.html', '/settings/audit-logs']) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 302, url);
    assert.match(String(response.headers.location), /^\/login\?next=/, url);
  }
});

test('CSS·JS·모달 조각 같은 정적 파일은 그대로 열린다', async () => {
  const cookie = sessionCookie(createSession('tester'), false).split(';')[0];
  for (const url of ['/shared/js/common.js', '/shared/css/app.css', '/shared/fragments/server-modal.html', '/dashboard/dashboard.js']) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode, 200, url);
  }
});
