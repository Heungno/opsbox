# 서버 코드·DB 재구성 설계

작성일: 2026-11-22

## 1. 왜 하는가

여러 AI를 거치며 기능을 덧붙였고, 저장소를 JSON 파일에서 SQLite로 옮기면서 JSON 시절 방식과 예전 버전 호환 코드가 곳곳에 남았다. 아직 실제 설치본과 운영 데이터는 없다(신규 개발). 목표는 **처음부터 구조를 잡고 만든 것처럼** 서버 코드와 DB를 일관되게 만드는 것이다.

이 작업은 두 단계 중 첫 번째다.
1. **이번 작업:** 서버 코드(`src/` 중 `public/` 제외)와 DB 재구성
2. **다음 작업(별도 설계):** 화면 JS를 공통 패턴으로 정리(프레임워크 없이)

## 2. 목표 / 하지 않을 것 / 실패로 볼 것

**목표**
- 기능별 폴더 구조. 기능 하나를 고칠 때 한 폴더 안에서 끝난다.
- 새로 설계한 DB 스키마. 한 건씩 수정하고, 외래키를 걸고, `PRAGMA user_version`으로 버전을 관리한다.
- 예전 버전 호환 코드를 모두 삭제한다.
- 저장하는 값은 사용자가 입력한 값만 둔다. 정책에서 계산되는 값은 읽을 때 계산한다.

**하지 않을 것**
- 기능 추가·변경. 지금 화면에서 되는 일은 그대로 된다. **예외는 하나, 서버 삭제를 "미사용"으로 바꾸는 것이다(4.6).**
- 화면 구조 변경(2단계에서 한다).
- 프레임워크·빌드 도구 교체. Fastify, `node:sqlite`, tsx는 유지한다.

**실패로 볼 것**
- 화면에서 되던 기능이 안 된다.
- 생성되는 점검 스크립트(Windows `.ps1`, Linux `.sh`) 내용이 바뀐다.
- 결과 가져오기·백업 규칙이 바뀐다.
- 중간 단계에서 테스트가 깨진 채로 다음 단계로 넘어간다.

## 3. 제약

- 개발 환경은 Termux(Android)다. TypeScript 7 `tsc`는 여기서 돌지 않으므로, 타입 검사는 임시로 설치한 TypeScript 5 JS 버전이나 PC에서 한다.
- API 주소와 응답 모양은 유지한다. 단, 예전 호환 전용 필드는 응답에서 빼고, 그 필드를 쓰는 화면 코드만 최소로 고친다(4.4).
- 기존 DB 파일을 열 필요가 없다. 새 스키마로 처음부터 만든다. 개발용 `data/opsbox.db`와 데모 DB는 다시 만든다(`npm run demo:seed`).

## 4. 결정된 방식

### 4.1 Approaches

**DB 스키마**

| 안 | 내용 | 판단 |
| --- | --- | --- |
| A-1 핵심은 열, 중첩 설정은 JSON | 조회·조인·제약이 필요한 값은 열로, 화면에서 통째로 다루는 설정은 JSON 열로 | **채택** (Claude 제안, 사용자가 반대하지 않음. 검토 때 확인) |
| A-2 완전 정규화 | 프로세스·포트·정책 항목까지 모두 별도 테이블 | 테이블·조인 코드가 몇 배로 늘고 얻는 게 적음 |
| A-3 JSON 문서 유지 + 한 건씩 수정 | 일은 가장 적음 | JSON 시절 구조가 남아 목적에 어긋남 |

**진행 방식**

| 안 | 내용 | 판단 |
| --- | --- | --- |
| B-1 기능 하나씩 옮기기 | 기능별로 새 구조로 옮기고 매 단계 테스트 통과 | **채택 (사용자 선택)** |
| B-2 새 폴더에 다시 쓰기 | 더 깨끗해 보임 | 스크립트 조립 같은 세부 규칙을 놓치기 쉬움 |

### 4.2 폴더 구조

