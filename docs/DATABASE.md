# OpsBox 데이터베이스 안내

OpsBox가 데이터를 어디에, 어떤 구조로 저장하는지와 점검 결과가 DB에 들어오는 과정, 백업·복구 방법을 정리한 문서입니다.
운영 담당자와 OpsBox를 고치는 개발자가 함께 봅니다.

## 1. 한눈에 보기

- **DB는 SQLite 파일 하나**입니다. 기본 위치는 `data/opsbox.db`이며, Node.js에 내장된 `node:sqlite`를 쓰므로 별도 DB 서버 설치가 필요 없습니다.
- 서버·정책·템플릿·공통코드·사용자·점검 결과·변경 이력이 모두 이 파일에 있습니다. **DB가 원본**입니다.
- 점검 결과 원본 JSON은 DB에 넣은 뒤 **암호화해서 별도 폴더에 백업**하고, 수신함의 원본은 지웁니다.
- 로그인 세션은 DB에 저장하지 않습니다(메모리). OpsBox를 다시 시작하면 모두 다시 로그인해야 합니다.

```
점검 대상 서버                           OpsBox 서버
┌──────────────────┐  결과 JSON         ┌───────────────────────────────────────────────┐
│ 점검 스크립트     │ ─────────────────▶ │ 수신함 (OPSBOX_RESULT_INBOX, 기본 data/inbox)    │
│ (.ps1 / .sh)     │ ① 결과 저장 경로에  │        │ 5분마다 가져오기                       │
└──────────────────┘    직접 저장        │        ▼                                       │
        │          (같은 공유 폴더를     │  검증 → DB(check_results) → 암호화 백업 → 원본 삭제 │
        │           대상 서버에서 본 경로) │                    │                           │
        │ ② 파일을 내려받아              │                    │                           │
        └── 화면에서 [결과 파일 올리기] ─▶ 같은 검증·저장 ─────┘                           │
                                         │  data/opsbox.db           data/backup/results/ │
                                         └───────────────────────────────────────────────┘
```

## 2. 파일 위치

| 파일·폴더 | 기본 위치 | 바꾸는 방법 | 설명 |
| --- | --- | --- | --- |
| DB | `data/opsbox.db` | `OPSBOX_DB_PATH` | 모든 데이터 |
| DB 작업 파일 | `data/opsbox.db-wal`, `data/opsbox.db-shm` | (DB와 같은 폴더) | WAL 모드라 생기는 파일. **DB 파일과 함께 다뤄야 합니다** (7장) |
| 수신함 | `data/inbox` | `OPSBOX_RESULT_INBOX` (`;`로 여러 개) | OpsBox가 결과 파일을 가져가는 폴더 (4장) |
| 결과 백업 | `data/backup/results/<점검 연도>/<서버 ID>/<파일>.json.enc` | `OPSBOX_BACKUP_DIR` | 가져온 점검 결과 원본(암호화) |
| 백업 암호화 키 | `data/backup.key` | `OPSBOX_BACKUP_KEY` 또는 `OPSBOX_BACKUP_KEY_FILE` | **잃어버리면 결과 백업을 복구할 수 없음** |
| 기본값(시드) | `seeds/*.json` | – | 빈 DB에 한 번 넣는 기본 공통코드·정책·템플릿 (6장) |

`data/` 아래 파일은 Git에 올리지 않습니다.

## 3. 테이블

DB 연결 설정: `journal_mode = WAL`(읽기와 쓰기가 서로 막지 않음), `busy_timeout = 5000`(잠금 시 5초 대기), `foreign_keys = ON`.
테이블 정의는 `src/db/schema.ts` 한 곳에 있고, 버전은 `PRAGMA user_version`으로 관리합니다(6장).

검색·조인·제약이 필요한 값은 **열**로, 화면에서 통째로 다루는 설정(점검 항목 목록 등)은 **JSON 열**로 저장합니다. 모든 수정은 한 건씩 합니다.

