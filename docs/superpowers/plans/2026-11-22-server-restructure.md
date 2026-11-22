# 서버 코드·DB 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 코드를 기능별 폴더로 옮기고 DB를 새 스키마로 바꾸며 예전 호환 코드를 모두 지운다. 기능과 생성 스크립트는 그대로, 서버 삭제만 "미사용"으로 바꾼다.

**Architecture:** 기능 하나씩 옮긴다(B-1). 각 기능은 `src/features/<기능>/{routes,service,repository,types}.ts`로 옮기고, 같은 작업에서 그 기능의 테이블을 새 스키마로 바꾼다. 먼저 만든 "기준 비교 테스트"(생성 스크립트·설정 API 응답)가 모든 작업에서 동작이 같음을 보장한다.

**Tech Stack:** Node 24, TypeScript, Fastify 5, `node:sqlite`, tsx, `node --test`

**Spec:** `docs/superpowers/specs/2026-11-22-server-restructure-design.md`

## Global Constraints

- 실행 명령은 npm `.bin`을 쓰지 않고 node로 직접 실행한다(Termux).
  - 테스트: `node --no-warnings --import tsx --test "test/**/*.test.ts"`
  - 타입 검사: `node "$TMPDIR/ts5/node_modules/typescript/lib/tsc.js" -p tsconfig.build.json --noEmit`
  - 타입 검사 도구가 없으면 먼저 설치한다: `npm i --prefix "$TMPDIR/ts5" typescript@5`
- 모든 작업은 전체 테스트, 타입 검사, `test/golden.test.ts` 통과로 끝난다. 하나라도 실패하면 다음 작업으로 넘어가지 않는다.
- API 주소와 응답 모양은 유지한다. 예외는 셋이다: 서버 객체의 `type`·`product` 삭제, 서버 객체의 `enabled` 추가, `DELETE /api/servers/:id`를 `POST /api/servers/:id/deactivate`·`/activate`로 교체.
- 생성되는 점검 스크립트(.ps1/.sh)는 바이트 단위로 같아야 한다.
- 스키마는 `PRAGMA user_version = 1` 하나다. 설치본이 없으므로 이 작업이 끝날 때까지 버전 1의 정의를 직접 고친다. 스키마를 바꾼 작업 뒤에는 `data/opsbox.db*`, `data/demo/`를 지우고 `npm run demo:seed`로 다시 만든다.
- 파일 이름은 kebab-case로 한다. 기능끼리는 서로의 `service.ts`만 import하고, 다른 기능의 `repository.ts`는 직접 쓰지 않는다.
- 커밋 메시지는 한국어로, 기존 커밋 스타일을 따른다. 작업마다 한 커밋.
- 화면 코드(`src/public/`)는 Task 12 전까지 건드리지 않는다.

## Review Focus

1. **미사용 서버와 같은 ID로 다시 등록:** "미사용 서버가 있습니다. [다시 사용]을 쓰세요"라는 409 오류가 나야 한다. 새 서버가 만들어지거나 예전 설정을 덮어쓰면 안 된다. → Task 6
2. **미사용 서버의 결과 파일이 수신함에 들어옴:** 가져오지 않고 원본을 남기며, 오류 목록에 "미사용 서버"로 표시한다. → Task 7
3. **공통코드 화면에서 코드를 끄거나 순서를 바꾸고 저장:** 다시 열었을 때 꺼진 코드와 순서가 그대로 보여야 한다(관리 화면은 문서 전체를 저장한다). → Task 3
4. **서버가 쓰는 정책 삭제:** 서버 상세와 스크립트 내려받기가 계속 되고, 해당 역할은 정책이 없는 상태로 보여야 한다. → Task 6
5. **사용자가 지운 기본 템플릿·정책:** OpsBox를 다시 시작해도 되살아나지 않아야 한다(시드는 빈 DB에서 한 번만 실행). → Task 4

---

### Task 1: 기준 비교 테스트 (golden)

재구성 전 동작을 파일로 고정한다. 이후 모든 작업의 안전망이다.

**Files:**
- Modify: `scripts/seed-demo.ts`: 실행 부분을 `export function seedDemo(): void`로 감싼다. 명령행으로 실행할 때(`require.main === module`)만 경로 확인 후 호출한다.
- Create: `test/helpers/demo-env.ts`: `helpers/env.ts`와 같지만 DB 경로를 `<TEST_ROOT>/demo/opsbox.db`로 둔다(seed-demo의 경로 확인 통과용).
- Create: `test/helpers/golden.ts`: `collectGolden(): Record<string, string>`
- Create: `scripts/update-golden.ts`: `collectGolden()` 결과를 `test/golden/`에 쓴다.
- Create: `test/golden.test.ts`, `test/golden/*`

**Interfaces:**
- Produces: `seedDemo(): void`, `collectGolden(): Record<string, string>`(키는 `test/golden/` 아래 파일 이름)

`collectGolden()`이 모으는 것:
- 미사용이 아닌 데모 서버마다 `scripts/<서버ID>.<ps1|sh>`: `generateScript(id)` 결과
- `api/servers.json`, `api/servers/<id>.json`, `api/servers/<id>/check-config.json`, `api/policies.json`, `api/templates.json`, `api/common-codes.json`: `app.inject`로 로그인한 뒤 GET한 응답의 `data`를 `JSON.stringify(v, null, 2)`한 것
- 응답 정규화: 서버 객체(`/api/servers*`의 최상위 객체)에서 `type`, `product`, `enabled` 키를 뺀다. 정책 객체에서 `checks` 키를 뺀다. 그 외에는 그대로 둔다.
- 점검 결과·보고서·대시보드는 실행 날짜에 따라 달라지므로 넣지 않는다. 이 부분은 기존 테스트가 맡는다.

