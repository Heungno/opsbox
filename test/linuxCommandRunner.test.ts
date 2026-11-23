import { makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createServer } from '../src/features/servers/service';
import { getTemplate, saveTemplate } from '../src/features/templates/service';
import { generateScript } from '../src/features/scripts/service';
import { parseResultJson } from '../src/features/results/service';
import { COMMAND_NOT_SELECTED_MESSAGE } from '../src/features/scripts/commands';

/*
 * Linux 관리 명령 실행기 조각(LINUX-PART-COMMAND_RUNNER) 테스트
 * 생성한 점검 스크립트를 실제 bash로 실행합니다. 가짜 wsadmin·jeusadmin은 임시 폴더의 bash 스크립트이고
 * PATH·WEBTOBDIR로 찾게 합니다. (Android Termux에서도 실행 가능)
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';
const bashPath = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || '/bin/bash';
const PASSWORD = 's3cr*t';
const WEBTOB = 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS';
const JEUS = 'JEUS6-COMMAND-WAS_ENGINE_STATUS';

function fakeTool(dir: string, name: string, body: string) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!${bashPath}\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

/** 기본 명령 템플릿을 고쳐 새 COMMAND 템플릿으로 저장하고 id를 돌려줍니다. */
function commandCopy(baseId: string, name: string, edit: (content: string) => string): string {
  const base = getTemplate(baseId)!;
  const { id: _id, ...rest } = base;
  return saveTemplate({ ...rest, name, content: edit(base.content) }).id;
}

interface Run { json: any; savedText: string; log: string; item: (role: string, item: string) => any }

/** WEB(WebtoB)·WAS(JEUS) 서버를 만들고 스크립트를 실행합니다. */
function runServer(id: string, scriptParts: Record<string, string>, env: Record<string, string | undefined>, pathDirs: string[] = []): Run {
  createServer({
    id, name: id, type: 'WEB', roles: ['WEB', 'WAS'], products: { WEB: 'WebtoB', WAS: 'JEUS' },
    os: 'Linux', ip: '10.0.0.20', resultPath: makeDir('results', id),
    policyIds: { BASIC: 'linux-basic-default', WEB: 'linux-web-default', WAS: 'linux-was-default' },
    roleChecks: { WEB: ['WEB_ENGINE_STATUS'], WAS: ['WAS_ENGINE_STATUS'] }, scriptParts,
    processes: [], directories: [],
  } as any);
  const scriptDir = makeDir('scripts', id);
  const scriptPath = path.join(scriptDir, `${id}.sh`);
  fs.writeFileSync(scriptPath, generateScript(id));
  const childEnv: Record<string, string | undefined> = { ...process.env, PATH: [...pathDirs, process.env.PATH].join(':'), WEBTOBDIR: undefined, JEUS_HOME: undefined, JEUS_NODE: undefined, OPSBOX_JEUS_USER: undefined, OPSBOX_JEUS_PASSWORD: undefined, ...env };
  for (const key of Object.keys(childEnv)) if (childEnv[key] === undefined) delete childEnv[key];
  const run = spawnSync('bash', [scriptPath], { cwd: scriptDir, encoding: 'utf8', timeout: 60_000, env: childEnv as NodeJS.ProcessEnv });
  assert.equal(run.status, 0, `실행 실패\n${run.stdout}\n${run.stderr}`);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, run.stdout);
  const savedText = fs.readFileSync(saved, 'utf8');
  const json = JSON.parse(savedText);
  return {
    json, savedText, log: `${run.stdout}\n${run.stderr}`,
    item: (role, item) => json.checks.rolePolicies[role].items.find((entry: any) => entry.item === item),
  };
}

function once<T>(fn: () => T): () => T {
  let value: T | undefined;
  let done = false;
  return () => { if (!done) { value = fn(); done = true; } return value as T; };
}

// A: 둘 다 PATH에서 찾음. wsadmin은 표준 입력을 파일로 남기고 RDY, jeusadmin은 인자를 그대로 출력(비밀번호 포함)
const toolsA = makeDir('tools', 'A');
const stdinFile = path.join(toolsA, 'wsadmin.stdin');
const runA = once(() => {
  fakeTool(toolsA, 'wsadmin', `cat > ${JSON.stringify(stdinFile)}\necho "svr1 RDY"`);
  fakeTool(toolsA, 'jeusadmin', 'echo "args: $*" >&2\ncat >/dev/null\necho "engine1 RUNNING (login $*)"');
  return runServer('CR-A', { WEB_ENGINE_STATUS: WEBTOB, WAS_ENGINE_STATUS: JEUS },
    { JEUS_NODE: 'node1', OPSBOX_JEUS_USER: 'administrator', OPSBOX_JEUS_PASSWORD: PASSWORD }, [toolsA]);
});

