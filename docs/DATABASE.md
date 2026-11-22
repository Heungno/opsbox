# OpsBox 데이터베이스 안내

OpsBox가 데이터를 어디에, 어떤 구조로 저장하는지와 점검 결과가 DB에 들어오는 과정, 백업·복구 방법을 정리한 문서입니다.
운영 담당자와 OpsBox를 고치는 개발자가 함께 봅니다.

## 1. 한눈에 보기

- **DB는 SQLite 파일 하나**입니다. 기본 위치는 `data/opsbox.db`이며, Node.js에 내장된 `node:sqlite`를 쓰므로 별도 DB 서버 설치가 필요 없습니다.
- 서버·정책·템플릿·공통코드·사용자·점검 결과·변경 이력이 모두 이 파일에 있습니다. **DB가 원본**입니다.
- 점검 결과 원본 JSON은 DB에 넣은 뒤 **암호화해서 별도 폴더에 백업**하고, 공유 폴더의 원본은 지웁니다.
- 로그인 세션은 DB에 저장하지 않습니다(메모리). OpsBox를 다시 시작하면 모두 다시 로그인해야 합니다.

```
점검 대상 서버                       OpsBox 서버
┌─────────────────┐   결과 JSON     ┌──────────────────────────────────────────────┐
│ 점검 스크립트    │ ──────────────▶ │ 공유 폴더/results/  (수신함)                  │
│ (.ps1 / .sh)    │  ① 공유 폴더에   │        │ 5분마다 가져오기                     │
└─────────────────┘     직접 저장    │        ▼                                      │
        │                           │  검증 → DB(check_results) → 암호화 백업 → 원본 삭제 │
        │ ② 파일을 내려받아          │                    │                          │
        └── 화면에서 [결과 파일 올리기] ─▶ 같은 검증·저장 ──┘                          │
                                    │                                              │
                                    │  data/opsbox.db          data/backup/results/ │
                                    └──────────────────────────────────────────────┘
```

## 2. 파일 위치

| 파일·폴더 | 기본 위치 | 바꾸는 방법 | 설명 |
| --- | --- | --- | --- |
| DB | `data/opsbox.db` | `OPSBOX_DB_PATH` | 모든 데이터 |
| DB 작업 파일 | `data/opsbox.db-wal`, `data/opsbox.db-shm` | (DB와 같은 폴더) | WAL 모드라 생기는 파일. **DB 파일과 함께 다뤄야 합니다** (실행 중 복사할 때 주의, 7장) |
| 결과 백업 | `data/backup/results/<점검 연도>/<서버 ID>/<파일>.json.enc` | `OPSBOX_BACKUP_DIR` | 가져온 점검 결과 원본(암호화) |
| 백업 암호화 키 | `data/backup.key` | `OPSBOX_BACKUP_KEY` 또는 `OPSBOX_BACKUP_KEY_FILE` | **잃어버리면 결과 백업을 복구할 수 없음** |
| 초기값(시드) | `data/*.json` | – | DB가 비어 있을 때만 사용 (6장) |

`data/opsbox.db*`, `data/backup/`, `data/backup.key`는 Git에 올리지 않습니다.

## 3. 테이블

DB 연결 설정: `journal_mode = WAL`(읽기와 쓰기가 서로 막지 않음), `busy_timeout = 5000`(잠금 시 5초 대기), `foreign_keys = ON`.
테이블은 OpsBox가 시작할 때 없으면 만듭니다(`src/db/database.ts`).

### 3.1 설정 데이터 (JSON 문서형)

