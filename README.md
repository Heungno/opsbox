# OpsBox

사내 서버 운영 점검 및 리포트 관리 시스템

## 개요

OpsBox는 서버 운영 담당자가 WEB, WAS, DB 서버를 등록하고
점검 스크립트를 실행한 후 결과를 수집 및 조회할 수 있는
경량 운영 관리 시스템입니다.

주요 기능

- 서버 등록 및 관리
- 서버 유형별 점검 스크립트 제공
- 점검 결과 수집 및 조회
- Dashboard 제공
- 점검 리포트 생성
- 프로세스 상태 점검
- 디렉토리 사용량 점검
- 다중 디스크 사용량 점검
- 특정 파일 크기 및 존재 여부 점검
- TCP/UDP 포트 리스닝 점검
- WEB/WAS 제품 분류(WebtoB, Apache HTTP Server, IIS, Nginx, JEUS, Tomcat, JBoss, Node.js)
- 서버 한 대에 WEB, WAS, DB, 기타 역할을 복수 지정하고 역할별 제품을 설정
- 서버 등록 정보와 역할/제품을 구역별로 구분해 입력하고, 점검 정책 항목별 추가 버튼을 구분
- 서버 등록과 상세 수정이 공통 HTML 모달을 사용
- 설정 화면에서 점검 항목별 PowerShell 템플릿과 SQL 쿼리를 관리하고, 다운로드 시 서버 설정에 맞춰 한 파일로 조립
- Windows/Linux 공통 점검 스크립트 및 MSSQL 상태 쿼리 샘플 기본 제공
- 템플릿 편집기에서 SQL, PowerShell, Bash 구문과 `{{변수}}` 토큰 색상 강조
- 점검 보고서 WebtoB 콘솔 출력과 서버 상세 JSON 예시에도 구문별 색상 강조
- 전체 화면에서 공통 레이아웃을 사용하고 공통 CSS·JavaScript·HTML 조각을 `src/public/shared`에 배치해 페이지별 폴더와 구분
- 사이드바 메뉴를 대시보드, 점검 보고서, 설정으로 구성하고 설정 아래에 서버 관리·스크립트 관리를 배치
- 해/달 토글로 전체 화면 밝은 테마와 어두운 테마를 전환
- 스크립트 관리 화면은 전체 목록과 편집기를 함께 표시하며, 서버 상세에서 수정할 때는 해당 템플릿을 목록에서 선택한 상태로 엶
- 서버 상세의 점검 정책별 Windows 스크립트 템플릿 지정 및 다운로드 조립
- 서버 상세 점검 정책에서 공통·WEB/WAS 항목별 스크립트를 연결하고, DB는 단일 공통 실행기에 항목별 SQL 쿼리 템플릿을 연결
- DB 인스턴스·세션·데이터 영역·백업·로그·복제 및 사용자 쿼리는 정책 항목별 지정 인스턴스에서 실행
- DB 및 사용자 쿼리 결과를 보고서 표로 표시하고, WebtoB `wsadmin` 원문은 콘솔 출력 형태로 표시
- 스크립트 관리 목록에서 템플릿 종류, OS, 점검 영역, 점검 항목별 필터 제공
- 서버 점검 정책에서 기본 제공 스크립트와 사용자 지정 스크립트를 명확히 구분하고 기본 스크립트도 바로 편집 가능
- 서버 상세 기본 정보에 최근 점검 요약과 최근 5회 기록을 작은 표로 표시
- 점검 정책을 공통 기본점검, WEB, WAS, DB 독립 블록으로 구성하고 역할별 세부 항목을 추가·삭제
- Windows 점검 스크립트는 실행 준비, 자원, 프로세스, 경로, 포트, 역할별 수집, 결과 저장 항목 템플릿을 조립
- Windows PS1이 단계별 로그를 콘솔에 출력하고 결과 JSON을 직접 저장
- Windows 스크립트의 HTTP/HTTPS 상태 코드 및 응답 시간 점검
- Windows WAS 서버의 JDK `jstat` 기반 JVM Heap 사용률 점검
- Windows WebtoB WEB 서버의 `wsadmin` 정보·클라이언트 수·서버/서비스 상태 점검 (WebtoB 4.1)
- WEB/WAS 로그 점검은 서버별 폴더·기간을 저장하고 하위 폴더까지 검색해 오류 유형별 건수 집계
- DB 제품 분류(MSSQL, MariaDB, CUBRID, PostgreSQL)
- Windows MSSQL `sqlcmd`와 Windows 통합 인증을 이용한 읽기 전용 서버·데이터베이스 상태 점검
- Windows PowerShell 점검 스크립트의 UTF-8 BOM 적용으로 한글 메시지 인코딩 지원
- 서버·프로세스 가동 시간을 년·월·일·시·분 형식으로 표시
- 브라우저에 저장되는 전체 화면 테마 설정
- 외부 CSS와 웹폰트 없이 동작하는 오프라인 UI
- 서버 역할, 운영체제, 제품, 포트 프로토콜, 스크립트 항목 등 선택값을 `data/common-codes.json`에서 관리
- `/api/common-codes`를 통해 화면 선택 목록을 공통코드 JSON과 동기화

