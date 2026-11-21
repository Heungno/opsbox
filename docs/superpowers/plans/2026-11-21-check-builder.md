# 점검 만들기 (Check Builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정책 관리의 항목 추가 창에서 폼만 채우면, OpsBox가 정책 OS에 맞는 점검 스크립트 조각을 생성해 템플릿으로 저장하고 기존 조립 경로로 실행·보고되게 한다.

**Architecture:** 폼 데이터(`executor.options.builder`)를 순수 모듈(`src/services/checkBuilder/`)이 검증하고 OS별 조각 문자열로 생성한다. 정책 저장 시 생성 템플릿(`ManagedTemplate.generated`)을 같이 만들고/갱신/삭제하며, 직접 편집된 조각(내용 해시 불일치)은 덮어쓰지 않는다. 생성 조각은 기존 결과 경로(Windows `$rolePolicyResults`, Linux `opsbox_role_record`)로 결과를 남기고, 서버별 값은 코드에 넣지 않고 실행 중 설정에서 읽는다.

**Tech Stack:** TypeScript(Node 24, Fastify 5, node:sqlite), `node:test` + tsx, bash 4.2+, Windows PowerShell 3.0+ (생성 대상), 화면은 의존성 없는 ES 모듈 JS.

**Spec:** `docs/superpowers/specs/2026-11-21-check-builder-design.md`

## Global Constraints

- 생성 Windows 코드는 PowerShell 3.0에서 동작: `::new(`, ` -in `, ` -notin `, `class`, `using` 금지 (`test/builtInUpgrade.test.ts`의 문법 검사 규칙).
- 생성 Linux 코드는 bash 4.2+, jq 등 외부 도구 없이 동작.
- 폼 값이 코드에 들어갈 때는 Windows `psLiteral`, Linux `shLiteral` 두 함수만 거친다. 서버별 값은 코드에 넣지 않는다.
- 명령 실행 시간 제한 30초(초과 시 미수집), 출력 보관 최대 2,000자.
- 길이 제한: 직접 입력 명령 2,000자, 문구 200자 × 최대 20개.
- 문구 확인은 단순 포함·대소문자 무시(정규식 아님).
- 화면: 인라인 스크립트·`onclick` 금지(CSP `script-src 'self'`), 외부 리소스 없음.
- 실행 방식 코드 `CHECK_BUILDER`, 표시명 "점검 만들기". 생성 템플릿 ID `GEN-<항목ID>-<WINDOWS|LINUX>`, 이름 `점검 만들기 · <항목 이름>`.
- 상태 값은 `Healthy | Warning | Critical | NotCollected`, 종합 규칙은 기존과 같음(위험 > 주의 > 정상, 전부 미수집이면 미수집).
- 모든 문구·주석·커밋 메시지는 한국어(저장소 관례).

## Review Focus

