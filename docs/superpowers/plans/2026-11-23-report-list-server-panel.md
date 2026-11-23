# 보고서 목록 왼쪽 서버 패널 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보고서 목록을 "왼쪽 서버 목록(검색·역할 탭) + 오른쪽 기간 조건·요약 카드·보고서 표"로 바꾸고, 왼쪽 패널은 서버 관리 화면과 같은 공통 부품을 쓴다.

**Architecture:** 서버 관리 화면(`server-detail.js`) 안의 서버 목록 패널 코드를 `shared/js/server-picker.js`로 빼서 두 화면이 같이 쓴다. 보고서 목록은 `/api/reports`를 기간 조건으로 한 번 받고, 서버 선택·역할 탭·검색·상태 카드는 화면에서 거른다. 계산은 `report-list-view.js`의 순수 함수, 그리기는 같은 파일의 render 함수.

**Tech Stack:** 브라우저 ES 모듈(빌드 없음), Node `node:test` + tsx, `test/helpers/fakeDom`, puppeteer-core e2e, `test/visual` 화면 비교.

**Spec:** `docs/superpowers/specs/2026-11-23-report-list-server-panel-design.md`

## Global Constraints

- 보고서 API·DB·보고서 상세·인쇄는 바꾸지 않는다.
- 서버 관리 화면의 왼쪽 패널 동작(검색 ID·이름·IP, 역할 탭 건수·방향키, 선택 표시, 미사용 표시)은 지금과 같아야 한다. 화면 비교 `--only=server-detail` 차이 0.
- CSS는 토큰만(색·간격·글자·모서리 px 직접 값 금지 — `test/cssStructure.test.ts`가 검사). 같은 선택자를 두 CSS 파일에 두지 않는다. 두 화면 이상이 쓰는 규칙은 `components.css`, 보고서 목록 전용은 `pages/reports.css`.
- 주소: `/reports?serverId=<ID>`, `history.replaceState`로 갱신. 없는 ID면 전체 서버.
- 상태 값 → 이름은 `statusLabel()` (Healthy 정상 · Warning 경고 · Critical 위험).
- 표 칸 순서: 점검일시 · 서버(`이름 (ID)`, 항상) · 상태 · CPU · MEM · DISK · [보고서 보기]. 최신순.
- 요약 카드 순서: 보고서 · 서버(전체 서버일 때만) · 정상 · 경고 · 위험 · 최근 점검(일시 + 서버 이름).
- HTML의 CSS·JS `?v=`를 바꾼 파일에 맞춰 올린다(`20261123-report-panel`).
- Termux: grep/find가 깨져 있음 — node 스크립트나 Read 도구 사용. 테스트는 `node --import tsx --test …`.

## Review Focus

1. 역할 탭·검색으로 왼쪽 목록이 줄면 "전체 서버"의 오른쪽 결과도 보이는 서버만으로 줄어야 한다 (Task 2 테스트 `filterReports` serverIds).
2. `?serverId=NO-SUCH` → 전체 서버로 열리고 주소에서 serverId가 빠진다 (Task 3 e2e).
3. 조건에 맞는 보고서 0건 → 요약 0, 최근 점검 "-", 표 대신 "조건에 맞는 보고서가 없습니다." (Task 2 테스트).
4. 미사용 서버를 고르면 그 서버의 보고서가 나온다(목록에서 숨기지 않음) (Task 1 테스트 `미사용` 표시 + Task 3 e2e는 WEB-01로 충분, 미사용은 단위 테스트로).
5. 상태 카드로 거른 채 서버를 바꾸면 상태 거르기는 유지되고 카드가 눌린 상태로 보인다 (Task 2 `renderReportSummary` aria-pressed 테스트).

---

### Task 1: 공통 서버 목록 패널 (`server-picker.js`) + 서버 관리 화면 적용