## 실행 및 빌드

```powershell
npm install
npm run build
npm start
```

`npm run build`는 TypeScript 서버 코드, 화면, 공통코드와 `data/templates.json`을 `dist/`에 모읍니다. 실행 환경은 **Node.js 22.13 이상(권장 24)** 이어야 합니다(내장 `node:sqlite` 사용, 별도 DB 설치 불필요). 빌드 산출물만 별도 위치에서 실행하려면 Node.js 런타임과 운영 의존성(`fastify`, `@fastify/static`, `pino-pretty`)도 준비해야 합니다. `dist/` 폴더로 이동한 뒤 의존성을 사용할 수 있게 하고 `node server.js`로 실행하세요.

빌드 없이 개발할 때는 `npm run dev`를 사용합니다.

## 데이터 저장 (SQLite)

모든 데이터는 SQLite 파일 하나(`data/opsbox.db`)에 저장합니다.

| 데이터 | 테이블 | 최초 이관 원본 |
| --- | --- | --- |
| 서버 | `servers` | `data/servers.json` |
| 점검 정책 | `policies` | `data/policy.json` |
| 스크립트 템플릿 / 이력 | `templates`, `template_history` | `data/templates.json`, `data/template-history.json` |
| 공통코드 | `settings` (`common_codes`) | `data/common-codes.json` |
| 사용자 | `users` | `data/user.json` |
| 점검 결과 | `check_results` | 공유 폴더의 결과 JSON (아래 참고) |

- 서버를 처음 실행할 때 테이블이 비어 있으면 위 JSON 파일을 DB로 옮깁니다. **이후에는 DB가 원본**이며 JSON 파일을 고쳐도 반영되지 않습니다.
- 백업은 서버를 멈춘 뒤 `data/opsbox.db`를 복사하거나, 실행 중에는 `sqlite3 data/opsbox.db ".backup backup.db"`를 사용합니다.
- 계정 추가: `node scripts/create-user.cjs <아이디>` (DB의 `users` 테이블에 저장)

## 점검 결과 가져오기와 암호화 백업

점검 스크립트는 지금처럼 `<공유폴더>/results/<연도>/<서버ID>/*.json`에 결과를 만듭니다. OpsBox는 이 파일을

1. 읽어서 DB(`check_results`)에 저장하고 (원본 JSON 전체 + 점검일시·상태·CPU·메모리·디스크)
2. 원본을 **AES-256-GCM으로 암호화**해 `data/backup/results/<연도>/<서버ID>/<파일>.json.enc`에 보관한 뒤
3. 공유 폴더의 원본을 삭제합니다.

- 실행 시점: 서버 시작 직후 1회 + `OPSBOX_IMPORT_INTERVAL_MINUTES`(기본 5분)마다. 수동 실행은 `POST /api/results/import`, 상태 확인은 `GET /api/results/import/status`.
- 같은 내용의 파일은 다시 저장하지 않습니다(SHA-256 비교).
- 수정된 지 10초가 안 된 파일은 쓰는 중일 수 있어 다음 주기로 미룹니다.
- JSON 형식 오류 등으로 실패한 파일은 지우지 않고 그대로 두며, 오류는 상태 API에서 확인할 수 있습니다.

**암호화 키**

- `OPSBOX_BACKUP_KEY`(base64, 32바이트) 환경변수가 있으면 그 값을, 없으면 `data/backup.key` 파일을 사용합니다. 파일이 없으면 처음 실행할 때 자동으로 만듭니다.
- **키를 잃어버리면 백업을 복구할 수 없습니다.** 키는 백업 폴더와 다른 곳(별도 매체, 금고 등)에 따로 보관하세요.
- 키 직접 만들기: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