### 3.1 서버

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `servers` | `id` (PK), `name`, `os`, `ip`, `result_path`, `enabled`, `check_config`(JSON), `position`, `created_at`, `updated_at` | 서버 1대 = 1행. `result_path`는 이 서버만 다른 결과 저장 경로(없으면 OS별 기본값, 4.1). `enabled = 0`이면 **미사용**(3.6). `check_config`는 프로세스·디렉터리·파일·포트·HTTP 목록, 항목별 서버 입력값, 선택한 스크립트 조각 등 점검 설정 |
| `server_roles` | `server_id` (FK, 서버와 함께 삭제), `role`, `product`, `position` | 서버 역할(WEB·WAS·DB·기타)과 역할별 제품 |
| `server_policies` | `server_id` (FK), `category`(BASIC·WEB·WAS·DB), `policy_id` (FK) | 서버에 할당한 점검 정책. **정책을 지우면 이 할당만 풀립니다** |

할당된 정책이 정하는 값(역할별 점검 항목, 정책 항목의 스크립트 조각·쿼리 템플릿)은 저장하지 않고 **읽을 때 계산**합니다(`src/features/servers/check-plan.ts`). 정책을 고치면 서버에 바로 반영됩니다.

### 3.2 정책·템플릿·공통코드

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `policies` | `id` (PK), `name`, `os`, `category`, `enabled`, `items`(JSON), `position`, `updated_at` | 점검 정책. `items`는 점검 항목·실행 방식·입력값·결과 표시 구성 |
| `templates` | `id` (PK), `name`, `kind`, `os`, `role`, `product`, `dbms`, `item`, `uses_query_template`, `enabled`, `content`, `generated`(JSON), `position`, `updated_at` | 스크립트 조각(SCRIPT_PART)과 DB 쿼리(QUERY). 기본 조각 id는 `WINDOWS-PART-<항목>`, `LINUX-PART-<항목>`. `generated`는 점검 만들기가 만든 조각의 생성 정보 |
| `template_versions` | `id` (PK), `template_id`, `saved_at`, `snapshot`(JSON) | 템플릿의 이전 버전(템플릿마다 최근 50개). 화면의 "버전 복원"에 씁니다. 템플릿을 지워도 남깁니다(지우기 전 내용을 되살릴 수 있게) |
| `common_code_categories` | `category` (PK), `shape`, `position` | 공통코드 분류와 모양(목록 / 그룹별 목록 / 화면 설정) |
| `common_codes` | `category`, `group_key`, `value` (함께 PK), `label`, `enabled`, `sort_order`, `extra`(JSON), `position` | 공통코드 한 개 = 1행. 같은 분류·그룹에 같은 코드는 둘 수 없습니다 |
| `common_code_overrides` | `meta_key` (PK), `label`, `enabled`, `sort_order` | 공통코드 관리 화면에서 바꾼 사용 여부·순서 |
| `settings` | `key` (PK), `value` | 단일 설정 값. 지금은 결과 저장 경로 기본값(`result_path_windows`, `result_path_linux`)만 있습니다 |

### 3.3 사용자

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `users` | `username` (PK, 대소문자 구분 안 함), `display_name`, `password_salt`, `password_hash` | 로그인 계정. 비밀번호는 솔트와 해시로만 저장합니다 |

계정 추가: `node scripts/create-user.cjs <아이디>` (OpsBox를 처음 시작하기 전에 실행해도 됩니다)

