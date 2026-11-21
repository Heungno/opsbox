import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPreset, presetsFor } from '../src/services/checkBuilder/presets';
import { builderInputs, builderResult, resolveSpec, validateBuilderSpec } from '../src/services/checkBuilder/spec';

/*
 * 점검 만들기: 폼 데이터 검증, 준비된 점검 목록, 서버별 입력·결과 표시 정의
 */

test('준비된 점검은 OS별로 매뉴얼 항목을 제공한다', () => {
  assert.deepEqual(presetsFor('Linux').map((preset) => preset.id), [
    'linux.swap', 'linux.inode', 'linux.ping', 'linux.nic', 'linux.raid', 'linux.multipath', 'linux.hba', 'linux.cluster', 'linux.sysctl',
  ]);
  assert.deepEqual(presetsFor('Windows').map((preset) => preset.id), [
    'windows.pagefile', 'windows.ping', 'windows.nic', 'windows.disk', 'windows.multipath', 'windows.hba', 'windows.cluster', 'windows.registry',
  ]);
  assert.equal(getPreset('linux.swap')?.os, 'Linux');
  assert.equal(getPreset('no.such'), undefined);
});

test('높을수록 나쁜 숫자 비교는 주의 기준이 위험 기준보다 작아야 한다', () => {
  const errors = validateBuilderSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', warning: 80, critical: 70 }, 'Linux', 'items.0');
  assert.equal(errors[0]?.field, 'items.0.warning');
});