// B: wsadmin은 PATH에 없고 $WEBTOBDIR/bin에만, NRDY. WAS 엔진 상태는 명령 템플릿을 고르지 않음
const homeB = makeDir('tools', 'B-webtob');
const runB = once(() => {
  fakeTool(path.join(homeB, 'bin'), 'wsadmin', 'cat >/dev/null\necho "svr1 NRDY"\necho "svr2 RDY"');
  return runServer('CR-B', { WEB_ENGINE_STATUS: WEBTOB }, { WEBTOBDIR: homeB });
});

// C: wsadmin 없음, jeusadmin은 있으나 JEUS_NODE 없음
const toolsC = makeDir('tools', 'C');
const runC = once(() => {
  fakeTool(toolsC, 'jeusadmin', 'echo RUNNING');
  return runServer('CR-C', { WEB_ENGINE_STATUS: WEBTOB, WAS_ENGINE_STATUS: JEUS },
    { OPSBOX_JEUS_USER: 'administrator', OPSBOX_JEUS_PASSWORD: PASSWORD }, [toolsC]);
});

// D: 특수 문자 출력(WEB), 시간 초과 1초(WAS)
const toolsD = makeDir('tools', 'D');
const runD = once(() => {
  fakeTool(toolsD, 'wsadmin', 'cat >/dev/null\nprintf \'%s\\n\' \'say "hi" \\ back\' $\'tab\\there\' \'한글 상태 [.*] $(x) `y`\' \'svr1 RDY\'');
  fakeTool(toolsD, 'jeusadmin', 'sleep 5\necho RUNNING');
  const web = commandCopy(WEBTOB, '시험 · 특수 문자', (c) => c);
  const was = commandCopy(JEUS, '시험 · 시간 초과', (c) => c.replace(/@opsbox-timeout\s+\d+/, '@opsbox-timeout  1'));
  return runServer('CR-D', { WEB_ENGINE_STATUS: web, WAS_ENGINE_STATUS: was },
    { JEUS_NODE: 'node1', OPSBOX_JEUS_USER: 'administrator', OPSBOX_JEUS_PASSWORD: PASSWORD }, [toolsD]);
});

