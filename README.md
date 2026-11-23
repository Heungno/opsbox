# OpsBox

사내 서버(WEB·WAS·DB·기타) 정기 예방점검 관리 시스템입니다. 서버별 점검 스크립트를 만들어 내려받고, 서버에서 실행한 결과 JSON을 모아 대시보드와 보고서로 보여 줍니다. 외부 CDN·웹폰트 없이 폐쇄망에서 동작합니다.

사용 방법은 [사용자 가이드](docs/USER_GUIDE.md), 테이블 구조와 백업·복구는 [DB 문서](docs/DATABASE.md), 점검 기준 원문은 [예방점검 매뉴얼](docs/INFORMATION_SYSTEM_PREVENTIVE_CHECK_MANUAL.md)에 있습니다.

## 주요 기능

- **서버 관리**: 한 서버에 WEB·WAS·DB·기타 역할을 여러 개 지정하고 역할별 제품을 설정합니다.
  - WEB: WebtoB, Apache HTTP Server, IIS, Nginx
  - WAS: JEUS, Tomcat, JBoss, Node.js
  - DB: MSSQL, MariaDB, CUBRID, PostgreSQL
- **점검 정책 관리**: OS(Windows·Linux)별로 기본·WEB·WAS·DB 정책을 만들고, 서버에서 불러와 서버별 값(프로세스, 경로, 포트, URL, DB 인스턴스 등)을 입력합니다.
- **점검 만들기**: 스크립트를 쓰지 않고 폼만 채워 점검 항목을 추가합니다. 6가지 유형을 지원하고, 매뉴얼 기준으로 준비된 점검 17개가 있습니다.
- **스크립트 관리**: 점검 항목별 PowerShell·bash 조각과 SQL 쿼리를 편집하고 변경 이력에서 복원합니다. 서버가 스크립트를 내려받을 때 조각을 한 파일로 조립합니다.
- **결과 수집**: 수신함 폴더의 결과 JSON을 자동으로 가져오거나 화면에서 올립니다. 원본은 암호화해 백업합니다.
- **대시보드·보고서**: 상태별(정상·주의·위험·미수집) 집계를 보여 줍니다. 보고서는 유형별 점검표, 이전 점검과의 비교, 자원 사용 추세 그래프(4·12·26주), A4 인쇄·PDF를 지원합니다.
- **공통코드 관리**: 역할, OS, 제품, 상태 이름 같은 선택값을 관리합니다. **변경 이력** 화면에서는 감사 로그를 조회합니다.
- 밝은 테마와 어두운 테마를 전환할 수 있습니다. 처음에는 기기 설정을 따릅니다.

**점검 대상 지원 범위**
- Windows Server 2012 이상, PowerShell 3.0 이상(5.1 권장)
- Linux bash 4.2 이상

## 실행

Node.js 22.13 이상(권장 24)이 필요합니다. DB는 내장 `node:sqlite`를 쓰므로 따로 설치할 필요가 없습니다.

```powershell
npm install
npm run dev        # 개발 실행 (http://localhost:3000)
npm run build      # dist/ 에 서버·화면·초기 데이터 모으기
npm start          # dist/server.js 실행
npm test           # 테스트 (bash 스크립트 실행 테스트는 Linux에서만)
npm run test:e2e   # 브라우저 테스트 (Chromium 필요, OPSBOX_E2E_BROWSER로 경로 지정)
```

계정 추가: `node scripts/create-user.cjs <아이디>` (비밀번호 12자 이상). 이름과 비밀번호는 각자 화면의 **내 정보**에서 바꿉니다.

`dist/`만 다른 곳으로 옮겨 실행할 때는 `package.json`의 `dependencies`도 함께 준비하고 `node server.js`로 실행합니다.

### 데모 데이터

```powershell
npm run demo:seed     # data/demo/ 에 데모 DB 생성 (다시 실행하면 새로 만듦)
npm run demo:dev      # 데모 DB로 http://localhost:3001 실행 (demo / demo1234)
npm run demo:remove   # data/demo/ 삭제
```