test('낮을수록 나쁜 숫자 비교는 주의 기준이 위험 기준보다 커야 한다', () => {
  assert.deepEqual(validateBuilderSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', direction: 'LOWER_IS_WORSE', warning: 80, critical: 70 }, 'Linux', 'items.0'), []);
  assert.ok(validateBuilderSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', direction: 'LOWER_IS_WORSE', warning: 10, critical: 20 }, 'Linux', 'items.0').length);
});

test('다른 OS의 준비된 점검은 고를 수 없다', () => {
  const errors = validateBuilderSpec({ version: 1, type: 'COMMAND_TEXT', presetId: 'windows.nic' }, 'Linux', 'items.0');
  assert.equal(errors[0]?.field, 'items.0.presetId');
});

test('준비된 점검의 유형과 폼 유형이 다르면 오류', () => {
  assert.ok(validateBuilderSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.nic' }, 'Linux', 'i').length);
});

test('직접 입력 명령과 문구의 길이·개수를 제한한다', () => {
  const field = (spec: object) => validateBuilderSpec({ version: 1, presetId: null, ...spec }, 'Linux', 'i').map((error) => error.field);
  assert.ok(field({ type: 'COMMAND_NUMBER', command: 'x'.repeat(2001), warning: 1, critical: 2 }).includes('i.command'));
  assert.ok(field({ type: 'COMMAND_NUMBER', command: '', warning: 1, critical: 2 }).includes('i.command'));
  assert.ok(field({ type: 'COMMAND_TEXT', command: 'x', badPhrases: Array.from({ length: 21 }, (_, n) => `p${n}`) }).includes('i.badPhrases'));
  assert.ok(field({ type: 'COMMAND_TEXT', command: 'x', badPhrases: ['a'.repeat(201)] }).includes('i.badPhrases'));
  assert.ok(field({ type: 'COMMAND_TEXT', command: 'x', badPhrases: ['  '] }).includes('i.badPhrases'));
  assert.deepEqual(field({ type: 'COMMAND_TEXT', command: 'x', badPhrases: ['state DOWN'] }), []);
});

test('유형별 필수 값을 확인한다', () => {
  const fields = (spec: object, os: 'Linux' | 'Windows' = 'Linux') => validateBuilderSpec({ version: 1, presetId: null, ...spec }, os, 'i').map((error) => error.field);
  assert.ok(fields({ type: 'NO_SUCH' }).includes('i.type'));
  assert.ok(fields({ type: 'SETTING_VALUE', comparator: '=', expected: '1' }).includes('i.settingName'));
  assert.ok(fields({ type: 'SETTING_VALUE', settingName: 'Name', comparator: '=', expected: '1' }, 'Windows').includes('i.settingPath'));
  assert.ok(fields({ type: 'SETTING_VALUE', settingName: 'vm.swappiness', comparator: '~', expected: '1' }).includes('i.comparator'));
  // 커널 파라미터 이름은 옵션으로 해석되지 않도록 글자를 제한 (예: -w 로 시작하면 값 변경 옵션)
  assert.ok(fields({ type: 'SETTING_VALUE', settingName: '-w vm.swappiness=1', comparator: '=', expected: '1' }).includes('i.settingName'));
  assert.deepEqual(fields({ type: 'SETTING_VALUE', settingName: 'net.ipv4.tcp_syncookies', comparator: '=', expected: '1' }), []);
  assert.ok(fields({ type: 'FILE_FRESHNESS', maxAgeHours: 0 }).includes('i.maxAgeHours'));
  assert.ok(fields({ type: 'LOG_PATTERN', phrases: [], periodDays: 7, warning: 1, critical: 5 }).includes('i.phrases'));
  assert.ok(fields({ type: 'REMOTE_PORT', timeoutSeconds: 0 }).includes('i.timeoutSeconds'));
  assert.deepEqual(fields({ type: 'REMOTE_PORT' }), []);
  assert.ok(validateBuilderSpec(null, 'Linux', 'i').length);
});

test('원격 포트 접속은 서버별 대상 목록 입력을 만든다', () => {
  assert.deepEqual(builderInputs({ version: 1, type: 'REMOTE_PORT', presetId: null }), [
    { key: 'targets', label: '접속 대상 (호스트:포트, 한 줄에 하나)', type: 'TARGET_LIST', scope: 'SERVER', required: true },
  ]);
  assert.equal(builderInputs({ version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24 })[0].key, 'paths');
  assert.equal(builderInputs({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.ping' })[0].key, 'target');
  assert.deepEqual(builderInputs({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap' }), []);
});

test('결과 표시는 유형에 맞는 구성 요소와 고정 열을 쓴다', () => {
  assert.deepEqual(builderResult({ version: 1, type: 'LOG_PATTERN', presetId: null }).components.map((component) => component.type), ['SUMMARY', 'TABLE', 'LOG_TABLE']);
  assert.deepEqual(builderResult({ version: 1, type: 'COMMAND_TEXT', presetId: null }).components.map((component) => component.type), ['SUMMARY', 'TABLE', 'CONSOLE']);
  const result = builderResult({ version: 1, type: 'REMOTE_PORT', presetId: null });
  assert.deepEqual(result.components.map((component) => component.type), ['SUMMARY', 'TABLE']);
  assert.deepEqual(result.components[1].columns?.map((column) => column.key), ['target', 'value', 'threshold', 'status', 'message']);
  assert.equal(result.statusField, 'status');
});

test('실행용 값은 준비된 점검의 명령과 기본값을 채운다', () => {
  const resolved = resolveSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap' });
  assert.equal(resolved.warning, 50);
  assert.equal(resolved.critical, 80);
  assert.match(resolved.command ?? '', /free/);
  // 사용자가 정한 기준값은 기본값보다 우선
  assert.equal(resolveSpec({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', warning: 60 }).warning, 60);
  // 직접 입력은 그대로
  assert.equal(resolveSpec({ version: 1, type: 'COMMAND_TEXT', presetId: null, command: 'echo hi' }).command, 'echo hi');
  // 문구 확인의 수준 기본값은 위험
  assert.equal(resolveSpec({ version: 1, type: 'COMMAND_TEXT', presetId: 'linux.nic' }).level, 'Critical');
  assert.deepEqual(resolveSpec({ version: 1, type: 'COMMAND_TEXT', presetId: 'linux.nic' }).badPhrases, ['state DOWN']);
});
