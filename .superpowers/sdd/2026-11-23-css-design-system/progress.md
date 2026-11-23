# SDD ledger — plan: /data/data/com.termux/files/home/workspace/opsbox/docs/superpowers/plans/2026-11-23-css-design-system.md
Spec: docs/superpowers/specs/2026-11-23-css-design-system-design.md
Pre-flight: T1 produces Scenario/StyleSnapshot/diffStyles + npm visual:* → T3-8 consume the commands only (match). T2 functions → T7/T8 tests (match). T3 token names → T4-8 (match).
Note: task-start/task-done scripts fail on Termux (/usr/bin/env missing) — BASE tracked by hand, test runs logged by hand. T1 BASE=a6dca70
Task 2: Ruling: done before Task 1 commit (Task 1 stability run in background) — independent files — cost: none
Task 2: complete (commits 540567f, tests: node --test test/cssStructure.test.ts → 5/5 pass)
Task 1: Ruling: page.evaluate needs a __name shim (tsx/esbuild keepNames) — injected via evaluateOnNewDocument — cost: none
Task 1: Ruling: width/height left out of computed-style comparison (text like timestamps changes them); layout covered by flex/grid/padding/margin props + screenshots — cost: a pure width rule change (e.g. max-width) is not caught by the strict gate, only by Task 8 screenshots
Task 1: Ruling: baseline taken on branch after commit ebb980d (old-URL routes removed at user request) — route change has no CSS effect — cost: none
Task 1: complete (commits a6dca70..87cdf0c, tests: visualStyleDiff 4/4; visual baseline→compare on same CSS → 0 diffs over 120 scenarios)
Task 1: Ruling (amends earlier): added min/max-width/height, top/left/right/bottom, z-index, transform etc. to compared props; baseline retaken, re-verified 0 diffs/120 — commit 18f3cdd
T3 BASE=18f3cdd
Task 3: complete (commits 18f3cdd..17de3a1, tests: unit 272/276 pass 4 skip, e2e 9/9, visual:compare 0 diffs 120 scenarios)
Task 3: Ruling: result-path-error 시나리오가 클릭 뒤 hover 여부로 흔들림 — 마우스를 (0,0)으로 치우고 그 시나리오만 원래 CSS로 기준 다시 찍음 — 틀렸다면 그 버튼의 hover 색은 다른 시나리오(hover-focus-disabled)만 봄
T4 BASE=17de3a1
Task 4: Ruling: PC(Windows)에서 기준 다시 찍음 — 원래 하나짜리 app.css(18f3cdd)로 baseline, 같은 CSS로 compare 0/120 확인 — Chrome 없음 → browser.ts 후보에 Edge 추가, run.ts는 브라우저 실패 시 서버 닫고 끝냄
Task 4: Ruling: winners.ts는 --match 시나리오만 봐서 base.css(전 화면 공통)엔 맞지 않음(script-management의 textarea min-height 96px가 지워짐) → base.css는 손으로 합침, layout.css만 prune(347 선언·112 규칙) — 비용: 맞은 적 없는 규칙 14개(접힌 사이드바)는 그대로 둠
Task 4: Ruling: 사이드바는 두 테마 모두 어두움 → 섀시 글자·강조·신호 점은 테마 공통 토큰, 활성 테두리(#dededb/#303030)·내 정보 hover는 테마별 토큰(값 그대로, Task 8에서 정리). 바닥의 .sidebar-footer label 규칙 4개는 요소가 없어 삭제
Task 4: Ruling: npm test의 Windows 실패(테스트 끝 임시 폴더 EPERM 18개, golden CRLF 1개)는 CSS와 무관 — 환경 문제, 따로 고칠 일
Task 4: complete (tests: visual:compare 0 diffs 120 scenarios(login 재확인 포함), e2e 9/9, unit 232 pass / 20 fail = Windows 환경만)
T5 BASE=18886c1
Task 5: Ruling: 공통 부품 = 2개 이상 화면이 쓰거나 기본 요소(카드·섹션 제목·표·배지·상태 램프·버튼·폼·탭·결과 지표·대화상자·알림·도움 문구). 한 화면만 쓰는 것(.summary-card, .compact-*, .command-*, .checkbox-label, .generated-badge 등)은 Task 6. 어디서도 안 쓰는 .stats-grid·.field-error·.visually-hidden 삭제
Task 5: Ruling: components.css가 legacy보다 앞에 오면서 원래 지던 legacy 규칙 2개가 이김 → 원래 한 번도 이기지 못한 .server-overview-latest .summary-badge(686줄)·.template-filters label 삭제
Task 5: Ruling: winners는 120개 시나리오 전체로 (Task 4의 base.css 교훈) — 68분 걸림, 241 선언·58 규칙 삭제, 맞은 적 없는 7개(toast 변형·fieldset)는 그대로
Task 5: Ruling (사용자 결정 2026-11-23): 다크 덮어쓰기 선택자(특이도 높음)를 지우니 다크에서만 있던 불일치가 사라짐 — 작은 버튼이 다크에서 일반 크기, 보고서 섹션 제목 16/20px, 서버 상세 결과 숫자 22/15px, 감사 로그 줄 색. 다크가 밝은 테마와 같아지는 것을 받아들임(2711개 중 2657개 값이 밝은 테마와 같음, 나머지는 반올림·같은 규칙) → 다크 시나리오 60개 기준을 이 CSS로 다시 찍음
Task 5: complete (tests: visual:compare 0 diffs 120 scenarios, e2e 9/9, unit 232 pass / 20 fail = Windows 환경만(EPERM 18, golden CRLF 1))
T6 BASE=(이 커밋)
Task 6: Ruling: font-display: optional(3d07b28) 뒤로 비교가 HEAD에서도 108/120 어긋남(캐시 빈 첫 열기에서 ch·글자 폭을 대체 글꼴로 잼) → capture.ts가 찍기 전에 페이지를 한 번 다시 열게 함. 기준은 그대로(밝은 1440 22개 차이 0 확인)
Task 6: Ruling: 지울 규칙 = 선택자의 클래스·id 이름이 하나도 HTML/JS에 없는 것(41개: .summary-total 등, .policy-item-editor, .role-policy-group 등). 첫 시도의 손 정규식은 .dashboard·.role-policy-row·syntax-json-*(JS가 이어 붙여 만듦)까지 지워 비교에서 걸림 → classify.cjs 기준으로 바꿈
Task 6: Ruling: 2개 이상 화면이 쓰는 것(.template-workspace·list·list-item·management-page·filters, .server-badge, .webtob-console-output, .account-*, .script-template-picker) → components.css 끝, #current-user-avatar → layout.css. account 화면 전용 규칙이 없어 pages/account.css는 안 만듦. legacy.css가 비어 이 Task에서 삭제
Task 6: Ruling: cssmove render — 같은 선택자의 뒤 정의가 같은 속성을 정하면 앞 선언은 버림(같은 특이도라 절대 못 이김)
Task 6: Ruling: 화면 파일의 직접 색 44곳·다크 덮어쓰기 13개 → 토큰(--syntax-*, --editor-*, --console-*, --command-ink, --detached-*, --chassis-avatar, --trend-range-active-text). 값 그대로. .trend-range 선택 버튼의 :root[data-theme] 접두사는 이길 대상(:root[data-theme] .btn:not)이 Task 5에서 없어져 뗌
Task 6: Ruling (사용자 결정 2026-11-23): 다크 덮어쓰기 .template-list-item이 .is-selected를 이겨 다크에서 선택 항목이 안 보였음 → 없애니 다크에서도 선택 강조가 보임. 받아들임 → 해당 다크 시나리오 15개 기준 다시 찍음
Task 6: complete (tests: visual:compare 0 diffs 120 scenarios(다크 선택 항목 15개 기준 갱신 뒤), e2e 9/9, unit 233 pass / 20 fail = Windows 환경만(EPERM, golden CRLF))
T7 BASE=(Task 6 커밋)
Task 7: Ruling: 로그 건수 수정(34c8d75)이 보고서 화면을 바꿔 HEAD 비교가 16/120 어긋남 → report- 시나리오 20개 기준을 HEAD로 다시 찍고 시작. server-detail 6개(db·web, 1024·390)는 OpsBox 수신함 칸의 무작위 임시 폴더 이름 길이로 높이만 흔들림 — CSS 무관
Task 7: Ruling: 별칭 → 새 이름 146곳(rename-aliases), --shadow-card는 none으로, --focus-ring·--diff-*-wash는 정식 토큰. 인쇄 CSS의 별칭 덮어쓰기 줄 삭제
Task 7: Ruling (사용자 결정 2026-11-23): 다크 인쇄에서만 --surface-soft가 #fff였음(밝은 테마 인쇄는 :root[data-theme="light"]가 인쇄 :root를 이겨 #f5f7f8) → 새 이름으로 바꾸니 다크 인쇄 항목 상자 11개가 밝은 테마 인쇄와 같아짐. 받아들임 → report-print-dark 기준 다시 찍음
Task 7: Ruling: 인라인 → 클래스. server-detail 체크박스 cssText는 servers.css 규칙이 이미 같은 값을 정해서 그냥 삭제, 그 규칙의 !important 12개도 특이도(0,2,1)로 충분해 삭제. 남은 !important 6줄은 같은 줄 이유 주석
Task 7: Ruling: 인쇄 토큰은 계획의 --print-rule/--print-font 대신 기존 이름 --print-line/--print-serif/--print-sans 유지 + --print-ink/paper/grid/wash/head-bg. @page 쪽 번호 색도 var(--print-ink)
Task 7: Ruling (사용자 요청): 인쇄 로그 표가 고정 배치라 칸이 같은 너비 → th[data-column]로 시각 36mm·경로 44mm, 로그 내용이 나머지
Task 7: complete (tests: cssStructure 9/9, visual:compare 0 diffs except server-detail 6개(임시 폴더 이름), e2e 9/9, unit 실패 = Windows 환경만(EPERM, golden CRLF; resultImport는 전체 실행에서만 흔들림))
Task 8: Ruling (사용자 결정 2026-11-23): 30분 안에 끝낼 수 있는 것만 → Step 4(README CSS 규칙·visual 명령) 먼저. 남은 것: Step 1 단계 맞춤(tokens.css 밖 px 값 469곳: font-size 108·padding 111·gap 106·margin 102·border-radius 42, 화면 너비 기준 480·640·760·768·820·900·1100·1180 → 480·640·900·1180), Step 2 px 직접 값 검사 테스트, Step 3 visual:report 판정, Step 5 테스트, 끝나면 이 작업 폴더 삭제. 30분 단위로 나눠 할 것(예: 모서리 → 글자 → 간격 → 화면 너비)
