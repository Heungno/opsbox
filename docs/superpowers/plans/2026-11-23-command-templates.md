# 명령 템플릿 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 도구(wsadmin·jeusadmin)에 넣을 명령과 판정 규칙만 적는 **명령(COMMAND) 템플릿**을 만들고, 서버의 WEB·WAS 항목에서 골라 Linux·Windows 점검 스크립트가 실행하게 한다.

**Architecture:** 템플릿은 `templates` 표에 kind `COMMAND`로 저장하고(새 열 없음: `product`·`item` 재사용), 서버는 기존 `scriptParts[항목] = 템플릿 ID`로 고른다. 스크립트 조립은 그런 항목의 원래 조각 대신 `COMMAND_RUNNER` 조각을 한 번 넣고, 설정에 `commands` 목록을 싣는다. 실행기 조각은 시험판(`docs/spikes/command-templates/opsbox-command-runner.sh`)을 옮긴 것이며 결과는 기존 역할 결과 기록(`opsbox_role_record` / `$rolePolicyResults`)으로 남겨 보고서의 SUMMARY·CONSOLE 상자가 그대로 보여 준다.

**Tech Stack:** Node 24 + TypeScript(tsx), node:sqlite, node:test, bash, PowerShell 3.0+, 화면은 바닐라 JS 모듈.

**Spec:** `docs/superpowers/specs/2026-11-23-command-templates-design.md`

## Global Constraints

- 템플릿 머리 주석: `@opsbox-product`·`@opsbox-tool`·`@opsbox-home`·`@opsbox-args`·`@opsbox-require`·`@opsbox-quit`·`@opsbox-timeout`(초, 기본 20)·`@opsbox-status <수준> ~ <정규식>`. 주석이 아닌 빈 줄 아닌 줄 = 명령.
- 판정: Critical → Warning → Healthy 순서로 처음 맞는 수준. 아무것도 안 맞으면 NotCollected, 문구 `<제품> 상태 값을 확인할 수 없습니다(맞는 판정 규칙 없음).` 정규식은 출력을 **대문자로 바꾼 것**에 적용.
- 도구 없음·필수 환경 변수 없음·시간 초과 → NotCollected + 이유 문구(시험판 문구 그대로).
- 결과 모양: `{ product, status, command, output, message }`. `command`는 `<도구>: <명령1>, <명령2>`(인자 넣지 않음). `output`은 앞 12000자.
- 이름에 `PASSWORD`가 든 `@opsbox-require` 변수의 값은 `output`과 로그에서 `****`.
- `{{…}}` 치환은 COMMAND 내용에 하지 않는다. `${이름}`(환경 변수)만 실행 중에 바뀐다.
- 명령 템플릿을 안 고른 `WAS_ENGINE_STATUS` 문구: `서버 정책에서 관리 명령 템플릿을 고르세요.` (Linux·Windows 같음)
- COMMAND 템플릿에는 `os`가 없다. 고를 때 OS 검사를 하지 않는다.
- 기본값(템플릿·조각·정책 항목·공통코드)은 **ID가 없을 때만** 추가. 사용자가 고친 것은 덮어쓰지 않는다.
- Windows 조각은 PowerShell 3.0 문법만(`::new()`, `-in`, `class`, `using` 금지 — `test/seedTemplates.test.ts`가 검사).
- 명령은 `npm test`가 Termux에서 실패하면 `node --import tsx --test "test/**/*.test.ts"`로 실행(`/usr/bin/env` 없음).

## Review Focus