// E: 악성 템플릿 — 간접 확장 이름에 명령 치환, 인자에 $(…), '-'로 시작하는 판정 정규식
const toolsE = makeDir('tools', 'E');
const pwnedDir = makeDir('pwned');
const pwned = (name: string) => path.join(pwnedDir, name);
const runE = once(() => {
  fakeTool(toolsE, 'wsadmin', 'cat >/dev/null\necho "svr1 RDY"');
  fakeTool(toolsE, 'jeusadmin', 'cat >/dev/null\nprintf "arg=%s\\n" "$@"\necho "x -run"');
  const web = commandCopy(WEBTOB, '시험 · 잘못된 홈 이름', (c) => c.replace(/@opsbox-home\s+\S+/, `@opsbox-home  X[$(touch ${pwned('home')})]`));
  const was = commandCopy(JEUS, '시험 · 인자·정규식', (c) => c
    .replace(/@opsbox-require .*/, '@opsbox-require  OK_VAR')
    .replace(/@opsbox-args .*/, `@opsbox-args  \${OK_VAR} $(touch ${pwned('args')}) \${A[$(touch ${pwned('index')})]} \`touch ${pwned('tick')}\``)
    .replace(/# @opsbox-status .*\n/g, '')
    .replace('# @opsbox-timeout  30', '# @opsbox-timeout  30\n# @opsbox-status   Healthy ~ -RUN'));
  return runServer('CR-E', { WEB_ENGINE_STATUS: web, WAS_ENGINE_STATUS: was }, { OK_VAR: 'has space' }, [toolsE]);
});

test('Linux 실행기: RDY → 정상, 결과에 command와 output', { skip: !canRunBash }, () => {
  const item = runA().item('WEB', 'WEB_ENGINE_STATUS');
  assert.equal(item.status, 'Healthy');
  assert.equal(item.detail.product, 'WebtoB 4.1');
  assert.equal(item.detail.command, 'wsadmin: si, ci');
  assert.match(item.detail.output, /RDY/);
  assert.equal(item.detail.message, null);
  assert.equal(runA().json.checks.web.status, 'Healthy', 'WEB 엔진 상태(web_status·web_check_json)도 같은 값');
  assert.equal(runA().json.checks.web.detail.command, 'wsadmin: si, ci');
});

test('Linux 실행기: 명령 둘 다 한 번에 표준 입력으로, 끝에 @opsbox-quit', { skip: !canRunBash }, () => {
  runA();
  assert.equal(fs.readFileSync(stdinFile, 'utf8'), 'si\nci\nquit\n');
});

test('비밀번호 가림: 출력·로그에 비밀번호가 없고 command에 인자가 없다', { skip: !canRunBash }, () => {
  const run = runA();
  const item = run.item('WAS', 'WAS_ENGINE_STATUS');
  assert.equal(item.status, 'Healthy');
  assert.doesNotMatch(run.savedText + run.log, /s3cr\*t/);
  assert.match(item.detail.output, /-P\*\*\*\*/);
  assert.match(item.detail.output, /args: node1 -Uadministrator -P\*\*\*\*/, '도구의 표준 오류도 출력에 넣고 가림');
  assert.equal(item.detail.command, 'jeusadmin: allenginenames, pidlist');
  assert.match(run.log, /jeusadmin/);
});

test('Linux 실행기: NRDY → 위험', { skip: !canRunBash }, () => {
  const item = runB().item('WEB', 'WEB_ENGINE_STATUS');
  assert.equal(item.status, 'Critical');
  assert.match(item.detail.output, /NRDY/);
});

test('Linux 실행기: $WEBTOBDIR/bin에서 찾는다', { skip: !canRunBash }, () => {
  const run = runB();
  assert.notEqual(run.item('WEB', 'WEB_ENGINE_STATUS').status, 'NotCollected');
  assert.ok(run.log.includes(path.join(homeB, 'bin', 'wsadmin')), '도구 경로를 로그에 남김');
});

test('Linux 실행기: 명령 템플릿 미선택 WAS 엔진 상태는 미수집 + 고르라는 문구', { skip: !canRunBash }, () => {
  const item = runB().item('WAS', 'WAS_ENGINE_STATUS');
  assert.equal(item.status, 'NotCollected');
  assert.equal(item.detail.message, COMMAND_NOT_SELECTED_MESSAGE);
});

test('Linux 실행기: 도구 없음 → 미수집, 문구에 $WEBTOBDIR/bin', { skip: !canRunBash }, () => {
  const item = runC().item('WEB', 'WEB_ENGINE_STATUS');
  assert.equal(item.status, 'NotCollected');
  assert.equal(item.detail.message, 'wsadmin을 PATH 또는 $WEBTOBDIR/bin에서 찾을 수 없습니다.');
  assert.equal(item.detail.command, 'wsadmin: si, ci');
  assert.equal(runC().json.checks.web.status, 'NotCollected');
});

test('Linux 실행기: 필수 환경 변수 없음 → 미수집 "환경 변수 JEUS_NODE 이(가) 비어 있습니다"', { skip: !canRunBash }, () => {
  const item = runC().item('WAS', 'WAS_ENGINE_STATUS');
  assert.equal(item.status, 'NotCollected');
  assert.equal(item.detail.message, '환경 변수 JEUS_NODE 이(가) 비어 있습니다. 실행 계정에 설정하세요(파일에 적지 않음).');
});

test('Linux 실행기: 시간 초과 → 미수집 "jeusadmin 실행 시간이 1초를 넘었습니다."', { skip: !canRunBash }, () => {
  const item = runD().item('WAS', 'WAS_ENGINE_STATUS');
  assert.equal(item.status, 'NotCollected');
  assert.equal(item.detail.message, 'jeusadmin 실행 시간이 1초를 넘었습니다.');
});

test('출력 JSON 안전: 따옴표·역슬래시·탭·한글·[.*] 출력도 결과 가져오기 성공', { skip: !canRunBash }, () => {
  const run = runD();
  const item = run.item('WEB', 'WEB_ENGINE_STATUS');
  assert.equal(item.status, 'Healthy');
  assert.ok(item.detail.output.includes('say "hi" \\ back'), item.detail.output);
  assert.ok(item.detail.output.includes('tab\there'));
  assert.ok(item.detail.output.includes('한글 상태 [.*] $(x) `y`'));
  assert.equal(parseResultJson(run.savedText).server, 'CR-D');
});

test('악성 템플릿: 환경 변수 이름·인자의 명령 치환을 실행하지 않고, "-"로 시작하는 정규식도 패턴으로 쓴다', { skip: !canRunBash }, () => {
  const run = runE();
  const web = run.item('WEB', 'WEB_ENGINE_STATUS');
  assert.equal(web.status, 'NotCollected');
  assert.match(web.detail.message, /환경 변수 이름이 올바르지 않습니다/);
  const was = run.item('WAS', 'WAS_ENGINE_STATUS');
  assert.equal(was.status, 'Healthy', JSON.stringify(was));
  assert.match(was.detail.output, /arg=has space\n/, '${이름}은 한 인자로 바뀜');
  assert.match(was.detail.output, /arg=\$\(touch\n/, '$(…)는 글자 그대로');
  for (const name of ['home', 'args', 'index', 'tick']) assert.ok(!fs.existsSync(pwned(name)), `${name}: 명령이 실행됨`);
});
