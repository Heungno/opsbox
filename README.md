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
- 서버 유형 분류: WEB, WAS, DB, 기타
- Windows 스크립트의 HTTP/HTTPS 상태 코드 및 응답 시간 점검
- Windows WAS 서버의 JDK `jstat` 기반 JVM Heap 사용률 점검
- Windows WebtoB WEB 서버의 `wsadmin` 정보·클라이언트 수·서버/서비스 상태 점검 (WebtoB 4.1)
- Windows PowerShell 점검 스크립트의 UTF-8 BOM 적용으로 한글 메시지 인코딩 지원
- 브라우저에 저장되는 전체 화면 테마 설정
- 외부 CSS와 웹폰트 없이 동작하는 오프라인 UI

---

## 지원 서버 유형

- WEB
- WAS
- DB
- 기타

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
- WEB / WAS / DB / 기타 유형별 점검보고서 양식 및 서버별 보고서 트리
- 상태 분석
- 프로세스 상태
- 디스크별 사용량
- 디렉토리 사용률
- 파일 크기 및 포트 리스닝 결과

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