- [ ] **Step 1:** `seedDemo` 분리. `node --import tsx scripts/seed-demo.ts`(npm run demo:seed)가 전과 같이 동작하는지 확인한다.
- [ ] **Step 2:** `test/golden.test.ts` 작성

```ts
test('생성 스크립트와 설정 API 응답이 기준 파일과 같다', () => {
  const actual = collectGolden();
  const expectedFiles = listGoldenFiles(); // test/golden 아래 모든 파일
  for (const name of Object.keys(actual)) assert.ok(expectedFiles.includes(name), `기준 파일 없음: ${name}`);
  for (const name of expectedFiles) {
    if (!(name in actual)) continue; // 미사용으로 바뀐 서버의 스크립트는 건너뜀 (Task 12)
    assert.equal(actual[name], fs.readFileSync(path.join(GOLDEN_DIR, name), 'utf8'), name);
  }
});
```

- [ ] **Step 3:** 기준 파일이 없어 실패하는지 확인한다: `node --no-warnings --import tsx --test test/golden.test.ts` → FAIL "기준 파일 없음"
- [ ] **Step 4:** `node --no-warnings --import tsx scripts/update-golden.ts`로 기준 파일을 만든다. 다시 실행하면 PASS. 데모 서버 12대 모두의 스크립트 파일이 생겼는지 확인한다.
- [ ] **Step 5:** 전체 테스트와 타입 검사를 통과시키고 커밋한다: "재구성 안전망: 생성 스크립트·설정 API 기준 비교 테스트"

> 이후 작업에서 `update-golden.ts`를 다시 실행하지 않는다. 기준이 바뀌어야 한다면 작업을 멈추고 이유를 보고한다.

---

### Task 2: 기반 (shared, db 연결, app 분리, seeds·docs 이동)

동작 변경 없이 파일만 옮긴다. 스키마는 그대로 둔다.

**Files:**
- Move: `src/errors.ts` → `src/shared/errors.ts`, `src/logger.ts` → `src/shared/logger.ts`, `src/utils/http.ts` → `src/shared/http.ts`, `src/utils/errorHandler.ts` → `src/shared/error-handler.ts`, `src/pages.ts` → `src/shared/pages.ts`
- Create: `src/db/connection.ts`: `db`, `DB_PATH`, `transaction()`를 `database.ts`에서 옮긴다. PRAGMA 설정도 여기에 둔다.
- Modify: `src/db/database.ts`: 테이블 생성·시드·마이그레이션만 남기고 `connection.ts`를 import한다. Task 11에서 삭제한다.
- Create: `src/app.ts`: `export function buildApp(): FastifyInstance`. 지금 `server.ts`의 Fastify 생성, 훅, 정적 파일, 화면·API 라우트, `/api/health`를 옮긴다.
- Modify: `src/server.ts`: `buildApp()`, listen, 스케줄러, 종료 처리만 남긴다. `export { app }`은 유지한다(테스트 호환). 값은 `buildApp()` 결과다.
- Move: `data/common-codes.json`, `data/policy.json`, `data/templates.json` → `seeds/`. `data/template-history.json`, `data/servers.json.example`, `data/user.json.example`은 삭제한다(시드하지 않음).
- Modify: `src/db/database.ts`의 `readJsonFile`이 `seeds/`를 읽게, `scripts/copy-runtime-assets.js`가 `seeds/`를 `dist/seeds/`로 복사하게 바꾼다.
- Move: `doc/*` → `docs/`. README의 링크를 고친다.
- Modify: 모든 import 경로(src, test, scripts)

**Interfaces:**
- Produces: `src/db/connection.ts`의 `db: DatabaseSync`, `DB_PATH: string`, `transaction<T>(fn: () => T): T`, `src/app.ts`의 `buildApp()`

- [ ] **Step 1:** 파일을 옮기고 import를 고친다.
- [ ] **Step 2:** 전체 테스트, 타입 검사, golden을 통과시킨다.
- [ ] **Step 3:** `node --no-warnings --import tsx src/server.ts`로 시작해 `/api/health`가 200인지 확인하고 종료한다.
- [ ] **Step 4:** 커밋: "구조 기반: shared·db 연결·app 분리, 시드 JSON을 seeds/로, 문서를 docs/로"

---

### Task 3: 새 스키마 틀 + 공통코드

**Files:**
- Create: `src/db/schema.ts`: `export function migrate(db: DatabaseSync): { created: boolean }`. `user_version`이 0이면 버전 1 스키마 SQL을 실행하고 1로 올린 뒤 `created: true`를 돌려준다. 1이면 아무것도 하지 않는다. 1보다 크면 "이 OpsBox보다 새 DB" 오류를 던진다.
- Create: `src/db/seed.ts`: `export function seedNewDatabase(): void`. 각 기능의 `seed…()`를 차례로 부른다. `migrate`가 `created: true`일 때만 실행한다.
- Create: `src/db/index.ts`: import하면 `migrate` 후 필요하면 `seedNewDatabase()`를 실행한다(지금 `database.ts`처럼 import 시점에 준비 완료).
- Create: `src/features/common-codes/{routes,service,repository,types}.ts`
- Delete: `src/routes/commonCodeRoutes.ts`, `src/services/commonCodeService.ts`, `src/types/commonCode.ts`, `database.ts`의 `addNewExecutorCodes`와 `common_codes` 시드
- Test: `test/commonCodes.test.ts`

