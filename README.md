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

`npm run build`는 TypeScript 서버 코드, 화면, `dist/script-parts`, 템플릿 샘플과 공통코드를 `dist/`에 모읍니다. 실행 환경은 Node.js 22 이상이어야 합니다. 빌드 산출물만 별도 위치에서 실행하려면 Node.js 런타임과 운영 의존성(`fastify`, `@fastify/static`, `pino-pretty`)도 준비해야 합니다. `dist/` 폴더로 이동한 뒤 의존성을 사용할 수 있게 하고 `node server.js`로 실행하세요. `dist/data`의 운영 서버·정책·템플릿 데이터는 배포 갱신 때 보존해야 합니다.

빌드 없이 개발할 때는 `npm run dev`를 사용합니다.

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

Windows 스크립트 원본은 `src/script-parts/windows` 아래의 `common`, `web`, `was`, `db`, `system` 폴더에 점검 항목별 파일로 둡니다. 기본 템플릿은 이 원본 파일에서 생성되며, 현재 등록된 Windows 스크립트 원본은 모두 기본 템플릿에서 사용합니다. 빌드 산출물에서는 기본 원본이 `dist/script-parts`에 포함됩니다.

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
- `src/script-parts`는 기본 스크립트 원본, `data/templates.json`은 관리 화면에서 수정하는 운영 템플릿 저장소입니다. 새 설치와 누락 기본값 복구 때 원본을 운영 저장소에 복사합니다.
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