서버·정책·템플릿은 **한 행에 JSON 문서 한 건**을 그대로 저장합니다. 화면과 API가 다루는 모양 그대로라 항목이 늘어도 테이블을 바꿀 필요가 없습니다.

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `servers` | `id` (PK), `position`, `data` | 서버 1대 = 1행. `data`는 `basicInfo`(ID·이름·OS·IP·공유 폴더), `roles`(역할별 제품), `policy`(점검 대상 프로세스·디렉터리·파일·포트·HTTP와 정책·템플릿 연결)로 나뉩니다. `position`은 목록 순서 |
| `policies` | `id` (PK), `position`, `data` | 점검 정책 1개 = 1행. OS·분류(BASIC/WEB/WAS/DB)·점검 항목과 기준값 |
| `templates` | `id` (PK), `position`, `data` | 스크립트 조각(SCRIPT_PART)과 DB 쿼리(QUERY) 템플릿. 기본 조각 id는 `WINDOWS-PART-<항목>`, `LINUX-PART-<항목>` |
| `template_history` | `template_id` (PK), `data` | 템플릿별 이전 버전 목록(JSON 배열). 화면의 "버전 복원"에 사용 |
| `settings` | `key` (PK), `data` | 단일 설정 문서 (아래 표) |

> 목록형 테이블은 저장할 때 **전체를 지우고 다시 쓰는** 방식입니다(`writeCollection`). 데이터가 수백 건 수준이라 문제가 없고, 순서(`position`)를 단순하게 유지할 수 있습니다.

`settings`에 들어 있는 키:

| key | 내용 |
| --- | --- |
| `common_codes` | 공통코드 전체 (OS, 역할, 제품, 점검 항목 이름 등) |
| `builtin_template_ids` | 지금까지 DB에 넣었던 기본 템플릿 id 목록. 새 버전의 기본 템플릿을 추가할 때, 사용자가 지운 기본 템플릿을 되살리지 않으려고 기록합니다 (6장) |
| `migration_linux_basic_items_v1` | Linux 기본 정책에 프로세스·디렉터리·파일·포트·HTTP 항목을 추가한 기록 (한 번만 실행) |
| `migration_linux_role_items_v1` | Linux WEB·WAS 기본 정책에 역할별 점검 항목을 추가한 기록 (한 번만 실행) |
| `migration_executor_codes_v1` | 새 실행 방식 공통코드(예: 점검 만들기 `CHECK_BUILDER`)를 추가한 기록 (한 번만 실행) |

### 3.2 사용자

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `users` | `username` (PK, 대소문자 구분 안 함), `display_name`, `password_salt`, `password_hash` | 로그인 계정. 비밀번호는 솔트와 해시로만 저장합니다 |

계정 추가: `node scripts/create-user.cjs <아이디>`

### 3.3 점검 결과

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `check_results` | `id` (PK, 자동 증가) | |
| | `server_id` | 결과 파일 **안의** 서버 ID |
| | `file_name` | 결과 파일 이름 (보고서 주소에 쓰임) |
| | `check_date` | 점검 일시 (`YYYY-MM-DD HH:MM:SS`) |
| | `status` | 종합 상태 `Healthy` / `Warning` / `Critical` / `NotCollected` |
| | `cpu`, `memory`, `disk` | 목록·대시보드용 요약 수치(%) |
| | `file_hash` (UNIQUE) | 원본 파일의 SHA-256. 같은 파일을 두 번 넣어도 한 번만 저장 |
| | `raw_json` | **원본 JSON 전체.** 보고서는 이 값을 읽어 그립니다 |
| | `backup_path` | 암호화 백업 파일 위치 |
| | `imported_at` | 가져온 시각 (UTC, ISO 형식) |
| `result_import_errors` | `source_path` (PK), `server_id`, `message`, `first_seen`, `last_seen` | 가져오지 못한 파일과 이유. 같은 파일을 다음에 가져오면 지워집니다 |

인덱스: `(server_id, check_date DESC)`, `(server_id, file_name)` – 서버별 최신 결과·이력 조회용.

