import { TEST_ROOT, makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { generateLinuxPart } from '../src/services/checkBuilder/linux';
import { builderInputs, builderResult } from '../src/services/checkBuilder/spec';
import type { BuilderSpec } from '../src/services/checkBuilder/types';
import { getPolicies, savePolicy } from '../src/services/policyService';
import { generateScript } from '../src/services/scriptService';
import { createServer, getServer, updateCheckConfig } from '../src/services/serverService';
import { saveTemplate } from '../src/services/templateService';

/*
 * 점검 만들기: Linux 생성 조각을 실제 bash로 실행해 6가지 유형의 판정을 확인합니다.
 * 가짜 sysctl·ping은 PATH 앞의 폴더에 둡니다.
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';
const work = makeDir('cb-linux');
const fakeBin = makeDir('cb-linux', 'bin');
const marker = path.join(TEST_ROOT, 'cb-injected');
const bashPath = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || '/bin/bash';
const tricky = `a'b"c $(touch ${marker}) \`touch ${marker}\` \\ d`;

fs.writeFileSync(path.join(work, 'tricky.txt'), `${tricky}\n`);
fs.writeFileSync(path.join(fakeBin, 'sysctl'), `#!${bashPath}\n[ "$2" = vm.test ] && { printf '1\\n'; exit 0; }\necho "sysctl: cannot stat $2" >&2; exit 255\n`);
fs.writeFileSync(path.join(fakeBin, 'ping'), `#!${bashPath}\nprintf '%s\\n' "$*" > '${path.join(work, 'ping-args')}'\necho '5 packets transmitted, 4 received, 20% packet loss, time 4005ms'\n`);
for (const name of ['sysctl', 'ping']) fs.chmodSync(path.join(fakeBin, name), 0o755);
const fresh = path.join(work, 'fresh.bak'); fs.writeFileSync(fresh, 'x');
const old = path.join(work, 'old.bak'); fs.writeFileSync(old, 'x');
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
fs.utimesSync(old, hoursAgo(3), hoursAgo(3));
const logDir = makeDir('cb-linux', 'logs');
fs.writeFileSync(path.join(logDir, 'app.log'), 'INFO 시작\nERROR 첫 번째 오류\nWARN 경고\nerror 두 번째 오류\n');
// 검토 지적: 읽을 수 없는 로그 파일, 실패하는 pcs
const mixedLogDir = makeDir('cb-linux', 'mixed-logs');
fs.writeFileSync(path.join(mixedLogDir, 'ok.log'), 'ERROR 읽을 수 있는 오류\n');
fs.writeFileSync(path.join(mixedLogDir, 'secret.log'), 'ERROR 권한 없음\n');
fs.chmodSync(path.join(mixedLogDir, 'secret.log'), 0o000);
fs.writeFileSync(path.join(fakeBin, 'pcs'), `#!${bashPath}\necho 'Error: cluster is not currently running on this node' >&2\nexit 1\n`);
fs.chmodSync(path.join(fakeBin, 'pcs'), 0o755);

const big = `for i in $(seq 1 1000); do printf '한글ab'; done; printf '\\001\\002끝'`;
const items: Record<string, { spec: BuilderSpec; inputs?: Record<string, string>; name?: string }> = {
  CUSTOM_CB00000000000001: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo 85.5', warning: 70, critical: 90 } },
  CUSTOM_CB00000000000002: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo 95', warning: 70, critical: 90 } },
  CUSTOM_CB00000000000003: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo abc', warning: 70, critical: 90 } },
  CUSTOM_CB00000000000004: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo 5', direction: 'LOWER_IS_WORSE', warning: 20, critical: 10 } },
  CUSTOM_CB00000000000005: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: "printf 'eth1: <BROADCAST> STATE down\\n'", badPhrases: ['state DOWN'] } },
  CUSTOM_CB00000000000006: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: `cat '${path.join(work, 'tricky.txt')}'`, badPhrases: [tricky] }, name: `이름\ntouch ${marker}` },
  CUSTOM_CB00000000000007: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'sleep 5; echo 1', warning: 70, critical: 90 } },
  CUSTOM_CB00000000000008: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: big, badPhrases: ['zzz'] } },
  CUSTOM_CB00000000000009: { spec: { version: 1, type: 'REMOTE_PORT', presetId: null, timeoutSeconds: 2 }, inputs: { targets: '' } },
  CUSTOM_CB00000000000010: { spec: { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 1 }, inputs: { paths: `${fresh}\n${old}\n${path.join(work, 'none.bak')}` } },
  CUSTOM_CB00000000000011: { spec: { version: 1, type: 'LOG_PATTERN', presetId: null, phrases: ['ERROR'], periodDays: 7, warning: 1, critical: 5 }, inputs: { paths: logDir } },
  CUSTOM_CB00000000000012: { spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingName: 'vm.test', comparator: '=', expected: '1' } },
  CUSTOM_CB00000000000013: { spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingName: 'vm.test', comparator: '=', expected: '0' } },
  CUSTOM_CB00000000000014: { spec: { version: 1, type: 'REMOTE_PORT', presetId: null }, inputs: { targets: '' } },
  CUSTOM_CB00000000000015: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.ping' }, inputs: { target: '10.1.1.1' } },
  CUSTOM_CB00000000000016: { spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingName: 'vm.none', comparator: '=', expected: '1' } },
  CUSTOM_CB00000000000017: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: "for i in $(seq 1 700); do echo \"path$i active ready running\"; done; echo 'path701 failed faulty'", badPhrases: ['failed'] } },
  CUSTOM_CB00000000000018: { spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'echo 5; exit 3', warning: 70, critical: 90 } },
  CUSTOM_CB00000000000019: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: 'echo all ok; exit 1', badPhrases: ['zzz'] } },
  CUSTOM_CB00000000000020: { spec: { version: 1, type: 'COMMAND_TEXT', presetId: 'linux.cluster' } },
  CUSTOM_CB00000000000021: { spec: { version: 1, type: 'LOG_PATTERN', presetId: null, phrases: ['ERROR'], periodDays: 7, warning: 1, critical: 5 }, inputs: { paths: mixedLogDir } },
};

const listener = net.createServer((socket) => socket.end());
let json: any;
let runOutput = '';

before(async () => {
  if (!canRunBash) return;
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  items.CUSTOM_CB00000000000009.inputs = { targets: `127.0.0.1:${port}\n127.0.0.1:1` };

  // 14번은 서버 설정을 저장한 뒤 정책에 추가(서버별 입력이 아직 없는 상태 재현)
  const late = 'CUSTOM_CB00000000000014';
  const basic = getPolicies().find((policy) => policy.id === 'linux-basic-default')!;
  const toItem = ([id, { spec, name }]: [string, typeof items[string]]) => ({
    id, name: name ?? id, enabled: true, executor: { type: 'SCRIPT', options: { builder: spec } }, inputs: builderInputs(spec), result: builderResult(spec),
  });
  savePolicy({ ...basic, items: [...basic.items, ...Object.entries(items).filter(([id]) => id !== late).map(toItem)] } as any, basic.id);
  const saveGenerated = (id: string) => {
    const { spec, name } = items[id];
    saveTemplate({ name: `점검 만들기 · ${id}`, kind: 'SCRIPT_PART', os: 'Linux', item: id, enabled: true, content: generateLinuxPart({ itemId: id, itemName: name ?? id, role: 'BASIC', spec }) } as any);
  };
  Object.keys(items).filter((id) => id !== late).forEach(saveGenerated);
  createServer({ id: 'LNX-CB', name: '점검 만들기 서버', type: 'OTHER', roles: ['OTHER'], os: 'Linux', ip: '10.0.0.40', sharedPath: '', policyIds: { BASIC: 'linux-basic-default' }, processes: [], directories: [] } as any);
  const settings = Object.fromEntries(Object.entries(items).filter(([id, entry]) => entry.inputs && id !== late).map(([id, entry]) => [id, { inputs: entry.inputs }]));
  updateCheckConfig('LNX-CB', { ...getServer('LNX-CB'), rolePolicySettings: settings } as any);
  const updated = getPolicies().find((policy) => policy.id === 'linux-basic-default')!;
  savePolicy({ ...updated, items: [...updated.items, toItem([late, items[late]])] } as any, updated.id);
  saveGenerated(late);

  const scriptPath = path.join(work, 'LNX-CB.sh');
  fs.writeFileSync(scriptPath, generateScript('LNX-CB'));
  const run = spawnSync('bash', [scriptPath, work], { cwd: work, encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, OPSBOX_CB_TIMEOUT: '2' } });
  runOutput = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, runOutput);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, runOutput);
  json = JSON.parse(fs.readFileSync(saved, 'utf8'));
});
after(() => listener.close());

const item = (id: string) => json.checks.policyItems.find((entry: any) => entry.item === `CUSTOM_CB000000000000${id}`);

test('숫자 비교: 높을수록 나쁜 값은 주의·위험 기준으로 판정하고 읽은 값을 남긴다', { skip: !canRunBash }, () => {
  assert.equal(item('01').status, 'Warning');
  assert.equal(item('01').detail.rows[0].value, '85.5');
  assert.equal(item('02').status, 'Critical');
});

test('숫자 비교: 숫자가 없는 출력은 미수집', { skip: !canRunBash }, () => {
  assert.equal(item('03').status, 'NotCollected');
  assert.equal(item('03').detail.output, 'abc');
});

test('숫자 비교: 낮을수록 나쁜 값', { skip: !canRunBash }, () => {
  assert.equal(item('04').status, 'Critical');
});

test('문구 확인: 대소문자를 가리지 않고 비정상 문구를 찾는다', { skip: !canRunBash }, () => {
  assert.equal(item('05').status, 'Critical');
});

test('폼 값과 항목 이름의 따옴표·명령 치환·줄바꿈은 실행되지 않고 문자 그대로 비교된다', { skip: !canRunBash }, () => {
  assert.equal(item('06').status, 'Critical');
  assert.equal(fs.existsSync(marker), false);
});

test('명령이 시간 제한을 넘으면 미수집과 안내 메시지', { skip: !canRunBash }, () => {
  assert.equal(item('07').status, 'NotCollected');
  assert.match(item('07').detail.rows[0].message, /초를 초과/);
});

test('큰 출력·한글·제어문자도 2,000바이트 이하로 잘라 올바른 JSON으로 남긴다', { skip: !canRunBash }, () => {
  assert.equal(item('08').status, 'Healthy');
  const output: string = item('08').detail.output;
  assert.ok(Buffer.byteLength(output, 'utf8') <= 2000, `${Buffer.byteLength(output, 'utf8')}`);
  assert.ok(output.startsWith('한글ab'));
  assert.doesNotMatch(output, /�/, '한글이 반쯤 잘리지 않음');
});

test('원격 포트: 대상별로 접속 성공·실패를 남기고 항목은 최악 상태', { skip: !canRunBash }, () => {
  const rows = item('09').detail.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'Healthy');
  assert.equal(rows[1].status, 'Critical');
  assert.equal(item('09').status, 'Critical');
});

test('원격 포트: 서버별 대상이 비어 있으면 미수집과 서버 상세 안내', { skip: !canRunBash }, () => {
  assert.equal(item('14').status, 'NotCollected');
  assert.match(item('14').detail.message, /서버 상세/);
});

test('파일 최신 여부: 최근·오래됨·없음을 정상·주의·위험으로', { skip: !canRunBash }, () => {
  assert.deepEqual(item('10').detail.rows.map((row: any) => row.status), ['Healthy', 'Warning', 'Critical']);
  assert.equal(item('10').status, 'Critical');
});

test('로그 문구 검색: 문구 포함 줄 수로 판정하고 표본을 남긴다', { skip: !canRunBash }, () => {
  assert.equal(item('11').status, 'Warning');
  assert.equal(item('11').detail.rows[0].value, '2');
  assert.equal(item('11').detail.samples.length, 2);
  assert.match(item('11').detail.samples[0].text, /첫 번째 오류/);
});

test('설정값 비교: sysctl 값이 기대값과 같으면 정상, 다르면 위험, 없으면 미수집', { skip: !canRunBash }, () => {
  assert.equal(item('12').status, 'Healthy');
  assert.equal(item('13').status, 'Critical');
  assert.equal(item('16').status, 'NotCollected');
});

test('준비된 점검은 서버별 입력을 OPSBOX_INPUT_ 환경 변수로 받는다', { skip: !canRunBash }, () => {
  assert.equal(item('15').status, 'Warning');
  assert.match(fs.readFileSync(path.join(work, 'ping-args'), 'utf8'), /10\.1\.1\.1/);
});

test('생성 조각은 생성기 버전과 자동 생성 안내를 첫 줄에 남긴다', () => {
  const content = generateLinuxPart({ itemId: 'CUSTOM_X', itemName: '이름', role: 'BASIC', spec: items.CUSTOM_CB00000000000001.spec });
  assert.match(content.split('\n')[0], /^# 점검 만들기 · 이름 \(자동 생성, 생성기 v1\)/);
});

test('항목 ID가 함수 이름으로 쓸 수 없는 글자를 포함하면 생성하지 않는다', () => {
  assert.throws(() => generateLinuxPart({ itemId: 'BAD;ID', itemName: 'x', role: 'BASIC', spec: items.CUSTOM_CB00000000000001.spec }), /항목 ID/);
});

test('문구 확인은 2,000바이트 뒤의 비정상 문구도 찾는다 (보관 출력만 자름)', { skip: !canRunBash }, () => {
  assert.equal(item('17').status, 'Critical');
  assert.ok(Buffer.byteLength(item('17').detail.output, 'utf8') <= 2000);
});

test('명령이 0이 아닌 종료 코드로 끝나면 판정하지 않고 미수집과 종료 코드를 남긴다', { skip: !canRunBash }, () => {
  assert.equal(item('18').status, 'NotCollected');
  assert.match(item('18').detail.rows[0].message, /종료 코드 3/);
  assert.equal(item('19').status, 'NotCollected');
  assert.match(item('19').detail.rows[0].message, /종료 코드 1/);
});

test('클러스터 준비된 점검: pcs 가 실패하면(클러스터 중지) 위험', { skip: !canRunBash }, () => {
  assert.equal(item('20').status, 'Critical');
});

test('로그 문구 검색: 읽을 수 없는 파일이 있어도 나머지로 판정하고 알려 준다', { skip: !canRunBash }, () => {
  assert.equal(item('21').status, 'Warning');
  assert.equal(item('21').detail.rows[0].value, '1');
  assert.match(item('21').detail.rows[0].message, /읽을 수 없는 파일 1개/);
});