**복원**

```powershell
node scripts/decrypt-backup.cjs data/backup/results/2026/WEB01/WEB01_20261116_175424.json.enc         # 화면 출력
node scripts/decrypt-backup.cjs data/backup/results/2026/WEB01/WEB01_20261116_175424.json.enc out.json  # 파일 저장
node scripts/decrypt-backup.cjs data/backup/results restored                                           # 폴더 전체
```

**환경변수**

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `OPSBOX_DB_PATH` | `data/opsbox.db` | SQLite DB 파일 |
| `OPSBOX_BACKUP_DIR` | `data/backup/results` | 암호화 백업 폴더 |
| `OPSBOX_BACKUP_KEY` | (없음) | 백업 키 (base64 32바이트) |
| `OPSBOX_BACKUP_KEY_FILE` | `data/backup.key` | 백업 키 파일 (`OPSBOX_BACKUP_KEY`가 없을 때) |
| `OPSBOX_IMPORT_INTERVAL_MINUTES` | `5` | 자동 가져오기 주기(분), 0이면 자동 실행 안 함 |
| `OPSBOX_IMPORT_MIN_AGE_SECONDS` | `10` | 이 시간 안에 수정된 파일은 다음 주기로 미룸 |

---

## 화면 파일 구조

화면은 메뉴 기준으로 폴더와 파일명을 맞추고, 각 화면의 HTML과 JavaScript를 같은 폴더에 둡니다.

```text
src/public/
├─ dashboard/
│  ├─ dashboard.html
│  └─ dashboard.js
├─ reports/
│  ├─ report-list.html
│  ├─ report-list.js
│  ├─ report-detail.html
│  └─ report-detail.js
├─ settings/
│  ├─ server-management/
│  │  ├─ server-list.html / server-list.js
│  │  └─ server-detail.html / server-detail.js
│  └─ script-management/
│     └─ script-management.html / script-management.js
└─ shared/
   ├─ css/
   ├─ fragments/
   └─ js/
```

서버 상세에서 스크립트를 수정하면 스크립트 관리 전체 화면을 열고, 목록 전체를 보여주면서 해당 스크립트를 선택합니다. 기존 `/servers` 및 `/settings/templates` 경로도 호환용으로 유지합니다.

Windows 점검 스크립트와 DB 쿼리를 포함한 기본 템플릿은 `data/templates.json`에서 관리합니다. 스크립트 관리 화면에서 저장한 변경 내용도 같은 파일에 기록되어 GitHub에 공유됩니다.

스크립트 템플릿의 내용을 수정해 저장하면 이전 내용은 `data/template-history.json`에 최대 50개 버전까지 보관됩니다. 스크립트 관리 화면의 변경 이력에서 이전 버전을 복원할 수 있으며, 복원 직전 내용도 이력에 추가됩니다.

---

## 서버 역할

한 서버가 WEB, WAS, DB 역할을 함께 수행하는 경우 서버를 한 번만 등록하고 해당 역할을 모두 선택합니다. 공통 OS 자원은 한 번 수집하고 역할별 제품 점검 및 보고서 양식은 각각 적용합니다. 기존 단일 `type`/`product` 서버 데이터도 읽을 때 역할/제품 정보로 호환 처리됩니다.

| 역할 | 제품 |
| --- | --- |
| WEB | WebtoB, Apache HTTP Server, IIS, Nginx |
| WAS | JEUS, Apache Tomcat, JBoss, Node.js |
| DB | MSSQL, MariaDB, CUBRID, PostgreSQL |
| 기타 | 별도 제품 없이 공통 점검 |

---

## 주요 화면

### Dashboard

- 전체 서버 현황
- 정상 / 경고 / 위험 상태
- 서버 유형별 집계
- 최근 점검 결과

### Server Management

- 서버 등록
- 서버 수정
- 서버 삭제

### Server Detail

- 서버 정보 확인
- 최신 점검 결과
- 점검 스크립트 다운로드
- Windows 실행 명령에서 결과 저장 폴더를 지정할 수 있으며, 비워 두면 서버정보의 공유 경로 아래 연도/서버 ID 폴더를 사용합니다.
- 점검 이력 조회

### Report