```
src/
  app.ts                 Fastify 앱 조립(플러그인·라우트 등록). 테스트에서도 사용
  server.ts              실행 진입점(listen, 스케줄러 시작)
  db/
    connection.ts        DatabaseSync, PRAGMA, transaction()
    schema.ts            스키마 정의와 user_version 마이그레이션
    seed.ts              빈 DB에 기본값 넣기
  features/
    servers/             routes.ts service.ts repository.ts types.ts validation.ts
    policies/
    templates/
    common-codes/
    results/             가져오기(import), 암호화 백업(backup-crypto), 조회
    reports/             목록·상세·보고 규칙
    dashboard/
    audit/
    auth/                로그인, 계정, 로그인 제한
    scripts/             조립(assembly), linux, windows, check-builder/
  shared/
    errors.ts http.ts error-handler.ts logger.ts pages.ts
  public/                (이번 작업에서는 그대로)
seeds/                   기본 정책·템플릿·공통코드 JSON (data/에서 옮김)
data/                    실행 중 생기는 파일만 (DB, 백업, 키)
docs/                    doc/와 docs/를 하나로 합침
```

- 각 기능 폴더는 `routes.ts`(HTTP), `service.ts`(규칙), `repository.ts`(SQL)를 둔다. 필요 없는 파일은 만들지 않는다.
- 기능끼리는 서로의 `service.ts`만 import한다. 다른 기능의 `repository.ts`는 직접 쓰지 않는다.
- 파일 이름은 kebab-case로 한다(`backup-crypto.ts`).
- `src/types/`는 없애고, 타입은 각 기능의 `types.ts`로 옮긴다. 여러 기능이 같이 쓰는 타입만 `shared/`에 둔다.

### 4.3 DB 스키마 (A-1)

| 테이블 | 열 | JSON 열 |
| --- | --- | --- |
| `servers` | `id` PK, `name`, `os`, `ip`, `shared_path`, `enabled`(기본 1), `position`, `created_at`, `updated_at` | `check_config`: 프로세스·디렉터리·파일·포트·HTTP 목록, 항목별 서버 입력값, 사용자 쿼리 템플릿 id |
| `server_roles` | `server_id` FK→servers ON DELETE CASCADE, `role`, `product`, PK(server_id, role) | – |
| `server_policies` | `server_id` FK CASCADE, `category`(BASIC/WEB/WAS/DB), `policy_id` FK→policies ON DELETE CASCADE, PK(server_id, category) | – |
| `policies` | `id` PK, `name`, `os`, `category`, `enabled`, `position`, `updated_at` | `items` |
| `templates` | `id` PK, `name`, `kind`, `os`, `role`, `product`, `dbms`, `item`, `enabled`, `position`, `updated_at` | `content`(TEXT), `generated` |
| `template_versions` | `id` PK, `template_id` FK CASCADE, `saved_at` | `snapshot` |
| `common_codes` | `group_key`, `value`, `label`, `enabled`, `sort_order`, PK(group_key, value) | `extra`(그 외 속성) |
| `users` | 지금과 같음 | – |
| `check_results` | 지금과 같음 + `hostname` 열 추가. `server_id`에는 외래키를 걸지 않음 | `raw_json` |
| `audit_logs` | 지금과 같음, 쓰이지 않는 `idx_audit_logs_user` 제거 | `changes`, `detail` |
| `result_import_errors` | 지금과 같음 | – |
| `settings` | 남는 키가 없으면 삭제 | – |

- **서버를 지워도 점검 결과는 지우지 않는다(사용자 결정).** 나중에 복원해야 할 수 있기 때문이다. 그래서 `check_results.server_id`에는 외래키를 걸지 않는다(걸면 결과가 있는 서버는 지울 수 없다). 같은 ID로 서버를 다시 등록하면 예전 결과가 다시 보인다. 지금 동작과 같다.
- **정책을 지우면 그 정책을 쓰던 서버의 할당만 풀린다(CASCADE).** 지금도 삭제를 막지 않는다. 지워진 정책 id가 서버에 남아 있으면 할당이 없는 것처럼 동작하므로, 같은 결과를 스키마로 보장하는 것이다. (Claude의 판단)
- 공통코드의 `_codeMeta`(사용 여부·정렬)는 `enabled`, `sort_order` 열로 흡수한다. `productsByRole`, `rolePolicies`처럼 다른 모양의 그룹도 행으로 표현하고, 모양은 서비스에서 복원해 API 응답을 유지한다.
- `check_date`는 가져올 때 `YYYY-MM-DD HH:MM:SS` 형식으로 맞춰 저장한다. 맞출 수 없으면 가져오기 실패로 처리한다.
- 마이그레이션은 `schema.ts`의 배열(버전 번호 → SQL)로 관리한다. 지금은 버전 1(초기 스키마) 하나만 있다.