1. **폼 값에 따옴표·`$(…)`·백틱·역슬래시·줄바꿈이 든 경우**(문구, 설정 이름, 레지스트리 경로, 항목 이름) — 실행되지 않고 문자 그대로 비교돼야 한다. → Task 3(bash 실행), Task 4(정적 검사)에 테스트.
2. **서버별 입력이 비어 있거나 예전 `;` 구분 값인 경우** — 스크립트가 멈추지 않고 미수집 + "서버 상세에서 '<입력 이름>'을 입력하세요" 메시지. → Task 3 테스트.
3. **명령이 멈추거나 출력이 매우 크거나 한글·제어문자를 내는 경우** — 30초 후 미수집, 출력 2,000자로 자르고 결과 JSON이 유효. → Task 3 테스트.
4. **생성 조각을 스크립트 관리에서 고친 뒤 정책을 다시 저장한 경우** — 고친 내용이 남고 폼 화면에 "직접 편집됨" 안내. → Task 5 테스트.
5. **기본(BASIC) 사용자 항목이 위험인데 보고서 종합이 정상으로 나오는 경우**(현재 Windows·Linux 모두 종합 계산에서 빠짐) — 종합 상태에 반영. → Task 2(Linux), Task 4(Windows SAVE) 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/services/checkBuilder/types.ts` (신규) | `BuilderSpec` 등 폼 데이터 타입, 유형 상수 |
| `src/services/checkBuilder/presets.ts` (신규) | 준비된 점검 목록(OS별 명령·기본값·서버별 입력) |
| `src/services/checkBuilder/spec.ts` (신규) | 검증, 서버별 입력 정의·결과 표시 정의 만들기 |
| `src/services/checkBuilder/literal.ts` (신규) | `psLiteral`, `shLiteral` |
| `src/services/checkBuilder/linux.ts` (신규) | Linux 조각 생성 |
| `src/services/checkBuilder/windows.ts` (신규) | Windows 조각 생성 |
| `src/services/checkBuilder/templates.ts` (신규) | 정책 저장·삭제·시작 시 생성 템플릿 동기화, 직접 편집 판단 |
| `src/routes/checkBuilderRoutes.ts` (신규) | 프리셋 목록·미리보기·다시 만들기 API |
| `src/services/linuxScriptService.ts` | 서버별 입력 전달, BASIC 항목 수집, 종합 상태 반영 |
| `src/services/scriptAssembly.ts` | DB 역할에 생성 조각 조립, 쿼리 실행기에는 SQL 항목만 |
| `src/services/policyService.ts` | DB 정책 허용, 빌더 검증, 템플릿 동기화 호출 |
| `src/services/templateService.ts` | `generated` 보존, 연결된 생성 템플릿 삭제 차단 |
| `src/services/serverService.ts` | DB 쿼리 템플릿 검증을 SQL 항목에만 |
| `src/db/database.ts` | 실행 방식 코드 마이그레이션, Windows SAVE 업그레이드, 생성기 버전 업그레이드 호출 |
| `src/types/policy.ts`, `src/types/template.ts` | 타입 추가 |
| `data/common-codes.json`, `data/templates.json` | 실행 방식 코드, Windows SAVE 종합 상태 |
| `src/public/settings/policy-management/check-builder-form.js` (신규) | 항목 창의 안내형 폼 |
| `src/public/settings/policy-management/policy-management.{html,js}` | 폼 연결 |
| `src/public/settings/script-management/script-management.js` | "자동 생성 / 직접 편집됨" 표시 |
| `src/public/settings/server-management/server-detail.js` | `TARGET_LIST` 입력 |
| `test/checkBuilder*.test.ts` (신규) | 아래 각 Task 테스트 |
| `scripts/seed-demo.ts`, `README.md`, `doc/USER_GUIDE.md` | 데모·문서 |

---

### Task 1: 폼 데이터 타입·프리셋·검증 (순수 모듈)

**Files:**
- Create: `src/services/checkBuilder/types.ts`, `presets.ts`, `spec.ts`
- Modify: `src/types/policy.ts` (`ExecutorType`에 `'CHECK_BUILDER'`, `PolicyInputType`에 `'TARGET_LIST'`)
- Test: `test/checkBuilderSpec.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BuilderType = 'COMMAND_NUMBER' | 'COMMAND_TEXT' | 'SETTING_VALUE' | 'REMOTE_PORT' | 'FILE_FRESHNESS' | 'LOG_PATTERN';
  export type Level = 'Warning' | 'Critical';
  export interface BuilderSpec {
    version: 1; type: BuilderType; presetId: string | null;
    command?: string;                       // 직접 입력(COMMAND_*), 프리셋이면 무시
    unit?: string; direction?: 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE'; warning?: number; critical?: number; // COMMAND_NUMBER, LOG_PATTERN(건수)
    badPhrases?: string[]; goodPhrases?: string[]; level?: Level;  // COMMAND_TEXT (level 기본 Critical)
    settingName?: string; settingPath?: string;                     // SETTING_VALUE (Linux sysctl 키 / Windows 레지스트리 경로+값 이름)
    comparator?: '=' | '!=' | '>=' | '<='; expected?: string;       // SETTING_VALUE, level 공용
    timeoutSeconds?: number;                                       // REMOTE_PORT (기본 3)
    maxAgeHours?: number; missingLevel?: Level;                     // FILE_FRESHNESS (missingLevel 기본 Critical)
    phrases?: string[]; periodDays?: number;                        // LOG_PATTERN
  }
  export interface Preset { id: string; os: 'Windows' | 'Linux'; type: 'COMMAND_NUMBER' | 'COMMAND_TEXT' | 'SETTING_VALUE'; name: string; description: string;
    command?: string; defaults: Partial<BuilderSpec>; inputs: PolicyInput[] }
  export function presetsFor(os: 'Windows' | 'Linux'): Preset[];
  export function getPreset(id: string): Preset | undefined;
  export function validateBuilderSpec(spec: unknown, os: 'Windows' | 'Linux', field: string): FieldError[];
  export function resolveSpec(spec: BuilderSpec): BuilderSpec & { command?: string };   // 프리셋 기본값·명령을 합친 실행용 값
  export function builderInputs(spec: BuilderSpec): PolicyInput[];   // 서버별 입력 (scope: 'SERVER')
  export function builderResult(spec: BuilderSpec): PolicyItemResult;
  ```
- 서버별 입력 키(고정): REMOTE_PORT `targets`(TARGET_LIST, 필수), FILE_FRESHNESS `paths`(PATH_LIST, 필수), LOG_PATTERN `paths`(PATH_LIST, 필수), Ping 프리셋 `target`(TEXT, 선택).
- 결과 표 열(고정, `builderResult`): `target` 대상, `value` 값, `threshold` 기준, `status` 상태, `message` 메시지. COMMAND_* 는 `SUMMARY, TABLE, CONSOLE`, LOG_PATTERN 은 `SUMMARY, TABLE, LOG_TABLE`, 그 밖은 `SUMMARY, TABLE`. `statusField: 'status'`.

프리셋 1차 목록 (명령 출력: 숫자 유형은 숫자 하나, 문구 유형은 판정용 텍스트. 구현 시 실제 환경에서 확인하고 다르면 고친다):

| id | os | type | 기본값 | 명령(출발점) |
|---|---|---|---|---|
| `linux.swap` | Linux | NUMBER | 50/80 % | `free \| awk '/^Swap:/ { if ($2 > 0) printf "%.1f\n", $3 * 100 / $2; else print 0 }'` |
| `linux.inode` | Linux | NUMBER | 70/90 % | `df -Pi -x tmpfs -x devtmpfs \| awk 'NR > 1 && $5 ~ /%/ { v = $5 + 0; if (v > m) m = v } END { print m + 0 }'` |
| `linux.ping` | Linux | NUMBER | 20/60 % | `ping -c 5 -W 2 "$target"` → `x% packet loss` 숫자, 대상 미입력 시 `ip route` 기본 게이트웨이 |
| `linux.nic` | Linux | TEXT | 나쁨 `state DOWN`, 위험 | `ip -o link show \| awk -F': ' '$2 != "lo"'` |
| `linux.raid` | Linux | TEXT | 나쁨 `_`, 위험 | `grep -o '\[[U_]*\]' /proc/mdstat` |
| `linux.multipath` | Linux | TEXT | 나쁨 `failed`,`faulty`,`offline`, 위험 | `multipath -ll` |
| `linux.hba` | Linux | TEXT | 나쁨 `Linkdown`,`Offline`, 위험 | `cat /sys/class/fc_host/host*/port_state` |
| `linux.cluster` | Linux | TEXT | 나쁨 `OFFLINE`,`Stopped`,`FAILED`, 위험 | `pcs status` |
| `linux.sysctl` | Linux | SETTING | 사용자 지정 키·기대값 | `sysctl -n <키>` |
| `windows.pagefile` | Windows | NUMBER | 50/80 % | `Win32_PageFileUsage` CurrentUsage/AllocatedBaseSize × 100 (여러 개면 최대) |
| `windows.ping` | Windows | NUMBER | 20/60 % | `Test-Connection -Count 5 -ErrorAction SilentlyContinue` 응답 수로 손실률, 대상 미입력 시 기본 게이트웨이 |
| `windows.nic` | Windows | TEXT | 나쁨 `Disconnected`,`Down`, 위험 | `Get-NetAdapter -Physical \| ForEach-Object { "$($_.Name) $($_.Status)" }` |
| `windows.disk` | Windows | TEXT | 나쁨 `Warning`,`Unhealthy`, 위험 | `Get-PhysicalDisk \| ForEach-Object { "$($_.FriendlyName) $($_.HealthStatus)" }` |
| `windows.multipath` | Windows | TEXT | 나쁨 `Failed`, 위험 | `mpclaim.exe -s -d` |
| `windows.hba` | Windows | TEXT | 나쁨 `Linkdown`,`Offline`, 위험 | `Get-InitiatorPort \| ForEach-Object { "$($_.NodeAddress) $($_.ConnectionType) $($_.OperationalStatus)" }` |
| `windows.cluster` | Windows | TEXT | 나쁨 `Down`,`Paused`, 위험 | `Get-ClusterNode \| ForEach-Object { "$($_.Name) $($_.State)" }` |
| `windows.registry` | Windows | SETTING | 사용자 지정 경로·이름·기대값 | `Get-ItemProperty -Path <경로> -Name <이름>` |

- [ ] **Step 1: 실패하는 테스트 작성** — `test/checkBuilderSpec.test.ts`
  - `presetsFor('Linux')`의 id 목록이 위 표의 Linux 9개와 같고, `presetsFor('Windows')`는 Windows 8개.
  - `validateBuilderSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', warning: 80, critical: 70 }, 'Linux', 'items.0')` → `field: 'items.0.warning'` 오류(HIGHER_IS_WORSE에서 주의 < 위험).
  - 같은 값에 `direction: 'LOWER_IS_WORSE'` → 오류 없음.
  - `presetId: 'windows.nic'` + os `'Linux'` → 프리셋 OS 불일치 오류.
  - 직접 입력 `command: 'x'.repeat(2001)` → 길이 오류, `badPhrases` 21개 → 오류, 201자 문구 → 오류, 빈 문구 `['  ']` → 오류.
  - `type: 'REMOTE_PORT'`이면 `builderInputs`가 `[{ key: 'targets', type: 'TARGET_LIST', scope: 'SERVER', required: true, … }]`.
  - `builderResult({ type: 'LOG_PATTERN', … }).components.map(c => c.type)` → `['SUMMARY', 'TABLE', 'LOG_TABLE']`.
  - `resolveSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap' })` → `warning: 50, critical: 80`, `command`에 `free` 포함.
