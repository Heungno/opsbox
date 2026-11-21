# 보고서 자원 사용 추세 그래프 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보고서 상세에 CPU·메모리·디스크 사용률의 최근 2·4·8주 추세선을 라이브러리 없이 SVG로 그리고, 데모 데이터를 8주로 늘린다.

**Architecture:** 좌표·눈금·선 경로 계산은 순수 ES 모듈(`trend-chart-model.js`)이 맡고, DOM 생성(`trend-chart.js`)은 그 결과를 createElementNS로 그리기만 한다. 데이터는 보고서 화면이 이미 불러오는 점검 이력(`historyResults`)을 쓴다.

**Tech Stack:** 의존성 없는 브라우저 ES 모듈 + SVG, CSS 변수(밝은·어두운 테마), node:test(+tsx)로 ES 모듈 직접 import.

**Spec:** `docs/superpowers/specs/2026-11-21-report-trend-chart-design.md`

## Global Constraints

- 외부 라이브러리·CDN 금지, 인라인 스크립트·`onclick` 금지(CSP `script-src 'self'`).
- DOM은 `createElement`/`createElementNS` + `textContent`만 사용(값을 HTML로 넣지 않음).
- 기간 버튼 2주(14일)·4주(28일, 기본)·8주(56일). 끝점은 지금 보는 보고서의 `checkDate`.
- y축 0~100%, 주의 70%·위험 90% 점선. 숫자가 아닌 값은 점에서 빼고 선을 끊음.
- 인쇄 시 밝은 색·값 표시 상자 숨김.
- 문구·주석·커밋 메시지는 한국어.

## Review Focus

1. **같은 시각 점검이 여러 건이거나 기간 안 결과가 1건 이하** — 그래프가 0으로 나눗셈 없이 그려지거나 "결과가 부족합니다" 안내. → Task 1 테스트.
2. **`checkDate` 형식이 비거나 이상한 결과**(예전 형식, 빈 값) — 그 결과만 빼고 나머지는 그림. → Task 1 테스트.
3. **값이 100을 넘거나 음수**(잘못 수집된 값) — 축 밖으로 나가지 않게 0~100으로 자름(표시 값은 원래 숫자). → Task 1 테스트.
4. **비교 선택이 기간 밖의 점검**이면 빈 점을 그리지 않고 오류도 없음. → Task 2 테스트.
5. **키보드 사용자** — 점에 포커스(tabindex)·Enter로 이동, 값 표시 상자도 포커스로 열림. → Task 2 테스트.

---

### Task 1: 추세 모델 (순수 계산)

**Files:**
- Create: `src/public/reports/trend-chart-model.js`
- Test: `test/trendChartModel.test.ts`

**Interfaces:**
- Produces:
  ```js
  export const TREND_SERIES = [{ key: 'cpu', label: 'CPU' }, { key: 'memory', label: '메모리' }, { key: 'disk', label: '디스크' }];
  export function parseCheckDate(text) // 'YYYY-MM-DD HH:mm:ss' → ms(로컬), 형식이 아니면 NaN
  export function buildTrendModel(results, { endDate, days, width = 720, height = 240, padding = { top: 12, right: 16, bottom: 28, left: 40 } })
  // → { enough: boolean, start, end, series: [{ key, label, points: [{ x, y, value, fileName, date }], paths: string[] }],
  //     xTicks: [{ x, label }], yTicks: [{ y, label }], thresholds: [{ y, value: 70|90, label: '주의'|'위험' }] }
  ```
- `results`는 `historyResults` 항목(`{ fileName, checkDate, cpu, memory, disk }`). 기간: `end - days*86400000 ≤ t ≤ end`. 점은 시간순. `paths`는 연속된 유효 점끼리의 SVG path `d` 문자열 목록(값이 없는 점에서 끊김). x는 start~end 시각 비례(start=end면 가운데), y는 `clamp(value, 0, 100)` 기준. x 눈금: 기간 14일 → 2일 간격, 28일 → 7일, 56일 → 7일, 라벨 `MM/DD`. `enough`는 유효 점이 있는 결과가 2건 이상.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/trendChartModel.test.ts`
  - `parseCheckDate('2026-11-21 09:05:00')`가 `new Date(2026, 10, 21, 9, 5, 0).getTime()`, `parseCheckDate('')`·`parseCheckDate('2026/11/21')`는 NaN.
  - 기간 필터: endDate 11-21 09:00, days 14, 결과 11-01·11-08·11-21·11-22 → 11-08·11-21만, 시간순.
  - y 좌표: height 240·padding top 12·bottom 28일 때 값 100 → y 12, 0 → y 212, 150 → y 12(자름)·`value` 150 유지, -5 → y 212.
  - 값이 없는 결과(memory null) 사이에서 memory 선은 `paths.length === 2`, cpu는 1.
  - 같은 시각 결과 2건이면 x가 같고 NaN 없음; 결과 1건이면 `enough === false`, 점 x는 가운데.
  - `checkDate`가 빈 결과는 제외.
  - 기준선 2개(70 주의, 90 위험), y 눈금 0·25·50·75·100 라벨 `0%`…`100%`.
  - x 눈금: days 28이면 7일 간격(라벨 5개 이내), 라벨 형식 `/^\d{2}\/\d{2}$/`.
- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/trendChartModel.test.ts` → 모듈 없음 FAIL
- [ ] **Step 3: 구현** (위 Interfaces 값 그대로)
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `보고서 추세 그래프: 좌표·눈금 계산 모듈`