이 작업 동안 예전 테이블(`database.ts`)과 새 스키마(`schema.ts`)가 같은 DB에 함께 있다. 예전 테이블은 각 기능 작업에서 하나씩 `database.ts`에서 빠진다.

**스키마 (버전 1에 추가):**
```sql
CREATE TABLE common_code_categories (
  category TEXT PRIMARY KEY,
  shape TEXT NOT NULL CHECK (shape IN ('LIST','GROUPS')), -- 배열이면 LIST, productsByRole처럼 그룹별 배열이면 GROUPS
  position INTEGER NOT NULL
);
CREATE TABLE common_codes (
  category TEXT NOT NULL REFERENCES common_code_categories(category) ON DELETE CASCADE,       -- 'serverRoles', 'productsByRole' …
  group_key TEXT NOT NULL DEFAULT '', -- productsByRole·rolePolicies의 그룹('WEB' 등), 그 외 ''
  value TEXT NOT NULL,
  label TEXT,                   -- 문자열로만 된 코드면 NULL
  enabled INTEGER,              -- 항목에 enabled가 없으면 NULL
  sort_order INTEGER,           -- 항목에 sortOrder가 없으면 NULL
  extra TEXT,                   -- 그 외 속성(JSON) 또는 NULL
  position INTEGER NOT NULL,    -- 문서 안의 배열 순서
  PRIMARY KEY (category, group_key, value)
);
CREATE TABLE common_code_overrides (  -- 화면이 쓰는 _codeMeta (키: 분류::그룹::코드)
  meta_key TEXT PRIMARY KEY,
  enabled INTEGER, sort_order INTEGER, label TEXT
);
```

**Interfaces:**
- Produces (기존 이름 유지): `getCommonCodes(): CommonCodes`(사용 중인 코드만, 정렬됨), `getRawCommonCodes(): CommonCodes`(관리 화면용, 꺼진 코드 포함, `_codeMeta` 포함), `saveCommonCodes(codes: CommonCodes): CommonCodes`, `getCommonCodeValues(category: keyof CommonCodes): string[]`, `seedCommonCodes(): void`
- Produces: `src/db/index.ts`의 `prepareDatabase(): void`(migrate 후 새 DB면 시드). import 시점에도 한 번 실행한다. 이후 작업의 테스트가 "다시 시작"을 흉내 낼 때 쓴다.
- Repository: `readAll(): { rows: CommonCodeRow[]; overrides: CodeOverrideRow[] }`, `replaceAll(rows, overrides): void`(한 트랜잭션). 공통코드 화면은 문서 전체를 저장하므로 여기만 전체 교체를 쓴다. 문서 ↔ 행 변환은 `service.ts`의 `toRows(codes)`, `fromRows(rows, overrides)`가 맡는다.
- 문자열로만 된 코드(`productsByRole`의 `'Nginx'`)는 `label = NULL`로 저장해, 문서로 되돌릴 때 다시 문자열로 만든다.
- 항목 자체의 `enabled`·`sortOrder`와 `_codeMeta`는 화면이 두 곳에 모두 쓰므로 각각 그대로 저장한다. 하나로 합치는 일은 2단계(화면 정리)에서 한다.

- [ ] **Step 1:** 실패하는 테스트 작성

```ts
test('공통코드: 시드 문서를 저장했다가 읽으면 같은 문서가 나온다', () => {
  const seed = JSON.parse(fs.readFileSync('seeds/common-codes.json', 'utf8'));
  saveCommonCodes(seed);
  assert.deepEqual(getRawCommonCodes(), seed);
});

test('공통코드: 끈 코드와 바꾼 순서가 저장 후에도 유지된다', () => {
  const raw = getRawCommonCodes();
  raw._codeMeta = { ...raw._codeMeta, 'serverRoles::::WAS': { enabled: false }, 'serverRoles::::DB': { sortOrder: -1 } };
  saveCommonCodes(raw);
  assert.deepEqual(getRawCommonCodes()._codeMeta?.['serverRoles::::WAS'], { enabled: false });
  const roles = getCommonCodes().serverRoles.map((code) => code.value);
  assert.equal(roles.includes('WAS'), false);
  assert.equal(roles[0], 'DB');
});

test('공통코드: 시스템 코드(START·SAVE)는 지울 수 없다', () => {
  const raw = getRawCommonCodes();
  raw.scriptItems = raw.scriptItems.filter((code) => code.value !== 'START');
  assert.throws(() => saveCommonCodes(raw), /시스템 코드는 삭제할 수 없습니다/);
});
```

`getCommonCodes()`의 정렬·필터 규칙(`_codeMeta` 우선, 그다음 항목 값, 그다음 배열 순서)은 지금 `commonCodeService.ts`와 같아야 한다. 문서의 키 순서(분류 순서)도 시드 문서와 같게 돌아와야 `deepEqual`과 golden이 통과한다. 분류 순서와 모양(빈 분류 포함)은 `common_code_categories`로 복원한다. 그룹 순서는 그룹 안 첫 행의 `position` 기준이다. 행이 하나도 없는 그룹(예: 화면에서 `productsByRole.WEB`를 모두 지움)은 저장하면 문서에서 빠진다. 그룹을 읽는 서버 코드가 모두 `?? []`로 처리하는지 확인한다.

- [ ] **Step 2:** 실행해 실패를 확인한다(모듈 없음).
- [ ] **Step 3:** `schema.ts`, `seed.ts`, `db/index.ts`, `features/common-codes/*`를 만든다. 다른 기능의 import를 새 서비스로 바꾼다.
- [ ] **Step 4:** 새 테스트, 전체 테스트, 타입 검사, golden을 통과시킨다.
- [ ] **Step 5:** 개발·데모 DB를 다시 만든다(Global Constraints). 커밋: "공통코드: 행 단위 테이블과 user_version 스키마"