**Files:**
- Create: `src/public/shared/js/server-picker.js`
- Modify: `src/public/settings/server-management/server-detail.js` (지금 `loadServerPicker`·`renderServerPicker`·역할 탭 click/keydown·`server-search` input·`server-list-refresh` 부분, 약 122-151행과 bindEvents 안 해당 줄)
- Modify: `src/public/shared/css/pages/servers.css` → `src/public/shared/css/components.css` (`.server-workspace`, `.server-workspace .template-list-panel`, `.server-workspace .template-list` 규칙과 그 @media 안 규칙, `.summary-card` 규칙 전부를 components.css 끝으로 옮김 — Task 3의 보고서 목록도 씀)
- Test: `test/ui/server-picker.test.ts`

**Interfaces:**
- Produces:
  - `pickerMatches(servers, { keyword, role }) → server[]` — keyword는 `${id} ${name} ${ip}` 소문자 부분 일치, role `'ALL'` 또는 `server.roles`에 포함.
  - `renderPickerList(list, servers, { selectedId, allLabel?, onSelect }) → void` — `allLabel`이 있으면 맨 앞에 그 항목(선택 값 `null`). 항목: `div.template-list-item[role=button][tabindex=0]`, 선택된 것 `is-selected`, 안에 `strong`(이름) + `small`(`ID · IP · OS` + 미사용이면 ` · 미사용`). click·Enter·Space → `onSelect(id|null)`.
  - `createServerPicker({ search, tabs, list, empty, refresh?, allLabel?, onSelect, onFilterChange? }) → { load(): Promise<server[]>, setSelected(id|null): void, visibleServers(): server[] }` — `load`는 `/api/servers?includeInactive=1`(`api()` 사용), 역할 탭은 기존 `renderRoleTabs`(server-list-view.js)로 그림, 방향키·클릭 동작은 지금 server-detail.js와 같음. 검색·탭이 바뀌면 다시 그리고 `onFilterChange?.()` 호출. empty 문구: 서버 0개 '등록된 서버가 없습니다.', 걸러서 0개 '조건에 맞는 서버가 없습니다.'.

- [ ] **Step 1: 실패 테스트** `test/ui/server-picker.test.ts` (fakeDom, `setCodes({ serverRoles: [WEB, WAS, OTHER] })`)
  - `pickerMatches`: `[A(WEB, ip 10.0.0.1), B(WAS, name '결제')]`에 `{keyword:'결제', role:'ALL'}` → `['B']`; `{keyword:'10.0.0.1', role:'WAS'}` → `[]`; `{keyword:'', role:'WEB'}` → `['A']`.
  - `renderPickerList`: `allLabel:'전체 서버'`, `selectedId:null` → 첫 항목 글자 '전체 서버', 그것만 `is-selected`; 미사용 서버 small 글자가 ` · 미사용`으로 끝남; 두 번째 항목 click → `onSelect('A')` 한 번; 첫 항목 keydown Enter → `onSelect(null)`.
- [ ] **Step 2: 실행 → FAIL** `node --import tsx --test test/ui/server-picker.test.ts` (모듈 없음)
- [ ] **Step 3: `server-picker.js` 구현**, server-detail.js가 `createServerPicker`를 쓰게 바꿈(`onSelect: selectServer`, `allLabel` 없음; `selectServer`는 지금처럼 replaceState 후 `picker.setSelected(id)`). 쓰이지 않게 된 `state.activeServerPickerRole` 등은 지움.
- [ ] **Step 4: CSS 옮기기** (규칙 내용은 그대로, 위치만). `node --import tsx --test test/cssStructure.test.ts` PASS.
- [ ] **Step 5: 전체 확인** `node --import tsx --test "test/**/*.test.ts"` PASS, `node --import tsx --test "test/e2e/**/*.e2e.ts"` PASS, `node --no-warnings --import tsx test/visual/run.ts compare --only=server-detail` → "계산된 스타일 차이 0".
- [ ] **Step 6: Commit** `git commit -m "화면: 서버 목록 패널을 공통 부품(server-picker)으로"`

### Task 2: 보고서 목록 계산·그리기 함수 (`report-list-view.js`)