### 4.4 삭제할 호환 코드

- `seedFromJsonFiles`(JSON 최초 이관)는 `seed.ts`의 빈 DB 시드로 대체한다. `servers.json`, `user.json` 시드는 없애고, 계정은 `scripts/create-user.cjs`로 만든다.
- 1회용 마이그레이션 5개, `builtin_template_ids`, 템플릿 SHA-256 업그레이드 목록을 삭제한다.
- `normalizeServer`, `toStoredServer`의 예전 필드 처리를 삭제한다. 대상은 `basicInfo` 중첩 저장 형태, `WEBTOB`, `OS_DISK`, `DATABASE`, `scriptTemplateId`다.
- `Server.type`, `Server.product` 필드를 삭제한다. 화면에서 쓰는 곳(`server-list.js`, `server-detail.js`, `report-detail.js` 등 서버 객체의 `.type`, `.product`)은 `roles[0]`, `products[role]`로 고친다. 다른 객체의 `.type`(정책 항목, 실행 방식 등)은 건드리지 않는다.
- 이전 결과 형식 v1(`server` 문자열, `checkDate`)과 이전 방식 수신함 폴더(`results/<연도>/<서버ID>/`)를 삭제한다. `schemaVersion: 2`만 받는다.
  - `.devcontainer/sample-results/`의 샘플 2개는 v1 형식이므로 v2로 바꾼다. 데모 시드(`scripts/seed-demo.ts`)는 이미 v2다.
  - 이전 방식 폴더가 없어지므로 샘플도 `results/` 바로 아래에 두도록 `.devcontainer/setup.cjs`를 고친다.
- `Policy.checks`(호환용 항목 id 목록)는 화면에서 쓰지 않으면 삭제한다.

### 4.5 저장 값과 계산 값

지금은 서버를 읽을 때마다 할당된 정책으로 `roleChecks`, `scriptParts`, `rolePolicySettings.queryTemplateId`를 다시 계산해 서버 객체에 섞는다. 앞으로는 이렇게 한다.
- DB에는 사용자가 입력한 값만 저장한다: 기본 정보, 역할·제품, 할당 정책, 점검 목록, 항목별 입력값.
- 계산 값은 `servers/service.ts`의 한 함수(예: `resolveCheckPlan(server)`)에서 만든다. API 응답과 스크립트 조립이 모두 이 함수를 쓴다.
- `GET/PUT /api/servers/:id/check-config`의 응답 모양은 유지한다. `server-detail.js`가 `scriptParts`, `roleChecks`, `rolePolicySettings`를 쓰기 때문이다. PUT에서 받은 계산 값 중 정책이 정하는 부분은 무시한다(지금도 정책이 할당되면 덮어쓴다).

### 4.6 서버 미사용 (사용자 결정)

서버를 지우면 보고서 목록·대시보드에서 그 서버의 결과가 사라진다(목록이 등록된 서버 기준이라서). 복원해야 할 수 있으므로, 서버는 지우지 않고 **미사용**으로 바꾼다.

- 미사용 서버는:
  - 서버 목록에서 기본으로 숨기고, 필터로 볼 수 있다.
  - 대시보드에서 빠진다.
  - 스크립트를 내려받을 수 없다.
  - 새 결과를 받지 않는다. 가져오기·올리기에서 "미사용 서버" 오류를 낸다.
  - **보고서 목록과 상세에는 계속 나온다.**