---

### Task 4: 템플릿

**Files:**
- Create: `src/features/templates/{routes,service,repository,types}.ts`
- Delete: `src/routes/templateRoutes.ts`, `src/services/templateService.ts`, `src/types/template.ts`, `database.ts`의 `templates`·`template_history` 테이블과 시드, `addNewBuiltInTemplates`, `upgradeBuiltInTemplates`, `BUILTIN_TEMPLATE_UPGRADES`, `builtin_template_ids`, `test/builtInUpgrade.test.ts`
- Test: `test/templates.test.ts`

**스키마:**
```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  os TEXT, role TEXT, product TEXT, dbms TEXT, item TEXT,
  uses_query_template INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL, generated TEXT,          -- generated: GeneratedInfo JSON 또는 NULL
  position INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,                             -- 지금의 versionId
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL,
  snapshot TEXT NOT NULL                           -- ManagedTemplate JSON
);
CREATE INDEX idx_template_versions_template ON template_versions (template_id, saved_at DESC);
```

**Interfaces:**
- Produces (기존 이름 유지): `getTemplates(filter?: { kind?: string }): ManagedTemplate[]`, `getTemplate(id?: string): ManagedTemplate | undefined`, `saveTemplate`, `deleteTemplate`, `saveGeneratedTemplate`, `deleteGeneratedTemplate`, `getTemplateHistory`, `restoreTemplateVersion`, `seedTemplates(): void`
- Repository는 한 건씩 `insert`, `update`, `delete`한다. 전체를 지우고 다시 쓰지 않는다. 새 템플릿의 `position`은 `MAX(position) + 1`이다.
- 템플릿을 지우면 버전 기록도 같이 지운다(CASCADE). 지금 동작과 같은지 확인하고, 다르면 지금 동작을 따른다.

- [ ] **Step 1:** 실패하는 테스트 작성

```ts
test('템플릿: 한 건 수정은 다른 템플릿의 순서와 내용을 바꾸지 않는다', () => {
  const before = getTemplates().map((t) => t.id);
  const target = getTemplates()[5];
  saveTemplate({ ...target, content: `${target.content}\n# 수정` }, target.id);
  assert.deepEqual(getTemplates().map((t) => t.id), before);
  assert.equal(getTemplateHistory(target.id).length, 1);
});

test('템플릿: 사용자가 지운 기본 템플릿은 다시 시작해도 되살아나지 않는다', () => {
  const id = getTemplates({ kind: 'QUERY' })[0].id;
  deleteTemplate(id);
  runStartupAgain(); // db/index.ts의 시작 처리(migrate + 조건부 시드)를 다시 실행하는 테스트용 함수
  assert.equal(getTemplate(id), undefined);
});
```

`runStartupAgain`은 `src/db/index.ts`가 내보내는 `prepareDatabase(): void`를 부른다. Task 3의 `db/index.ts`에서 이 함수를 만들어 두고, import 시점에도 이 함수를 실행한다.

- [ ] **Step 2:** 실패 확인 → 구현 → 새 테스트, 전체 테스트, 타입 검사, golden 통과
- [ ] **Step 3:** DB 다시 만들기, 커밋: "템플릿: 열 단위 테이블, 버전 기록 테이블, 기본 템플릿 업그레이드 코드 삭제"

---

### Task 5: 정책

**Files:**
- Create: `src/features/policies/{routes,service,repository,types}.ts`
- Move: 점검 만들기 정책 API(`src/routes/checkBuilderRoutes.ts`)는 Task 10에서 옮긴다. 이 작업에서는 import만 고친다.
- Delete: `src/routes/policyRoutes.ts`, `src/services/policyService.ts`, `src/types/policy.ts`, `database.ts`의 `policies` 테이블·시드, `addLinuxBasicPolicyItems`, `addLinuxRolePolicyItems`
- Test: `test/policies.test.ts`

**스키마:**
```sql
CREATE TABLE policies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, os TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('BASIC','WEB','WAS','DB')),
  enabled INTEGER NOT NULL DEFAULT 1,
  items TEXT NOT NULL,                             -- PolicyItem[] JSON
  position INTEGER NOT NULL, updated_at TEXT NOT NULL
);
```

**Interfaces:**
- Produces: `getPolicies(): Policy[]`, `getPolicy(id: string): Policy | undefined`(새로 추가), `savePolicy(input, id?)`, `deletePolicy(id)`, `seedPolicies(): void`
- `Policy.checks`: 서버 코드(`src/`)에서 읽는 곳이 없으면 타입과 응답에서 지운다. 읽는 곳이 있으면 그대로 두고 커밋 메시지에 적는다. golden은 이 키를 이미 무시한다.
- `savePolicy`, `deletePolicy`와 `syncGeneratedTemplates` 호출은 지금처럼 한 트랜잭션으로 묶는다.

- [ ] **Step 1:** 실패하는 테스트 작성

```ts
test('정책: 한 건 저장은 다른 정책을 다시 쓰지 않는다', () => {
  const others = getPolicies().filter((p) => p.id !== 'linux-basic-default');
  const target = getPolicy('linux-basic-default')!;
  savePolicy({ ...target, name: '이름 변경' }, target.id);
  assert.equal(getPolicy('linux-basic-default')!.name, '이름 변경');
  assert.deepEqual(getPolicies().filter((p) => p.id !== 'linux-basic-default'), others);
});