**Files:**
- Modify: `src/public/reports/report-list-view.js` (`groupReports`·`renderReportTree` 삭제 — Task 3 뒤엔 안 쓰임)
- Modify: `test/ui/report-list-view.test.ts` (트리 테스트 4개를 아래로 바꿈)

**Interfaces:**
- Produces:
  - `filterReports(reports, { serverIds, health }) → report[]` — `serverIds`: `Set<string>`(그 서버들만) 또는 `null`(거르지 않음), `health`: `'Healthy'|'Warning'|'Critical'|null`. 결과는 `checkDate` 내림차순.
  - `summarizeReports(reports) → { total, servers, healthy, warning, critical, latest: { checkDate, serverName } | null }` — `servers`는 서로 다른 serverId 수, latest는 checkDate 최대.
  - `renderReportSummary(container, summary, { showServers, activeHealth, onHealth })` — 카드 `div.summary-card`(span 이름 + strong 값). 순서·이름: 보고서, 서버(showServers일 때만), 정상, 경고, 위험, 최근 점검. 상태 카드 3개는 `button.summary-card`에 `data-health`·`aria-pressed`(activeHealth와 같으면 'true'), click → `onHealth(같으면 null, 아니면 그 값)`. 최근 점검 strong은 checkDate, 그 아래 `small` serverName; latest가 null이면 strong '-'.
  - `renderReportTable(container, reports)` — 0건이면 `p.report-list-empty` '조건에 맞는 보고서가 없습니다.'; 아니면 `table.server-table` 칸 7개(Global Constraints 순서), 서버 칸 `${serverName} (${serverId})`, 상태 `span.history-status <health 소문자>`, 링크 `/reports/detail?serverId=…&file=…`(지금 코드와 같음).

- [ ] **Step 1: 실패 테스트** (기존 report 헬퍼 재사용, health 인자 추가)
  - `filterReports`: A 2건·B 1건(B가 Critical)에 `{serverIds:new Set(['A']), health:null}` → A 2건 최신순; `{serverIds:null, health:'Critical'}` → B 1건; `{serverIds:new Set(), health:null}` → `[]`.
  - `summarizeReports`: 위 3건 → `{ total:3, servers:2, healthy:2, warning:0, critical:1, latest:{ checkDate:<가장 늦은 것>, serverName:<그 서버> } }`; `[]` → `latest:null`, 숫자 0.
  - `renderReportSummary`: `showServers:false`면 span 글자 `['보고서','정상','경고','위험','최근 점검']`; `activeHealth:'Warning'`면 경고 버튼만 aria-pressed 'true'; 경고 click → `onHealth(null)`, 위험 click → `onHealth('Critical')`.
  - `renderReportTable`: 0건 → 글자 '조건에 맞는 보고서가 없습니다.'; 1건 → th 글자 `['점검일시','서버','상태','CPU','MEM','DISK','보고서']`, 서버 칸 'A (A)'.
- [ ] **Step 2: 실행 → FAIL** `node --import tsx --test test/ui/report-list-view.test.ts`
- [ ] **Step 3: 구현** (트리 함수 삭제)
- [ ] **Step 4: 실행 → PASS**
- [ ] **Step 5: Commit** `git commit -m "보고서 목록: 거르기·요약·표 그리기 함수"`

(Task 2 커밋 뒤 report-list.js는 지울 함수를 import하므로 Task 3 전까지 화면이 깨짐 — Task 2·3은 연달아 하고, 원하면 하나로 합쳐 커밋해도 됨.)

### Task 3: 보고서 목록 화면 연결

