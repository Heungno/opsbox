# CSS 디자인 체계 다시 잡기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app.css` 3,824줄을 "점검 일지" 토큰 위의 역할별 CSS 파일로 다시 짜되, 화면 모양은 그대로 유지한다.

**Architecture:** 먼저 모든 화면·상태의 계산된 스타일(computed style)과 스크린샷을 기준으로 찍는 도구를 만든다. 구조 정리(Task 3~7)는 토큰 값을 지금 값 그대로 두고, 계산된 스타일이 기준과 같아야 통과한다. 마지막에 값을 단계로 맞추고(Task 8) 전·후 스크린샷 비교 페이지로 확인한다.

**Tech Stack:** 브라우저가 그대로 읽는 CSS(@import), puppeteer-core(이미 개발 의존성), node:test, tsx.

**Spec:** `docs/superpowers/specs/2026-11-23-css-design-system-design.md`

## Global Constraints

- 모양 바꾸기 없음. 색·글꼴·배치·사이드바 모양은 지금 그대로 (예외: Task 8의 단계 맞춤 1~2px).
- 빌드 도구·CSS 프레임워크(Tailwind, Sass, PostCSS 등) 도입 금지. 새 런타임 의존성 없음. 개발 의존성 추가는 피함(차이 계산은 브라우저 캔버스로).
- HTML은 계속 `/shared/css/app.css` 하나만 링크(보고서 상세는 `report-print.css` 추가 링크 그대로). `?v=` 값은 전 화면 같은 값.
- 화면 기능·HTML 구조 변경 금지. 예외: 고정 인라인 스타일 → 클래스, CSS 링크 태그.
- 다크 테마는 `:root[data-theme="dark"]` 토큰 값으로만. 규칙별 다크 덮어쓰기 금지(불가피한 예외는 tokens.css 옆에 주석과 함께).
- 규칙 안 직접 색 금지(`transparent`, `currentColor`, 토큰 `color-mix()` 허용). `!important`는 이유 주석이 있는 것만.
- `report-print.css`는 인쇄 층: 직접 색은 맨 위 인쇄 토큰 블록에만, 공통 선택자 재정의는 `@media print` 안에서만.
- 각 Task 끝: `npm test`, `npm run test:e2e`, `npm run visual:compare`(Task 3~7은 계산된 스타일 차이 0) 통과.
- Termux: grep/find 깨짐 → node/awk. 브라우저는 `test/e2e/helpers/browser.ts`의 `findBrowser()`/`launch()`.

## Review Focus

1. `:hover`·`:focus-visible`·`:disabled`·`[aria-selected]` 같은 상태 규칙은 페이지를 열기만 해서는 계산된 스타일에 안 나타남 → 옮기다 빠져도 모름. 기대: 상태 규칙도 그대로. (Task 1 시나리오에 hover·focus·disabled 상태 포함)
2. JS가 나중에 만드는 요소(알림 toast, 검증 오류 줄, 빈 목록 안내, 대화상자) → 첫 화면에 없어 기준에서 빠짐. 기대: 그대로 보임. (Task 1 시나리오: toast, 오류, 대화상자, 빈 목록)
3. 다크 테마 + 대화상자/알림/코드 상자 → 규칙별 다크 덮어쓰기를 없애면 일부가 밝게 남기 쉬움. 기대: 다크에서도 어두운 표면. (Task 1 시나리오를 밝은/다크 모두로)
4. 다크 테마에서 보고서 인쇄 → 흰 종이에 검정 글자. (Task 1 시나리오: 인쇄 흉내 × 다크)
5. 사이드바 접힘·좁은 화면 메뉴 열림 → 별도 @media·클래스 규칙이 많아 빠지기 쉬움. 기대: 지금과 같음. (Task 1 시나리오)

---

## File Structure