test('정책: 사용자가 지운 기본 정책은 다시 시작해도 되살아나지 않는다', () => {
  deletePolicy('linux-was-default');
  prepareDatabase();
  assert.equal(getPolicy('linux-was-default'), undefined);
});
```

- [ ] **Step 2:** 실패 확인 → 구현 → 새 테스트, 전체 테스트, 타입 검사, golden 통과
- [ ] **Step 3:** DB 다시 만들기, 커밋: "정책: 열 단위 테이블, 1회용 정책 보강 마이그레이션 삭제"

---

### Task 6: 서버 (새 저장 구조, 계산 값 분리, 미사용)

가장 큰 작업이다. golden이 핵심 안전망이다.

**Files:**
- Create: `src/features/servers/{routes,service,repository,types,validation}.ts`(`validation.ts`는 `serverValidation.ts`를 옮긴 것), `src/features/servers/check-plan.ts`
- Delete: `src/routes/serverRoutes.ts`, `src/services/serverService.ts`, `src/services/serverValidation.ts`, `src/types/server.ts`의 `StoredServer`와 예전 필드, `database.ts`의 `servers` 테이블
- Modify: `src/features/audit/`가 아직 없으므로 `src/services/auditService.ts`의 `AUDIT_ACTIONS`에 `SERVER_DEACTIVATE`(서버 미사용), `SERVER_ACTIVATE`(서버 다시 사용)를 추가하고, 예전 `SERVER_DELETE`는 삭제한다.
- Test: `test/servers.test.ts`, 기존 테스트에서 `type`/`product`/`deleteServer`를 쓰는 곳 고치기

**스키마:**
```sql
CREATE TABLE servers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, os TEXT NOT NULL, ip TEXT NOT NULL,
  shared_path TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  check_config TEXT NOT NULL,                      -- StoredCheckConfig JSON
  position INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE server_roles (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  role TEXT NOT NULL, product TEXT, position INTEGER NOT NULL,
  PRIMARY KEY (server_id, role)
);
CREATE TABLE server_policies (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('BASIC','WEB','WAS','DB')),
  policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, category)
);
```

**저장하는 값(`StoredCheckConfig`, `types.ts`):** `processes`, `directories`, `fileChecks`, `ports`, `httpChecks`, `customQueryTemplateIds`, `itemSettings`(지금의 `rolePolicySettings`에서 사용자가 입력하는 `logDirectories`·`periodDays`·`instanceTargets`·`inputs`, 그리고 정책이 정하지 않은 항목의 `queryTemplateId`), `scriptParts`(정책이 정하지 않은, 사용자가 고른 조각만), `roleChecks`(정책이 할당되지 않은 역할의 사용자 선택만), `minUptimeMinutes`(서버 코드에서 쓰이지 않으면 삭제)

**계산 값:** `check-plan.ts`의 `export function resolveCheckPlan(server: ServerRecord, policies: Policy[]): ResolvedServer`가 지금 `normalizeServer`의 계산을 맡는다. 정책에 따른 `roleChecks`, `scriptParts`, SQL 항목의 `queryTemplateId`·`dbms`, Windows 기본 역할 점검 등이다. 예전 필드 정리(`basicInfo`, `WEBTOB`, `OS_DISK`, `DATABASE`, `scriptTemplateId`, `type`/`product`)는 옮기지 않는다.

**Interfaces:**
- Produces:
  - `type Server`: API 응답 모양. 지금 `Server`에서 `type`, `product`, `policy`, `queryTemplateId`를 빼고 `enabled: boolean`을 더한 것
  - `getAllServers(options?: { includeInactive?: boolean }): Server[]`: 기본은 사용 중인 서버만
  - `getServer(id: string): Server | undefined`: 미사용 서버도 돌려준다
  - `createServer`, `updateServer`, `getCheckConfig`, `updateCheckConfig`: 이름 유지
  - `deactivateServer(id: string): Server`, `activateServer(id: string): Server`
  - `getServerRoles(server: Pick<Server, 'roles'>): ServerRole[]`, `getServerProduct(server: Pick<Server, 'products'>, role): ServerProduct | undefined`
  - `SERVER_ID_PATTERN`
- 라우트:
  - `GET /api/servers?includeInactive=1`
  - `POST /api/servers/:id/deactivate`, `POST /api/servers/:id/activate`: 응답은 바뀐 서버. 변경 이력을 남긴다.
  - `DELETE /api/servers/:id` 삭제
- `createServer`에 미사용 서버와 같은 ID가 오면 `ConflictError('미사용 서버 <id>가 있습니다. 서버 목록에서 [다시 사용]을 누르세요.')`를 던진다. 사용 중인 서버와 같은 ID일 때의 오류는 지금 문구를 유지한다.

- [ ] **Step 1:** 실패하는 테스트 작성

```ts
test('서버: 미사용으로 바꾸면 기본 목록에서 빠지고, includeInactive로는 보인다', () => {
  createServer(webServer('OFF-1'));
  deactivateServer('OFF-1');
  assert.equal(getAllServers().some((s) => s.id === 'OFF-1'), false);
  assert.equal(getAllServers({ includeInactive: true }).find((s) => s.id === 'OFF-1')?.enabled, false);
});

test('서버: 다시 사용하면 점검 설정까지 그대로 돌아온다', () => {
  createServer(webServer('OFF-2'));
  updateCheckConfig('OFF-2', { processes: [{ name: 'nginx' }] });
  deactivateServer('OFF-2');
  activateServer('OFF-2');
  assert.deepEqual(getCheckConfig('OFF-2').processes, [{ name: 'nginx' }]);
});