- [ ] **Step 2: 실행해 실패 확인** — `node --import tsx --test test/checkBuilderSpec.test.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3: `types.ts`·`presets.ts`·`spec.ts` 구현** (위 Interfaces, 표 값 그대로)
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `점검 만들기: 폼 데이터 타입·준비된 점검·검증 추가`

---

### Task 2: Linux 실행 기반 — 서버별 입력 전달, BASIC 항목 수집, 종합 상태 반영

**Files:**
- Modify: `src/services/linuxScriptService.ts` (`ROLE_RUNTIME`, `ROLE_FINALIZE`, `renderBashConfig`)
- Test: `test/linuxCustomItem.test.ts` (신규)

**Interfaces:**
- Produces (bash, 모든 Linux 조각에서 사용 가능):
  - `opsbox_item_input ITEM KEY` → 서버별 입력 값을 출력(없으면 빈 문자열). 목록 값은 줄바꿈 구분(저장값의 `;`도 줄바꿈으로 바꿔 전달).
  - `opsbox_role_record BASIC ITEM STATUS DETAIL_JSON` → 기본 사용자 항목도 기록됨(기존 함수 그대로, 수집 단계만 추가).
- 설정 블록에 추가: `declare -A OPSBOX_ITEM_INPUT=( ['<ITEM>:<KEY>']=<shLiteral 값> … )` (값은 `checks.rolePolicySettings[item].inputs`), `OPSBOX_BASIC_ITEM_IDS`, `OPSBOX_BASIC_ITEM_META` 배열(`checks.basicPolicyItems` 순서).
- `ROLE_FINALIZE`가 BASIC 항목별로 `OPSBOX_ROLE_STATUS["BASIC:<id>"]`를 읽어 `OPSBOX_BASIC_POLICY_ITEMS_JSON`을 다시 만들고(기록 없으면 지금처럼 미수집 메시지), BASIC 상태들을 `OPSBOX_ROLE_POLICY_STATUSES`에 덧붙인다(→ SAVE의 `all_statuses`·종합 상태에 반영). SAVE 템플릿은 바꾸지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/linuxCustomItem.test.ts` (실제 bash, `canRunBash` 조건은 `linuxRoleScript.test.ts`와 같게)
  - Linux 기본 정책에 사용자 항목 `CUSTOM_TEST0000000001`(executor `SCRIPT`, inputs `[{ key: 'note', type: 'TEXT', scope: 'SERVER' }]`)을 추가하고, 그 항목 ID로 직접 작성한 Linux 조각 `opsbox_role_record BASIC CUSTOM_TEST0000000001 Critical "{\"value\":$(opsbox_json_string "$(opsbox_item_input CUSTOM_TEST0000000001 note)")}"`를 저장.
  - 서버의 `rolePolicySettings.CUSTOM_TEST0000000001.inputs.note = "it's \"q\" $(touch <marker>)"`.
  - 실행 결과: `checks.policyItems[0].status === 'Critical'`, `detail.value`가 입력 문자열과 정확히 같음, `<marker>` 파일이 생기지 않음, `summary.status === 'Critical'`.
  - 같은 항목을 기록하지 않는 조각이면 `status === 'NotCollected'`이고 기존 미수집 메시지.
  - 목록 입력 `"a;b"` → `opsbox_item_input`가 `a\nb` 출력.