```
test/visual/
  scenarios.ts      찍을 화면·상태 목록 (Scenario[])
  capture.ts        시나리오마다 계산된 스타일 JSON + PNG 저장
  style-diff.ts     계산된 스타일 비교 (순수 함수, 단위 테스트 대상)
  report.ts         전·후 PNG 나란히 + 캔버스 차이 HTML 만들기
  run.ts            명령: baseline | compare | report
  .out/             (git 제외) baseline/, current/, report.html
test/visualStyleDiff.test.ts
test/cssStructure.test.ts      3.7 검사 (Task 2 함수, Task 7에서 실제 파일 검사)
scripts/css-structure.ts       3.7 검사 함수 (순수, 테스트 대상)
src/public/shared/css/
  app.css          입구: @import만
  tokens.css  base.css  layout.css  components.css
  pages/dashboard.css reports.css servers.css policy.css scripts.css common-codes.css result-collection.css audit-logs.css account.css login.css
  legacy.css       (Task 3~6 임시) 아직 안 옮긴 예전 규칙. Task 7에서 삭제
src/public/reports/report-print.css
```

---

### Task 1: 모양 기준 찍기 도구

**Files:**
- Create: `test/visual/scenarios.ts`, `capture.ts`, `style-diff.ts`, `report.ts`, `run.ts`, `test/visualStyleDiff.test.ts`
- Modify: `package.json` (scripts), `.gitignore` (`test/visual/.out/`)

**Interfaces:**
- Consumes: `startApp()` (`test/e2e/helpers/app.ts`), `launch()`, `openSession(baseUrl)`, `settle(ms)` (`test/e2e/helpers/browser.ts`)
- Produces:
  - `interface Scenario { name: string; url: string; theme: 'light' | 'dark'; width: 1440 | 1024 | 768 | 390; print?: boolean; prepare?: (page: Page) => Promise<void> }`
  - `scenarios(): Scenario[]`
  - `type StyleSnapshot = Record<string /* 요소 경로 */, Record<string /* 속성 */, string>>`
  - `diffStyles(before: StyleSnapshot, after: StyleSnapshot): StyleDiff[]` where `StyleDiff = { path: string; property: string; before?: string; after?: string }`
  - `normalizeValue(property: string, value: string): string`
  - 명령: `npm run visual:baseline` (→ `.out/baseline/`), `npm run visual:compare` (→ `.out/current/`, 차이 출력, 차이 있으면 종료 코드 1), `npm run visual:report` (→ `.out/report.html`)

- [ ] **Step 1: Write the failing test** `test/visualStyleDiff.test.ts`

```ts
test('같은 스냅샷은 차이 없음', () => {
  const snap = { 'body>div:0': { color: 'rgb(22, 33, 43)', 'padding-top': '24px' } };
  assert.deepEqual(diffStyles(snap, structuredClone(snap)), []);
});
test('값이 바뀌거나 요소가 사라지면 차이', () => {
  const diffs = diffStyles({ a: { color: 'rgb(0, 0, 0)' }, b: { color: 'rgb(1, 1, 1)' } }, { a: { color: 'rgb(0, 0, 1)' } });
  assert.deepEqual(diffs, [{ path: 'a', property: 'color', before: 'rgb(0, 0, 0)', after: 'rgb(0, 0, 1)' }, { path: 'b', property: '*', before: 'present', after: undefined }]);
});
test('color-mix 소수 채널은 반올림해 같게 본다', () => {
  assert.equal(normalizeValue('background-color', 'rgb(227.4, 238.6, 242)'), normalizeValue('background-color', 'rgb(227, 239, 242)'));
  assert.equal(normalizeValue('color', 'color(srgb 0.5 0.5 0.5)'), 'rgb(128, 128, 128)');
});
```