### 3.4 점검 결과

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `check_results` | `id` (PK, 자동 증가) | |
| | `server_id` | 결과 파일 **안의** 서버 ID. 외래키를 걸지 않습니다(서버를 미사용으로 바꿔도 결과 유지) |
| | `file_name` | 결과 파일 이름 (보고서 주소에 쓰임) |
| | `check_date` | 점검 일시 `YYYY-MM-DD HH:MM:SS` (필수) |
| | `hostname` | 결과 파일의 호스트 이름 |
| | `status` | 종합 상태 `Healthy` / `Warning` / `Critical` / `NotCollected` (가져올 때 계산) |
| | `cpu`, `memory`, `disk` | 목록·대시보드용 요약 수치(%) |
| | `file_hash` (UNIQUE) | 원본 파일의 SHA-256. 같은 파일을 두 번 넣어도 한 번만 저장 |
| | `raw_json` | **원본 JSON 전체.** 보고서 상세는 이 값을 읽어 그립니다 |
| | `backup_path` | 암호화 백업 파일 위치 |
| | `imported_at` | 가져온 시각 (UTC, ISO 형식) |
| `result_import_errors` | `source_path` (PK), `server_id`, `message`, `first_seen`, `last_seen` | 가져오지 못한 파일과 이유. 같은 파일을 다음에 가져오면 지워집니다 |

인덱스: `(server_id, check_date DESC)`, `(server_id, file_name)` – 서버별 최신 결과·이력 조회용.

보고서 목록은 `raw_json`을 펼치지 않고 요약 열(`check_date`, `hostname`, `status`, `cpu`, `memory`, `disk`)만 읽습니다. 그래서 `status`는 **가져올 때 계산한 값**입니다. 다만 결과 파일 안에 점검 당시의 종합 상태가 들어 있어, 판정 규칙이 나중에 바뀌어도 값은 같습니다.

### 3.5 변경 이력

| 테이블 | 열 | 내용 |
| --- | --- | --- |
| `audit_logs` | `id`, `at`(UTC), `username`, `action`, `target_type`, `target_id`, `summary`, `changes`(JSON), `detail`(JSON), `ip`, `request_id` | 로그인, 서버·정책·템플릿·공통코드·설정 변경, 서버 미사용·다시 사용, 스크립트 다운로드, 결과 가져오기·올리기 기록 |

- `changes`에는 바뀐 항목의 이전/이후 값이 들어갑니다. 300자가 넘는 값은 "(긴 텍스트 n자)"처럼 요약하고, 비밀번호 관련 값은 남기지 않습니다.
- `OPSBOX_AUDIT_RETENTION_DAYS`(기본 365일)보다 오래된 기록은 하루에 한 번 지웁니다.
- 인덱스: 시각, 작업 종류.

### 3.6 서버 미사용

서버는 지우지 않고 **미사용**(`servers.enabled = 0`)으로 바꿉니다. 점검 결과와 보고서를 남기고, 나중에 다시 쓸 수 있게 하기 위해서입니다.

| 미사용 서버는 | |
| --- | --- |
| 서버 목록 | 기본으로 숨김("미사용 포함"으로 보기) |
| 대시보드 | 빠짐 |
| 스크립트 내려받기 | 안 됨 |
| 결과 가져오기·올리기 | 거부 ("미사용 서버의 결과입니다") – 원본은 수신함에 남음 |
| 보고서 목록·상세 | **그대로 나옴** |

[다시 사용]을 누르면 점검 설정까지 그대로 돌아옵니다. 미사용 서버와 같은 ID로 새 서버를 등록할 수는 없습니다.
정책은 지워도 됩니다. 결과 파일에 점검 당시의 정책 정의(`checks.policyDefinitions`)가 들어 있어 예전 보고서는 그대로 표시됩니다.

## 4. 점검 결과가 DB에 들어오는 과정

### 4.1 결과 경로: 수신함과 결과 저장 경로

같은 공유 폴더라도 OpsBox와 점검 대상 서버가 보는 경로가 다르므로 둘을 따로 정합니다.

