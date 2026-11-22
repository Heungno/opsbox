# 화면 코드 정리·테스트·공통코드화 Implementation Plan (2단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 JS를 연결부/로직으로 나눠 테스트하고, 화면에 보이는 이름·목록은 공통코드에서, 동작이 기대는 값은 서버 한 곳에서 가져오게 합니다. 브라우저 테스트로 모든 화면이 오류 없이 열리는지 확인합니다.

**Architecture:** 화면마다 `<화면>.js`(연결부)와 `<화면>-*.js`(순수 함수, 내보냄)로 나눕니다. 공통 도우미는 `shared/js/codes.js`, `shared/js/dom.js`입니다. 단위 테스트는 fakeDom으로, 브라우저 테스트는 `puppeteer-core` + 시스템 Chromium으로 합니다.

**Tech Stack:** 브라우저 ES 모듈(빌드 없음), Node 24 `node:test` + tsx, puppeteer-core

**Spec:** `docs/superpowers/specs/2026-11-22-frontend-structure-design.md`

## Global Constraints

- 명령은 node로 직접 실행합니다(Termux).
  - 단위 테스트: `node --no-warnings --import tsx --test "test/**/*.test.ts"`
  - 브라우저 테스트: `node --no-warnings --import tsx --test "test/e2e/**/*.e2e.ts"` (package.json `test:e2e`)
  - 타입 검사: `node "$TMPDIR/ts5/node_modules/typescript/lib/tsc.js" -p tsconfig.build.json --noEmit` (없으면 `npm i --prefix "$TMPDIR/ts5" typescript@5`)
- 모든 작업은 단위 테스트, 타입 검사, 기준 비교(golden), 브라우저 테스트(Task 1 이후)를 통과해야 끝납니다.
- 화면의 보이는 모양과 동작은 바꾸지 않습니다. 예외: 공통코드 이름이 반영되는 곳(설계 3.3), 템플릿 종류 `SCRIPT` 관련 입력 삭제(Task 3·7).
- 로직 모듈(`<화면>-*.js`, `shared/js/codes.js`, `shared/js/dom.js`)은 **상대 경로로만 import**합니다(`'../../shared/js/dom.js'`). Node 테스트가 `/shared/...` 절대 경로를 풀 수 없기 때문입니다. 연결부 파일은 지금처럼 절대 경로를 써도 됩니다.
- 로직 모듈은 `document`·`window`·`fetch`를 직접 쓰지 않습니다. DOM은 `createElement` + `textContent`만, `innerHTML` 금지.
- 연결부의 화면 상태는 맨 위 `const state = { ... }` 하나에 모읍니다.
- 생성 스크립트(golden `scripts/*`)는 바뀌면 안 됩니다. golden 다시 만들기는 Task 3에서만, `api/common-codes*.json`만 바뀌어야 합니다.
- 작업마다 커밋 하나. 커밋 메시지는 한국어로 기존 스타일을 따릅니다.
- 이번 작업 중 데모 서버(:3000)는 `tsx watch`로 돌고 있을 수 있습니다. 브라우저 테스트는 자기 서버를 따로 띄우므로 영향이 없습니다.

## Review Focus

1. **공통코드에서 역할 이름(`OTHER` → "기타")을 바꿈:** 대시보드·보고서 목록·보고서 상세·서버 목록·서버 상세·인쇄 머리말 모두 새 이름이어야 합니다. 한 곳이라도 예전 이름이면 실패입니다. → Task 10 e2e + 각 화면 단위 테스트
2. **공통코드를 아직 못 불러온 순간(또는 불러오기 실패):** 화면이 비지 않고 값(`OTHER`)이라도 보여야 합니다. 예외로 화면이 멈추면 안 됩니다. → Task 2
3. **비활성(enabled=false)으로 바꾼 공통코드:** 그 코드의 이름 표시는 계속 되어야 합니다(예전 데이터 표시). 선택 목록에서만 빠집니다. → Task 2
4. **서버 상세에서 저장하지 않은 DB 항목을 추가:** 기본 쿼리 템플릿이 지금처럼 바로 선택되어야 합니다(접두어 API). → Task 9
5. **모든 화면을 로그인 없이 열기:** 로그인 화면으로 보내져야 하고, 화면 열기 점검이 이것을 "오류 없음"으로 잘못 통과시키면 안 됩니다. → Task 1