- 서버 12대에 서버별로 최근 26주치 주간점검 결과(주 1회)가 들어 있습니다. 날짜는 실행일을 기준으로 만듭니다. 운영 DB는 건드리지 않습니다.
- 서버마다 상황이 하나씩 들어 있습니다.
  - 디스크 증가(DB-03), 백업 실패 후 재점검(DB-01), WebtoB 서비스 중지(WEB-01)
  - JVM Heap 증가(WAS-01), Heap Dump(WAS-02), 로그 오류·HTTP 실패(WEB-02)
  - 프로세스·포트 중지(APP-01), CUBRID HA 점검(DB-04), 배치 CPU 급증(BATCH-01), 2주째 미수신(FILE-01)
- 생성 규칙은 `scripts/seed-demo.ts`에 있습니다.

## 데이터와 결과 수집

- 모든 데이터는 `data/opsbox.db`(SQLite)에 저장되고 Git에서는 제외됩니다.
- `seeds/*.json`(템플릿, 정책, 공통코드)은 **DB를 새로 만들 때만** 넣는 기본값입니다. 이후에는 DB가 원본입니다.
- DB 구조는 `src/db/schema.ts`에 있고 `PRAGMA user_version`으로 버전을 관리합니다. 자세한 내용은 [DB 문서](docs/DATABASE.md)를 보세요.
- 재구성 전 OpsBox가 만든 `data/opsbox.db`는 열 수 없습니다. 백업한 뒤 지우고 다시 시작하세요(시작할 때 안내가 나옵니다).

**결과 수집 흐름**
1. 점검 스크립트가 결과 저장 경로(설정 → 결과 수집의 OS별 기본값 또는 서버별 지정)에 `<서버ID>_<시각>.json`을 저장합니다.
2. OpsBox가 시작할 때와 5분마다 수신함(`OPSBOX_RESULT_INBOX`, 기본 `data/inbox`) 바로 아래의 결과 파일을 읽어, 파일 안의 서버 ID로 서버를 구분해 저장합니다. 결과 저장 경로와 수신함은 보통 같은 공유 폴더입니다.
3. 원본은 AES-256-GCM으로 암호화해 `data/backup/results/<연도>/<서버ID>/`에 보관하고, 수신함에서는 지웁니다.
4. 같은 파일은 다시 저장하지 않습니다. 형식 오류가 났거나 미사용 서버의 파일은 수신함에 그대로 남깁니다.

**백업 키**
- `data/backup.key`가 없으면 처음 실행할 때 자동으로 만듭니다.
- **키를 잃어버리면 백업을 복구할 수 없으니** 다른 매체에 따로 보관하세요.
- 복원: `node scripts/decrypt-backup.cjs <.enc 파일 또는 폴더> [출력]`

## 환경변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `OPSBOX_PORT` | `3000` | 접속 포트 (데모 3001) |
| `OPSBOX_DB_PATH` | `data/opsbox.db` | SQLite DB 파일 |
| `OPSBOX_RESULT_INBOX` | `data/inbox` | 결과 수신함 폴더, 여러 개는 `;`로 구분 |
| `OPSBOX_BACKUP_DIR` | `data/backup/results` | 암호화 백업 폴더 |
| `OPSBOX_BACKUP_KEY` / `OPSBOX_BACKUP_KEY_FILE` | (없음) / `data/backup.key` | 백업 키(base64 32바이트) 또는 키 파일 |
| `OPSBOX_IMPORT_INTERVAL_MINUTES` | `5` | 자동 가져오기 주기(분), 0이면 끔 |
| `OPSBOX_IMPORT_MIN_AGE_SECONDS` | `10` | 이 시간 안에 바뀐 파일은 다음 주기로 미룸 |
| `OPSBOX_AUDIT_RETENTION_DAYS` | `365` | 감사 로그 보관 기간, 0이면 계속 보관 |
| `OPSBOX_LOG_LEVEL` / `OPSBOX_LOG_DIR` | `info` / `logs` | 로그 수준과 폴더 |
| `OPSBOX_LOG_FILE` | (켜짐) | `false`면 파일 로그 끔 |
| `OPSBOX_LOG_RETENTION_FILES` / `OPSBOX_LOG_MAX_SIZE` | `30` / `100m` | 남길 로그 파일 수, 파일 하나의 최대 크기 |

**로그**
- 파일 로그는 `logs/opsbox.<날짜>.<번호>.log`에 JSON 한 줄씩 남습니다. 터미널에는 요청마다 한 줄씩 나옵니다.
- 화면 오류 알림에 나오는 **요청 ID**로 로그를 찾을 수 있습니다: `grep '"reqId":"<ID>"' logs/*.log`
- 쿠키, 비밀번호 같은 값은 `[숨김]`으로 기록합니다.