| | 누가 보는 경로 | 정하는 곳 |
| --- | --- | --- |
| **수신함** | OpsBox 서버 (예: `D:\opsbox-share\results`, `/srv/opsbox/results`) | 환경 변수 `OPSBOX_RESULT_INBOX` (`;`로 여러 개, 기본 `data/inbox`). 화면 **설정 → 결과 수집**에서 확인 |
| **결과 저장 경로** | 점검 대상 서버 (예: `\\NAS01\opsbox\results`, `/mnt/opsbox/results`) | **설정 → 결과 수집**의 Windows·Linux 기본값, 서버마다 다르면 서버 정보의 "결과 저장 경로" |

- 점검 스크립트는 결과를 **실행할 때 준 폴더 → 서버의 결과 저장 경로 → OS별 기본값 → 스크립트가 있는 폴더** 순서로 정한 곳에 저장합니다. 하위 폴더는 만들지 않습니다.
- 결과 파일 이름은 `<서버 ID>_<시각>.json`입니다.
- 결과 저장 경로를 바꾸면 **스크립트를 다시 내려받아야** 반영됩니다(경로가 스크립트에 들어갑니다).

### 4.2 수신함에서 가져오기

- 각 수신함 **바로 아래의 `.json` 파일**만 읽습니다. 하위 폴더는 읽지 않습니다.
- **어느 서버의 결과인지는 파일 안의 서버 ID로 정합니다.** 파일 이름이 아닙니다.
- 가져오기 주기: OpsBox 시작 직후 1회, 이후 `OPSBOX_IMPORT_INTERVAL_MINUTES`(기본 5분)마다. API(`POST /api/results/import`)로 바로 실행할 수도 있습니다.

한 파일을 가져오는 순서:

1. **쓰는 중인지 확인** – 수정된 지 `OPSBOX_IMPORT_MIN_AGE_SECONDS`(기본 10초)가 안 됐으면 다음 주기로 미룹니다.
2. **형식 확인** – JSON이 아니거나, `schemaVersion`이 2가 아니거나, 점검 일시(`collectedAt`)가 `YYYY-MM-DD HH:MM:SS`가 아니면 실패.
3. **서버 확인** – 파일 안에 서버 ID가 없거나, 등록되지 않았거나, 미사용 서버면 실패.
4. **중복 확인** – 같은 SHA-256의 결과가 이미 있으면 새로 저장하지 않습니다.
5. **암호화 백업** – `<백업 폴더>/<점검 연도>/<서버 ID>/<파일>.json.enc`로 저장합니다. 같은 이름이 이미 있으면 해시 앞 12자리를 붙여 덮어쓰지 않습니다.
6. **DB 저장** – `check_results`에 한 행을 넣습니다.
7. **원본 삭제** – 백업과 DB 저장이 모두 끝난 뒤에만 지웁니다.

실패한 파일은 **지우지 않고 그대로 둡니다.** 이유는 `result_import_errors`와 `GET /api/results/import/status`, 애플리케이션 로그에서 확인할 수 있습니다. 같은 오류는 로그에 반복해서 남기지 않습니다.

### 4.3 화면에서 올리기

수신함에 저장할 수 없는 서버는 점검자가 결과 파일을 내려받아 **서버 상세 → 최근 점검 기록 → [결과 파일 올리기]**로 올립니다 (`POST /api/results/upload`).

- 4.2의 2~6단계를 똑같이 거칩니다.
- 서버 상세 화면에서 올리므로, 파일 안의 서버 ID가 **그 화면의 서버와 다르면 거부**합니다.
- 파일 이름의 경로 부분과 특수문자는 제거하고 저장합니다.
- 올린 기록은 변경 이력에 `점검 결과 올리기`로 남습니다.
- 한 파일 최대 20MB.

### 4.4 결과 파일 형식

스크립트(Windows·Linux)는 `schemaVersion: 2` 형식으로 저장하며, OpsBox는 이 형식만 받습니다. 주요 부분:

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

- 서버 ID는 `server.id`, 점검 일시는 `collectedAt`에서 읽습니다.
- `policyDefinitions`에는 점검 당시의 정책 정의가 들어 있어, 나중에 정책을 바꾸거나 지워도 예전 보고서는 그때 기준으로 표시됩니다.