test('서버: 미사용 서버와 같은 ID로 새로 등록하면 409와 안내 문구', () => {
  createServer(webServer('OFF-3'));
  deactivateServer('OFF-3');
  assert.throws(() => createServer(webServer('OFF-3')), (e: any) => e.status === 409 && /\[다시 사용\]/.test(e.message));
});

test('서버: 할당된 정책을 지워도 서버를 읽을 수 있고 그 역할은 정책 없음', () => {
  const policy = savePolicy({ name: '임시 WEB', os: 'Linux', category: 'WEB', enabled: true, items: [] });
  createServer({ ...webServer('POL-1'), policyIds: { WEB: policy.id } });
  deletePolicy(policy.id);
  assert.equal(getServer('POL-1')!.policyIds?.WEB, undefined);
  assert.doesNotThrow(() => generateScript('POL-1'));
});

test('API: DELETE /api/servers/:id는 없고 deactivate는 변경 이력을 남긴다', async () => {
  // app.inject로 로그인 → DELETE는 404, POST deactivate는 200, audit_logs에 SERVER_DEACTIVATE 1건
});
```

`webServer(id)`는 테스트 파일 안의 도우미로, Linux·WEB(Nginx) 서버 입력을 만든다.

- [ ] **Step 2:** 실패 확인
- [ ] **Step 3:** 구현. `getAllServers`를 부르는 기존 곳의 의도를 정한다.
  - 사용 중인 서버만: 대시보드, 결과 가져오기의 서버 확인, 스크립트
  - 미사용 포함: 보고서 목록(Task 8에서 확인), 서버 목록 API의 `includeInactive`
- [ ] **Step 4:** 새 테스트, 전체 테스트, 타입 검사, golden 통과. golden이 실패하면 계산 값 분리에서 빠진 규칙이 있는 것이다. 기준 파일을 고치지 말고 `resolveCheckPlan`을 고친다.
- [ ] **Step 5:** DB 다시 만들기, 커밋: "서버: 입력값만 저장하고 정책 계산은 resolveCheckPlan으로, 삭제 대신 미사용"

---

### Task 7: 점검 결과 (가져오기·백업·조회)

**Files:**
- Create: `src/features/results/{routes,service,repository,types,importer,backup-crypto}.ts`(`importer.ts`는 `resultImportService.ts`, `backup-crypto.ts`는 `backupCrypto.ts`를 옮긴 것)
- Delete: `src/routes/resultRoutes.ts`, `src/services/result*.ts`, `src/services/backupCrypto.ts`, `src/types/result.ts`, `database.ts`의 `check_results`·`result_import_errors` 테이블
- Modify: `.devcontainer/sample-results/`의 두 파일을 `schemaVersion: 2` 형식으로 바꾸고 `sample-results/` 바로 아래로 옮긴다. `.devcontainer/setup.cjs`, `.devcontainer/README.md`의 경로도 고친다. `scripts/decrypt-backup.cjs`의 import 경로를 고친다.
- Test: `test/resultImport.test.ts`(이전 방식 폴더 테스트 2개 삭제, 새 테스트 추가), `test/reportList.test.ts`(v1 결과를 v2로 바꾸기)

**스키마:**
```sql
CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,                         -- 외래키 없음: 서버가 미사용이어도 결과 유지
  file_name TEXT NOT NULL, check_date TEXT NOT NULL, hostname TEXT,
  status TEXT NOT NULL CHECK (status IN ('Healthy','Warning','Critical','NotCollected')),
  cpu REAL, memory REAL, disk REAL,
  file_hash TEXT NOT NULL UNIQUE, raw_json TEXT NOT NULL,
  backup_path TEXT, imported_at TEXT NOT NULL
);
CREATE INDEX idx_check_results_server_date ON check_results (server_id, check_date DESC);
CREATE INDEX idx_check_results_server_file ON check_results (server_id, file_name);
CREATE TABLE result_import_errors (지금과 같음);
```

**규칙:**
- `schemaVersion`이 2가 아니면 실패: `'지원하지 않는 결과 형식입니다(schemaVersion 2만 지원). 최신 점검 스크립트로 다시 점검하세요.'`
- `collectedAt`이 `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/`가 아니면 실패: `'점검 일시(collectedAt) 형식이 올바르지 않습니다: <값>'`. 변환하지 않는다. 스크립트가 이 형식으로 쓰기 때문이다.
- 서버가 없으면 지금 문구를 유지한다. 서버가 미사용이면 실패: `'미사용 서버의 결과입니다: <id>. 서버 목록에서 [다시 사용]을 누른 뒤 가져오세요.'`. 원본은 지우지 않는다.
- `results/` 아래 하위 폴더는 읽지 않는다(바로 아래 파일만).
- `hostname`은 가져올 때 `host.hostname`으로 저장한다. `getResultSummaries`는 `json_extract` 대신 이 열을 읽는다.
- `parseResultJson`의 v1 분기를 지운다.

**Interfaces:**
- Produces (기존 이름 유지): `parseResultJson`, `getResults`, `getLatestResult`, `getResultByFile`, `getResultFiles`, `getResultSummaries(serverIds, range): ResultSummary[]`, `getHealthStatus`, `storeUploadedResult`, `importResults`, `getImportStatus`, `startResultImportScheduler`, `logImportSummary`, `encryptBackup`, `decryptBackup`, `BACKUP_DIR`

- [ ] **Step 1:** 실패하는 테스트 작성(`resultImport.test.ts`에 추가)

```ts
test('미사용 서버의 결과는 가져오지 않고 원본을 남긴다', () => {
  deactivateServer('SRV-B');
  fs.writeFileSync(path.join(inbox, 'off.json'), result('SRV-B', '2026-04-01 00:00:00'));
  const summary = importResults();
  assert.equal(summary.imported, 0);
  assert.match(summary.errors[0].message, /미사용 서버의 결과입니다: SRV-B/);
  assert.ok(fs.existsSync(path.join(inbox, 'off.json')));
  activateServer('SRV-B');
  assert.equal(importResults().imported, 1);
});