1. **비밀번호가 결과·로그에 남음** — `-P${OPSBOX_JEUS_PASSWORD}`의 값이 도구 출력에 그대로 찍히는 경우. 기대: `output`·로그 모두 `****`, `command`에 인자 없음. → Task 5 테스트 `비밀번호 가림`.
2. **템플릿을 고른 뒤 그 템플릿을 지우거나 중지함** — 기대: 스크립트 내려받기가 `… 지정한 스크립트 템플릿을 사용할 수 없습니다` 오류(지금 조각과 같은 동작), 서버 상세 선택 창에 `저장된 템플릿을 찾을 수 없음`. → Task 4 테스트, Task 8 테스트.
3. **Windows WEB 엔진 상태에서 명령 템플릿을 골랐는데 정책 기본 조각(`WINDOWS-PART-WEB_ENGINE_STATUS`)이 덮어씀** — `check-plan.ts`가 정책 `templateId`로 `scriptParts`를 덮어쓰기 때문. 기대: COMMAND 선택이 남는다. → Task 3 테스트.
4. **이미 설치된 DB(버전 2)에서 업데이트** — 기대: COMMAND 기본 템플릿 2개, 실행기 조각 2개, 두 WAS 정책의 `WAS_ENGINE_STATUS`, 공통코드가 생기고, 사용자가 고친 같은 ID 템플릿은 그대로. → Task 2 테스트.
5. **출력에 정규식 특수문자·따옴표·역슬래시·한글이 있음** — 기대: JSON이 깨지지 않고 결과 가져오기가 성공. → Task 5 테스트 `출력 JSON 안전`.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/features/templates/command-template.ts` (새) | 명령 템플릿 내용 해석·검사 (`parseCommandTemplate`) |
| `src/features/templates/service.ts` | 저장 검사에 COMMAND 추가, `product`·`item` 저장 |
| `src/features/scripts/commands.ts` (새) | 서버의 명령 항목 결정 (`resolveCommandItems`) |
| `src/features/scripts/assembly.ts`·`linux.ts`·`windows.ts`·`service.ts` | 조각 고르기·설정에 `commands` |
| `src/features/servers/check-plan.ts`·`service.ts` | COMMAND 선택 유지·서버 저장 검사 |
| `src/db/schema.ts`·`src/db/seed.ts` | 버전 3 + 기존 DB에 기본값 더하기 |
| `seeds/common-codes.json`·`policy.json`·`templates.json` | 종류·항목·정책·기본 템플릿·실행기 조각 |
| `src/shared/constants.ts` | `COMMAND_ONLY_ITEMS` |
| `src/public/settings/script-management/*` | 종류 "관리 명령" 편집 |
| `src/public/settings/server-management/server-policy-form.js`·`server-detail.js` | 선택 창 목록 |
| `scripts/seed-demo.ts`, `test/golden/**`, `docs/USER_GUIDE.md`, `docs/spikes/command-templates/` | 데모·기준 파일·안내·시험판 정리 |

---

### Task 1: 명령 템플릿 해석·저장 검사

**Files:**
- Create: `src/features/templates/command-template.ts`
- Modify: `src/features/templates/service.ts` (`validate`, `saveTemplate`)
- Modify: `seeds/common-codes.json` (`templateKinds`에 `{ "value": "COMMAND", "label": "관리 명령" }`)
- Test: `test/commandTemplate.test.ts` (새), `test/templates.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CommandLevel = 'Critical' | 'Warning' | 'Healthy';
  export interface CommandTemplate {
    product: string; tool: string; home: string; args: string; require: string[]; quit: string;
    timeoutSeconds: number; rules: Array<{ level: CommandLevel; pattern: string }>; commands: string[];
  }
  export interface CommandIssue { line: number; message: string }
  export function parseCommandTemplate(content: string): { template: CommandTemplate; errors: CommandIssue[]; warnings: CommandIssue[] };
  ```
  `ManagedTemplate`(kind `COMMAND`)은 `product`(공통코드 `productsByRole.WEB`·`WAS` 값), `item`(scriptItems 중 role이 WEB·WAS인 값), `os` 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/commandTemplate.test.ts`

  ```ts
  test('명령 템플릿: 시험판 jeus-6.cmd를 읽는다', () => {
    const { template, errors } = parseCommandTemplate(fs.readFileSync('docs/spikes/command-templates/jeus-6.cmd', 'utf8'));
    assert.deepEqual(errors, []);
    assert.equal(template.tool, 'jeusadmin'); assert.equal(template.timeoutSeconds, 30);
    assert.deepEqual(template.require, ['JEUS_NODE', 'OPSBOX_JEUS_USER', 'OPSBOX_JEUS_PASSWORD']);
    assert.deepEqual(template.commands, ['allenginenames', 'pidlist']);
    assert.deepEqual(template.rules.map((r) => r.level), ['Critical', 'Healthy']);
  });
  test('명령 템플릿: 도구·판정·명령이 없거나 수준·정규식이 틀리면 줄 번호와 함께 오류', () => {
    const { errors } = parseCommandTemplate('# @opsbox-status Fatal ~ X\n# @opsbox-status Healthy ~ (RDY\n');
    assert.deepEqual(errors.map((e) => e.message), [
      '@opsbox-tool(관리 도구 이름)이 필요합니다.',
      '1번 줄: 수준은 Critical·Warning·Healthy 중 하나여야 합니다.',
      '2번 줄: 정규식이 올바르지 않습니다.',
      '도구에 넣을 명령 줄이 1개 이상 필요합니다.',
    ]);
  });
  test('명령 템플릿: @opsbox-args에 ${…} 아닌 -P 값이 있으면 경고(저장은 됨)', () => {
    const { errors, warnings } = parseCommandTemplate('# @opsbox-tool x\n# @opsbox-args -Psecret\n# @opsbox-status Healthy ~ OK\nst\n');
    assert.deepEqual(errors, []);
    assert.match(warnings[0].message, /비밀번호를 직접 적었을 수 있습니다/);
  });
  ```
  `test/templates.test.ts`에 추가:
  ```ts
  test('템플릿: COMMAND는 제품·항목을 저장하고 OS는 없으며, 형식이 틀리면 저장 거부', () => {
    const saved = saveTemplate({ name: 'JEUS 6 엔진', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', os: 'Linux', content: JEUS6 });
    assert.equal(saved.product, 'JEUS'); assert.equal(saved.item, 'WAS_ENGINE_STATUS'); assert.equal(saved.os, undefined);
    assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', content: 'st\n' }), /@opsbox-tool/);
    assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'JEUS', item: 'CPU', content: JEUS6 }), (e: any) => e.errors.some((x: any) => x.field === 'item'));
    assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'Oracle', item: 'WAS_ENGINE_STATUS', content: JEUS6 }), (e: any) => e.errors.some((x: any) => x.field === 'product'));
  });
  ```
  (`JEUS6`는 시험판 `jeus-6.cmd` 내용. `WAS_ENGINE_STATUS` 공통코드는 Task 2에서 들어오므로, 이 테스트는 `WEB_ENGINE_STATUS`·`WebtoB`로 쓰고 Task 2 뒤에 WAS 경우를 더해도 된다.)

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/commandTemplate.test.ts test/templates.test.ts` → 모듈 없음/검사 없음으로 FAIL.

- [ ] **Step 3: `parseCommandTemplate` 구현** — 시험판 실행기의 줄 규칙과 같게(`# @opsbox-키 값`, `#`로 시작하는 다른 줄·빈 줄 무시, 끝 공백·`\r` 제거). 정규식은 `new RegExp(pattern)`으로 한 번 컴파일해 보기. 모르는 키는 경고(`@opsbox-xxx는 모르는 머리 주석이라 무시합니다.`). `-P` 경고: `args`에서 `/-P(?!\$\{)\S/` 이면 `@opsbox-args에 비밀번호를 직접 적었을 수 있습니다. \${환경변수}로 바꾸세요.`

- [ ] **Step 4: `validate`·`saveTemplate`에 COMMAND 추가** — kind `COMMAND`이면: `product`가 `productsByRole.WEB ∪ WAS`에 없으면 `{ field: 'product', message: '제품을 선택하세요.' }`, `item`이 role WEB·WAS인 scriptItems에 없으면 `{ field: 'item', message: 'WEB·WAS 점검 항목을 선택하세요.' }`, `parseCommandTemplate(content).errors`마다 `{ field: 'content', message }`. 저장 객체: COMMAND이면 `os: undefined, product, item`(지금은 `item`을 SCRIPT_PART만 저장, `product`는 저장 안 함 → 둘 다 COMMAND에도 저장). 경고는 응답에 `warnings: string[]`로 붙여 돌려준다(저장 객체에는 넣지 않음).

- [ ] **Step 5: 통과 확인** — Step 2 명령 → PASS. `node --import tsx --test test/codesApi.test.ts test/golden.test.ts`에서 공통코드 응답 기준 파일이 달라지면 Task 9에서 한꺼번에 다시 만든다(여기서는 실패 내용이 `templateKinds` 한 줄뿐인지만 확인).

- [ ] **Step 6: 커밋** — `명령 템플릿: 형식 해석과 저장 검사`

---

### Task 2: 새 정책 항목·기본 명령 템플릿·기존 DB에 더하기

**Files:**
- Modify: `seeds/common-codes.json` (`scriptItems`에 `{ "value": "WAS_ENGINE_STATUS", "label": "WAS 엔진 상태", "group": "WAS", "role": "WAS", "description": "JEUS jeusadmin 등 제품별 관리 명령으로 엔진 상태를 확인합니다." }`를 `WAS_JVM_HEAP` 앞에, `rolePolicies.WAS` 맨 앞에 `WAS_ENGINE_STATUS`)
- Modify: `seeds/policy.json` (`linux-was-default`·`windows-was-default` 항목 맨 앞에 `WAS_ENGINE_STATUS`: `WEB_ENGINE_STATUS` 항목과 같은 `result`, `executor: { "type": "CONSOLE_COMMAND", "options": {} }`, templateId 없음)
- Modify: `seeds/templates.json` (`WEBTOB41-COMMAND-WEB_ENGINE_STATUS` 이름 `WebtoB 4.1 · WEB 엔진 상태`, product `WebtoB`, item `WEB_ENGINE_STATUS`, 내용 = 시험판 `webtob-4.1.cmd`; `JEUS6-COMMAND-WAS_ENGINE_STATUS` 이름 `JEUS 6 · WAS 엔진 상태`, product `JEUS`, item `WAS_ENGINE_STATUS`, 내용 = `jeus-6.cmd`. 첫 줄 `(시험판)` 글자만 빼고 "현장 확인 필요" 주석은 그대로)
- Modify: `src/db/schema.ts` (MIGRATIONS 3: 주석만 있는 SQL `/* 3: 명령 템플릿 기본값 — seed.ts의 SEED_UPGRADES[3]가 넣음 */ SELECT 1;`), `migrate`가 `{ created, from: number }` 반환
- Modify: `src/db/seed.ts`, `src/db/index.ts`
- Test: `test/migrations.test.ts`, `test/seedTemplates.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/db/seed.ts
  /** 버전 N으로 올라갈 때 기존 DB에 더할 기본값 ID. 이미 있는 ID는 건드리지 않음 */
  export const SEED_UPGRADES: Record<number, { templates: string[]; policyItems: Array<{ policyId: string; itemId: string }>; codes: Array<{ category: 'templateKinds' | 'scriptItems'; value: string } | { category: 'rolePolicies'; group: string; value: string }> }>;
  export function upgradeSeeds(fromVersion: number): void;  // from+1..SCHEMA_VERSION 차례로
  ```
  `SEED_UPGRADES[3].templates` = `['WEBTOB41-COMMAND-WEB_ENGINE_STATUS', 'JEUS6-COMMAND-WAS_ENGINE_STATUS', 'LINUX-PART-COMMAND_RUNNER', 'WINDOWS-PART-COMMAND_RUNNER']` (실행기 조각은 Task 5·6에서 seeds에 생김 — 없는 ID는 건너뛰므로 순서 문제 없음).
  `prepareDatabase`: `const { created, from } = migrate(db); if (created) seedNewDatabase(); else upgradeSeeds(from);`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/migrations.test.ts`

  ```ts
  test('버전 3: 기존 DB에 명령 템플릿·WAS 엔진 상태를 더하고, 사용자가 고친 같은 ID 템플릿은 그대로', () => {
    // helpers/env의 새 DB에서: JEUS6 템플릿 내용을 '# 내가 고침'으로 바꾸고, WEBTOB41 템플릿·두 정책의 WAS_ENGINE_STATUS·
    // 공통코드 COMMAND·WAS_ENGINE_STATUS를 지운 뒤 PRAGMA user_version = 2 → prepareDatabase()
    assert.equal(findTemplate('JEUS6-COMMAND-WAS_ENGINE_STATUS')!.content, '# 내가 고침');
    assert.equal(findTemplate('WEBTOB41-COMMAND-WEB_ENGINE_STATUS')!.kind, 'COMMAND');
    assert.equal(findPolicy('linux-was-default')!.items[0].id, 'WAS_ENGINE_STATUS');
    assert.equal(findPolicy('windows-was-default')!.items[0].id, 'WAS_ENGINE_STATUS');
    const codes = fromTables(readTables());
    assert.ok(codes.templateKinds.some((c) => c.value === 'COMMAND'));
    assert.ok(codes.scriptItems.some((c) => c.value === 'WAS_ENGINE_STATUS'));
    assert.ok(codes.rolePolicies.WAS.includes('WAS_ENGINE_STATUS'));
  });
  test('버전 3: 두 번 올려도 항목이 겹치지 않는다', () => { /* upgradeSeeds(2) 두 번 → WAS_ENGINE_STATUS 1개 */ });
  ```
  `test/seedTemplates.test.ts`: `COMMAND 기본 템플릿은 parseCommandTemplate 오류가 없다`.

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/migrations.test.ts test/seedTemplates.test.ts` → FAIL.
- [ ] **Step 3: 시드 JSON 수정, MIGRATIONS 3, `upgradeSeeds` 구현** — 템플릿은 `findTemplate`이 없을 때 `upsertTemplate`, 정책 항목은 정책이 있고 항목이 없을 때 seeds의 같은 위치(앞 항목 다음)에 넣어 `upsertPolicy`, 공통코드는 `fromTables(readTables())`에 없는 값만 seeds 위치대로 넣고 `replaceTables(toTables(…))`.
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS. 기존 마이그레이션 2 테스트도 PASS(`migrate`의 반환 모양만 바뀜).
- [ ] **Step 5: 커밋** — `명령 템플릿: WAS 엔진 상태 항목·기본 템플릿, 기존 DB에 더하기`

---

### Task 3: 서버에서 명령 템플릿 고르기 (저장·불러오기)

**Files:**
- Modify: `src/shared/constants.ts` — `export const COMMAND_ONLY_ITEMS: ReadonlySet<string> = new Set(['WAS_ENGINE_STATUS']);` (기본 조각 없이 명령 템플릿으로만 도는 항목)
- Modify: `src/features/servers/check-plan.ts` — `PlanContext`에 `commandTemplateIds: ReadonlySet<string>`; 정책 `templateId`로 `scriptParts`를 덮어쓸 때 저장값이 COMMAND 템플릿 ID면 덮어쓰지 않음
- Modify: `src/features/servers/service.ts` — `resolve`가 `commandTemplateIds`(`getTemplates({ kind: 'COMMAND' })`의 ID) 전달; 저장 검사
- Test: `test/servers.test.ts`

**Interfaces:**
- Consumes: Task 1의 COMMAND 템플릿, Task 2의 `WAS_ENGINE_STATUS`.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/servers.test.ts`

  ```ts
  test('서버: Windows WEB 엔진 상태에 명령 템플릿을 고르면 정책 기본 조각이 덮어쓰지 않는다', () => {
    // Windows WEB 서버(policyIds.WEB = windows-web-default)에 scriptParts.WEB_ENGINE_STATUS = 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS' 저장
    assert.equal(getServer(id)!.scriptParts.WEB_ENGINE_STATUS, 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS');
  });
  test('서버: 다른 항목용 명령 템플릿이나 중지된 명령 템플릿은 저장 거부', () => {
    // WEB_ENGINE_STATUS에 JEUS6-COMMAND-WAS_ENGINE_STATUS → field 'scriptParts.WEB_ENGINE_STATUS', /다른 점검 항목용/
    // 중지한 명령 템플릿 → /사용할 수 없습니다/
  });
  test('서버: Windows WAS 서버는 WAS 엔진 상태 조각이 없어도 저장된다(명령 템플릿 미선택)', () => { /* 오류 없음 */ });
  test('서버: 서버 WAS 제품과 템플릿 제품이 달라도 저장된다', () => { /* Apache Tomcat 서버에 JEUS6 템플릿 → 저장됨 */ });
  ```

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/servers.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 저장 검사(역할 항목 반복 안): `selectedId`의 템플릿이 kind `COMMAND`이면 `enabled`가 아니면 `{ field: 'scriptParts.<item>', message: '<항목 이름> 항목의 관리 명령 템플릿을 사용할 수 없습니다.' }`, `template.item !== item`이면 `'<항목 이름> 항목에는 다른 점검 항목용 관리 명령 템플릿을 고를 수 없습니다.'`. Windows "조각 없음" 오류는 `selectedId`가 COMMAND이거나 `COMMAND_ONLY_ITEMS.has(item)`이면 내지 않는다.
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS.
- [ ] **Step 5: 커밋** — `명령 템플릿: 서버 항목에서 고르기(저장·검사)`