## 5. 데이터가 바뀌는 곳

코드는 기능별 폴더(`src/features/<기능>/`)에 있습니다. 각 폴더의 `service.ts`가 규칙, `repository.ts`가 SQL, `routes.ts`가 API입니다.

| 데이터 | 바꾸는 곳 | 코드 |
| --- | --- | --- |
| 서버 | 서버 관리 화면 | `src/features/servers/` |
| 정책 | 점검 정책 관리 화면 | `src/features/policies/` |
| 템플릿 | 스크립트 관리 화면 | `src/features/templates/` |
| 공통코드 | 공통코드 관리 화면 | `src/features/common-codes/` |
| 결과 저장 경로 기본값 | 결과 수집 화면 | `src/features/settings/` |
| 점검 결과 | 자동 가져오기, 결과 파일 올리기 | `src/features/results/` |
| 계정 | `scripts/create-user.cjs`, 내 정보 화면 | `src/features/auth/` |
| 변경 이력 | 위 작업마다 자동 기록 | `src/features/audit/` |

**OpsBox가 실행 중일 때 DB 파일을 다른 도구로 직접 고치지 마세요.** 화면을 쓰면 변경 이력이 남고 값 검증도 거칩니다.

## 6. 스키마 버전과 기본값

OpsBox는 시작할 때 `src/db/index.ts`에서 다음을 합니다.

1. **스키마 올리기** – `PRAGMA user_version`이 `src/db/schema.ts`의 최신 버전보다 낮으면, 그 사이의 변경을 차례로 실행합니다. DB 버전이 더 높으면(더 새 OpsBox가 만든 DB) 시작하지 않습니다.
2. **기본값 넣기** – DB를 **새로 만들었을 때만** `seeds/`의 공통코드·템플릿·정책을 넣습니다(`src/db/seed.ts`). 스키마와 기본값은 한 트랜잭션이라, 기본값 넣기가 실패하면 빈 DB로 돌아가 다음 시작 때 다시 시도합니다.

이미 쓰는 DB에는 기본값을 다시 넣지 않으므로, **사용자가 지운 기본 템플릿·정책은 되살아나지 않습니다.**

> 테이블 구조를 바꿔야 할 때는 `src/db/schema.ts`의 `MIGRATIONS` 배열 **끝에** 새 SQL을 추가하세요(이미 있는 항목은 고치지 않음). 새 버전의 기본값을 기존 DB에도 넣어야 하면 그 마이그레이션 안에서 넣습니다.

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

백업 이후에 들어온 점검 결과는 `data/backup/results/`에 암호화 원본이 있으므로, 필요하면 풀어서(7.3) 수신함에 넣거나 화면에서 올리면 다시 가져옵니다. 이미 있는 결과는 중복으로 걸러집니다.

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
| 서버 목록 (미사용 포함) | `SELECT id, name, os, ip, enabled FROM servers ORDER BY position` |
| 서버별 역할·제품 | `SELECT server_id, role, product FROM server_roles ORDER BY server_id, position` |
| 서버별 결과 수와 최근 점검 | `SELECT server_id, COUNT(*) AS 건수, MAX(check_date) AS 최근 FROM check_results GROUP BY server_id` |
| 가져오지 못한 파일 | `SELECT source_path, message, last_seen FROM result_import_errors` |
| 최근 변경 이력 20건 | `SELECT at, username, action, summary FROM audit_logs ORDER BY at DESC LIMIT 20` |
| 스키마 버전 | `PRAGMA user_version` |
| DB 상태 검사 | `PRAGMA integrity_check` |

## 9. 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `OPSBOX_DB_PATH` | `data/opsbox.db` | DB 파일 |
| `OPSBOX_RESULT_INBOX` | `data/inbox` | 수신함 폴더. 여러 개는 `;`로 구분 (4.1) |
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
