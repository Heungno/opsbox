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
- 파일 존재 여부 점검

---

## 지원 서버 유형

- WEB
- WAS
- DB

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
- 점검 이력 조회

### Report

- 점검 결과 리포트
- 상태 분석
- 프로세스 상태
- 디렉토리 사용률

---

## 서버 정보 구조

```json
{
  "id": "WEB01",
  "name": "업무웹01",
  "type": "WEB",
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

  "network": "UP",

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

---

## License

Internal Use Only