test('schemaVersion 2가 아니거나 점검 일시 형식이 다르면 가져오지 않는다', () => {
  assert.throws(() => storeUploadedResult(Buffer.from(JSON.stringify({ server: 'SRV-A', checkDate: '2026-01-01 00:00:00' })), 'v1.json'), /schemaVersion 2만 지원/);
  assert.throws(() => storeUploadedResult(Buffer.from(result('SRV-A', '2026-01-01T00:00:00Z')), 't.json'), /점검 일시\(collectedAt\) 형식/);
});

test('results/ 아래 하위 폴더의 파일은 읽지 않는다', () => {
  fs.mkdirSync(path.join(inbox, '2026', 'SRV-A'), { recursive: true });
  fs.writeFileSync(path.join(inbox, '2026', 'SRV-A', 'old.json'), result('SRV-A', '2026-05-01 00:00:00'));
  assert.equal(importResults().imported, 0);
});
```

- [ ] **Step 2:** 실패 확인 → 구현 → 새 테스트, 전체 테스트, 타입 검사, golden 통과
- [ ] **Step 3:** `node .devcontainer/setup.cjs`가 오류 없이 샘플을 복사하는지 확인한다. 임시 폴더로 실행할 수 있으면 그렇게 한다.
- [ ] **Step 4:** DB 다시 만들기, 커밋: "점검 결과: schemaVersion 2만 받기, 미사용 서버 결과 거부, 호스트 이름 열"

---

### Task 8: 보고서·대시보드

**Files:**
- Create: `src/features/reports/{routes,service,rules,types}.ts`(`rules.ts`는 `reportRuleService.ts`), `src/features/dashboard/{routes,service}.ts`
- Delete: `src/routes/{reportRoutes,dashboardRoutes}.ts`, `src/services/{reportService,reportRuleService,dashboardService}.ts`, `src/types/report.ts`
- Test: `test/reportList.test.ts`

**규칙:** 보고서 목록은 `getAllServers({ includeInactive: true })` 기준이다. 대시보드는 사용 중인 서버만 센다. `ReportListItem`의 `serverType`은 `roles[0]`로 채운다. 응답 키는 화면이 쓰므로 유지한다.

- [ ] **Step 1:** 실패하는 테스트 작성(`reportList.test.ts`에 추가)

```ts
test('미사용 서버의 보고서도 목록에 나오고, 대시보드에서는 빠진다', () => {
  deactivateServer('DB-B');
  assert.ok(getAllReports().some((r) => r.serverId === 'DB-B'));
  assert.equal(getRecentChecks().some((c) => c.serverId === 'DB-B'), false);
  assert.equal(getDashboardSummary().total, 1);
  activateServer('DB-B');
});
```

- [ ] **Step 2:** 실패 확인 → 구현 → 새 테스트, 전체 테스트, 타입 검사, golden 통과
- [ ] **Step 3:** 커밋: "보고서·대시보드 기능 폴더로, 미사용 서버 보고서 유지"

---

### Task 9: 변경 이력·인증

**Files:**
- Create: `src/features/audit/{routes,service,repository,types}.ts`, `src/features/auth/{routes,service,repository,types,login-throttle}.ts`
- Delete: `src/routes/{auditRoutes,authRoutes}.ts`, `src/services/{auditService,authService,loginThrottle}.ts`, `src/types/{audit,auth}.ts`, `database.ts`의 `users`·`audit_logs` 테이블과 `user.json` 시드
- Modify: `scripts/create-user.cjs`는 `users` 테이블이 그대로라 확인만 한다.

**스키마:** `users`, `audit_logs`는 지금과 같다. `idx_audit_logs_at`, `idx_audit_logs_action`만 만들고 `idx_audit_logs_user`는 만들지 않는다.

- [ ] **Step 1:** 옮기고 import를 고친다. `test/account.test.ts`, `test/security.test.ts`가 그대로 통과해야 한다.
- [ ] **Step 2:** 전체 테스트, 타입 검사, golden 통과. 커밋: "변경 이력·인증 기능 폴더로, 쓰이지 않는 사용자 인덱스 삭제"

---

### Task 10: 스크립트·점검 만들기

**Files:**
- Create: `src/features/scripts/{routes,service,assembly,linux,windows,db-query-defaults}.ts`, `src/features/scripts/check-builder/{routes,linux,windows,literal,presets,spec,templates,types}.ts`
- Delete: `src/routes/{scriptRoutes,checkBuilderRoutes}.ts`, `src/services/{scriptService,scriptAssembly,linuxScriptService,windowsScriptService,dbQueryDefaults}.ts`, `src/services/checkBuilder/`
- Modify: `scripts/build-windows-check-test.ts`의 import

**규칙:** `generateScript(serverId)`는 미사용 서버면 `BadRequestError('미사용 서버는 스크립트를 내려받을 수 없습니다: <id>')`를 던진다.

- [ ] **Step 1:** 실패하는 테스트 작성(`test/servers.test.ts`에 추가)

```ts
test('미사용 서버는 스크립트를 내려받을 수 없다', () => {
  createServer(webServer('OFF-4'));
  deactivateServer('OFF-4');
  assert.throws(() => generateScript('OFF-4'), /미사용 서버는 스크립트를 내려받을 수 없습니다: OFF-4/);
});
```

- [ ] **Step 2:** 실패 확인 → 옮기기·구현 → 전체 테스트, 타입 검사, golden 통과
- [ ] **Step 3:** 커밋: "스크립트·점검 만들기 기능 폴더로, 미사용 서버 스크립트 차단"

---

### Task 11: 정리

**Files:**
- Delete: `src/db/database.ts`, `src/routes/`, `src/services/`, `src/types/`, `src/utils/`. 남은 공통 타입(`api.ts`, `validation.ts`, `fastify.d.ts`)은 `src/shared/`로 옮긴다.
- Modify: `package.json`
  - `description`을 "서버 정기점검 스크립트 생성·결과 수집·보고서"로 채운다.
  - `main`을 `dist/server.js`로 바꾼다.
  - 쓰이지 않는 `nodemon`을 devDependencies에서 뺀다.
- Modify: `src/db/schema.ts`에 `settings` 테이블이 남아 있으면 쓰는 곳을 확인하고, 없으면 삭제한다.

- [ ] **Step 1:** 삭제한 경로를 import하는 곳이 없는지 확인한다: `node -e` 스크립트로 `src`, `test`, `scripts`의 `from '…/(routes|services|types|utils)/` 패턴을 찾아 0건
- [ ] **Step 2:** 빌드 결과물이 실행되는지 확인한다.
  - `node "$TMPDIR/ts5/node_modules/typescript/lib/tsc.js" -p tsconfig.build.json && node scripts/copy-runtime-assets.js`
  - `OPSBOX_DB_PATH=$TMPDIR/build-check/opsbox.db node dist/server.js`를 실행해 `/api/health`가 200인지 확인하고 종료한다(빈 DB에 시드됨).
