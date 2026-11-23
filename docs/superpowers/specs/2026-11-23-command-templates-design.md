# 명령 템플릿 설계

작성일: 2026-11-23 · 시험판: `docs/spikes/command-templates/`

## 1. 왜

WEB·WAS 엔진 점검을 고치거나 새 제품을 넣기가 어렵다. 지금 스크립트 조각(예: `LINUX-PART-WEB_ENGINE_STATUS`, 약 4KB)
한 개 안에 로그·제품 갈래(`if WebtoB … else Apache/Nginx`)·시간 초과·판정·결과 JSON·기록이 섞여 있고, Windows·Linux 두 벌이다.
사용자가 JEUS에 WebtoB의 wsadmin 같은 점검을 넣으려다 막혔다. JEUS는 지금 엔진 상태 점검이 없다(Thread Pool 등은 미수집 자리만).

DB는 쿼리 템플릿(SELECT + 상태 열)만 쓰면 공통 쿼리 실행기가 나머지를 맡아서 쉽다. **명령도 그렇게** 만든다.

## 2. 목표 · 비목표 · 반목표

- 목표: 스크립트 관리에 새 종류 **명령(COMMAND)** 템플릿. 관리 도구 이름, 넣을 명령 몇 줄, 판정 규칙만 적는다. 제품·버전별로 따로 둔다.
- 목표: 서버 상세의 WEB·WAS 항목 "스크립트 선택" 창에서 명령 템플릿도 고를 수 있다(쿼리 선택과 같은 흐름). 고르면 그 항목은 명령 실행기가 돌린다.
- 목표: 기본 명령 템플릿 2개 — **WebtoB 4.1 · WEB 엔진 상태**, **JEUS 6 · WAS 엔진 상태** — 와 새 정책 항목 **WAS 엔진 상태**.
- 목표: Linux(bash)·Windows(PowerShell) 둘 다.
- 비목표: 기존 WEB 엔진 상태 조각(WebtoB·Apache·Nginx)을 명령 템플릿으로 옮기기 — 명령 템플릿을 고르지 않은 서버는 지금 그대로 돈다(따로 할 일).
- 비목표: JEUS Thread Pool·DB Connection Pool 등 다른 WAS 항목, 비밀번호 저장.
- 반목표: 명령 템플릿 때문에 기존 서버의 스크립트나 보고서가 달라지는 것. 템플릿에 비밀번호가 적히거나 결과·로그에 비밀번호가 남는 것.

## 3. 방법 (사용자 선택: 1)

1. **쿼리 템플릿처럼 서버마다 고르기** ← 선택. 익숙한 흐름, 같은 제품도 버전마다 다른 템플릿.
2. 제품이 맞으면 자동 적용 — 고를 화면이 없어 간단하지만 버전(JEUS 6/8) 구분 불가.
3. 점검 만들기에 "관리 도구 명령" 종류 추가 — 정책 항목 단위라 제품별로 안 나뉨, 템플릿을 직접 고치는 방식과 다름.

## 4. 템플릿 형식 (시험판과 같음)

```
# @opsbox-product  JEUS 6                    결과에 남는 제품 이름
# @opsbox-tool     jeusadmin                 관리 도구 (PATH → $홈/bin 순서로 찾음, Windows는 .exe/.cmd/.bat도)
# @opsbox-home     JEUS_HOME                 홈 디렉터리 환경 변수
# @opsbox-args     ${JEUS_NODE} -U${OPSBOX_JEUS_USER} -P${OPSBOX_JEUS_PASSWORD}   ${환경변수}만 바뀜
# @opsbox-require  JEUS_NODE OPSBOX_JEUS_USER OPSBOX_JEUS_PASSWORD               비면 미수집
# @opsbox-quit     exit                      명령 뒤에 보낼 종료 명령
# @opsbox-timeout  30                        초, 기본 20
# @opsbox-status   Critical ~ (SHUTDOWN|FAILED)    출력(대문자)에서 정규식. Critical → Warning → Healthy 순
# @opsbox-status   Healthy  ~ RUNNING
allenginenames                               주석이 아닌 줄 = 도구 표준 입력으로 넣을 명령
pidlist
```

