import './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createServer, getServer } from '../src/features/servers/service';
import { getTemplates } from '../src/features/templates/service';
import { assembleWindowsScript } from '../src/features/scripts/windows';

/*
 * Windows 관리 명령 실행기 조각(WINDOWS-PART-COMMAND_RUNNER) 정적 검사
 * 이 환경(Termux)에는 PowerShell이 없어 실행하지 않고 내용만 봅니다. PowerShell 3.0 문법 검사는 seedTemplates.test.ts가 합니다.
 */
const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seeds', 'templates.json'), 'utf8'));
const runner = (seeds as any[]).find((t) => t.id === 'WINDOWS-PART-COMMAND_RUNNER');
const content = (): string => {
  assert.ok(runner, 'WINDOWS-PART-COMMAND_RUNNER 시드가 없습니다');
  return runner.content as string;
};

test('Windows 실행기: 시드 항목 모양', () => {
  content();
  assert.equal(runner.name, 'Windows 관리 명령 실행기');
  assert.equal(runner.kind, 'SCRIPT_PART');
  assert.equal(runner.os, 'Windows');
  assert.equal(runner.item, 'COMMAND_RUNNER');
  assert.equal(runner.enabled, true);
});

test('Windows 실행기: 설정의 commands를 돌며 역할 결과에 남긴다', () => {
  assert.match(content(), /\$opsboxConfig\.commands/);
  assert.match(content(), /\$rolePolicyResults \+= @\{ role = /);
  assert.match(content(), /\$webCheck = /, 'WEB 항목이면 $webCheck도 같은 값');
  for (const key of ['product', 'status', 'command', 'output', 'message']) assert.match(content(), new RegExp(`\\b${key} = `), key);
});

test('Windows 실행기: 시간 초과면 프로세스를 끝내고, 표준 입력은 닫는다', () => {
  assert.match(content(), /WaitForExit\(/);
  assert.match(content(), /\.Kill\(\)/);
  assert.match(content(), /StandardInput\.Close\(\)/);
  assert.match(content(), /ReadToEndAsync\(\)/, '교착을 피하려고 기다리기 전에 출력 읽기 시작');
});

test('Windows 실행기: 비밀번호 변수 값을 출력·로그에서 가리고, command에 인자를 넣지 않는다', () => {
  assert.match(content(), /PASSWORD/);
  assert.match(content(), /'\*\*\*\*'/);
  assert.match(content(), /\.Replace\(\$secret, '\*\*\*\*'\)/, '정규식이 아닌 글자 그대로 바꾸기');
  assert.match(content(), /Sort-Object -Property Length -Descending/, '긴 비밀 값부터 가림');
  assert.doesNotMatch(content(), /-replace\s+\$secret/);
});

test('Windows 실행기: 템플릿 글을 코드로 실행하지 않는다', () => {
  assert.doesNotMatch(content(), /Invoke-Expression|\biex\b|\[scriptblock\]::Create|NewScriptBlock|ExpandString/i);
});

test('Windows 실행기: 환경 변수 이름을 검사하고 .bat/.cmd는 cmd를 거친다', () => {
  assert.ok(content().includes("'^[A-Za-z_][A-Za-z0-9_]*$'"));
  assert.ok(content().includes('\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}'));
  assert.match(content(), /\$env:ComSpec/);
  assert.match(content(), /\/c call /);
});

test('Windows 실행기: 문구가 Linux와 같다', () => {
  // 미선택 문구는 설정의 message로 오므로 조각에는 없음
  for (const text of [
    '이(가) 비어 있습니다. 실행 계정에 설정하세요(파일에 적지 않음).', '실행 시간이', '초를 넘었습니다.', '상태 값을 확인할 수 없습니다(맞는 판정 규칙 없음).',
    '에서 찾을 수 없습니다.', '@opsbox-require의 환경 변수 이름이 올바르지 않습니다: ', '@opsbox-home의 환경 변수 이름이 올바르지 않습니다: ',
    '관리 명령 점검 시작: ', '관리 명령 판정: ', '모르는 머리 주석 무시: @opsbox-',
  ]) assert.ok(content().includes(text), text);
});

test('조립: Windows 명령 항목이 있으면 시드 실행기 조각이 SAVE 바로 앞', () => {
  createServer({
    id: 'CMD-WIN-R1', name: 'CMD-WIN-R1', type: 'WEB', os: 'Windows', ip: '10.1.0.9',
    roles: ['WEB', 'WAS'], products: { WEB: 'WebtoB', WAS: 'JEUS' },
    policyIds: { BASIC: 'windows-basic-default', WEB: 'windows-web-default', WAS: 'windows-was-default' },
    roleChecks: { WEB: ['WEB_ENGINE_STATUS'], WAS: ['WAS_ENGINE_STATUS'] },
    scriptParts: { WEB_ENGINE_STATUS: 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS', WAS_ENGINE_STATUS: 'JEUS6-COMMAND-WAS_ENGINE_STATUS' },
  } as any);
  const script = assembleWindowsScript(getServer('CMD-WIN-R1')!, getTemplates());
  // SAVE는 조립 중 일부가 바뀌므로 첫 줄로 찾습니다.
  const save = getTemplates({ kind: 'SCRIPT_PART' }).find((t) => t.id === 'WINDOWS-PART-SAVE')!.content.split('\n')[0];
  const at = script.indexOf(content());
  assert.ok(at > 0, '실행기 조각이 들어감');
  assert.equal(script.indexOf(content(), at + 1), -1, '한 번만');
  assert.equal(script.indexOf(save), at + content().length + '\r\n\r\n'.length, 'SAVE 바로 앞');
});

test('Windows 실행기: 도구 이름은 .exe·.cmd·.bat·.com을 먼저, 확장자 없는 이름은 마지막에 찾는다', () => {
  assert.ok(content().includes("$names = @(($Tool + '.exe'), ($Tool + '.cmd'), ($Tool + '.bat'), ($Tool + '.com'), $Tool)"));
  const find = content().slice(content().indexOf('function Find-OpsBoxCommandTool'), content().indexOf('function Get-OpsBoxCommandSpec'));
  assert.equal(find.split('foreach ($name in $names)').length - 1, 2, 'PATH와 $홈\\bin 둘 다 같은 순서');
});

test('Windows 실행기: .bat/.cmd 도구 경로에 % 또는 ^가 있으면 실행하지 않고 글자를 알려 준다', () => {
  assert.ok(content().includes("$isBatch -and $toolPath -match '[%^]'"));
  assert.ok(content().includes('경로에 cmd.exe로 넘길 수 없는 글자(% ^)가 있습니다'));
});

test('Windows 실행기: 시간 초과면 taskkill /T로 자식 프로세스까지 끝낸다(출력은 버림)', () => {
  const timeoutBranch = content().slice(content().indexOf('if (-not $process.WaitForExit($timeoutMs))'), content().indexOf("$output = Get-OpsBoxCommandOutput $stdoutTask $stderrTask 2000"));
  assert.match(timeoutBranch, /& taskkill\.exe \/PID \$process\.Id \/T \/F 2>\$null \| Out-Null/);
  assert.ok(timeoutBranch.indexOf('taskkill') < timeoutBranch.indexOf('$process.Kill()'), 'Kill() 전에 taskkill');
});