- [ ] **Step 2: 실행해 실패 확인** — `node --import tsx --test test/linuxCustomItem.test.ts` → `policyItems[0].status`가 NotCollected라 FAIL
- [ ] **Step 3: `linuxScriptService.ts` 구현** — 위 Interfaces. 값 인용은 기존 `quote` 사용(Task 3의 `shLiteral`과 같은 규칙).
- [ ] **Step 4: 통과 + 기존 Linux 테스트 확인** — `node --import tsx --test test/linuxCustomItem.test.ts test/linuxScript.test.ts test/linuxRoleScript.test.ts test/linuxDbScript.test.ts` → PASS
- [ ] **Step 5: 커밋** — `Linux 사용자 항목 수집과 서버별 입력 전달, 종합 상태 반영`

---

### Task 3: Linux 조각 생성기

**Files:**
- Create: `src/services/checkBuilder/literal.ts`, `src/services/checkBuilder/linux.ts`
- Test: `test/checkBuilderLinux.test.ts`

**Interfaces:**
- Consumes: Task 1 `resolveSpec`, `BuilderSpec`; Task 2 `opsbox_item_input`, `opsbox_role_record`; START 조각의 `opsbox_log`, `opsbox_json_string`, `opsbox_json_number`.
- Produces:
  ```ts
  export function shLiteral(value: string | number): string;   // 'a'\''b'
  export function psLiteral(value: string | number): string;   // [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('…'))
  export const GENERATOR_VERSION = 1;
  export function generateLinuxPart(args: { itemId: string; itemName: string; role: 'BASIC' | 'WEB' | 'WAS' | 'DB'; spec: BuilderSpec }): string;
  ```
- 생성 조각 규칙: 첫 줄 주석 `# 점검 만들기 · <이름> (자동 생성, 생성기 v1) — 직접 고치면 폼 변경이 반영되지 않습니다`. 폼 값은 모두 `shLiteral`로 변수에 담은 뒤 사용. 명령은 `timeout 30 bash -c "$cb_command"`(timeout 없으면 그냥 실행), stdout+stderr 합쳐 2,000자로 자름. 결과 detail 형식: `{"rows":[{target,value,threshold,status,message}],"output":"…"}`(LOG_PATTERN은 `samples` 최대 5줄 추가). 명령 없음(종료 코드 127) → NotCollected `명령을 찾을 수 없습니다: …`. 시간 초과(124) → NotCollected `명령 실행 시간이 30초를 초과했습니다.`. 필수 서버별 입력이 비면 NotCollected `서버 상세에서 '<label>'을 입력하세요.`.
- 원격 포트: `timeout <초> bash -c 'exec 3<>/dev/tcp/HOST/PORT'` (호스트·포트는 변수로 전달), 대상별 행.
- 파일 최신: `stat -c %Y`, 대상별 행. 로그 문구: 기간 필터는 파일 수정 시각 기준(`find -mtime`), 문구는 `grep -iF -e … -e …`(고정 문자열).