---

### Task 1: 브라우저 테스트 틀과 화면 열기 점검 (안전망)

**Files:**
- Modify: `package.json`: devDependencies에 `puppeteer-core`, scripts에 `"test:e2e": "node --import tsx --test \"test/e2e/**/*.e2e.ts\""`. `npm i -D puppeteer-core`로 설치(lock 갱신).
- Create: `test/e2e/helpers/app.ts`
  - `startApp(): Promise<{ baseUrl: string; stop(): Promise<void> }>`: 임시 폴더 `<tmp>/demo/opsbox.db`에 `node --import tsx scripts/seed-demo.ts`로 데모 데이터를 만들고(환경 변수 OPSBOX_DB_PATH·OPSBOX_BACKUP_DIR·OPSBOX_BACKUP_KEY_FILE·OPSBOX_LOG_DIR·OPSBOX_RESULT_INBOX을 임시 폴더로), 빈 포트(`net` 서버로 0번 포트를 열어 얻음)로 `node --import tsx src/server.ts`를 띄운 뒤 `/api/health`가 200이 될 때까지 기다립니다. `stop`은 프로세스를 끝내고 임시 폴더를 지웁니다.
  - 데모 계정: `demo` / `demo1234` (seed-demo가 만듦).
- Create: `test/e2e/helpers/browser.ts`
  - `findBrowser(): string | undefined`: `OPSBOX_E2E_BROWSER` → `/data/data/com.termux/files/usr/bin/chromium-browser` → `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`, `C:\Program Files\Google\Chrome\Application\chrome.exe`, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 중 처음 있는 것.
  - `openBrowser(baseUrl)`: `puppeteer.launch({ executablePath, args: ['--no-sandbox', '--headless=new'] })`, 새 페이지에서 로그인 폼(`#username`, `#password`, 제출)으로 로그인한 상태의 `{ browser, page, errors }`를 돌려줍니다. `errors`에는 `pageerror` 메시지와 `console` `error` 메시지를 모읍니다. 무시: `favicon.ico` 404.
  - 로그인 폼의 실제 id는 `src/public/login.html`에서 확인해 씁니다.
- Create: `test/e2e/pages.e2e.ts`

```ts
const browserPath = findBrowser();
test('모든 화면이 로그인 후 오류 없이 열린다', { skip: !browserPath && '브라우저 없음' }, async () => {
  // PAGES(src/shared/pages.ts)의 대표 주소마다: 열기 → 1.5초 대기(비동기 그리기) → errors가 비어 있고 페이지 제목이 'OpsBox |'로 시작
  // /reports/detail 은 ?serverId=WEB-01&file=<GET /api/reports 첫 항목의 fileName> 으로 연다
  // /settings/server-management 는 ?id=WEB-01 로 연다
});
test('로그인하지 않으면 화면이 로그인으로 보낸다', { skip: !browserPath && '브라우저 없음' }, async () => {
  // 새 브라우저 컨텍스트(쿠키 없음)로 /servers → 최종 URL이 /login 으로 시작
});
```

- [ ] **Step 1:** 패키지 설치, 위 파일 작성.
- [ ] **Step 2:** 실행해 통과를 확인합니다. 지금 상태가 통과해야 이후 작업의 안전망이 됩니다. 실패하면 실제 화면 오류인지 테스트 문제인지 가려서 고치고 ledger에 적습니다.
- [ ] **Step 3:** 안전망이 진짜로 잡는지 확인합니다. `server-detail.js`에 일부러 `undefined.x`를 넣고 실행해 실패하는지 본 뒤 되돌립니다.
- [ ] **Step 4:** 커밋: "화면 안전망: 브라우저 테스트 틀(puppeteer-core)과 모든 화면 열기 점검"

---

### Task 2: 공통 도우미 `codes.js`, `dom.js`, 상태 이름 정리

