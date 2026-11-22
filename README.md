# OpsBox

사내 서버(WEB·WAS·DB·기타) 정기 예방점검 관리 시스템입니다. 서버별 점검 스크립트를 만들어 내려받고, 서버에서 실행한 결과 JSON을 모아 대시보드와 보고서로 보여 줍니다. 외부 CDN·웹폰트 없이 폐쇄망에서 동작합니다.

사용 방법은 [사용자 가이드](doc/USER_GUIDE.md), 테이블 구조와 백업·복구는 [DB 문서](doc/DATABASE.md), 점검 기준 원문은 [예방점검 매뉴얼](doc/INFORMATION_SYSTEM_PREVENTIVE_CHECK_MANUAL.md)에 있습니다.

## 주요 기능

- **서버 관리**: 한 서버에 WEB·WAS·DB·기타 역할을 여러 개 지정하고 역할별 제품을 설정합니다.
  - WEB: WebtoB, Apache HTTP Server, IIS, Nginx
  - WAS: JEUS, Tomcat, JBoss, Node.js
  - DB: MSSQL, MariaDB, CUBRID, PostgreSQL
- **점검 정책 관리**: OS(Windows·Linux)별로 기본·WEB·WAS·DB 정책을 만들고, 서버에서 불러와 서버별 값(프로세스, 경로, 포트, URL, DB 인스턴스 등)을 입력합니다.
- **점검 만들기**: 스크립트를 쓰지 않고 폼만 채워 점검 항목을 추가합니다. 6가지 유형을 지원하고, 매뉴얼 기준으로 준비된 점검 17개가 있습니다.
- **스크립트 관리**: 점검 항목별 PowerShell·bash 조각과 SQL 쿼리를 편집하고 변경 이력에서 복원합니다. 서버가 스크립트를 내려받을 때 조각을 한 파일로 조립합니다.
- **결과 수집**: 공유 폴더의 결과 JSON을 자동으로 가져오거나 화면에서 올립니다. 원본은 암호화해 백업합니다.
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
```

계정 추가: `node scripts/create-user.cjs <아이디>`

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
- `data/*.json`(템플릿, 정책, 공통코드 등)은 **처음 실행할 때만** DB로 옮기는 초기값입니다. 이후에는 DB가 원본입니다.
- 새 버전의 기본 템플릿은 시작할 때 기존 DB에 추가됩니다. 사용자가 고친 템플릿은 건드리지 않습니다.

**결과 수집 흐름**
1. 각 서버 공유 폴더의 `results/`가 수신함입니다.
2. OpsBox가 시작할 때와 5분마다 결과 파일을 읽어, 파일 안의 서버 ID로 서버를 구분해 저장합니다.
3. 원본은 AES-256-GCM으로 암호화해 `data/backup/results/<연도>/<서버ID>/`에 보관하고, 수신함에서는 지웁니다.
4. 같은 파일은 다시 저장하지 않습니다. 형식 오류가 난 파일은 수신함에 그대로 남깁니다.

**백업 키**
- `data/backup.key`가 없으면 처음 실행할 때 자동으로 만듭니다.
- **키를 잃어버리면 백업을 복구할 수 없으니** 다른 매체에 따로 보관하세요.
- 복원: `node scripts/decrypt-backup.cjs <.enc 파일 또는 폴더> [출력]`

## 환경변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `OPSBOX_PORT` | `3000` | 접속 포트 (데모 3001) |
| `OPSBOX_DB_PATH` | `data/opsbox.db` | SQLite DB 파일 |
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
src/server.ts      Fastify 시작점
src/db/            SQLite 연결·테이블 생성·초기값 이관
src/routes/        API (서버·정책·템플릿·스크립트·결과·보고서·공통코드·감사 로그·인증)
src/services/      업무 로직 (스크립트 조립, 결과 가져오기, 상태 판정, 백업 등)
src/types/         공용 타입 (strict)
src/public/        화면: 메뉴별 폴더(dashboard, reports, settings/*), 공통은 shared/
scripts/           데모·계정 생성·백업 복호화·빌드 보조
test/              node:test 테스트
```

- **API 응답 형식**: 성공은 `{ success: true, data }`, 실패는 `{ success: false, code, message, errors?, requestId? }`입니다.
  - 서버 코드에서는 `src/errors.ts`의 오류 클래스를 던집니다.
  - 화면 코드에서는 `fetch` 대신 `src/public/shared/js/api.js`의 `api()`를 씁니다.
- **CSP**: `script-src 'self'`라서 HTML 안의 인라인 스크립트와 `onclick`은 동작하지 않습니다. 별도 `.js` 파일로 작성하세요.
- **공통 레이아웃**: 사이드바 등 공통 레이아웃은 `src/public/shared/fragments/layout.html`이고, 서버가 각 화면에 붙여서 내보냅니다.

## 향후 계획

- 권한 구분(관리자/일반). 점검 만들기의 직접 입력 명령이 관리자 권한으로 실행되기 때문에 필요합니다.
- 스케줄 점검, 알림

## License

Internal Use Only