- 점검 결과 리포트
- WEB / WAS / DB / 기타 유형별 점검보고서 양식 및 서버별 보고서 트리
- 보고서 상세의 공통·역할별 결과 구분 및 A4 PDF 인쇄용 페이지 분할 최적화
- 상태 분석
- 프로세스 상태
- 디스크별 사용량
- 디렉토리 사용률
- 파일 크기 및 포트 리스닝 결과

### Template Settings

- 스크립트 템플릿은 서버별로 지정해 사용자 변수로 서버 설정을 삽입할 수 있습니다.
- Windows MSSQL은 하나의 DB 공통 PowerShell 실행기를 사용하며, 각 DB 정책에서 해당 점검 쿼리 템플릿을 선택합니다.
- 각 DB 정책 항목에서 해당 쿼리를 실행할 MSSQL 인스턴스 목록을 지정하며, 결과의 컬럼·행은 보고서 표로 표시됩니다.
- `data/templates.json`은 기본 점검 스크립트와 DB 쿼리를 포함한 공통 템플릿 데이터입니다. 관리 화면에서 변경하면 이 파일에 저장됩니다.
- 스크립트 관리는 `/settings/script-management`에서 수행합니다.

---

## 서버 정보 구조

```json
{
  "id": "WEB01",
  "name": "업무웹01",
  "type": "WEB",
  "roles": ["WEB", "WAS"],
  "products": { "WEB": "WebtoB", "WAS": "JEUS" },
  "os": "Linux",
  "ip": "10.10.10.11",
  "sharedPath": "\\\\NAS01\\OpsBox",

  "processes": [
    {
      "name": "nginx"
    }
  ],

  "directories": [
    {
      "path": "/logs",
      "warningPercent": 70,
      "criticalPercent": 90
    }
  ],

  "ports": [
    {
      "port": 443,
      "protocol": "TCP",
      "description": "HTTPS"
    }
  ]
}
```

---

## 점검 결과 구조

```json
{
  "server": "WEB01",
  "serverType": "WEB",
  "hostname": "WEB01",
  "checkDate": "2026-11-16 17:54:24",

  "cpu": 10,
  "memory": 40,
  "disk": 50,

  "network": "NotChecked",
  "disks": [
    {
      "device": "/dev/sda1",
      "mountPoint": "/",
      "totalGB": 100,
      "usedGB": 50,
      "freeGB": 50,
      "usagePercent": 50,
      "status": "Healthy"
    }
  ],

  "processes": [
    {
      "name": "nginx",
      "running": true
    }
  ],

  "directories": [
    {
      "path": "/logs",
      "sizeGB": 25,
      "usagePercent": 50
    }
  ],

  "ports": [
    {
      "port": 443,
      "protocol": "TCP",
      "description": "HTTPS",
      "listening": true
    }
  ]
}
```

---

## API

### 응답 형식

모든 JSON API는 같은 형식으로 응답합니다.

```jsonc
// 성공 (HTTP 2xx)
{ "success": true, "data": { ... }, "count": 3 }          // count·health 같은 부가 정보는 data 옆에

// 실패 (HTTP 4xx/5xx)
{
  "success": false,
  "code": "VALIDATION_ERROR",                            // 아래 오류 코드 표
  "message": "서버 ID는 필수입니다.",                       // 화면에 그대로 보여줄 수 있는 문장
  "errors": [{ "field": "id", "message": "서버 ID는 필수입니다." }],  // 입력값 오류일 때만
  "requestId": "req-1a"                                  // 서버 오류(5xx)일 때만, 로그 추적용
}
```

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | JSON 형식 오류, 빈 본문, 처리할 수 없는 입력(스크립트 템플릿 미선택 등) |
| 400 | `VALIDATION_ERROR` | 입력값 검증 실패 (`errors`에 필드별 내용) |
| 401 | `UNAUTHENTICATED` | 로그인 안 됨·세션 만료·로그인 실패 |
| 404 | `NOT_FOUND` | 대상 없음, 없는 API |
| 409 | `CONFLICT` | 이미 실행 중 등 현재 상태와 충돌 |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | 요청이 너무 크거나 JSON이 아님 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 서버 오류 (내부 메시지는 숨기고 `requestId`로 로그 확인) |