**Files:**
- Create: `src/public/shared/js/codes.js`
- Create: `src/public/shared/js/dom.js`
- Modify: `src/public/shared/js/status.js`: `loadStatusLabels`가 `codes.js`의 불러오기를 쓰게(따로 `/api/common-codes`를 부르지 않음). 내보내는 이름은 유지.
- Test: `test/ui/codes.test.ts`, `test/ui/dom.test.ts` (기존 `test/statusLabels.test.ts`는 계속 통과)

**Interfaces (Produces):**
- `codes.js`
  - `setCodes(codes: object): void`: 받은 공통코드(일반 `/api/common-codes` 응답)를 기억하고 `setStatusLabels(codes.healthStatuses)`도 부릅니다.
  - `loadCodes(fetcher?: (url) => Promise<object>): Promise<object>`: 한 번만 불러와 `setCodes`. 기본 fetcher는 `import('./api.js')`의 `api`. 실패하면 빈 공통코드로 계속(오류를 던지지 않음).
  - `getCodes(): object`: 기억한 공통코드(없으면 빈 객체).
  - `codeLabel(category: string, value: string, group?: string): string`: 이름. 모르면 `value` 그대로. **비활성 코드도 이름을 찾습니다**(아래 참고).
  - `codeList(category: string, group?: string): Array<{ value, label }>`: 선택 목록(사용 중인 코드만, 공통코드 순서). 문자열 코드는 `{ value: s, label: s }`.
  - `roleLabel(role: string): string` = `codeLabel('serverRoles', role)`
  - `resetCodes(): void` (테스트용)
- `dom.js`
  - `el(tag: string, className?: string, text?: string): HTMLElement`
  - `option(value: string, label: string, selected?: boolean): HTMLOptionElement`
  - `replace(container: Element, ...nodes: Array<Node | string>): void` = `container.replaceChildren(...)`
- 비활성 코드 이름: 일반 `/api/common-codes`는 사용 중인 코드만 줍니다. `codeLabel`이 비활성 코드 이름도 찾으려면 서버가 이름표를 함께 줘야 합니다. Task 3에서 `GET /api/common-codes` 응답에 `_labels: { [category]: { [value]: label } }`(비활성 포함, 그룹 코드는 `그룹::값` 키)를 더합니다. `codeLabel`은 `_labels`를 먼저 보고, 없으면 목록에서 찾습니다. 이 Task에서는 `_labels`가 없어도 동작하게 만듭니다.

- [ ] **Step 1: 실패하는 테스트**

```ts
test('codeLabel: 공통코드 이름, 모르면 값 그대로, 불러오기 전에도 값', () => {
  resetCodes();
  assert.equal(roleLabel('OTHER'), 'OTHER');
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타' }] });
  assert.equal(roleLabel('OTHER'), '기타');
  assert.equal(codeLabel('serverRoles', 'NOPE'), 'NOPE');
});
test('codeLabel: 비활성 코드도 _labels로 이름을 찾는다', () => {
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }], _labels: { serverRoles: { OTHER: '기타 서버' } } });
  assert.equal(roleLabel('OTHER'), '기타 서버');
  assert.deepEqual(codeList('serverRoles'), [{ value: 'WEB', label: 'WEB' }]);
});
test('codeList: 그룹 문자열 코드는 value=label', () => {
  setCodes({ productsByRole: { WEB: ['Nginx'] } });
  assert.deepEqual(codeList('productsByRole', 'WEB'), [{ value: 'Nginx', label: 'Nginx' }]);
});
test('loadCodes: 실패해도 던지지 않고, 상태 이름도 함께 채운다', async () => {
  resetCodes();
  await loadCodes(async () => { throw new Error('network'); });
  assert.deepEqual(getCodes(), {});
  resetCodes();
  await loadCodes(async () => ({ healthStatuses: [{ value: 'Warning', label: '주의' }] }));
  assert.equal(statusLabel('Warning'), '주의');
});
test('el: 태그·클래스·글자', () => { /* fakeDom 설치 후 el('span','badge','x') 확인 */ });
```

- [ ] **Step 2:** 실패 확인 → 구현 → 통과, 전체 테스트·e2e 통과
- [ ] **Step 3:** 커밋: "화면 공통 도우미: 공통코드 이름·목록(codes.js), 요소 만들기(dom.js)"

---

### Task 3: 서버 쪽 공통코드화와 한 곳으로 모으기