## 개발 참고

```text
src/server.ts      시작점 (listen, 결과 가져오기 스케줄러, 종료 처리)
src/app.ts         Fastify 앱 조립 (보안 헤더, 로그인 확인, 화면·API 라우트)
src/db/            SQLite 연결, 스키마·버전(schema.ts), 새 DB 기본값(seed.ts)
src/features/      기능별 폴더: servers, policies, templates, common-codes, settings,
                   results, reports, dashboard, scripts(check-builder 포함), audit, auth
                   각 폴더: routes.ts(API) · service.ts(규칙) · repository.ts(SQL) · types.ts
src/shared/        오류 클래스, HTTP 응답 도우미, 로거, 화면 레이아웃 조립
src/public/        화면: 메뉴별 폴더(dashboard, reports, settings/*), 공통은 shared/
                   각 화면: <화면>.js(연결부) + <화면>-*.js(로직, 단위 테스트 대상)
seeds/             새 DB에 넣는 기본 공통코드·정책·템플릿
scripts/           데모·계정 생성·백업 복호화·빌드 보조
test/              node:test 테스트 (golden/: 생성 스크립트·설정 API 기준 비교 파일,
                   ui/: 화면 로직 단위 테스트, e2e/: 브라우저 테스트)
```

- **API 응답 형식**: 성공은 `{ success: true, data }`, 실패는 `{ success: false, code, message, errors?, requestId? }`입니다.
  - 서버 코드에서는 `src/shared/errors.ts`의 오류 클래스를 던집니다.
  - 화면 코드에서는 `fetch` 대신 `src/public/shared/js/api.js`의 `api()`를 씁니다.
- **CSP**: `script-src 'self'`라서 HTML 안의 인라인 스크립트와 `onclick`은 동작하지 않습니다. 별도 `.js` 파일로 작성하세요.
- **기능끼리의 의존**: 다른 기능은 그 기능의 `service.ts`만 import합니다. `repository.ts`(SQL)는 같은 기능 안에서만 씁니다.
- **화면 코드 규칙**
  - 화면마다 연결부(`<화면>.js`: 요소 찾기·이벤트·API 호출)와 로직(`<화면>-*.js`: 계산·그리기 순수 함수)을 나눕니다. 로직 모듈은 `document`·`window`를 직접 쓰지 않고, **상대 경로로만 import** 합니다(Node 테스트에서 불러오기 위해).
  - 연결부의 화면 상태는 맨 위 `const state = { ... }` 하나에 모읍니다.
  - 화면에 보이는 이름·선택 목록은 하드코딩하지 않고 `shared/js/codes.js`(`codeLabel`·`codeList`·`roleLabel`)로 공통코드에서 가져옵니다. 프로그램 동작이 기대는 값(정책 분류 등)은 서버 `src/shared/constants.ts`에 두고, 화면에 필요하면 API로 내려줍니다.
  - 요소는 `shared/js/dom.js`의 `el()`로 만들고 `innerHTML`은 쓰지 않습니다.