- [ ] **Step 1: 실패하는 테스트 작성** — `test/checkBuilderLinux.test.ts`: 서버를 만들고 기본 정책에 CHECK_BUILDER 항목을 넣은 뒤(템플릿은 `generateLinuxPart`로 직접 저장 — Task 5 전이므로), `generateScript`로 전체 스크립트를 실제 bash 실행. 가짜 명령 폴더를 PATH 앞에 둠.
  - COMMAND_NUMBER 직접 입력 `echo 85.5` + 70/90 → Warning, `rows[0].value === '85.5'`; `echo 95` → Critical; `echo abc` → NotCollected.
  - COMMAND_NUMBER LOWER_IS_WORSE `echo 5`, 20/10 → Critical.
  - COMMAND_TEXT 문구 `["state DOWN"]`, 출력 `eth1: <…> STATE down` → Critical(대소문자 무시); 문구에 `"a'b$(touch M)"` 넣고 출력에 같은 문자열 → Critical, `M` 미생성.
  - 명령 `sleep 40` → NotCollected, 메시지 `30초`(테스트는 생성기 옵션 대신 시간 제한을 환경 변수 `OPSBOX_CB_TIMEOUT=1`로 줄여 확인 — 생성 코드는 `${OPSBOX_CB_TIMEOUT:-30}` 사용).
  - 출력 5,000자(한글 포함) → `output` 길이 ≤ 2,000, 결과 JSON 파싱 성공.
  - REMOTE_PORT 대상 `127.0.0.1:<열린 포트>`(테스트에서 node `net.createServer`로 연 포트), `127.0.0.1:1` → 행 2개, 항목 Critical.
  - FILE_FRESHNESS `maxAgeHours: 1`, 방금 만든 파일 + `touch -d '3 hours ago'` 파일 + 없는 경로 → Healthy/Warning/Critical 행.
  - LOG_PATTERN 문구 `["ERROR"]`, 기준 1/5, 오류 2줄 → Warning, `samples.length === 2`.
  - SETTING_VALUE 가짜 `sysctl`(인자에 따라 `1` 출력), `=`/`1` → Healthy, 기대 `0` → Critical(level 기본).
  - 필수 입력(targets) 빈 값 → NotCollected, 메시지에 `서버 상세`.
- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/checkBuilderLinux.test.ts` → FAIL
- [ ] **Step 3: `literal.ts`, `linux.ts` 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `점검 만들기: Linux 스크립트 조각 생성기`

---

### Task 4: Windows 조각 생성기와 Windows 종합 상태 반영

**Files:**
- Create: `src/services/checkBuilder/windows.ts`
- Modify: `data/templates.json` (`WINDOWS-PART-SAVE`: `$allStatuses`에 `$basicPolicyOutput`의 상태 추가), `src/db/database.ts` (`BUILTIN_TEMPLATE_UPGRADES`에 현재 SAVE 해시 추가), `test/helpers/` (현재 SAVE 내용 보관 파일)
- Test: `test/checkBuilderWindows.test.ts`, `test/builtInUpgrade.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 3 `psLiteral`, `GENERATOR_VERSION`.
- Produces: `export function generateWindowsPart(args: { itemId: string; itemName: string; role: 'BASIC' | 'WEB' | 'WAS' | 'DB'; spec: BuilderSpec }): string;`
- 생성 조각 규칙: Linux와 같은 첫 줄 주석(`#`), 폼 값은 모두 `psLiteral`로 변수에 담음, 서버별 값은 `$opsboxConfig.checks.rolePolicySettings.'<ID>'.inputs.<key>`에서 읽고 `-split "[;\r\n]+"`로 목록화. 명령은 `powershell.exe -NoProfile -Command` 자식 프로세스 + `WaitForExit(30000)`(초과 시 Kill, NotCollected), 출력 2,000자. 결과: `$rolePolicyResults += @{ role = '<ROLE>'; item = '<ID>'; status = $cbStatus; detail = @{ rows = @(…); output = … } }`. 전체를 `try { } catch { … NotCollected … }`로 감쌈. 원격 포트는 `System.Net.Sockets.TcpClient` + `BeginConnect`/`WaitOne(<초>*1000)`(Test-NetConnection은 느림). 파일 최신은 `Get-Item … .LastWriteTime`, 로그 문구는 `Select-String -SimpleMatch`(대소문자 무시 기본), 레지스트리는 `Get-ItemProperty`.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/checkBuilderWindows.test.ts`
  - 6가지 유형 각각 `generateWindowsPart` 결과가 `/::new\(|\s-(not)?in\s|^\s*class\s|^\s*using\s/m`에 걸리지 않음.
  - 폼 값(항목 이름·문구·설정 경로·명령)에 `'`, `"`, `` ` ``, `$(x)`, `\r\n`을 넣으면: 결과 문자열에 그 원문이 나타나지 않고 base64로만 있음(`Buffer.from(…).toString('base64')` 포함 검사).
  - 서버별 입력 키 `targets`가 `rolePolicySettings` 경로로 읽힘(`.inputs.targets` 포함), 코드에 대상 값 자체는 없음.
  - `$rolePolicyResults +=`가 정확히 한 번, `role = 'DB'` 등 전달한 역할 포함.
  - 스냅샷 대신 핵심 문자열 검사: `WaitForExit(30000)`, `2000`.
- [ ] **Step 2: `builtInUpgrade.test.ts`에 테스트 추가** — 이전 SAVE 내용으로 바꾼 뒤 `applyBuiltInUpdates()` → `WINDOWS-PART-SAVE` 내용에 `$basicPolicyOutput`의 상태가 `$allStatuses` 계산에 포함(`$basicPolicyStatuses` 같은 변수명 정해 assert).
- [ ] **Step 3: 실패 확인** — `node --import tsx --test test/checkBuilderWindows.test.ts test/builtInUpgrade.test.ts` → FAIL
- [ ] **Step 4: 구현** (`windows.ts`, SAVE 수정, 업그레이드 해시: 수정 전 내용의 sha256)
- [ ] **Step 5: 통과 확인** → PASS
- [ ] **Step 6: 커밋** — `점검 만들기: Windows 스크립트 조각 생성기, 기본 사용자 항목을 종합 상태에 반영`

---

### Task 5: 생성 템플릿 동기화와 직접 편집 보호

**Files:**
- Create: `src/services/checkBuilder/templates.ts`
- Modify: `src/types/template.ts` (`generated?: { by: 'CHECK_BUILDER'; generatorVersion: number; itemId: string; contentSha256: string }`), `src/services/templateService.ts` (`saveTemplate`가 기존 `generated` 보존·입력값 무시, `deleteTemplate`가 연결된 생성 템플릿이면 `ConflictError('점검 정책 관리에서 항목을 삭제하세요.')`), `src/services/policyService.ts` (`savePolicy`·`deletePolicy`에서 동기화 호출, DB 정책 CHECK_BUILDER 허용, 빌더 검증 호출), `src/db/database.ts` (`applyBuiltInUpdates`에 실행 방식 코드 마이그레이션·생성기 버전 업그레이드), `data/common-codes.json` (`policyExecutors`에 `{ "value": "CHECK_BUILDER", "label": "점검 만들기" }`)
- Test: `test/checkBuilderTemplates.test.ts`

**Interfaces:**
- Consumes: Task 3 `generateLinuxPart`, Task 4 `generateWindowsPart`, Task 1 `validateBuilderSpec`, `builderInputs`, `builderResult`.
- Produces:
  ```ts
  export function generatedTemplateId(itemId: string, os: 'Windows' | 'Linux'): string;   // GEN-<id>-WINDOWS
  export function isDetached(template: ManagedTemplate): boolean;                          // sha256(content) !== generated.contentSha256
  export function syncGeneratedTemplates(before: Policy | undefined, after: Policy | undefined): { created: string[]; updated: string[]; kept: string[]; deleted: string[] };
  export function regenerateItem(policyId: string, itemId: string): ManagedTemplate;       // 직접 편집 여부와 관계없이 다시 생성(이전 내용은 이력)
  export function upgradeGeneratedTemplates(): string[];                                   // generatorVersion 낮고 직접 편집 안 된 것만
  ```
- `savePolicy`는 CHECK_BUILDER 항목의 `inputs`·`result`를 `builderInputs`/`builderResult`로 덮어쓰고 `executor.templateId = generatedTemplateId(...)`로 정한 뒤 저장하고, 같은 트랜잭션(`transaction`)에서 `syncGeneratedTemplates` 호출. 역할 값: 정책 `category`(BASIC/WEB/WAS/DB).
- 마이그레이션 설정 키: `migration_executor_codes_v1` (한 번만, 사용자가 코드를 지운 뒤 되살리지 않음).

- [ ] **Step 1: 실패하는 테스트 작성** — `test/checkBuilderTemplates.test.ts`
  - Linux 기본 정책에 CHECK_BUILDER 항목 추가 저장 → 템플릿 `GEN-<id>-LINUX` 생성, `generated.itemId === id`, 항목 `executor.templateId` 일치, 항목 `inputs`가 `builderInputs` 결과.
  - 기준값 바꿔 다시 저장 → 같은 ID 템플릿 내용 변경, 이력 1건 추가.
  - `saveTemplate({ ...tpl, content: tpl.content + '\n# 수정', generated: undefined }, tpl.id)` 후 `generated` 유지되고 `isDetached === true`; 정책 다시 저장 → 템플릿 내용이 수정본 그대로(`kept`에 포함).
  - `saveTemplate`에 가짜 `generated`를 넣은 일반 템플릿 → 저장 결과에 `generated` 없음.
  - `regenerateItem` → 폼 기준 내용으로 돌아오고 `isDetached === false`.
  - 연결된 생성 템플릿 `deleteTemplate` → 409; 정책에서 항목 삭제 저장 → 템플릿 삭제(`deleted`).
  - DB 정책에 CHECK_BUILDER 저장 허용, BASIC 정책에 SQL_QUERY는 여전히 거부.
  - 공통코드에서 `CHECK_BUILDER`를 뺀 DB 설정으로 `applyBuiltInUpdates()` → 다시 들어감; 설정 키가 이미 있으면 다시 넣지 않음.
  - `generatorVersion: 0`으로 바꾼(내용 해시 일치) 템플릿 → `upgradeGeneratedTemplates()`가 다시 생성; 직접 편집된 것은 그대로.
- [ ] **Step 2: 실패 확인** — `node --import tsx --test test/checkBuilderTemplates.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 + 전체 테스트** — `npm test` → 실패 0
- [ ] **Step 5: 커밋** — `점검 만들기: 정책 저장 시 스크립트 조각 생성·갱신, 직접 편집 보호`

---

### Task 6: DB 역할에서 생성 조각 조립

**Files:**
- Modify: `src/services/scriptAssembly.ts` (`selectScriptParts` DB 분기, `buildScriptConfig`의 `rolePolicies`는 그대로), `src/services/scriptService.ts`(쿼리 템플릿 선택이 SQL 항목만 대상인지 확인 후 필요 시), `src/services/serverService.ts` (`updateCheckConfig`의 DB 쿼리 템플릿 검증을 `executor.type === 'SQL_QUERY'` 항목에만), `src/services/linuxScriptService.ts` (`notCollectedMessage`: DB 역할이라도 생성 조각이 있으면 기본 메시지)
- Test: `test/checkBuilderDb.test.ts`

**Interfaces:**
- Consumes: Task 5(정책 저장이 템플릿 생성).
- DB 역할 조립 규칙: DB 역할 항목 중 SQL 항목이 하나라도 있으면 `DB_QUERY_RUNNER`, CHECK_BUILDER 항목은 항목 ID로 조각 추가(순서: 쿼리 실행기 → 빌더 항목들, 정책 순서).

- [ ] **Step 1: 실패하는 테스트 작성** — `test/checkBuilderDb.test.ts`
  - Linux DB 정책(PostgreSQL 서버)에 CHECK_BUILDER `FILE_FRESHNESS` 항목 추가, 서버 `roleChecks.DB`에 `DB_INSTANCE_STATUS`와 그 항목. `updateCheckConfig`가 빌더 항목에 쿼리 템플릿을 요구하지 않음.
  - 생성 스크립트에 `DB 공통 쿼리 실행기 시작`과 빌더 항목 첫 줄 주석이 모두 있고, `OPSBOX_DB_QUERY_ITEMS`에 빌더 항목 ID가 없음.
  - 실제 bash 실행(가짜 psql, `linuxDbScript.test.ts` 방식): `rolePolicies.DB.items`에 두 항목 모두, 빌더 항목 상태가 파일 결과대로.
  - 빌더 항목만 있는 DB 정책 → `DB_QUERY_RUNNER` 조각이 들어가지 않음.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 + `npm test`** → 실패 0
- [ ] **Step 5: 커밋** — `점검 만들기: DB 정책 항목을 스크립트에 조립`

---

### Task 7: API — 준비된 점검 목록·미리보기·다시 만들기

**Files:**
- Create: `src/routes/checkBuilderRoutes.ts`
- Modify: `src/routes/index.ts` (등록)
- Test: `test/checkBuilderApi.test.ts` (`app.inject`, 로그인은 `test/security.test.ts`처럼 사용자 생성 후 세션 쿠키)

**Interfaces:**
- `GET /api/check-builder/presets?os=Linux` → `ok(Preset[])` (명령 포함, 읽기 전용 미리보기용)
- `POST /api/check-builder/preview` body `{ os, role, itemId?, itemName, spec }` → `ok({ content: string })`; 검증 실패는 400 `VALIDATION_ERROR`(`validateBuilderSpec` 오류 목록).
- `POST /api/policies/:policyId/items/:itemId/regenerate` → `ok(ManagedTemplate)`; 감사 로그 `TEMPLATE_UPDATE`(요약 `점검 만들기 스크립트 다시 만들기: <항목 이름>`), 항목이 CHECK_BUILDER가 아니면 400.

- [ ] **Step 1: 실패하는 테스트 작성** — 위 세 경로: 로그인 없으면 401, `presets?os=Windows` 8개, 잘못된 spec 미리보기 400과 `errors[0].field`, 정상 미리보기 `content`에 `점검 만들기 ·` 포함, regenerate 후 `isDetached === false`, 감사 로그 1건.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `점검 만들기: 준비된 점검·미리보기·다시 만들기 API`

---

### Task 8: 화면 — 정책 항목 창의 안내형 폼

**Files:**
- Create: `src/public/settings/policy-management/check-builder-form.js`
- Modify: `policy-management.html`(폼 영역 마크업, 스크립트 캐시 버전 올림), `policy-management.js`(실행 방식이 CHECK_BUILDER면 기존 템플릿 선택·JSON 입력칸 숨기고 폼 표시, 저장 시 `executor.options.builder` 채움)

**Interfaces:**
- Consumes: Task 7 API.
- Produces (`check-builder-form.js`):
  ```js
  export function mountCheckBuilderForm(host, { os, category, item, onChange }) // 폼 그리기
  export function readCheckBuilderSpec(host)  // → BuilderSpec
  ```
- 흐름·문구는 spec 5.5 그대로: 점검 유형 → 준비된 점검/직접 입력 → 유형별 값 → 항목 이름(프리셋 이름 자동) → [생성될 스크립트 보기](미리보기 API + `syntax-highlight.js`) → 저장. 직접 입력 선택 시 경고 문구 `입력한 명령은 점검 스크립트 실행 계정(보통 관리자) 권한으로 그대로 실행됩니다.` 직접 편집된 항목은 안내 `이 항목의 스크립트는 직접 편집되었습니다. 폼 변경은 스크립트에 반영되지 않습니다.` + [폼 기준으로 다시 만들기](확인 후 regenerate API).
- DOM은 `createElement`/`textContent`만 사용(`innerHTML`에 값 넣지 않음), 이벤트는 `addEventListener`.

- [ ] **Step 1: 데모 서버로 수동 확인 준비** — `npm run demo:seed && npm run demo:dev` (http://localhost:3001, demo/demo1234)
- [ ] **Step 2: 구현**
- [ ] **Step 3: 수동 확인** — Linux 기본 정책에 `Swap 사용률` 프리셋 항목 추가 → 저장 → 스크립트 관리에 `점검 만들기 · Swap 사용률` 생성; 직접 입력 선택 시 경고 표시; 미리보기 구문 강조; 브라우저 콘솔에 CSP 오류 없음; 다크 모드에서 폼 가독성.
- [ ] **Step 4: `npm test`** → 실패 0 (`test/security.test.ts`의 인라인 스크립트 검사 포함)
- [ ] **Step 5: 커밋** — `점검 만들기: 정책 항목 창에 안내형 폼 추가`

---

### Task 9: 화면 — 스크립트 관리 표시, 서버 상세 대상 목록 입력

**Files:**
- Modify: `src/public/settings/script-management/script-management.js` (목록·편집기 머리에 `자동 생성` / `직접 편집됨` 배지와 "연결된 정책 항목" 링크; 판단은 템플릿 API 응답에 `generatedState: 'GENERATED' | 'DETACHED'` 필드를 추가해 서버가 계산), `src/routes/templateRoutes.ts`(응답에 `generatedState`), `src/public/settings/server-management/server-detail.js` (`TARGET_LIST`는 textarea, 안내 `한 줄에 하나씩, 호스트:포트`), `src/services/serverService.ts` (TARGET_LIST 값 검증: 줄마다 `호스트:1~65535`)
- Test: `test/checkBuilderTemplates.test.ts`에 `generatedState` 검사 추가, `test/checkBuilderApi.test.ts`에 서버 저장 시 잘못된 `TARGET_LIST`(`host:70000`) 400 추가

- [ ] **Step 1: 실패하는 테스트 추가** (위 두 검사)
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 + 수동 확인** — 데모 서버에서 배지·링크, 서버 상세의 원격 포트 대상 입력·저장
- [ ] **Step 5: 커밋** — `점검 만들기: 스크립트 관리 표시와 서버 상세 대상 목록 입력`

---

### Task 10: 데모 데이터와 문서

**Files:**
- Modify: `scripts/seed-demo.ts` (Linux 기본 정책에 `Swap 사용률`(프리셋), Windows 기본 정책에 `원격 포트 접속`(DB-01 대상 `10.10.4.41:1433`) 항목을 정책 저장 경로로 추가하고, 결과 JSON의 `policyItems`에 해당 결과 포함 — 결과 모양은 Task 3·4의 detail 형식), `README.md`(기능 목록·점검 만들기 요약), `doc/USER_GUIDE.md`(새 절: 점검 만들기 — 유형 6가지 표, 준비된 점검 목록, 서버별 입력, 직접 편집 안내, 사용자 스크립트에서 `opsbox_role_record BASIC <항목ID> <상태> <JSON>` 사용법)
- Test: `npm run demo:seed` 성공, `npm test`

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — `npm run demo:seed` 출력에 오류 없음, 데모 서버 보고서에서 두 항목 표 표시
- [ ] **Step 3: `npm test`** → 실패 0
- [ ] **Step 4: 커밋** — `점검 만들기: 데모 데이터와 사용자 가이드`

---

## Self-Review 결과

- **Spec 대응**: 5.1 → T1·T5, 5.2 → T1·T3·T4, 5.3 → T1, 5.4 → T2·T3·T4, 5.5 → T8·T9, 5.5.1 → T5·T6, 5.6 → T5·T7·T9, 5.7 → T4·T5, 9장 → 각 Task 테스트·T10. 빠진 항목 없음.
- **spec과 다른 점(의도)**: 명령 유형 출력은 메시지 대신 `CONSOLE` 표시(`detail.output`)로 보여 줌 — 보고서가 이미 지원하고 2,000자 출력에 더 맞음. Windows 기본 사용자 항목 종합 상태 반영(T4)과 Linux 반영(T2)은 spec에 명시되지 않았지만 "다른 항목처럼 상태 표시" 목표에 필요해 추가.
- **위험**: Windows 생성 코드는 이 환경에서 실행 검증 불가(T4는 정적 검사). 구현 완료 후 Windows Server(PS 5.1, 가능하면 2012 PS 3.0)에서 데모 정책으로 1회 실행 확인이 필요.