**Files:**
- Modify: `seeds/common-codes.json`: `auditTargets` 분류 추가. 값은 지금 `audit-logs.js`의 `TARGET_LABELS`와 같게: `AUTH 로그인, SERVER 서버, POLICY 점검 정책, TEMPLATE 템플릿, COMMON_CODE 공통코드, RESULT 점검 결과, SCRIPT 스크립트, SETTINGS 설정`. 위치는 `healthStatuses` 다음.
- Modify: `src/features/common-codes/service.ts`
  - `getCommonCodes()` 응답에 `_labels`를 더합니다(Task 2 참고). 다만 서버 코드에서 쓰는 `getCommonCodes()` 결과에는 넣지 않고, 라우트(`GET /api/common-codes`)에서만 붙입니다: `getCommonCodesForClient()`.
  - 저장 검증: `auditTargets`는 이름만 바꾸는 용도라 특별히 막지 않습니다. 코드를 지워도 화면은 값(`SETTINGS` 등)을 그대로 보여 줍니다.
- Create: `src/shared/constants.ts`
  - `export const POLICY_CATEGORIES = ['BASIC', 'WEB', 'WAS', 'DB'] as const;`
  - `export const ROLE_POLICY_TYPES = ['WEB', 'WAS', 'DB'] as const;`
  - `export const OPERATING_SYSTEMS = ['Windows', 'Linux'] as const;` (스크립트를 만들 수 있는 OS)
  - `servers/service.ts`, `servers/check-plan.ts`, `scripts/assembly.ts`, `scripts/check-builder/routes.ts`의 같은 배열을 이것으로 바꿉니다.
- Modify: `src/features/templates/service.ts` `validate()`
  - 종류: `getCommonCodeValues('templateKinds')` (`SCRIPT` 없음 → 통째 스크립트 템플릿 삭제)
  - OS: `OPERATING_SYSTEMS`
  - 역할: `getCommonCodeValues('serverRoles')`
  - `kind === 'SCRIPT'`에만 쓰이던 `role`, `product` 입력 처리 삭제(저장 시 `role`, `product`는 기존 값이 있으면 유지하지 않고 버림 — 기본 템플릿에 없는 필드)