보고서 목록은 `raw_json`을 펼치지 않고 요약 열(`check_date`, `status`, `cpu`, `memory`, `disk`)만 읽습니다. 호스트 이름만 `json_extract`로 꺼냅니다. 그래서 `status`는 **가져올 때 계산한 값**이며, 나중에 판정 규칙이 바뀌어도 이미 저장된 행은 다시 계산하지 않습니다. 보고서 상세는 `raw_json`을 그대로 읽습니다.

### 3.4 변경 이력

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `audit_logs` | `id`, `at`(UTC), `username`, `action`, `target_type`, `target_id`, `summary`, `changes`(JSON), `detail`(JSON), `ip`, `request_id` | 로그인, 서버·정책·템플릿·공통코드 변경, 스크립트 다운로드, 결과 가져오기·올리기 기록 |

- `changes`에는 바뀐 항목의 이전/이후 값이 들어갑니다. 300자가 넘는 값은 "(긴 텍스트 n자)"처럼 요약하고, 비밀번호 관련 값은 남기지 않습니다.
- `OPSBOX_AUDIT_RETENTION_DAYS`(기본 365일)보다 오래된 기록은 하루에 한 번 지웁니다.
- 인덱스: 시각, 작업 종류, 사용자.

## 4. 점검 결과가 DB에 들어오는 과정

### 4.1 수신함 (공유 폴더)

- 각 서버의 **공유 폴더 아래 `results/` 폴더가 수신함**입니다. 여러 서버가 같은 공유 폴더를 쓰면 한 번만 읽습니다.
- `results/` 바로 아래에 파일을 넣으면 됩니다. 폴더를 나눌 필요가 없습니다. 이전 방식인 `results/<연도>/<서버 ID>/`도 그대로 읽습니다.
- **어느 서버의 결과인지는 파일 안의 서버 ID로 정합니다.** 파일 이름이나 폴더 이름이 아닙니다.
- 가져오기 주기: OpsBox 시작 직후 1회, 이후 `OPSBOX_IMPORT_INTERVAL_MINUTES`(기본 5분)마다. 화면·API(`POST /api/results/import`)로 바로 실행할 수도 있습니다.

### 4.2 한 파일을 가져오는 순서

1. **쓰는 중인지 확인** – 수정된 지 `OPSBOX_IMPORT_MIN_AGE_SECONDS`(기본 10초)가 안 됐으면 다음 주기로 미룹니다.
2. **JSON 해석** – 형식이 틀리면 실패.
3. **서버 확인**
   - 파일 안에 서버 ID가 없으면 실패.
   - OpsBox에 등록되지 않은 서버 ID면 실패.
   - 이전 방식 폴더(`results/<연도>/<서버 ID>/`)에 있는데 파일 안의 ID와 폴더 이름이 다르면 실패 (잘못 넣은 파일).
4. **중복 확인** – 같은 SHA-256의 결과가 이미 있으면 새로 저장하지 않습니다.
5. **암호화 백업** – `<백업 폴더>/<점검 연도>/<서버 ID>/<파일>.json.enc`로 저장합니다. 연도는 **파일 안의 점검 일시**에서 정하므로 파일을 어디에 넣었든 백업은 항상 연도·서버별로 정리됩니다. 같은 이름이 이미 있으면 해시 앞 12자리를 붙여 덮어쓰지 않습니다.
6. **DB 저장** – `check_results`에 한 행을 넣습니다.
7. **원본 삭제** – 백업과 DB 저장이 모두 끝난 뒤에만 지웁니다.

실패한 파일은 **지우지 않고 그대로 둡니다.** 이유는 `result_import_errors`와 `GET /api/results/import/status`, 애플리케이션 로그에서 확인할 수 있습니다. 같은 오류는 로그에 반복해서 남기지 않습니다.

### 4.3 화면에서 올리기

공유 폴더를 쓸 수 없는 서버는 점검자가 결과 파일을 내려받아 **서버 상세 → 최근 점검 기록 → [결과 파일 올리기]**로 올립니다 (`POST /api/results/upload`).