- 판정: Critical 규칙이 맞으면 Critical, 아니면 Warning, 아니면 Healthy. 아무것도 안 맞으면 NotCollected("상태 값을 확인할 수 없음").
- 도구 없음·필수 환경 변수 없음·시간 초과 → NotCollected와 이유 문구.
- 이름에 `PASSWORD`가 든 `@opsbox-require` 변수의 값은 출력에서 `****`로 가린다(로그 포함).
- 정규식은 bash `grep -E`와 PowerShell `-match`가 같이 읽는 범위(ERE)만 쓴다고 도움말에 적는다.

## 5. 설계

### 5.1 템플릿 종류
- 공통코드 `templateKinds`에 `{ value: 'COMMAND', label: '관리 명령' }`.
- `ManagedTemplate`(kind `COMMAND`): `product`(공통코드 productsByRole 값, 예 `JEUS`), `item`(정책 항목 ID, 예 `WAS_ENGINE_STATUS`), `content`(위 형식). **`os` 없음**(OS 공통).
- 저장할 때 검사: `@opsbox-tool` 필수, `@opsbox-status` 1개 이상, 수준 값은 Critical·Warning·Healthy, 정규식은 서버(JS `RegExp`)에서 한 번 컴파일해 보고 틀리면 저장 거부, 명령 줄 1개 이상. 오류 문구는 줄 번호와 함께.
- 스크립트 관리 화면: 종류 필터에 "관리 명령", 편집 시 제품·항목 고르기(OS 고르기 숨김), 형식 도움말.

### 5.2 서버에서 고르기
- 서버 상세 정책 탭의 WEB·WAS 항목 "스크립트 선택" 창 목록에 **그 항목(`item`)의 COMMAND 템플릿**을 함께 보여 준다. 서버의 그 역할 제품과 `product`가 같은 것을 위에, 이름 뒤에 "(관리 명령)".
- 고른 값은 지금처럼 `scriptParts[항목] = 템플릿 ID`로 저장한다(새 저장 칸 없음).

### 5.3 스크립트 조립
- `scriptParts[항목]`이 COMMAND 템플릿이면 그 항목의 원래 조각을 넣지 않고, `COMMAND_RUNNER` 조각을 한 번 넣는다. 설정에 `commands: [{ role, item, templateId, name, content }]`를 싣는다(쿼리처럼 배열 환경 변수/PowerShell 배열).
- `LINUX-PART-COMMAND_RUNNER`·`WINDOWS-PART-COMMAND_RUNNER`(SCRIPT_PART 템플릿, 시드): 시험판 실행기를 조각으로 옮긴 것. 항목마다 결과를 지금 WEB 엔진 상태와 같은 모양 `{ product, status, command, output, message }`으로 `opsbox_role_record <역할> <항목> <상태> <json>`(Windows는 같은 역할 결과 목록)에 남긴다 → 보고서의 기존 SUMMARY·CONSOLE 상자가 그대로 보여 준다.
- 서버 제품과 템플릿 `product`가 달라도 막지 않는다(사용자가 골랐으므로). 단 화면에 표시.

### 5.4 새 정책 항목·기본 템플릿 (시드)
- 정책 `linux-was-default`·`windows-was-default`에 **`WAS_ENGINE_STATUS` "WAS 엔진 상태"** (executor `CONSOLE_COMMAND`, 결과 SUMMARY + CONSOLE). 기본 조각은 없다 → 명령 템플릿을 고르지 않으면 미수집, 문구 "서버 정책에서 관리 명령 템플릿을 고르세요."
- 기본 COMMAND 템플릿: `WEBTOB41-COMMAND-WEB_ENGINE_STATUS`(시험판 `webtob-4.1.cmd`), `JEUS6-COMMAND-WAS_ENGINE_STATUS`(시험판 `jeus-6.cmd`). 명령·상태 글자는 "현장 확인 필요" 주석을 그대로 둔다.
- 이미 설치된 DB에도 들어가야 한다(기존 시드 갱신 방식을 따름).