- Create: `GET /api/check-builder/types` (`scripts/check-builder/routes.ts`): `{ types: Array<{ value, label }>, levels: Array<{ value, label }> }`. 값과 이름은 서버 `check-builder/types.ts`의 `BUILDER_TYPE_LABELS`, 판정 수준은 `Critical 위험`, `Warning 주의`(지금 `check-builder-form.js`의 `LEVELS`와 같게).
- Create: `GET /api/scripts/db-query-prefixes` (`scripts/routes.ts`). 설계 3.4는 "점검 설정 응답에 항목별 기본 쿼리 id"였지만, 서버 상세는 저장하기 전에 추가한 DB 항목의 기본 쿼리도 바로 골라야 해서 접두어 맵을 내려주는 방식으로 바꿉니다(점검 설정 응답과 golden은 그대로): `{ MSSQL: 'WINDOWS-QUERY', POSTGRESQL: 'POSTGRESQL-QUERY', MARIADB: 'MARIADB-QUERY', CUBRID: 'CUBRID-QUERY' }`. `db-query-defaults.ts`에 이 맵을 두고 `defaultQueryTemplateId`도 이것을 쓰게 합니다(지금 서버 계산과 같은 결과인지 확인).
- Test: `test/commonCodes.test.ts`(auditTargets 시드, `_labels`), `test/templates.test.ts`(SCRIPT 거부), `test/checkBuilderApi.test.ts`(types 응답), `test/servers.test.ts` 또는 새 파일(db-query-prefixes 응답)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('공통코드 API: 비활성 코드 이름도 _labels로 준다', async () => {
  // 관리 문서에서 serverRoles::::OTHER 를 끄고 저장 → GET /api/common-codes 의 serverRoles에는 OTHER 없음, _labels.serverRoles.OTHER === '기타'
});
test('템플릿: 종류 SCRIPT는 저장할 수 없다', () => {
  assert.throws(() => saveTemplate({ name: 'x', kind: 'SCRIPT', os: 'Linux', content: 'echo' }), /템플릿 종류를 선택하세요/);
});
test('점검 만들기 종류 API: 종류와 판정 수준 이름', async () => {
  // GET /api/check-builder/types → types.length === BUILDER_TYPES.length, levels 에 { value: 'Critical', label: '위험' }
});
test('DB 기본 쿼리 접두어 API는 서버의 기본 쿼리 계산과 같다', async () => {
  // 응답 맵으로 만든 `${prefix}-${item}` 이 defaultQueryTemplateId(dbms, item) 과 같다 (MSSQL·PostgreSQL·MariaDB·CUBRID × DB_INSTANCE_STATUS)
});
```

- [ ] **Step 2:** 실패 확인 → 구현 → 단위 테스트 통과. golden은 `api/common-codes*.json`만 실패해야 정상입니다.
- [ ] **Step 3:** `node --no-warnings --import tsx scripts/update-golden.ts` 후 `git diff --stat test/golden`이 `api/common-codes.json`, `api/common-codes-manage.json` 둘뿐이고, 차이가 `auditTargets` 추가뿐인지 확인합니다(`api/templates.json`은 `SCRIPT` 종류 템플릿이 없으므로 그대로여야 함).
- [ ] **Step 4:** 타입 검사, e2e 통과, 데모 DB 다시 만들기(`node scripts/demo.cjs seed`), 커밋: "공통코드화(서버): auditTargets, 검증 목록을 공통코드로, 정책 분류 상수 한 곳, 점검 만들기 종류·DB 기본 쿼리 접두어 API, SCRIPT 템플릿 종류 삭제"

---

### Task 4: 대시보드·보고서 목록·변경 이력

**Files:**
- Create: `src/public/dashboard/dashboard-view.js`, `src/public/reports/report-list-view.js`, `src/public/settings/audit-logs/audit-logs-view.js`
- Modify: 각 연결부(`dashboard.js`, `report-list.js`, `audit-logs.js`): 그리기·계산을 view 모듈로 옮기고, `loadCodes()` 후 그립니다.
- 하드코딩 제거: 대시보드·보고서 목록의 `'OTHER' ? '기타'` → `roleLabel`, 보고서 목록 `typeOrder`·`typeLabels` → `codeList('serverRoles')`, 변경 이력 `TARGET_LABELS` → `codeLabel('auditTargets', …)`. `ACTION_TONE`(배지 색)은 표시 규칙이라 view 모듈 상수로 둡니다.
- Test: `test/ui/dashboard-view.test.ts`, `test/ui/report-list-view.test.ts`, `test/ui/audit-logs-view.test.ts`

**Interfaces (Produces):**
- `report-list-view.js`: `groupReports(reports, roleOrder: string[]): Array<{ role, label, servers: Array<{ serverId, serverName, items }> }>`, `renderReportTree(container, groups): void`
- `dashboard-view.js`: `renderRecentChecks(tbody, checks): void`, `renderSummary(root, summary): void` (요소 id는 연결부에서 찾아 넘김)
- `audit-logs-view.js`: `renderAuditRows(tbody, entries): void`, `targetText(entry): string`

- [ ] **Step 1: 실패하는 테스트** — 화면별로 최소 하나씩, 공통코드 이름 반영을 검사합니다.

```ts
test('보고서 목록: 역할 묶음 순서와 이름은 공통코드를 따른다', () => {
  setCodes({ serverRoles: [{ value: 'DB', label: '데이터베이스' }, { value: 'OTHER', label: '기타 서버' }, { value: 'WEB', label: 'WEB' }] });
  const groups = groupReports([{ serverId: 'A', serverType: 'OTHER', serverTypes: ['OTHER'], checkDate: '2026-01-01 00:00:00' }], codeList('serverRoles').map((c) => c.value));
  assert.deepEqual(groups.map((g) => g.role), ['OTHER']);
  assert.equal(groups[0].label, '기타 서버');
});
test('대시보드: 최근 점검 표의 역할 이름', () => { /* serverType OTHER → '기타 서버' */ });
test('변경 이력: 대상 이름은 auditTargets, 모르면 값', () => { /* SETTINGS → '설정', NEW → 'NEW' */ });
```

- [ ] **Step 2:** 실패 확인 → 구현(지금 함수를 옮기고, 화면 동작은 그대로) → 단위·e2e 통과
- [ ] **Step 3:** 커밋: "화면 정리: 대시보드·보고서 목록·변경 이력 로직 분리, 역할·대상 이름을 공통코드로"

---

### Task 5: 서버 목록 (+ 결과 수집·내 정보·로그인 점검)

**Files:**
- Create: `src/public/settings/server-management/server-list-view.js`
- Modify: `server-list.js`(연결부, `state` 객체), 결과 수집·내 정보·로그인은 하드코딩·전역 변수가 있으면 같은 규칙으로 정리(없으면 손대지 않음)
- Test: `test/ui/server-list-view.test.ts`

**Interfaces (Produces):**
- `filterServers(servers, { keyword, role }): Server[]`
- `summarizeServers(servers): { total, web, was, db, other }` (사용 중인 서버만)
- `renderServerRows(tbody, servers, { onToggle(server) }): void` (미사용 표시·버튼 포함)
- `readServerForm(form): { id, name, roles, products, os, ip, resultPath }` — form 요소를 받아 값만 읽음(fakeDom에서 input value 흉내)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('서버 목록: 요약 숫자는 사용 중인 서버만', () => { /* enabled:false 서버 제외 */ });
test('서버 목록: 미사용 서버 행은 배지와 [다시 사용]', () => { /* server-inactive 클래스, 버튼 글자 '다시 사용', 클릭하면 onToggle 호출 */ });
test('서버 목록: 역할 이름은 공통코드', () => { /* OTHER → 기타 서버 */ });
test('서버 폼 읽기: 결과 저장 경로 앞뒤 공백 제거, 역할마다 제품', () => { ... });
```