- [ ] **Step 3:** 전체 테스트, golden 통과. 커밋: "예전 구조 파일 삭제, package.json 정리"

---

### Task 12: 화면 최소 수정 (type·product, 미사용)

**Files:**
- Modify: `src/public/settings/server-management/server-list.js`, `server-detail.js`, `server-list.html`, `server-detail.html`, `src/public/reports/report-detail.js`, `src/public/settings/script-management/script-management.js`
  - 서버 객체의 `.type`을 `roles[0]`로, `.product`를 `products[role]`로 바꾼다. 정책 항목·실행 방식 같은 다른 객체의 `.type`은 그대로 둔다.
- 서버 목록:
  - [삭제] 버튼을 [미사용]으로 바꾼다. 확인 창 문구는 "미사용으로 바꾸면 대시보드와 스크립트 내려받기에서 빠집니다. 점검 결과와 보고서는 그대로 남습니다."이다.
  - "미사용 포함" 체크박스를 둔다(켜면 `?includeInactive=1`).
  - 미사용 서버 행에는 "미사용" 표시와 [다시 사용] 버튼을 둔다.
- 서버 상세: 미사용 서버면 상단에 "미사용 서버입니다" 안내와 [다시 사용] 버튼을 두고, 스크립트 내려받기 버튼을 숨긴다.
- Modify: `scripts/seed-demo.ts`: 마지막 데모 서버 1대를 만든 뒤 `deactivateServer`로 미사용으로 바꾼다.
- Modify: `test/pageLayout.test.ts` 등 화면 HTML을 검사하는 테스트가 있으면 맞춘다.

- [ ] **Step 1:** 수정 후 전체 테스트, 타입 검사, golden 통과. golden은 미사용이 된 서버의 스크립트를 건너뛴다(Task 1 테스트의 `continue`).
- [ ] **Step 2:** 데모 DB를 다시 만들고 `npm run demo:dev`(포트 3001)로 띄운다. playwright-termux로 다음을 확인하고 스크린샷을 남긴다.
  - 서버 목록 기본 화면에서 미사용 서버가 숨겨진다.
  - "미사용 포함"을 켜면 미사용 서버가 보인다.
  - [미사용] → [다시 사용]이 동작한다.
  - 미사용 서버의 보고서가 보고서 목록에서 열린다.
  - 서버 상세, 정책·템플릿 편집, 스크립트 내려받기, 결과 올리기가 된다.
  - 브라우저 콘솔에 오류가 없다.
- [ ] **Step 3:** 커밋: "화면: 서버 type·product 대신 roles·products, 서버 미사용·다시 사용"

---

### Task 13: 문서

**Files:**
- Modify: `docs/DATABASE.md`
  - 3장(테이블)을 새 스키마로 다시 쓴다.
  - 6장(최초 이관·업그레이드)은 "빈 DB면 seeds/로 시드, user_version으로 버전 관리"로 바꾼다.
  - 4장에서 이전 방식 폴더와 v1 형식 설명을 지운다.
  - 서버 미사용과 결과 보존을 설명한다.
  - 8장의 조회 예시 SQL을 새 테이블로 고친다.
- Modify: `README.md`(폴더 구조, 실행 방법, 시드 위치), `docs/USER_GUIDE.md`(서버 삭제 → 미사용), `.devcontainer/README.md`
- [ ] **Step 1:** 문서에 나오는 경로가 실제로 있는지 확인한다(`node -e`로 문서의 `` `src/…` ``, `` `seeds/…` `` 경로를 추출해 존재 여부 검사).
- [ ] **Step 2:** 커밋: "문서: 새 폴더 구조·스키마·서버 미사용 기준으로"