- 4.2의 2~6단계를 똑같이 거칩니다 (검증, 중복 확인, 암호화 백업, DB 저장).
- 서버 상세 화면에서 올리므로, 파일 안의 서버 ID가 **그 화면의 서버와 다르면 거부**합니다.
- 파일 이름의 경로 부분과 특수문자는 제거하고 저장합니다.
- 올린 기록은 변경 이력에 `점검 결과 올리기`로 남습니다.
- 한 파일 최대 20MB.

### 4.4 결과 파일 형식

현재 스크립트(Windows·Linux)는 `schemaVersion: 2` 형식으로 저장합니다. 주요 부분:

```json
{
  "schemaVersion": 2,
  "server": { "id": "WEB01", "name": "...", "ip": "...", "roles": ["WEB"], "products": { "WEB": "Nginx" } },
  "collectedAt": "2026-11-21 09:00:00",
  "host": { "hostname": "...", "osName": "Rocky Linux 9.3 (Blue Onyx)", "osVersion": "9.3, kernel 5.14.0-...", "uptimeMinutes": 1234, "status": "Healthy" },
  "resources": { "cpu": { "usagePercent": 35, "status": "Healthy" }, "memory": { ... }, "uptime": { ... }, "disk": { "maxUsagePercent": 82, "volumes": [ ... ] } },
  "checks": { "processes": { ... }, "directories": { ... }, "files": { ... }, "ports": { ... }, "http": { ... }, "web": { ... }, "was": { ... }, "database": { ... }, "rolePolicies": { ... }, "policyItems": [ ... ], "policyDefinitions": { ... } },
  "summary": { "status": "Warning", "counts": { "healthy": 8, "warning": 1, "critical": 0, "notCollected": 1 } }
}
```

- 서버 ID는 `server.id`, 점검 일시는 `collectedAt`에서 읽습니다. 이전 형식(버전 1)은 `server`(문자열)와 `checkDate`를 씁니다.
- `policyDefinitions`에는 점검 당시의 정책 정의가 들어 있어, 나중에 정책을 바꿔도 예전 보고서는 그때 기준으로 표시됩니다.

## 5. 데이터가 바뀌는 곳

| 데이터 | 바꾸는 곳 | 코드 |
| --- | --- | --- |
| 서버 | 서버 관리 화면 | `src/services/serverService.ts` |
| 정책 | 점검 정책 관리 화면 | `src/services/policyService.ts` |
| 템플릿 | 스크립트 관리 화면 | `src/services/templateService.ts` |
| 공통코드 | 공통코드 관리 화면 | `src/services/commonCodeService.ts` |
| 점검 결과 | 자동 가져오기, 결과 파일 올리기 | `src/services/resultImportService.ts` |
| 변경 이력 | 위 작업마다 자동 기록 | `src/services/auditService.ts` |

**OpsBox가 실행 중일 때 DB 파일을 다른 도구로 직접 고치지 마세요.** 화면을 쓰면 변경 이력이 남고 값 검증도 거칩니다.

## 6. 최초 이관과 버전 업그레이드

OpsBox는 시작할 때마다 다음을 확인합니다(`src/db/database.ts`).

1. **최초 이관** – 테이블이 비어 있으면 `data/` 폴더의 JSON(`servers.json`, `policy.json`, `templates.json`, `template-history.json`, `common-codes.json`, `user.json`)으로 채웁니다. 이후에는 **DB가 원본**이며 JSON 파일을 고쳐도 반영되지 않습니다.
2. **새 기본 템플릿 추가** – 새 버전의 `templates.json`에 생긴 기본 템플릿 중 **한 번도 넣은 적 없는 것만** DB에 추가합니다.
   - 이미 넣었던 기본 템플릿 id는 `settings.builtin_template_ids`에 기록하므로, 사용자가 지운 기본 템플릿은 되살리지 않습니다.
   - 사용자가 고친 템플릿은 덮어쓰지 않습니다.
