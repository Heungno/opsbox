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

## 인계 메모 (2026-11-23, 휴대폰 Termux → PC로 옮김)
Task 4 진행 중 (완료 아님). 지금 상태:
- base.css(56개 선택자)·layout.css(281개)를 legacy.css에서 옮김, app.css import 순서 tokens → base → layout → legacy.
- 옮기기 도구: tools/do-move.cjs (같은 선택자를 마지막 위치로 합치되, 사이에 같은 계열 속성을 정하는 다른 규칙이 있으면 그 선언은 원래 자리에 남김).
  처음 버전(무조건 마지막 위치로 합침)은 모바일 메뉴 사이드바 폭을 바꿨음 → 고친 뒤 mobile-menu-open 차이 0. 고친 뒤 전체 120개 비교는 아직 안 돌림.
- 다음 할 일:
  1. 기준 다시 찍기 (PC는 글꼴·렌더링이 달라 Termux 기준을 못 씀; .out은 git에 없음):
     git show 18f3cdd:src/public/shared/css/app.css > src/public/shared/css/app.css
     npm run visual:baseline
     git checkout src/public/shared/css/app.css
     (18f3cdd의 app.css는 하나짜리 원래 파일. 기준을 두 번 찍어 차이 0인지 먼저 확인)
  2. npm run visual:compare → 차이 0 확인
  3. 안 쓰이는 선언 지우기: node --import tsx tools/winners.ts --match='^(dashboard|server-detail-web|policy-management|report-detail|account)-|collapsed|mobile|hover|toast|dialog|login|print|policy-tab' --files=layout.css,base.css
     (CDP로 요소마다 cascade 승자 선언을 모음, 기본+hover 강제+focus 강제. Termux에선 58개에 20분 넘게 걸림)
     → node tools/prune.cjs src/public/shared/css/layout.css --dry 로 먼저 보고, 맞은 적 있는 규칙의 진 선언만 지움(맞은 적 없는 규칙은 목록만)
  4. layout.css에 남은 직접 색(126개 중 남은 것)·다크 덮어쓰기 → 토큰으로, !important 이유 주석(base.css 3줄)
  5. visual:compare 0, npm test, npm run test:e2e → 커밋 "CSS 정리: 기본·배치(사이드바·본문)" → Task 4 complete 줄
- 도구들은 작업용이라 Task 7/최종 정리 때 이 폴더째 지움.