---

### Task 2: 그래프 그리기와 보고서 연결

**Files:**
- Create: `src/public/reports/trend-chart.js`
- Modify: `src/public/reports/report-detail.html`(자원 사용량 요약 아래 카드: 제목 "자원 사용 추세", 기간 버튼 3개 `data-days`, 그래프 영역 `#trend-chart`, 스크립트 캐시 버전), `src/public/reports/report-detail.js`(renderReport에서 그리기, 기간 버튼·비교 선택 변경 시 다시 그리기), `src/public/shared/css/app.css`(`--trend-cpu`·`--trend-memory`·`--trend-disk` 밝은·어두운 값, 차트·범례·값 상자 스타일), `src/public/reports/report-print.css`(인쇄 시 값 상자·기간 버튼 숨김, 밝은 색)
- Test: `test/trendChart.test.ts` (테스트 안의 최소 DOM 흉내: `createElementNS`, `createElement`, `setAttribute`, `append`, `addEventListener`, `textContent`, `querySelectorAll`은 직접 순회)

**Interfaces:**
- Consumes: Task 1 `buildTrendModel`, `TREND_SERIES`.
- Produces: `export function renderTrendChart(container, { results, endDate, days, currentFile, compareFile, onSelect(fileName) })` — container 내용을 바꿈. `enough === false`면 `<p class="policy-help">추세를 그릴 점검 결과가 부족합니다.</p>`만.
- SVG 구성: 기준선(`class="trend-threshold"`, 점선), y·x 눈금 텍스트, 계열마다 `path`(`class="trend-line trend-<key>"`), 점 `circle`(`class="trend-point trend-<key>"`, `tabindex="0"`, `aria-label="<일시> <계열> <값>%"`), 지금 보고서 점은 `is-current`(채움), 비교 점검 점은 `is-compare`(빈 원). 범례는 SVG 밖 HTML. 값 상자는 `div.trend-tooltip`(hidden) — 점 `mouseenter`/`focus` 때 일시·CPU·메모리·디스크 값, `mouseleave`/`blur` 때 숨김. 점 `click`/Enter → `onSelect(fileName)`.
- report-detail 연결: `onSelect`는 `location.href = /reports/detail?serverId=…&file=…`(encodeURIComponent).

- [ ] **Step 0: dataviz 스킬 읽기** (색·표식 규칙 확인 후 색 값 결정)
- [ ] **Step 1: 실패하는 테스트 작성** — `test/trendChart.test.ts`
  - 결과 5건 → `path.trend-line` 3개, `circle.trend-point` 15개, `is-current` 3개(현재 파일), `is-compare` 3개(비교 파일).
  - 비교 파일이 기간 밖이면 `is-compare` 0개, 오류 없음.
  - 점 `aria-label`에 일시와 `%` 포함, `tabindex === '0'`; 점에 `keydown` Enter → `onSelect` 호출 인자가 그 파일명.
  - 점 `focus` → `.trend-tooltip`의 `hidden === false`이고 텍스트에 `CPU`·`메모리`·`디스크` 포함; `blur` → hidden.
  - 결과 1건 → 안내 문구만, SVG 없음.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** (trend-chart.js, HTML·JS 연결, CSS, 인쇄 CSS)
- [ ] **Step 4: 통과 + 전체 테스트** — `npm test` → 실패 0 (`test/security.test.ts` 인라인 스크립트 검사 포함)
- [ ] **Step 5: 커밋** — `보고서 추세 그래프: SVG 그리기와 보고서 화면 연결`

---

### Task 3: 데모 데이터 8주

**Files:**
- Modify: `scripts/seed-demo.ts` (`DAYS` 14 → 56; `growthPerDay`·`heap(55 + day * 3.2)`·`sessions(40 + day * 3)`·`fileSize(380 + day * 12)`·BATCH Swap 증가처럼 `day`에 비례하는 값은 8주 끝 값이 지금(14일 끝)과 비슷하도록 시작값·기울기 조정; "DAYS - n" 사건 시나리오는 그대로), `README.md`(데모 설명의 "최근 14일" → "최근 8주")

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — `npm run demo:seed` 출력에 오류 없음, 결과 건수 약 4배(서버 12대 × 56일 − 누락 + 재점검), 모든 결과의 CPU·메모리·디스크 0~100 사이(seed 후 DB 조회로 확인), 마지막 날 상태 분포가 이전(위험 몇 건 포함)과 비슷.
- [ ] **Step 3: `npm test`** → 실패 0
- [ ] **Step 4: 커밋** — `데모 데이터 기간을 8주로 늘림 (추세 그래프 확인용)`

---

## Self-Review 결과
- Spec 대응: 위치·데이터·축·기준선·현재/비교 점·값 상자·이동·부족 안내 → T1·T2, 다크·인쇄 → T2, 샘플 데이터 → T3. 비목표는 다루지 않음.
- 위험: 브라우저에서 직접 보지 못하면 그래프 모양(겹침·글자 크기)은 데모 서버로 사용자 확인이 필요.