3. **고치지 않은 기본 템플릿 갱신** – DB의 템플릿 내용이 예전 기본값과 똑같을 때(SHA-256 비교, `BUILTIN_TEMPLATE_UPGRADES`)만 새 기본값으로 바꿉니다. 사용자가 고친 템플릿은 그대로 둡니다.
4. **정책 보강 (각 1회)**
   - Linux 기본 정책(`linux-basic-default`)에 프로세스·디렉터리·파일 크기·포트·HTTP 항목이 없으면 추가합니다.
   - Linux WEB·WAS 기본 정책(`linux-web-default`, `linux-was-default`)에 빠진 역할별 점검 항목을 추가합니다.
   - 기존 항목과 기준값은 그대로 둡니다.
5. **실행 방식 공통코드 추가 (1회)** – 새 버전의 `common-codes.json`에 생긴 실행 방식(예: 점검 만들기 `CHECK_BUILDER`)을 기존 공통코드에 더합니다. 이후 사용자가 지우면 되살리지 않습니다.

한 번만 실행하는 작업은 `settings`의 `migration_…` 키(3.1)로 실행 여부를 기록합니다. 반영된 내용은 애플리케이션 로그에 "새 버전의 기본 템플릿·정책 항목을 반영했습니다"로 남습니다.

> 테이블 구조를 바꿔야 할 때는 `CREATE TABLE IF NOT EXISTS` 다음에 `ALTER TABLE`을 추가하고, 이미 바뀌었는지 확인한 뒤 실행하도록 작성하세요. 기존 설치본의 DB가 그대로 열려야 합니다.

## 7. 백업과 복구

백업해야 할 것은 세 가지입니다. **셋 다 다른 장소(다른 서버·매체)에 보관하세요.**

| 대상 | 없으면 |
| --- | --- |
| DB (`data/opsbox.db`) | 서버·정책·템플릿·결과·이력 전체를 잃음 |
| 결과 백업 폴더 (`data/backup/results/`) | DB가 망가졌을 때 점검 결과 원본을 되살릴 수 없음 |
| 백업 키 (`data/backup.key`) | 결과 백업을 풀 수 없음 |

### 7.1 DB 백업

**실행 중에 바로 백업** (권장, 추가 설치 없음):

```bash
node -e "new (require('node:sqlite').DatabaseSync)('data/opsbox.db').exec(\"VACUUM INTO 'backup/opsbox-20261121.db'\")"
```

- `VACUUM INTO`는 실행 중인 DB의 일관된 사본을 파일 하나로 만듭니다(WAL 내용 포함). 대상 파일이 이미 있으면 실패하므로 날짜를 붙이세요.
- Windows PowerShell에서는 바깥 따옴표 처리 때문에 위 명령을 `backup-db.cjs` 같은 파일에 넣어 `node backup-db.cjs`로 실행하는 편이 쉽습니다.

**멈춘 뒤 복사**: OpsBox를 멈추고 `opsbox.db`를 복사합니다. 이때 `opsbox.db-wal` 파일이 남아 있으면 같이 복사하세요.

> 실행 중에 `opsbox.db` 파일만 복사하면 아직 WAL에만 있는 최근 변경이 빠지거나 깨진 사본이 될 수 있습니다.

### 7.2 DB 복구

1. OpsBox를 멈춥니다.
2. 현재 `opsbox.db`, `opsbox.db-wal`, `opsbox.db-shm`을 다른 곳으로 옮겨 둡니다.
3. 백업 파일을 `data/opsbox.db`로 복사합니다.
4. OpsBox를 시작합니다.

백업 이후에 들어온 점검 결과는 `data/backup/results/`에 암호화 원본이 있으므로, 필요하면 풀어서(7.3) 공유 폴더의 `results/`에 넣거나 화면에서 올리면 다시 가져옵니다. 이미 있는 결과는 중복으로 걸러집니다.

