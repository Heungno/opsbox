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
T5 BASE=(이 커밋)