---

### Task 4: 스크립트 조립 — 명령 항목과 실행기 조각

**Files:**
- Create: `src/features/scripts/commands.ts`
- Modify: `src/features/scripts/assembly.ts` (`selectScriptParts`, `buildScriptConfig`)
- Modify: `src/features/scripts/linux.ts` (`renderBashConfig`), `windows.ts`, `service.ts`
- Test: `test/commandAssembly.test.ts` (새)

**Interfaces:**
- Consumes: `COMMAND_ONLY_ITEMS`(Task 3).
- Produces:
  ```ts
  // src/features/scripts/commands.ts
  export const COMMAND_NOT_SELECTED_MESSAGE = '서버 정책에서 관리 명령 템플릿을 고르세요.';
  export interface CommandEntry { role: 'WEB' | 'WAS'; item: string; templateId: string; name: string; content: string; message: string | null }
  /** WEB·WAS 역할 항목 중 scriptParts가 COMMAND 템플릿인 것(content 채움)과, COMMAND_ONLY_ITEMS인데 고르지 않은 것(content '', message) */
  export function resolveCommandItems(server: Server, templates: ManagedTemplate[]): CommandEntry[];
  ```
  - `selectScriptParts`: `resolveCommandItems`에 나온 항목은 조각을 고르지 않고, 목록이 비지 않으면 `'COMMAND_RUNNER'`를 역할 항목 뒤·`SAVE` 앞에 **한 번** 넣는다. 고른 ID의 템플릿이 없거나 중지·kind COMMAND인데 item이 다르면 지금처럼 `BadRequestError(… 지정한 스크립트 템플릿을 사용할 수 없습니다 …)`.
  - `buildScriptConfig(server, policyQueryTemplates, customQueryTemplates, templates: ManagedTemplate[] = [])` → 결과에 `commands: CommandEntry[]` (`{{…}}` 치환 안 함, `\r\n` → `\n`).
  - Linux 설정 블록: `OPSBOX_COMMAND_ROLES`·`OPSBOX_COMMAND_ITEMS`·`OPSBOX_COMMAND_NAMES`·`OPSBOX_COMMAND_CONTENTS`·`OPSBOX_COMMAND_MESSAGES` 배열(같은 순서).
  - Windows: Base64 설정 JSON의 `commands`.
  - `generateScript`: `getTemplates()`에서 SCRIPT_PART·COMMAND를 함께 넘긴다(`selectScriptParts`의 `usable`은 SCRIPT_PART만 그대로).