- **다시 사용**하면 점검 설정까지 그대로 돌아온다.
- API: `DELETE /api/servers/:id`는 없애고, `POST /api/servers/:id/deactivate`와 `POST /api/servers/:id/activate`를 둔다. 변경 이력에 각각 기록한다.
- 화면: 서버 목록·상세의 [삭제] 버튼을 [미사용]/[다시 사용]으로 바꾸고, 목록에 "미사용 포함" 필터를 둔다.
- 완전히 지우는 기능은 두지 않는다. (Claude의 판단. 복원 가능성을 남긴다는 목적에 맞추고, 필요하면 나중에 추가한다)
- 같은 ID로 새 서버를 등록하려 하면 "미사용 서버가 있다"고 알려 [다시 사용]을 안내한다.
- 정책은 미사용 처리가 필요 없다. 점검 결과에 당시 정책 정의(`checks.policyDefinitions`)가 저장되어 있어, 정책을 지워도 예전 보고서는 그대로 표시된다.

## 5. 진행 순서 (B-1)

각 단계가 끝날 때마다 다음을 모두 통과해야 다음 단계로 넘어간다: 전체 테스트, 타입 검사, 스크립트 동일성 검사(6장).

1. **기반:** `shared/`, `db/connection.ts`, `app.ts`/`server.ts` 분리, `seeds/`·`docs/` 이동. 스키마는 아직 그대로 둔다.
2. **기준 만들기:** 6장의 스크립트 동일성 검사를 먼저 만든다.
3. **기능별 이동:** common-codes → templates → policies → servers → results → reports·dashboard → audit·auth → scripts 순서로 옮긴다. 기능마다 폴더를 옮기고, 새 스키마의 테이블로 바꾸고, 호환 코드를 지운다.
4. **정리:** 예전 `database.ts`, `types/`, `routes/`, `services/`를 삭제하고 `settings` 테이블도 정리한다. 남은 import가 없는지 확인한다.
5. **화면 최소 수정:** `.type`, `.product` 사용처를 고친다(4.4). 서버 미사용 버튼과 필터를 넣는다(4.6). 데모 시드를 새 스키마로 맞추고, 미사용 서버도 하나 넣는다.
6. **문서:** `docs/DATABASE.md`, README, 사용자 가이드의 경로·구조 설명을 새로 쓴다.

각 단계는 별도 커밋으로 남긴다.

## 6. 확인 방법

- **기존 테스트 172개:** 지운 호환 기능을 검사하던 테스트(`builtInUpgrade.test.ts`, v1 결과·이전 폴더 관련 케이스)는 그 기능과 함께 지우고, 나머지는 통과해야 한다. 테스트의 import 경로는 새 구조에 맞게 고친다.
- **스크립트 동일성:** 스크립트 생성 코드에는 시각 값이 들어가지 않으므로 바이트 비교가 가능하다. 재구성 전에, 데모 데이터의 서버 전체에 대해 생성 스크립트(Windows·Linux)를 파일로 저장해 둔다. 이후 단계마다 다시 생성해 바이트 단위로 같은지 비교한다. 이 검사가 실패 기준(2장)의 핵심이다.
- **API 응답:** 데모 데이터로 주요 GET API(서버 목록·상세·점검 설정, 정책, 템플릿, 공통코드, 보고서 목록·상세, 대시보드) 응답을 저장해 두고 비교한다. 삭제한 호환 필드만 차이로 허용한다.
- **화면:** 5단계 후 주요 화면을 직접 열어 본다(서버 추가·수정·미사용·다시 사용, 미사용 서버의 보고서 표시, 정책·템플릿 편집, 스크립트 내려받기, 결과 올리기, 보고서).

## 7. 구현하는 쪽에 맡기는 것

- 각 기능 안의 함수 나누기와 이름
- 공통코드처럼 모양이 다른 그룹을 행으로 표현하는 세부 방식(응답 모양만 유지하면 됨)
- 테스트 파일 정리 방식(기능별 폴더로 옮길지 등)
- `ServerPolicy.minUptimeMinutes`처럼 화면에서 쓰지 않는 필드는, 서버 코드에서도 쓰이지 않는 것이 확인되면 삭제