- **CSS 규칙** (`src/public/shared/css/`, `test/cssStructure.test.ts`가 검사)
  - 파일 역할: `tokens.css`(색·글꼴 토큰, 간격 `--space-*`, 글자 크기 `--text-*`, 모서리 `--radius-*` 단계) → `base.css`(요소 기본값) → `layout.css`(사이드바·본문 틀) → `components.css`(여러 화면이 쓰는 부품: 카드·표·배지·버튼·폼·대화상자 등) → `pages/<화면>.css`(그 화면에서만 쓰는 규칙). `app.css`는 이 순서로 `@import`만 하고, HTML은 `app.css` 하나만 링크합니다(보고서 상세만 `reports/report-print.css`를 더 링크).
  - 색은 토큰으로만 씁니다(`var(--ink)`, `var(--crit)` 등). 규칙 안에 `#hex`·`rgb()`·색 이름을 직접 적지 않습니다(`transparent`, `currentColor`, 토큰을 섞은 `color-mix()`는 허용). 새 색이 필요하면 `tokens.css` 위 설명 목록과 토큰 블록에 용도 이름으로 추가합니다.
  - `padding`·`margin`·`gap`·`font-size`·`border-radius`도 토큰으로만 씁니다(`var(--space-3)`, `var(--text-md)`, `var(--radius-control)` 등). px을 직접 적지 않으며(0·1px·%는 허용) 테스트가 검사합니다. 화면 너비 기준(`@media`)은 480·640·900·1180px 네 가지만 씁니다.
  - 다크 테마는 `tokens.css`의 `:root[data-theme="dark"]`에서 토큰 값만 바꿉니다. 규칙마다 다크 덮어쓰기를 만들지 않습니다.
  - 같은 선택자를 두 파일에 두지 않습니다. 새 화면의 CSS는 `pages/`에 파일을 만들고 `app.css`에 `@import`를 추가합니다.
  - `!important`는 같은 줄(또는 바로 윗줄)에 이유 주석이 있을 때만 씁니다. HTML에 `style="…"`·`<style>`을 쓰지 않고 클래스로 만듭니다(그래프 위치처럼 JS가 계산하는 값은 예외).
  - 인쇄(`report-print.css`): 색·글꼴은 맨 위 인쇄 토큰 블록(`--print-ink`, `--print-paper`, `--print-line` 등)에서만 정하고, 화면 선택자 재정의는 `@media print` 안에서만 합니다. 다크 테마로 인쇄해도 밝은 테마로 인쇄한 것과 같게 나옵니다.
  - CSS나 화면 JS를 바꾸면 모든 HTML의 `?v=` 값을 같은 새 값으로 올립니다(브라우저 캐시).
- **브라우저 테스트**: `npm run test:e2e`는 임시 데모 DB로 OpsBox를 띄워 모든 화면을 열어 보고(페이지·콘솔 오류 없음), 서버 미사용·결과 수집·정책 저장·공통코드 이름 반영을 실제로 눌러 봅니다. Termux는 `chromium-browser`, PC는 설치된 Chrome을 자동으로 찾습니다.
- **화면 모양 비교**: CSS를 정리할 때 모양이 바뀌지 않았는지 확인합니다. 임시 데모 DB로 OpsBox를 띄워 화면·상태(hover·focus·대화상자·알림·빈 목록·인쇄) × 밝은/다크 × 화면 너비 120가지를 열고, 계산된 스타일과 스크린샷을 `test/visual/.out/`에 저장합니다(git 제외).
  - `npm run visual:baseline`: 지금 CSS로 기준을 찍습니다. 바꾸기 전에 한 번.
  - `npm run visual:compare`: 기준과 계산된 스타일을 비교해 다른 요소·속성을 보여 줍니다(전체 약 15분). 일부러 모양을 바꿨다면 확인한 뒤 그 시나리오만 기준을 다시 찍습니다.
  - `npm run visual:report`: 전·후 스크린샷과 차이 이미지를 나란히 놓은 `test/visual/.out/report.html`을 만듭니다.
  - `-- --only=<글자>`는 baseline·compare에만 적용되어 이름에 그 글자가 든 시나리오만 돌립니다(예: `npm run visual:compare -- --only=report-print`).
  - `test/visual/.out/notes.json`에 `{ "시나리오 이름": "판정 메모" }`를 적어 두면 report가 그 시나리오 옆에 메모를 보여 줍니다.
  - 서버 상세의 "OpsBox 수신함" 칸에 실행마다 다른 임시 폴더 이름이 나와서, 서버 상세 화면은 줄바꿈 높이가 조금 달라질 수 있습니다(CSS 차이 아님).
  - CSS를 고치는 동안에는 비교를 돌리지 않습니다(서버가 파일을 그때그때 읽음).
- **기준 비교 테스트**: `test/golden.test.ts`는 데모 서버의 생성 스크립트와 설정 API 응답을 `test/golden/`과 비교합니다. 동작을 일부러 바꿨을 때만 `node --import tsx scripts/update-golden.ts`로 다시 만들고, 바뀐 줄을 확인한 뒤 커밋하세요.
- **공통 레이아웃**: 사이드바 등 공통 레이아웃은 `src/public/shared/fragments/layout.html`이고, 서버가 각 화면에 붙여서 내보냅니다.

## 향후 계획

- 권한 구분(관리자/일반). 점검 만들기의 직접 입력 명령이 관리자 권한으로 실행되기 때문에 필요합니다.
- 스케줄 점검, 알림

## License

Internal Use Only