- [ ] **Step 1: 실패하는 테스트 작성** — `test/commandAssembly.test.ts` (실행기 조각이 아직 없으므로 테스트용 `LINUX-PART-COMMAND_RUNNER`·`WINDOWS-PART-COMMAND_RUNNER` SCRIPT_PART를 `# RUNNER` 내용으로 넘긴다)

  ```ts
  test('조립: 명령 템플릿을 고른 항목은 원래 조각 대신 실행기 조각 한 번, SAVE 바로 앞', () => {
    const parts = selectScriptParts(linuxWebWasServer /* WEB_ENGINE_STATUS=WEBTOB41, WAS_ENGINE_STATUS=JEUS6 */, templates, 'Linux', '@@CONFIG_BASH@@');
    assert.equal(parts.filter((p) => p === '# RUNNER').length, 1);
    assert.equal(parts.at(-2), '# RUNNER');
    assert.ok(!parts.includes(seedPart('LINUX-PART-WEB_ENGINE_STATUS')));
  });
  test('조립: WAS 엔진 상태를 안 고르면 실행기가 미수집 문구를 받는다', () => {
    const config = buildScriptConfig(server, [], [], templates);
    assert.deepEqual(config.commands.find((c) => c.item === 'WAS_ENGINE_STATUS'), { role: 'WAS', item: 'WAS_ENGINE_STATUS', templateId: '', name: '', content: '', message: COMMAND_NOT_SELECTED_MESSAGE });
  });
  test('조립: 명령 항목이 없으면 실행기 조각도 commands도 없다(기존 서버 스크립트 그대로)', () => { /* WEB만 있는 서버, 선택 없음 */ });
  test('조립: COMMAND 내용의 {{SERVER_IP}}는 바꾸지 않는다', () => {});
  test('조립: 고른 명령 템플릿을 중지하면 스크립트 만들기 오류', () => { assert.throws(() => selectScriptParts(...), /사용할 수 없습니다/); });
  test('Linux 설정 블록: OPSBOX_COMMAND_* 배열이 같은 순서로 들어간다', () => { /* assembleLinuxScript 출력에서 OPSBOX_COMMAND_ITEMS=('WEB_ENGINE_STATUS' 'WAS_ENGINE_STATUS') */ });
  ```

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/commandAssembly.test.ts` → FAIL.
- [ ] **Step 3: 구현** (위 Interfaces 그대로).
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS. `node --import tsx --test test/linuxScript.test.ts test/linuxRoleScript.test.ts test/linuxDbScript.test.ts` → PASS. `test/golden.test.ts`는 WAS 서버 기준 파일(정책에 `WAS_ENGINE_STATUS`가 생김)만 달라야 한다 — 다른 파일이 바뀌면 버그. 기준 파일은 Task 9에서 다시 만든다.
- [ ] **Step 5: 커밋** — `명령 템플릿: 스크립트 조립(명령 항목·실행기 조각 자리)`

---

### Task 5: Linux 실행기 조각 `LINUX-PART-COMMAND_RUNNER`

**Files:**
- Modify: `seeds/templates.json` (새 SCRIPT_PART: id `LINUX-PART-COMMAND_RUNNER`, 이름 `Linux 관리 명령 실행기`, os `Linux`, item `COMMAND_RUNNER`)
- Modify: `seeds/common-codes.json` (`scriptItems`에 `{ "value": "COMMAND_RUNNER", "label": "관리 명령 실행기", "group": "시스템" }` — 조각 저장 검사 통과용, `SEED_UPGRADES[3].codes`에도 추가)
- Test: `test/linuxCommandRunner.test.ts` (새, 실제 bash 실행)

**Interfaces:**
- Consumes: 설정 블록의 `OPSBOX_COMMAND_*` 배열(Task 4), `opsbox_role_record`·`opsbox_log`·`opsbox_json_string`(START·ROLE_RUNTIME).
- Produces: 항목마다 `opsbox_role_record <역할> <항목> <상태> <{product,status,command,output,message} JSON>`. WEB 항목이면 `web_status`·`web_check_json`도 같은 값으로(기존 WEB 엔진 상태 조각과 같이).

조각은 시험판 실행기를 함수 `opsbox_command_run <i>`로 옮긴 것: 템플릿 읽기는 파일 대신 `${OPSBOX_COMMAND_CONTENTS[$i]}`를 `while read`, `finish`의 `exit` 대신 `return`, `log`는 `opsbox_log`. `MESSAGES[$i]`가 있으면 실행하지 않고 그 문구로 NotCollected. 로그 줄에도 비밀번호 가림을 적용한다(`opsbox_log`에 넘기기 전에 가림). JSON 안에 넣는 문자열에 seeds JSON 이스케이프가 필요하므로, 조각은 `scratchpad/command-runner.sh`로 쓰고 `node -e`로 `templates.json`의 `content`에 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/linuxCommandRunner.test.ts` (`linuxRoleScript.test.ts`처럼 `createServer` → `generateScript` → `bash` 실행 → 결과 JSON 읽기. 가짜 `wsadmin`·`jeusadmin`은 `#!<bash 경로>` 스크립트로 임시 폴더에 만들고 `PATH`·`WEBTOBDIR`로 찾게 함)

  ```ts
  test('Linux 실행기: RDY → 정상, 결과에 command와 output', () => {
    const item = runAndGetRoleItem('WEB', 'WEB_ENGINE_STATUS', { fakeWsadmin: 'echo "svr1 RDY"' });
    assert.equal(item.status, 'Healthy');
    assert.equal(item.detail.command, 'wsadmin: si, ci');
    assert.match(item.detail.output, /RDY/);
  });
  test('Linux 실행기: NRDY → 위험', () => {});
  test('Linux 실행기: 도구 없음 → 미수집, 문구에 $WEBTOBDIR/bin', () => {});
  test('Linux 실행기: $WEBTOBDIR/bin에서 찾는다', () => {});
  test('Linux 실행기: 필수 환경 변수 없음 → 미수집 "환경 변수 JEUS_NODE 이(가) 비어 있습니다"', () => {});
  test('비밀번호 가림: 출력·로그에 비밀번호가 없고 command에 인자가 없다', () => {
    // OPSBOX_JEUS_PASSWORD='s3cr*t', 가짜 jeusadmin이 "$@"를 echo
    assert.doesNotMatch(resultFileText + stdoutLog, /s3cr\*t/);
    assert.match(item.detail.output, /\*\*\*\*/);
    assert.equal(item.detail.command, 'jeusadmin: allenginenames, pidlist');
  });
  test('Linux 실행기: 시간 초과 → 미수집 "jeusadmin 실행 시간이 1초를 넘었습니다."', () => { /* @opsbox-timeout 1, 가짜 도구 sleep 5 */ });
  test('출력 JSON 안전: 따옴표·역슬래시·탭·한글·[.*] 출력도 결과 가져오기 성공', () => { /* parseResultJson 성공 */ });
  test('Linux 실행기: 명령 템플릿 미선택 WAS 엔진 상태는 미수집 + 고르라는 문구', () => {});
  test('Linux 실행기: 명령 둘 다 한 번에 표준 입력으로, 끝에 @opsbox-quit', () => { /* 가짜 도구가 stdin을 파일로 → "si\nci\nquit\n" */ });
  ```

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/linuxCommandRunner.test.ts` → FAIL (실행기 조각 없음 → 항목이 미수집 "연결된 점검 스크립트가…").
- [ ] **Step 3: 조각 작성·시드에 넣기.**
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS, `test/seedTemplates.test.ts` PASS.
- [ ] **Step 5: 커밋** — `명령 템플릿: Linux 실행기 조각`

---

### Task 6: Windows 실행기 조각 `WINDOWS-PART-COMMAND_RUNNER`

**Files:**
- Modify: `seeds/templates.json` (id `WINDOWS-PART-COMMAND_RUNNER`, 이름 `Windows 관리 명령 실행기`, os `Windows`, item `COMMAND_RUNNER`)
- Test: `test/windowsCommandRunner.test.ts` (새, 정적 검사 — 이 환경에 PowerShell 없음)

**Interfaces:**
- Consumes: `$opsboxConfig.commands`(Task 4), `Write-OpsBoxLog`, `$rolePolicyResults`(START).
- Produces: 항목마다 `$rolePolicyResults += @{ role = …; item = …; status = …; detail = @{ product; status; command; output; message } }`. WEB 항목이면 `$webCheck`도 같은 값.

방식(설계서 6절의 남긴 결정): 기존 `WINDOWS-PART-WEB_ENGINE_STATUS`의 `System.Diagnostics.Process` 방식을 그대로 쓴다 — 도구는 `Get-Command`로 PATH에서 `<tool>`, `<tool>.exe`·`.cmd`·`.bat` 순, 없으면 `$env:<home>\bin\` 아래 같은 순서; `.bat/.cmd`면 `cmd /d /s /c call`; 표준 입력에 명령과 quit을 쓰고 닫음; `WaitForExit(<timeout>*1000)` 실패 시 `Kill()`. 인자의 `${NAME}`은 `[regex]::Replace(args, '\$\{([A-Za-z_][A-Za-z0-9_]*)\}', { param($m) [Environment]::GetEnvironmentVariable($m.Groups[1].Value) })`. 판정은 `$output.ToUpperInvariant() -cmatch <패턴>`. 템플릿 해석은 Linux와 같은 줄 규칙.

- [ ] **Step 1: 실패하는 테스트 작성**

  ```ts
  const runner = seeds.find((t: any) => t.id === 'WINDOWS-PART-COMMAND_RUNNER');
  test('Windows 실행기: 설정의 commands를 돌며 역할 결과에 남긴다', () => {
    assert.match(runner.content, /\$opsboxConfig\.commands/);
    assert.match(runner.content, /\$rolePolicyResults \+= @\{ role = /);
  });
  test('Windows 실행기: 시간 초과면 프로세스를 끝내고, 표준 입력은 닫는다', () => {
    assert.match(runner.content, /WaitForExit\(/); assert.match(runner.content, /\.Kill\(\)/); assert.match(runner.content, /StandardInput\.Close\(\)/);
  });
  test('Windows 실행기: 비밀번호 변수 값을 출력·로그에서 가리고, command에 인자를 넣지 않는다', () => {
    assert.match(runner.content, /PASSWORD/); assert.match(runner.content, /'\*\*\*\*'/);
  });
  test('Windows 실행기: 문구가 Linux와 같다', () => {
    // 미선택 문구는 설정의 message로 오므로 조각에는 없음
    for (const text of ['이(가) 비어 있습니다', '실행 시간이', '상태 값을 확인할 수 없습니다(맞는 판정 규칙 없음)']) assert.ok(runner.content.includes(text), text);
  });
  test('조립: Windows 명령 항목이 있으면 실행기 조각이 SAVE 바로 앞', () => { /* assembleWindowsScript 결과에서 실행기가 SAVE 앞 */ });
  ```
  (PowerShell 3.0 문법 검사는 `test/seedTemplates.test.ts`가 자동으로 한다.)

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/windowsCommandRunner.test.ts` → FAIL.
- [ ] **Step 3: 조각 작성·시드에 넣기** (Task 5처럼 scratchpad 파일 → `node -e`).
- [ ] **Step 4: 통과 확인** — Step 2 명령과 `test/seedTemplates.test.ts` → PASS.
- [ ] **Step 5: 커밋** — `명령 템플릿: Windows 실행기 조각`

---

### Task 7: 스크립트 관리 화면 — "관리 명령" 종류

**Files:**
- Modify: `src/public/settings/script-management/script-view.js` (`templateGroup`, `templateMeta`, `filterTemplates`)
- Modify: `src/public/settings/script-management/script-management.html` (`<div class="form-group template-command-option" hidden><label for="template-product">제품</label><select id="template-product"></select></div>`, 같은 줄에 항목 고르기는 기존 `#template-item` 재사용)
- Modify: `src/public/settings/script-management/script-management.js` (`updateFormMode`, 도움말·결과 예시, 저장 시 `product`·`item` 보내기, 응답 `warnings`를 알림으로 표시)
- Test: `test/ui/script-view.test.ts`

**Interfaces:**
- Consumes: Task 1의 저장 API(`product`, `item`, 응답 `warnings`).

- [ ] **Step 1: 실패하는 테스트 작성**

  ```ts
  const cmd = { id: 'c', name: 'JEUS 6', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', enabled: true };
  test('스크립트 관리: 관리 명령은 항목의 역할 묶음에, OS 필터와 상관없이 보인다', () => {
    const items = [...ITEMS, { value: 'WAS_ENGINE_STATUS', label: 'WAS 엔진 상태', role: 'WAS' }];
    assert.equal(templateGroup(cmd, items), 'WAS');
    assert.deepEqual(filterTemplates([cmd], { os: 'Linux' }, items).map((t: any) => t.id), ['c']);
    assert.deepEqual(filterTemplates([cmd], { kind: 'COMMAND', item: 'WAS_ENGINE_STATUS' }, items).map((t: any) => t.id), ['c']);
  });
  test('스크립트 관리: 관리 명령 한 줄 설명', () => {
    assert.equal(templateMeta(cmd), '관리 명령 · JEUS · WAS_ENGINE_STATUS · 사용');
  });
  ```

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/ui/script-view.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 편집기: 종류가 COMMAND면 OS 숨김, 제품(`productsByRole.WEB`+`WAS`)·항목(scriptItems 중 role WEB·WAS) 보임, `#template-help`에 Global Constraints의 머리 주석 표와 "정규식은 ERE 범위만(bash grep -E와 PowerShell이 같이 읽음)", "`@opsbox-args` 값에 공백 불가", "비밀번호는 `${환경변수}`로" 세 줄. 결과 예시는 `{ "product": "JEUS 6", "status": "Healthy", "command": "jeusadmin: allenginenames, pidlist", "output": "…", "message": null }`.
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS. 개발 서버(`OPSBOX_PORT=3000 node scripts/demo.cjs dev`)에서 playwright-termux로 스크립트 관리 → 새 템플릿 → 종류 "관리 명령" 고르고 시험판 `jeus-6.cmd` 붙여 저장, 목록에 `관리 명령 · JEUS …`가 보이는지 스크린샷으로 확인.
- [ ] **Step 5: 커밋** — `명령 템플릿: 스크립트 관리 화면`

---

### Task 8: 서버 상세 "스크립트 선택" 창에 명령 템플릿

**Files:**
- Modify: `src/public/settings/server-management/server-policy-form.js` (순수 함수 추가)
- Modify: `src/public/settings/server-management/server-detail.js` (`createPolicyScriptControl`, `populateScriptTemplatePicker`, `updateSelectedTemplateEditButton`)
- Test: `test/ui/server-detail-modules.test.ts`

**Interfaces:**
- Produces:
  ```js
  /** 선택 창에 더할 명령 템플릿: 그 항목(item)용·사용 중인 것만, 서버 제품과 같은 것 먼저(같으면 이름순) */
  export function commandTemplateOptions(templates, item, role, serverProduct) // → [{ id, label }]
  ```
  label: 제품 같음 `${name} (관리 명령)`, 다름 `${name} (관리 명령 · 제품: ${product} — 이 서버 ${role}는 ${serverProduct || '제품 미지정'})`.

- [ ] **Step 1: 실패하는 테스트 작성**

  ```js
  test('선택 창: 그 항목의 명령 템플릿만, 서버 제품과 같은 것 먼저, 다르면 표시', () => {
    const t = [
      { id: 'a', name: 'B 템플릿', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', enabled: true },
      { id: 'b', name: 'A 템플릿', kind: 'COMMAND', product: 'WebLogic', item: 'WAS_ENGINE_STATUS', enabled: true },
      { id: 'c', name: '다른 항목', kind: 'COMMAND', product: 'JEUS', item: 'WAS_JVM_HEAP', enabled: true },
      { id: 'd', name: '중지', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', enabled: false },
    ];
    assert.deepEqual(commandTemplateOptions(t, 'WAS_ENGINE_STATUS', 'WAS', 'JEUS'), [
      { id: 'a', label: 'B 템플릿 (관리 명령)' },
      { id: 'b', label: 'A 템플릿 (관리 명령 · 제품: WebLogic — 이 서버 WAS는 JEUS)' },
    ]);
  });
  ```

- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/ui/server-detail-modules.test.ts` → FAIL.
- [ ] **Step 3: 구현·연결** — `populateScriptTemplatePicker`: 기존 SCRIPT_PART 목록 뒤에 `commandTemplateOptions(...)`를 `관리 명령 · ` 접두어 없이 추가(라벨에 이미 있음). `COMMAND_ONLY_ITEMS` 항목(`WAS_ENGINE_STATUS`)의 첫 선택지는 `선택 안 함 · 미수집`. `createPolicyScriptControl`·`updateSelectedTemplateEditButton`의 선택 템플릿 찾기를 kind `SCRIPT_PART` 또는 `COMMAND`로. 저장된 ID가 목록에 없으면 기존처럼 `저장된 템플릿을 찾을 수 없음`.
- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS. 개발 서버에서 WAS-01 서버 상세 → 정책 탭 → "WAS 엔진 상태" 스크립트 선택 → `JEUS 6 · WAS 엔진 상태 (관리 명령)` 고르고 저장 → 다시 열어 남아 있는지, [스크립트 내려받기]가 되는지 확인.
- [ ] **Step 5: 커밋** — `명령 템플릿: 서버 상세 스크립트 선택 창`

---

### Task 9: 데모·기준 파일·안내서·시험판 정리

**Files:**
- Modify: `scripts/seed-demo.ts` (WAS-01: `scriptParts.WAS_ENGINE_STATUS = 'JEUS6-COMMAND-WAS_ENGINE_STATUS'`; `wasItems()`에 `WAS_ENGINE_STATUS: { status: 'Healthy', detail: { product: 'JEUS 6', status: 'Healthy', command: 'jeusadmin: allenginenames, pidlist', output: <RUNNING이 든 예시 3~5줄>, message: null } }` — WAS-01에서만, 다른 WAS 서버는 `{ status: 'NotCollected', detail: { message: COMMAND_NOT_SELECTED_MESSAGE } }`)
- Modify: `test/golden/**` (`node --import tsx scripts/update-golden.ts`로 다시 만듦)
- Modify: `docs/USER_GUIDE.md` (DB 계정 안내 옆에 "관리 명령 템플릿" 절: 템플릿 형식 표, 환경 변수는 실행 계정 환경에 둔다, JEUS 6 예시 `export JEUS_NODE=… OPSBOX_JEUS_USER=… OPSBOX_JEUS_PASSWORD=…`, "현장 확인 필요" 안내)
- Modify: `docs/spikes/command-templates/` (`README.md`만 남기고 첫 줄에 "기능으로 들어감: seeds/templates.json의 *-COMMAND-*, *-PART-COMMAND_RUNNER" 추가, 나머지 3개 파일 삭제)
- Test: `test/golden.test.ts`, 전체

- [ ] **Step 1: 데모 수정 후 기준 파일 다시 만들기** — `node --import tsx scripts/update-golden.ts`
- [ ] **Step 2: 기준 파일 차이 검토** — `git diff --stat test/golden`. 기대: `templates.json`·`common-codes*.json`·`policies.json`, WAS 서버(`WAS-01`·`WAS-02`)의 `check-config.json`·스크립트, WEB·APP 등 다른 서버 스크립트는 **변화 없음**(명령 항목이 없는 서버). 다른 서버가 바뀌었으면 Task 4로 돌아가 원인 수정.
- [ ] **Step 3: 전체 테스트** — `node --import tsx --test "test/**/*.test.ts"` → 모두 PASS.
- [ ] **Step 4: 데모 확인** — `node scripts/demo.cjs seed` 후 `OPSBOX_PORT=3000 node scripts/demo.cjs dev`, WAS-01 최신 보고서에서 "WAS 엔진 상태"가 정상·CONSOLE 출력으로 보이는지 스크린샷.
- [ ] **Step 5: 커밋** — `명령 템플릿: 데모·기준 파일·사용자 안내서, 시험판 정리`

---

## 자체 검토 메모

- 설계서 5.1 → Task 1·7, 5.2 → Task 3·8, 5.3 → Task 4·5·6, 5.4 → Task 2, 5.5 → Task 9, 5.6의 1~10 → Global Constraints·Task 3(2·9)·Task 4(2·3·6)·Task 5·6(7·8·10)·Task 2(4·5)·Task 9(1).
- `COMMAND_RUNNER`를 scriptItems 코드에 넣는 것(Task 5)은 설계서에 없던 것: 조각 저장 검사(`validate`의 item 목록)를 통과시키려는 것이며 화면 "시스템" 묶음에 보인다.
- `upgradeSeeds`의 공통코드 추가(Task 2)는 사용자가 공통코드에서 지운 값을 업데이트 때 한 번 되살릴 수 있다 — 버전 3으로 올라갈 때 한 번뿐이라 받아들임.