- [ ] **Step 2: Run** `node --no-warnings --import tsx --test test/visualStyleDiff.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement** `style-diff.ts` (`diffStyles`, `normalizeValue`: 색은 정수 rgb/rgba로, px는 소수 2자리 반올림). 그다음 `scenarios.ts`·`capture.ts`·`run.ts`:
  - 시나리오: `PAGES`(src/shared의 화면 목록, 서버 상세는 `?id=WEB-01`·`DB-02`, 보고서 상세는 WEB-01 최신 파일) × 밝은/다크 × 1440·1024·768·390. 추가 상태(1440 밝은/다크만): 서버 상세 정책 탭·스크립트 탭, 서버 수정 대화상자 열림, 사이드바 접힘, 390 너비 메뉴 열림, 버튼 hover·입력 focus·비활성 버튼, toast 하나 띄움(화면 JS의 `showToast` 호출), 결과 수집 경로 오류 표시, 빈 목록(필터로 결과 0건), 로그인 화면(로그인 안 한 세션), 보고서 상세 인쇄 흉내(`page.emulateMediaType('print')`) × 밝은/다크.
  - 테마는 `localStorage.opsbox-theme` 설정 후 새로고침, 애니메이션은 `prefers-reduced-motion` 흉내.
  - 계산된 스타일: 모든 요소(+ `::before`/`::after`, content가 none이 아닌 것)에 대해 정해진 속성 목록 — color, background-color, background-image, border-{top,right,bottom,left}-{color,width,style}, border-*-radius, padding-*, margin-*, font-family, font-size, font-weight, line-height, letter-spacing, text-align, text-transform, display, position, gap, grid-template-columns, flex-direction, flex-grow, flex-wrap, align-items, justify-content, box-shadow, outline-*, opacity, visibility, overflow-x, white-space, word-break, cursor. 너비·높이는 넣지 않음(시각 글자 따라 변함; 배치는 스크린샷이 봄). 요소 경로는 태그+형제 순번(id가 있으면 `#id`부터).
  - PNG는 전체 페이지 캡처.
- [ ] **Step 4: Run** 단위 테스트 PASS. `npm run visual:baseline` 두 번 실행해 두 번째 결과로 `npm run visual:compare` → Expected: "차이 0" (도구 자체가 안정적인지 확인; 차이가 나면 그 속성·요소를 원인 찾아 고정하거나 목록에서 빼고 Ruling).
- [ ] **Step 5: 기준 확정** — 지금 `main`의 CSS로 `npm run visual:baseline`. 이후 Task 3~7 동안 기준을 다시 찍지 않는다.
- [ ] **Step 6: Commit** `git commit -m "화면 모양 기준 찍기 도구 (계산된 스타일·스크린샷)"`

### Task 2: CSS 구조 검사 함수

**Files:**
- Create: `scripts/css-structure.ts`, `test/cssStructure.test.ts`

**Interfaces:**
- Produces:
  - `findLiteralColors(css: string, { allowInTokenBlocks: boolean }): { line: number; value: string }[]` — `#hex`, `rgb(`, `rgba(`, `hsl(`, 색 이름(white, black 등; `transparent`·`currentColor`·`inherit` 제외). `allowInTokenBlocks`면 `:root…{}` 안의 `--토큰:` 선언은 제외.
  - `findImportantWithoutReason(css: string): number[]` — 같은 줄이나 바로 윗줄에 `/* ... */` 주석이 없는 `!important` 줄 번호.
  - `selectorsByFile(files: Record<string, string>): Map<string, string[]>` — @media 밖·안 구분 없이 선택자 → 정의된 파일 목록(`:root` 토큰 블록 제외).
  - `findDuplicateSelectorsAcrossFiles(files): { selector: string; files: string[] }[]`
  - `importedFiles(appCss: string): string[]` — `@import url("./x.css")`/`@import "./x.css"` 경로.

- [ ] **Step 1: Write the failing test** — 위 함수마다 작은 CSS 문자열로:

```ts
test('직접 색 찾기: 토큰 블록 안 선언은 허용', () => {
  const css = ':root { --ink: #16212b; }\n.a { color: #fff; border-color: var(--ink); background: transparent; }';
  assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: true }).map((c) => c.value), ['#fff']);
});
test('!important는 이유 주석이 있어야', () => {
  assert.deepEqual(findImportantWithoutReason('[hidden] { display: none !important; } /* hidden 속성 강제 */\n.b { color: red !important; }'), [2]);
});
test('같은 선택자가 두 파일에 있으면 찾는다', () => {
  assert.deepEqual(findDuplicateSelectorsAcrossFiles({ 'a.css': '.btn, .x { }', 'b.css': '@media (max-width: 900px) { .btn { } }' }), [{ selector: '.btn', files: ['a.css', 'b.css'] }]);
});
test('@import 경로', () => {
  assert.deepEqual(importedFiles('@import url("./tokens.css");\n@import "./pages/login.css";'), ['tokens.css', 'pages/login.css']);
});
```

- [ ] **Step 2: Run** `node --no-warnings --import tsx --test test/cssStructure.test.ts` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** 주석 제거 후 중괄호 깊이로 규칙을 나누는 작은 파서(라이브러리 없음).
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "CSS 구조 검사 함수"`

### Task 3: 토큰과 입구 파일

**Files:**
- Create: `src/public/shared/css/tokens.css`, `legacy.css` (지금 `app.css` 내용을 그대로 옮김, 토큰 블록 제외)
- Modify: `src/public/shared/css/app.css` (입구), 모든 HTML의 `app.css?v=` 값 하나로 통일(`20261123-tokens`)

**Interfaces:**
- Produces: tokens.css의 토큰 이름. "점검 일지" 블록 이름을 기본으로: `--font-ui --font-code --paper --surface --surface-sunk --ink --slate --slate-soft --rule --rule-soft --petrol --petrol-strong --petrol-wash --ok --warn --crit --idle --chassis --chassis-raised --chassis-line --chassis-text --chassis-dim --radius-panel --radius-control`. 상태 옅은 배경은 `--ok-wash --warn-wash --crit-wash`, 표 hover `--table-hover`, 초점 `--focus-ring`. 간격 `--space-*`, 글자 `--text-*`, 모서리 `--radius-*`, 그림자 `--shadow-*`는 이 Task에서 **지금 쓰는 값 그대로** 목록화(단계 맞춤은 Task 8). 이후 Task는 이 이름만 씀.

- [ ] **Step 1:** `tokens.css` 작성 — 두 토큰 블록(3·897·1422·1444·2497~2585줄 근처)을 하나로: 밝은 `:root, :root[data-theme="light"]`, 다크 `:root[data-theme="dark"]`. 예전 별칭(`--primary` 등)은 이 Task에서는 tokens.css 맨 아래 "옮기는 동안만" 블록에 남기고 Task 7에서 삭제. 맨 위에 토큰 목록 주석과 화면 너비 기준 목록 주석(지금 값: 480·640·760·768·820·900·1100·1180).
- [ ] **Step 2:** `app.css` = `@import url("./tokens.css"); @import url("./legacy.css");` (글꼴 `@import`는 tokens.css 맨 위로).
- [ ] **Step 3: Run** `npm run visual:compare` — Expected: 계산된 스타일 차이 0. `npm test`, `npm run test:e2e` PASS.
- [ ] **Step 4: Commit** `git commit -m "CSS 토큰 파일과 입구 파일"`

### Task 4: base·layout

**Files:**
- Create: `base.css`, `layout.css`
- Modify: `app.css` (import 순서 tokens → base → layout → … → legacy), `legacy.css` (옮긴 규칙 삭제)

**Interfaces:**
- Consumes: Task 3 토큰 이름
- Produces: layout 클래스는 지금 이름 그대로(`.layout .sidebar .sidebar-* .content .container .page-header …`).

- [ ] **Step 1:** 리셋·기본 요소·포커스·선택 색·글꼴 계열 규칙 → `base.css`. 사이드바(예전 69줄 + 점검 일지 2642줄 + 모바일 메뉴 2266줄), 본문, 페이지 머리말, 모션 → `layout.css`. **옮길 때 같은 선택자의 여러 정의를 cascade 순서대로 합쳐 최종 결과 하나로**, 다크 덮어쓰기는 토큰으로 바꾸고(필요하면 토큰 추가), 직접 색은 토큰으로. 옮긴 규칙은 legacy.css에서 지움.
- [ ] **Step 2: Run** `npm run visual:compare` — Expected: 차이 0. 차이가 나면 cascade 순서·특이도 문제 → 고친 뒤 다시.
- [ ] **Step 3:** `npm test`, `npm run test:e2e` PASS.
- [ ] **Step 4: Commit** `git commit -m "CSS 정리: 기본·배치(사이드바·본문)"`

### Task 5: components

**Files:**
- Create: `components.css`; Modify: `app.css`, `legacy.css`

- [ ] **Step 1:** 카드·패널, 섹션 제목, 요약 칸, 표(괘선 장부), 배지·상태 램프, 버튼, 폼·입력, 탭, 목록, 결과 지표, 코드 상자·명령 상자, 대화상자, 알림(toast), 검증·도움 문구, 빈 상태 → `components.css`. Task 4와 같은 합치기 규칙.
- [ ] **Step 2: Run** `npm run visual:compare` — Expected: 차이 0
- [ ] **Step 3:** `npm test`, `npm run test:e2e` PASS
- [ ] **Step 4: Commit** `git commit -m "CSS 정리: 공통 부품"`

### Task 6: 화면별 파일

**Files:**
- Create: `pages/dashboard.css reports.css servers.css policy.css scripts.css common-codes.css result-collection.css audit-logs.css account.css login.css`; Modify: `app.css`, `legacy.css`

- [ ] **Step 1:** 화면 전용 규칙(예전 Responsive 블록 858~2264줄의 화면 규칙, 대시보드 계기판 2906줄, 보고서 3505·3736·3778줄, 로그인 3581줄, 변경 이력 2439줄 등)을 화면 파일로. 작은 화면부터, **화면 하나 옮길 때마다** `npm run visual:compare`.
- [ ] **Step 2: Run** `npm run visual:compare` — Expected: 차이 0. legacy.css에 남은 것은 Task 7 대상(인쇄 관련 없음이면 비어 있어야 함)만.
- [ ] **Step 3:** `npm test`, `npm run test:e2e` PASS
- [ ] **Step 4: Commit** (화면마다 커밋 가능) `git commit -m "CSS 정리: 화면별 파일"`

### Task 7: 인쇄·인라인 스타일·예전 층 삭제·구조 검사

**Files:**
- Modify: `src/public/reports/report-print.css`, 고정 인라인 스타일이 있는 HTML/JS(`report-detail.html` 5, `report-list.html` 5, `server-list.html` 1, `report-detail.js`, `server-detail.js` 체크박스 `cssText`, `policy-management.js`), `tokens.css`(별칭 블록 삭제), `app.css`
- Delete: `legacy.css`
- Test: `test/cssStructure.test.ts`에 실제 파일 검사 추가

- [ ] **Step 1: Write the failing test** (실제 파일):

```ts
test('실제 CSS: 토큰 파일 밖 직접 색 0, 이유 없는 !important 0, 파일 간 중복 선택자 0, 모든 파일을 app.css가 불러옴', () => {
  const files = readCssTree('src/public/shared/css'); // 경로 → 내용
  for (const [path, css] of Object.entries(files)) {
    assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: path === 'tokens.css' }), [], path);
    assert.deepEqual(findImportantWithoutReason(css), [], path);
  }
  assert.deepEqual(findDuplicateSelectorsAcrossFiles(files), []);
  assert.deepEqual(importedFiles(files['app.css']).sort(), Object.keys(files).filter((p) => p !== 'app.css').sort());
  assert.match(files['app.css'], /^(\s*@import[^\n]*\n?|\s*\/\*[\s\S]*?\*\/\s*)*$/, 'app.css는 @import만');
});
test('인쇄 CSS: 직접 색은 맨 위 인쇄 토큰 블록에만, 공통 선택자 재정의는 @media print 안에서만', () => { /* report-print.css 대상, 같은 함수 사용 */ });
test('예전 별칭 토큰(--primary, --bg, --text-light, --card-bg, --border, --success, --danger, --warning)은 어디에도 없다', () => { /* 모든 CSS·JS·HTML */ });
```

- [ ] **Step 2: Run** `node --no-warnings --import tsx --test test/cssStructure.test.ts` — Expected: FAIL (legacy.css·별칭·인라인 색 남음)
- [ ] **Step 3:** report-print.css 맨 위 인쇄 토큰 블록(`--print-ink`, `--print-rule`, `--print-paper`, `--print-font`), 다크 덮어쓰기는 그 블록에서만. 고정 인라인 스타일 → 클래스(계산 값 `flexGrow`·그래프 위치는 그대로). 별칭 사용처를 새 토큰 이름으로 바꾸고 별칭 블록 삭제. legacy.css에 남은 규칙 정리 후 삭제.
- [ ] **Step 4: Run** 테스트 PASS, `npm run visual:compare` 차이 0(인쇄 시나리오 포함), `npm test`, `npm run test:e2e` PASS.
- [ ] **Step 5: Commit** `git commit -m "CSS 정리: 인쇄 층, 인라인 스타일, 예전 층 삭제, 구조 검사"`

### Task 8: 단계 맞춤과 전·후 비교 페이지, 문서

**Files:**
- Modify: `tokens.css` 및 사용처, `test/visual/report.ts`, `README.md`

**Interfaces:**
- Consumes: Task 1 `npm run visual:report`

- [ ] **Step 1:** 간격 → 4px 단계(2·4·8·12·16·20·24·32·40·56 중 필요한 것), 글자 크기 → 6~8단계, 모서리 → `--radius-sm`·`--radius-control`(6)·`--radius-panel`(10)·`--radius-pill`(999) + `50%`, 눈으로 구별 안 되는 같은 용도 색 합치기. 화면 너비 기준은 480·640·900·1180으로 합치되, 1024·768 스크린샷에서 배치가 달라지는 기준은 남기고 Ruling. 사용처의 남은 px 값을 토큰으로.
- [ ] **Step 2: Test** — `test/cssStructure.test.ts`에 추가: `padding`/`margin`/`gap`/`font-size`/`border-radius`에 px 직접 값이 tokens.css 밖에 없다(0·1px 테두리·`50%` 허용). Run → FAIL → 사용처 정리 → PASS.
- [ ] **Step 3: Run** `npm run visual:report` → `.out/report.html`: 시나리오마다 전(기준)·후 PNG와 캔버스 차이 이미지, 차이 비율 순 정렬. 화면마다 보고 "단계 맞춤 밀림·줄바꿈"인지 "깨짐"인지 판정해 깨짐은 고침. 판정 목록을 report에 기록.
- [ ] **Step 4:** README "화면 코드 규칙"에 CSS 규칙(파일 역할, 토큰만, 다크는 토큰, 새 화면 CSS는 `pages/`, `npm run visual:baseline|compare|report`) 추가.
- [ ] **Step 5:** `npm test`, `npm run test:e2e` PASS.
- [ ] **Step 6: Commit** `git commit -m "CSS 정리: 간격·글자·모서리 단계 맞춤, 비교 페이지, 문서"` — 사용자가 report.html을 보고 병합을 정함(비교 페이지는 서버로 띄우거나 파일로 전달).