**Files:**
- Modify: `src/public/reports/report-list.html` (템플릿 전체를 `div.template-workspace.server-workspace` 안 왼쪽 `section.card.template-list-panel` + 오른쪽 열로; 왼쪽 마크업은 server-detail.html의 패널과 같은 id 체계: `server-search`, `server-picker-role-tabs`, `server-picker-list`, `server-picker-empty`, `server-list-refresh`(추가 버튼 없음). 오른쪽: `h2#report-heading`, `form#filter-form`(시작일 `filter-start-date`·종료일 `filter-end-date`·[검색]·[초기화 `btn-reset`]), `div#report-summary.report-summary`, `div#report-list`. `?v=` 갱신.)
- Modify: `src/public/reports/report-list.js`
- Modify: `src/public/shared/css/pages/reports.css` (`.report-tree*`·`.report-filter-search` 규칙 삭제, `.report-summary`(카드 줄: grid, 간격 토큰), `button.summary-card` 누름 표시(`aria-pressed="true"` → `--petrol` 테두리), `.report-list-empty` 추가)
- Modify: `test/e2e/flows.e2e.ts:79-80` (`#report-tree` → 왼쪽 역할 탭 글자에 '기타 장비'가 있는지)
- Modify: `test/visual/scenarios.ts:65-69` (`empty-report-list`: `#filter-server` 대신 `#server-search`에 'NO-SUCH-SERVER' 입력 후 800ms 대기)
- Test: `test/e2e/flows.e2e.ts`에 테스트 1개 추가

**Interfaces:**
- Consumes: Task 1 `createServerPicker({ …, allLabel: '전체 서버', onSelect, onFilterChange })`, `visibleServers()`, `setSelected()`; Task 2 `filterReports`, `summarizeReports`, `renderReportSummary`, `renderReportTable`.

동작:
- 시작: picker `load()` → 주소 serverId가 목록에 있으면 그 서버, 없으면 `null`(그리고 주소에서 serverId 제거) → 보고서 `GET /api/reports?startDate&endDate` 한 번 → 그림.
- 그리기: `serverIds` = 선택 서버면 `new Set([id])`, 전체면 `new Set(picker.visibleServers().map(s=>s.id))`; `filterReports(reports, { serverIds, health })`; 요약은 health 거르기 **전** 목록으로(`summarizeReports(filterReports(reports,{serverIds,health:null}))`) — 카드 숫자가 누른 상태와 상관없이 보이게. 표는 health 적용 뒤 목록.
- 제목: `보고서 (전체 서버 · N건)` / `보고서 (${이름} · N건)`, N은 표 건수.
- 서버 고르기 → `replaceState('/reports' + (id ? '?serverId='+encodeURIComponent(id) : ''))`, 다시 그림(API 다시 부르지 않음). 검색·[초기화] → 날짜 비우고 API 다시. 새로고침 버튼 → 서버 목록 다시.

- [ ] **Step 1: 실패 e2e** `flows.e2e.ts`에 `test('보고서 목록: 서버를 고르면 그 서버 보고서만, 주소에 남고 새로고침해도 유지')`: `/reports` 열기 → 표의 서버 칸 서로 다른 값 2개 이상; 왼쪽에서 '대민 포털 WEB #1' 항목 클릭 → 표 서버 칸 모두 'WEB-01' 포함, `location.search === '?serverId=WEB-01'`; 다시 열기 → 같은 항목이 `is-selected`; `/reports?serverId=NO-SUCH` 열기 → '전체 서버' 항목 선택, `location.search === ''`.
- [ ] **Step 2: 실행 → FAIL** `node --import tsx --test test/e2e/flows.e2e.ts`
- [ ] **Step 3: HTML·JS·CSS 구현**, flows.e2e 79-80행·scenarios 65-69행 수정
- [ ] **Step 4: 확인** `node --import tsx --test "test/**/*.test.ts"` PASS (cssStructure 포함), e2e 전체 PASS, `visual/run.ts compare --only=server-detail` 차이 0.
- [ ] **Step 5: 화면 비교 기준 갱신** `visual/run.ts baseline --only=report-list` 와 `--only=empty-report-list` (일부러 바꾼 화면) → 데모 서버(3000)에서 390·768·1440, 밝은/다크로 눈으로 확인: 좁은 화면에서 패널이 위, 보고서가 아래.
- [ ] **Step 6: Commit** `git commit -m "보고서 목록: 왼쪽 서버 목록, 오른쪽 기간 조건·요약·보고서 표"`