### 7.3 결과 백업 풀기

```bash
node scripts/decrypt-backup.cjs data/backup/results/2026/WEB01/WEB01_20261116_175424.json.enc            # 화면 출력
node scripts/decrypt-backup.cjs data/backup/results/2026/WEB01/WEB01_20261116_175424.json.enc out.json   # 파일 저장
node scripts/decrypt-backup.cjs data/backup/results restored                                              # 폴더 전체
```

형식: `OPSBOXE1`(8바이트) + IV(12) + 인증 태그(16) + AES-256-GCM(gzip(원본)).
키는 `OPSBOX_BACKUP_KEY`(base64 32바이트) 환경변수, 없으면 `OPSBOX_BACKUP_KEY_FILE`(기본 `data/backup.key`). 키 파일이 없으면 첫 실행 때 자동으로 만들고 로그에 경고를 남깁니다.

## 8. 자주 쓰는 조회

`sqlite3` 프로그램이 없어도 Node.js로 조회할 수 있습니다. 읽기 전용으로 열면 실행 중에도 안전합니다.

```bash
node -e "const db=new (require('node:sqlite').DatabaseSync)('data/opsbox.db',{readOnly:true}); console.table(db.prepare(process.argv[1]).all())" "<SQL>"
```

| 알고 싶은 것 | SQL |
| --- | --- |
| 서버별 결과 수와 최근 점검 | `SELECT server_id, COUNT(*) AS 건수, MAX(check_date) AS 최근 FROM check_results GROUP BY server_id` |
| 가져오지 못한 파일 | `SELECT source_path, message, last_seen FROM result_import_errors` |
| 최근 변경 이력 20건 | `SELECT at, username, action, summary FROM audit_logs ORDER BY at DESC LIMIT 20` |
| 서버 목록 | `SELECT id, json_extract(data,'$.basicInfo.name') AS 이름, json_extract(data,'$.basicInfo.os') AS OS FROM servers ORDER BY position` |
| DB 상태 검사 | `PRAGMA integrity_check` |

## 9. 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `OPSBOX_DB_PATH` | `data/opsbox.db` | DB 파일 |
| `OPSBOX_BACKUP_DIR` | `data/backup/results` | 결과 암호화 백업 폴더 |
| `OPSBOX_BACKUP_KEY` | (없음) | 백업 키 (base64 32바이트) |
| `OPSBOX_BACKUP_KEY_FILE` | `data/backup.key` | 백업 키 파일 (`OPSBOX_BACKUP_KEY`가 없을 때) |
| `OPSBOX_IMPORT_INTERVAL_MINUTES` | `5` | 자동 가져오기 주기(분). 0 이하면 자동 실행 안 함 |
| `OPSBOX_IMPORT_MIN_AGE_SECONDS` | `10` | 이 시간 안에 수정된 파일은 다음 주기로 미룸 |
| `OPSBOX_AUDIT_RETENTION_DAYS` | `365` | 변경 이력 보관 기간(일) |

## 10. 알아 둘 점

- **점검 결과는 자동으로 지우지 않습니다.** 결과 1건은 보통 수 KB~수십 KB(WebtoB 콘솔 출력·DB 쿼리 결과가 들어가면 더 큼)라 서버 100대 × 매일 1회 × 1년이면 수백 MB~수 GB 수준이지만, 오래 쓰면 DB가 커집니다. 보관 기간 정책이 필요하면 별도로 정해야 합니다.
- **같은 서버의 결과를 같은 파일 이름으로 두 번 올리면** 두 건 모두 저장되고, 보고서 주소로 열면 나중 것이 열립니다. 스크립트는 실행 시각을 파일 이름에 넣으므로 보통은 겹치지 않습니다.
- `node:sqlite`는 Node.js에서 아직 "실험적" 기능이라 시작할 때 경고(ExperimentalWarning)가 한 줄 나옵니다. 동작에는 문제가 없습니다.