- [ ] **Step 2:** 실패 확인 → 구현 → 단위·e2e 통과
- [ ] **Step 3:** 커밋: "화면 정리: 서버 목록 로직 분리"

---

### Task 6: 공통코드 관리·점검 정책 관리·점검 만들기 폼

**Files:**
- Create: `src/public/settings/common-code-management/common-code-view.js`, `src/public/settings/policy-management/policy-view.js`
- Modify: `common-code-management.js`, `policy-management.js`, `check-builder-form.js`(`TYPES`·`LEVELS`는 `GET /api/check-builder/types`로 받기. 폼 생성 함수가 목록을 인자로 받게)
- Test: `test/ui/common-code-view.test.ts`, `test/ui/policy-view.test.ts`, `test/ui/check-builder-form.test.ts`

**Interfaces (Produces):**
- `common-code-view.js`: `codeRows(codes, category, group): Array<{ group, index, value, label, enabled, sortOrder, extra }>` (지금 `rows()` 계산, `_codeMeta` 우선 규칙 그대로), `setMeta(codes, category, group, value, meta)`, `renderCategoryTable(tbody, rows, handlers)`
- `policy-view.js`: `renderPolicyList(container, policies, codes, handlers)`, `itemSummary(item, codes): string`
- `check-builder-form.js`: `createBuilderForm(container, { types, levels, os, spec })` — 지금 내보내는 함수의 인자에 `types`, `levels`를 더함(이름은 지금 내보내는 함수에 맞춤)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('공통코드 관리: _codeMeta가 항목 값보다 우선, 정렬은 sortOrder → 원래 순서', () => { ... });
test('공통코드 관리: 코드를 끄면 사용 안 함으로 보이고 _codeMeta에 기록', () => { ... });
test('점검 만들기 폼: 종류·판정 수준 선택지는 받은 목록 그대로', () => { ... });
```

- [ ] **Step 2:** 실패 확인 → 구현 → 단위·e2e 통과
- [ ] **Step 3:** 커밋: "화면 정리: 공통코드·정책 관리 로직 분리, 점검 만들기 종류는 서버에서"

---

### Task 7: 스크립트 관리 (SCRIPT 종류 삭제)

**Files:**
- Create: `src/public/settings/script-management/script-view.js`
- Modify: `script-management.js`, `script-management.html`: 종류 `SCRIPT`에만 쓰이던 대상 역할·제품 입력(`.template-target-option`, `template-role`, `template-product`)과 분기 삭제. 그룹 계산에서 `SYSTEM`(SCRIPT 종류) 분기 삭제.
- 하드코딩: 역할 판단 `['WEB','WAS','DB'].includes(template.role)`는 `item`의 공통코드 그룹(`scriptItems`의 `group`/`role`)으로 정하는 지금 규칙만 남김.
- Test: `test/ui/script-view.test.ts`

**Interfaces (Produces):**
- `templateGroup(template, codes, customItems): string`
- `filterTemplates(templates, { group, item, keyword }): Template[]`
- `renderTemplateList(container, templates, { selectedId, onOpen })`
- `outputExample(item, codes): object` (지금 `renderOutputExample`의 예시 데이터 계산 부분)

- [ ] **Step 1: 실패하는 테스트** — 그룹 계산(기본/역할/DB 쿼리/점검 만들기), 필터, 생성 배지(GENERATED/DETACHED 표시).
- [ ] **Step 2:** 실패 확인 → 구현 → 단위·e2e 통과
- [ ] **Step 3:** 커밋: "화면 정리: 스크립트 관리 로직 분리, 쓰이지 않던 통째 스크립트 종류 입력 삭제"

---

### Task 8: 보고서 상세

**Files:**
- Create: `src/public/reports/report-sections.js`(섹션별 그리기·요약 문구: 지금 `summarize*`, `render*` 중 DOM 전역을 쓰지 않게 바꾼 것), `src/public/reports/report-print.js`(`renderPrintHeader`, `formatPrintDate`, 서명 칸)
- Modify: `report-detail.js`(연결부, `state` 객체)
- 하드코딩: 역할 이름 3곳(`'OTHER' ? '기타'`) → `roleLabel`. `DEDICATED_SECTIONS`는 화면 배치 규칙이라 `report-sections.js` 상수로.
- Test: `test/ui/report-sections.test.ts`, `test/ui/report-print.test.ts`

**Interfaces (Produces):**
- `report-sections.js`: `summarizeProcesses(items)`, `summarizePorts(items)`, `summarizeHttp(items)`, `summarizeDisks(disks)`, `summarizePaths(items)`, `summarizeDatabaseCheck(check, product)`, `summarizeWebtoB(check)`, `summarizeWasRuntime(items)`, `renderDisks(container, disks, compare?)`, `renderMetrics(container, data, compare?)` 등 지금 함수 이름 유지. 컨테이너 요소를 인자로 받음.
- `report-print.js`: `printHeaderText(data, health, roles, server): { title, rows: Array<[label, value]> }`, `renderPrintHeader(container, …)`

- [ ] **Step 1: 실패하는 테스트**

```ts
test('보고서 인쇄 머리말: 역할 이름은 공통코드, 제품은 괄호', () => {
  setCodes({ serverRoles: [{ value: 'OTHER', label: '기타 서버' }, { value: 'WEB', label: 'WEB' }] });
  // roles ['WEB','OTHER'], products { WEB: 'Nginx' } → 'WEB (Nginx), 기타 서버'
});
test('요약 문구: 프로세스·포트·HTTP·디스크', () => { /* 지금 함수 결과와 같은 문구 */ });
```

- [ ] **Step 2:** 실패 확인 → 구현 → 단위·e2e 통과. 보고서 상세는 화면이 크므로 e2e 화면 열기 점검에 더해, 데모 보고서 한 건을 열어 섹션 제목 목록이 리팩터링 전과 같은지 비교하는 e2e를 이 Task에 추가합니다(전후 비교는 `document.querySelectorAll('h2, h3')` 글자 목록).
- [ ] **Step 3:** 커밋: "화면 정리: 보고서 상세를 섹션·인쇄 모듈로 나눔, 역할 이름 공통코드"

---

### Task 9: 서버 상세

**Files:**
- Create: `src/public/settings/server-management/server-overview.js`, `server-policy-form.js`, `server-policy-view.js`, `server-script-panel.js`
- Modify: `server-detail.js`(연결부만: `state` 객체, 초기화, 이벤트 연결, API 호출)
- 하드코딩:
  - 역할 이름 → `roleLabel`
  - `DEFAULT_QUERY_PREFIX` → `GET /api/scripts/db-query-prefixes` 응답(초기화 때 한 번)
  - `['WEB','WAS','DB']` 반복 → 공통코드 `policyCategories` 순서에서 `BASIC`을 뺀 목록(연결부에서 한 번 계산해 넘김)
- Test: `test/ui/server-overview.test.ts`, `test/ui/server-policy-form.test.ts`, `test/ui/server-policy-view.test.ts`, `test/ui/server-script-panel.test.ts`

**Interfaces (Produces):**
- `server-overview.js`: `effectiveResultPath(server, settings): { path, source }`, `renderServerInfo(refs, server, settings)`(refs = 연결부가 찾아 둔 요소들), `renderResultHistory(container, results, handlers)`, `healthOf(result): string`
- `server-policy-form.js`: `policyCheckIds(policy): string[]`, `readCheckConfig(refs, state): CheckConfigInput`(지금 `savePolicy`가 서버로 보내는 본문을 만드는 부분), `addListRow(kind, container, value?)`(프로세스·디렉터리·파일·포트·HTTP 행), `readListRows(kind, container)`
- `server-policy-view.js`: `renderPolicyScriptControls(refs, …)`, `renderRolePolicyGroups(refs, …)`, `renderFinalJsonExample(container, items, roleChecks)` — 지금 함수 이름 유지, DOM 전역 대신 refs
- `server-script-panel.js`: `scriptCommand(server): string`, `scriptDescription(server): string`, `renderScriptPanel(container, server, { onDownload, onCopy })`
- `defaultQueryTemplateId(prefixes, dbms, item): string`(`server-policy-form.js`)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('정책 사용 항목: enabled 항목 id만', () => { ... });   // 1단계 회귀 방지
test('점검 설정 본문: 프로세스·포트 행과 정책 선택을 지금과 같은 모양으로', () => { ... });
test('DB 기본 쿼리: 접두어 API 맵으로 계산, 저장 전 추가한 항목도', () => {
  assert.equal(defaultQueryTemplateId({ POSTGRESQL: 'POSTGRESQL-QUERY' }, 'PostgreSQL', 'DB_SESSION'), 'POSTGRESQL-QUERY-DB_SESSION');
});
test('결과 저장 경로 표시: 서버 지정 → OS 기본값 → 스크립트 폴더', () => { ... });
test('스크립트 패널: 미사용 서버는 다운로드 버튼 없음, 실행 명령은 서버 ID를 따옴표로', () => { ... });
```