- 서버 코드에서는 `src/errors.ts`의 `BadRequestError`, `ValidationError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`를 던지면 위 형식으로 응답됩니다. 일반 `Error`는 500으로 처리됩니다.
- 화면 코드에서는 `fetch` 대신 `src/public/shared/js/api.js`를 사용합니다.
  - `api(url, { method, body })` → `data`만 반환, `apiRequest()` → 응답 전체 반환
  - 실패하면 `ApiError`(message, status, code, errors)를 던짐. 네트워크 오류·시간 초과(30초)·JSON이 아닌 응답도 같은 형태
  - 401이면 로그인 화면으로 이동 (`?next=`로 원래 화면 복귀)
  - `notifyError(error)` / `showToast(message, 'success')`로 화면 알림, 처리되지 않은 오류도 자동으로 알림
  - `downloadFile(url)`: 파일 다운로드 (실패하면 오류 알림)

### 타입 구조

```text
src/types/
├─ index.ts       모든 타입 모음 (import from '../types')
├─ api.ts         응답 형식, 오류 코드, 공통 파라미터
├─ auth.ts        사용자·세션
├─ commonCode.ts  공통코드
├─ server.ts      서버, 점검 설정(CheckConfig), DB 저장 구조(StoredServer)
├─ policy.ts      점검 정책
├─ template.ts    스크립트·쿼리 템플릿
├─ result.ts      점검 결과, 가져오기 요약
├─ report.ts      대시보드·보고서
└─ validation.ts  입력값 검증 결과
```

TypeScript는 `strict` 모드로 검사합니다.

### 목록


### Servers

| Method | URL              |
| ------ | ---------------- |
| GET    | /api/servers     |
| GET    | /api/servers/:id |
| POST   | /api/servers     |
| PUT    | /api/servers/:id |
| DELETE | /api/servers/:id |

### Scripts

| Method | URL                       |
| ------ | ------------------------- |
| GET    | /api/scripts/:type/:os    |
| GET    | /api/scripts/download/:id |

### Results

| Method | URL                                   |
| ------ | ------------------------------------- |
| POST   | /api/results/import                   |
| GET    | /api/results/import/status            |
| GET    | /api/results/:serverId                |
| GET    | /api/results/:serverId/latest         |
| GET    | /api/results/:serverId/file/:fileName |

### Dashboard

| Method | URL                    |
| ------ | ---------------------- |
| GET    | /api/dashboard/summary |
| GET    | /api/dashboard/recent  |

---

## 유효성 검증

서버 저장 시 다음 항목을 검증합니다.

### 프로세스

- 필수 입력
- 중복 금지
- 대소문자 무시 중복 체크

### 디렉토리

- 경로 필수
- 중복 금지
- Warning 0~100
- Critical 0~100
- Warning < Critical

---

## 프로젝트 구조

```text
src

├ routes
│ ├ dashboardRoutes.ts
│ ├ resultRoutes.ts
│ ├ scriptRoutes.ts
│ └ serverRoutes.ts

├ services
│ ├ dashboardService.ts
│ ├ resultService.ts
│ ├ scriptService.ts
│ ├ serverService.ts
│ └ serverValidation.ts

├ types
│ ├ server.ts
│ └ error.ts

public
├ css
│ └ app.css
├ fragments
│ └ sidebar.html
├ dashboard
│ ├ index.html
│ └ index.js
├ servers
│ ├ index.html
│ ├ index.js
│ ├ detail.html
│ └ detail.js
└ reports
  ├ index.html
  ├ index.js
  ├ detail.html
  └ detail.js

doc
└ USER_GUIDE.md

data
├ servers.json
└ scripts.json
```

---

## 향후 계획

- PDF Export
- 점검 결과 차트
- 템플릿 기반 점검 항목 관리
- 사용자 인증
- 권한 관리
- 스케줄 점검
- 알림 기능

## 화면 테마

모든 화면의 사이드바 하단에서 블루 슬레이트, 밝은 회색, 포레스트 테마를 선택할 수 있습니다. 선택한 테마는 사이드바뿐 아니라 페이지 배경, 카드, 표, 입력창과 강조색에 적용되며 현재 브라우저에 저장됩니다. CSS와 글꼴은 로컬 리소스만 사용합니다.

## 사용자 가이드

설치, 서버 등록, 점검 정책 설정, 스크립트 실행, 결과 확인 방법은 [doc/USER_GUIDE.md](doc/USER_GUIDE.md)를 참고하세요. 점검 기준 원문 정리는 [정보시스템 예방점검 매뉴얼](doc/INFORMATION_SYSTEM_PREVENTIVE_CHECK_MANUAL.md)을 참고하세요.

---

## License

Internal Use Only