### 5.5 데모
- 데모 데이터에 WAS 서버 하나(JEUS)가 `WAS_ENGINE_STATUS`에 JEUS 6 템플릿을 고른 상태와, 그 결과 예시(정상) 하나.

### 5.6 세부 결정 (Claude의 판단 — 빠진 곳 확인에서 나온 질문)
1. **환경 변수는 누가 설정하나:** DB 쿼리 실행기와 같다. 점검 스크립트를 실행하는 계정의 환경(프로필, 작업 스케줄러·cron 설정)에 둔다. OpsBox는 저장하지 않는다. 없으면 미수집 + "환경 변수 X가 비어 있습니다" 문구. 사용자 안내서의 DB 계정 안내 옆에 같은 형식으로 적는다.
2. **조각 고르기:** `scriptParts[항목]`이 가리키는 템플릿이 `kind === 'COMMAND'`이면 OS 검사 없이 받아들인다(조립·서버 저장 검사·화면 필터 모두). `COMMAND_RUNNER`는 명령 항목이 하나 이상이면 **한 번**, 역할 항목 조각들 뒤·`SAVE` 앞에 넣는다.
3. **명령 템플릿을 안 고른 `WAS_ENGINE_STATUS`:** 건너뛰지 않고 미수집 기록을 남긴다(Linux·Windows 같은 문구, DB 쿼리 미선택 문구와 같은 방식). Windows의 "조각 없음" 오류에 걸리지 않게 이 항목은 조각 없이도 허용한다.
4. **항목 등록:** 공통코드 `scriptItems`에 `WAS_ENGINE_STATUS`/"WAS 엔진 상태", 정책 시드 두 곳. 보고서는 기존 WAS 역할 결과·항목 정의(SUMMARY·CONSOLE)로 보여 준다.
5. **시드:** COMMAND 기본 템플릿·실행기 조각·정책 항목은 **ID가 없을 때만 추가**한다. 이미 있는(사용자가 고쳤을 수 있는) 템플릿은 덮어쓰지 않는다.
6. **`{{…}}` 치환:** COMMAND 내용에는 하지 않는다. `${이름}`(환경 변수)만 실행 중에 바뀐다.
7. **인자·입력:** `@opsbox-args`는 환경 변수를 바꾼 뒤 공백으로 나눈다(값에 공백이 있으면 안 됨 — 도움말에 적음). 명령 줄과 `@opsbox-quit`은 실행 시작 때 한꺼번에 표준 입력으로 넣으므로 시간 초과와 상관없이 항상 들어간다. 시간 초과면 프로세스를 끝낸다.
8. **가리기:** 결과의 `command`에는 도구 이름과 명령 줄만 넣고 **인자(`@opsbox-args`)는 넣지 않는다**. `output`·로그에서 이름에 PASSWORD가 든 `@opsbox-require` 변수 값을 `****`로 가린다. 저장할 때 `@opsbox-args`에 `${…}` 아닌 `-P` 뒤 글자가 있으면 경고(비밀번호를 직접 적었을 수 있음).
9. **제품이 다를 때:** 선택 창 목록에서 이름 뒤에 "(제품: JEUS — 이 서버 WAS는 Apache Tomcat)"처럼 표시만 한다. 항목(`item`)이 다른 템플릿은 목록에 안 나온다.
10. **Windows 결과 기록:** 기존 Windows WEB 엔진 상태 조각이 역할 결과를 남기는 형식을 그대로 쓴다.

## 6. 만드는 쪽에 남기는 것
- PowerShell 실행기의 표준 입력 넣기·시간 초과 방식(`Start-Process` 리다이렉트 또는 `System.Diagnostics.Process`).
- 시드 갱신 방식(기존 `src/db/seed.ts` 규칙), 스크립트 관리 편집 화면 배치.
- 시험판 폴더(`docs/spikes/command-templates/`)는 기능이 들어가면 지우거나 README만 남김.