- [ ] **Step 2:** 실패 확인 → 패널 하나씩 옮기며 구현 → 단위·e2e 통과. 화면이 가장 크므로 패널마다 e2e를 돌립니다.
- [ ] **Step 3:** 커밋: "화면 정리: 서버 상세를 개요·정책 폼·정책 표시·스크립트 패널로 나눔"

---

### Task 10: 핵심 흐름 브라우저 테스트와 문서

**Files:**
- Create: `test/e2e/flows.e2e.ts`
- Modify: `README.md`(화면 구조 규칙: 연결부/로직, `codes.js`·`dom.js`, `npm run test:e2e`와 브라우저 경로), `docs/USER_GUIDE.md`(공통코드 이름이 화면에 반영된다는 안내, 변경 이력 대상 이름은 공통코드 `auditTargets`)

- [ ] **Step 1: 흐름 테스트 작성**

```ts
test('서버 미사용 → 목록에서 사라짐 → 미사용 포함 → 다시 사용', ...);
test('결과 수집: 잘못된 경로는 오류, 올바른 경로는 저장되고 서버 상세에 표시', ...);
test('서버 상세: 정책 탭에서 저장하면 성공 알림, 다시 열어도 값 유지', ...);
test('공통코드에서 OTHER 이름을 바꾸면 대시보드·보고서 목록·서버 목록·보고서 상세에 반영', ...);
```

- [ ] **Step 2:** 실행해 통과(흐름은 이미 동작하므로 통과가 정상. 하나라도 실패하면 회귀로 보고 원인을 고칩니다)
- [ ] **Step 3:** 문서 수정, 전체 단위·e2e·타입·golden 통과, 커밋: "화면 핵심 흐름 브라우저 테스트, 문서"
