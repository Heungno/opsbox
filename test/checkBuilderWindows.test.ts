import assert from 'node:assert/strict';
import { test } from 'node:test';

import { psLiteral } from '../src/services/checkBuilder/literal';
import { generateWindowsPart } from '../src/services/checkBuilder/windows';
import type { BuilderSpec } from '../src/services/checkBuilder/types';

/*
 * 점검 만들기: Windows(PowerShell) 생성 조각 정적 검사
 * 이 환경에는 PowerShell이 없어 실행하지 않고, 문법 규칙(PowerShell 3.0)과 값 삽입 규칙을 확인합니다.
 */
const tricky = `a'b"c \`d $(Remove-Item x) $env:PATH\r\n; Write-Host pwned`;
const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const specs: Record<string, BuilderSpec> = {
  number: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: tricky, warning: 70, critical: 90 },
  text: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: 'Get-Date', badPhrases: [tricky], goodPhrases: ['OK'] },
  setting: { version: 1, type: 'SETTING_VALUE', presetId: null, settingPath: `HKLM:\\SOFTWARE\\${tricky}`, settingName: tricky, comparator: '=', expected: tricky },
  port: { version: 1, type: 'REMOTE_PORT', presetId: null, timeoutSeconds: 3 },
  file: { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24 },
  log: { version: 1, type: 'LOG_PATTERN', presetId: null, phrases: [tricky], periodDays: 7, warning: 1, critical: 5 },
  preset: { version: 1, type: 'COMMAND_NUMBER', presetId: 'windows.ping' },
};
const generate = (spec: BuilderSpec, role: 'BASIC' | 'WEB' | 'WAS' | 'DB' = 'BASIC', itemName = tricky) =>
  generateWindowsPart({ itemId: 'CUSTOM_WIN0000000001', itemName, role, spec });

test('생성 조각은 PowerShell 3.0에서 쓸 수 없는 문법을 쓰지 않는다', () => {
  for (const [name, spec] of Object.entries(specs)) {
    assert.doesNotMatch(generate(spec), /::new\(|\s-(not)?in\s|^\s*class\s|^\s*using\s/m, name);
  }
});

test('폼 값과 항목 이름은 원문이 코드에 나타나지 않고 base64 문자열 식으로만 들어간다', () => {
  for (const [name, spec] of Object.entries(specs)) {
    // 첫 줄은 사람이 알아보도록 이름을 적는 한 줄 주석(줄바꿈 제거, 아래 테스트) — 코드 부분만 검사
    const content = generate(spec).split('\n').slice(1).join('\n');
    assert.ok(!content.includes('Remove-Item x'), `${name}: 원문이 코드에 있음`);
    assert.ok(!content.includes('Write-Host pwned'), `${name}: 원문이 코드에 있음`);
  }
  assert.ok(generate(specs.number).includes(b64(tricky)), '명령');
  assert.ok(generate(specs.text).includes(b64(tricky)), '문구');
  assert.ok(generate(specs.setting).includes(b64(`HKLM:\\SOFTWARE\\${tricky}`)), '레지스트리 경로');
});

test('주석 첫 줄의 항목 이름은 줄바꿈이 없어 주석 밖으로 나가지 않는다', () => {
  const first = generate(specs.port).split('\n')[0];
  assert.match(first, /^# 점검 만들기 · .* \(자동 생성, 생성기 v1\)/);
  assert.doesNotMatch(generate(specs.port).split('\n')[1], /Write-Host pwned/);
});

test('서버별 입력은 실행 중 설정(rolePolicySettings)에서 읽고 값 자체는 코드에 없다', () => {
  const content = generate(specs.port);
  assert.match(content, /rolePolicySettings/);
  assert.ok(content.includes(psLiteral('targets')));
  assert.ok(generate(specs.preset).includes(psLiteral('OPSBOX_INPUT_TARGET')), '준비된 점검 입력은 환경 변수로 전달');
});

test('결과는 역할·항목과 함께 script 범위의 $rolePolicyResults 에 한 번 기록한다', () => {
  const content = generate(specs.file, 'DB');
  assert.equal(content.match(/\$script:rolePolicyResults \+=/g)?.length, 1);
  assert.ok(content.includes(psLiteral('DB')));
  assert.ok(content.includes(psLiteral('CUSTOM_WIN0000000001')));
});

test('명령은 시간 제한(기본 30초)과 출력 2,000자 제한을 둔다', () => {
  const content = generate(specs.number);
  assert.match(content, /WaitForExit\(\$cbTimeout \* 1000\)/);
  assert.match(content, /OPSBOX_CB_TIMEOUT/);
  assert.match(content, /\b30\b/);
  assert.match(content, /\b2000\b/);
});

test('항목 전체를 try/catch로 감싸 오류가 나도 스크립트가 멈추지 않는다', () => {
  const content = generate(specs.log);
  assert.match(content, /\btry \{/);
  assert.match(content, /\bcatch \{/);
});

test('항목 ID가 함수 이름으로 쓸 수 없는 글자를 포함하면 생성하지 않는다', () => {
  assert.throws(() => generateWindowsPart({ itemId: 'BAD-ID;', itemName: 'x', role: 'BASIC', spec: specs.port }), /항목 ID/);
});
