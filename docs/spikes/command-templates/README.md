# 명령 템플릿 시험판 (WebtoB 4.1 · JEUS 6)

앱과 섞지 않은 **따로 떨어진 시험판**입니다. OpsBox 스크립트 조각·정책·화면은 건드리지 않습니다.

쿼리 템플릿처럼 **명령과 판정 규칙만** 적고, 나머지(도구 찾기·로그인·시간 초과·판정·결과 JSON)는
실행기 하나가 맡는 방식이 실제로 쉬운지 확인하려는 것입니다.

| 파일 | 내용 |
|---|---|
| `opsbox-command-runner.sh` | 실행기 (Linux bash). 템플릿을 읽어 실행하고 결과 JSON 한 줄을 출력 |
| `webtob-4.1.cmd` | WebtoB 4.1 · WEB 엔진 상태 (`wsadmin`에 `si`, `ci`) |
| `jeus-6.cmd` | JEUS 6 · WAS 엔진 상태 (`jeusadmin`에 `allenginenames`, `pidlist`) |

## 점검 서버에서 해 보기

```bash
# WebtoB 4.1 (wsadmin이 PATH나 $WEBTOBDIR/bin에 있어야 함)
bash opsbox-command-runner.sh webtob-4.1.cmd

# JEUS 6 (로그인 정보는 파일에 적지 않고 환경 변수로)
export JEUS_NODE=<노드 이름> OPSBOX_JEUS_USER=administrator OPSBOX_JEUS_PASSWORD='…'
bash opsbox-command-runner.sh jeus-6.cmd
```

결과 예:

```json
{"product":"WebtoB 4.1","status":"Critical","command":"wsadmin: si, ci","output":"…","message":null}
```

진행 로그는 표준 오류로, 결과 JSON은 표준 출력으로 나옵니다. 출력에 비밀번호(이름에 PASSWORD가 든 환경 변수 값)가 나오면 `****`로 가립니다.

## 템플릿 쓰는 법

```
# @opsbox-product  제품 이름
# @opsbox-tool     관리 도구 이름          (PATH → $홈/bin 순서로 찾음)
# @opsbox-home     홈 디렉터리 환경 변수
# @opsbox-args     도구 인자 (${환경변수}만 바뀜)
# @opsbox-require  꼭 있어야 하는 환경 변수
# @opsbox-quit     마지막에 보낼 종료 명령
# @opsbox-timeout  초 (기본 20)
# @opsbox-status   Critical|Warning|Healthy ~ 정규식   (출력을 대문자로 바꿔서 찾음)
명령1
명령2
```

판정은 Critical → Warning → Healthy 순서로 맞는 규칙을 찾고, 아무것도 안 맞으면 미수집(NotCollected)입니다.

## 현장 확인이 필요한 것

- **WebtoB 4.1**: `si`·`ci`가 4.1의 wsadmin 명령과 맞는지, 상태 글자(RDY/NRDY/BLK)가 맞는지.
- **JEUS 6**: `jeusadmin <노드> -U… -P…` 로그인 방식, `allenginenames`·`pidlist` 명령, 출력에 나오는 상태 글자(RUNNING/SHUTDOWN 등).
  틀리면 템플릿의 명령 줄과 `@opsbox-status` 줄만 고치면 됩니다.
- Windows(PowerShell) 실행기는 아직 없습니다.

## 시험한 것 (가짜 wsadmin·jeusadmin으로)

RDY → 정상, NRDY·BLK → 위험, 도구 없음 → 미수집, `$WEBTOBDIR/bin`에서 찾기, 로그인 환경 변수 없음 → 미수집, 비밀번호 가림, 시간 초과 → 미수집.
