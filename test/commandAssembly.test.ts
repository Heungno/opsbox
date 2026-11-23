import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServer, getServer } from '../src/features/servers/service';
import { getTemplates } from '../src/features/templates/service';
import { buildScriptConfig, selectScriptParts } from '../src/features/scripts/assembly';
import { assembleLinuxScript } from '../src/features/scripts/linux';
import { assembleWindowsScript } from '../src/features/scripts/windows';
import { COMMAND_NOT_SELECTED_MESSAGE } from '../src/features/scripts/commands';
import type { ManagedTemplate } from '../src/features/templates/types';

/* 명령 템플릿 항목 조립. 위치를 찾기 쉽게 시드의 실행기 조각 대신 시험용 SCRIPT_PART(# RUNNER)를 넘깁니다. */
const runner = (os: 'Linux' | 'Windows'): ManagedTemplate => ({
  id: `${os.toUpperCase()}-PART-COMMAND_RUNNER`, name: '실행기', kind: 'SCRIPT_PART', os, item: 'COMMAND_RUNNER', enabled: true, content: '# RUNNER', updatedAt: '',
});
const templates = (): ManagedTemplate[] => [
  ...getTemplates({ kind: 'SCRIPT_PART' }).filter((t) => t.item !== 'COMMAND_RUNNER'), ...getTemplates({ kind: 'COMMAND' }), runner('Linux'), runner('Windows'),
];
const seedPart = (id: string) => getTemplates({ kind: 'SCRIPT_PART' }).find((t) => t.id === id)!.content;
const COMMAND_IDS = { WEB_ENGINE_STATUS: 'WEBTOB41-COMMAND-WEB_ENGINE_STATUS', WAS_ENGINE_STATUS: 'JEUS6-COMMAND-WAS_ENGINE_STATUS' };

function make(id: string, os: 'Linux' | 'Windows', extra: Record<string, unknown>) {
  createServer({
    id, name: id, type: 'WEB', os, ip: '10.1.0.1',
    policyIds: { BASIC: `${os.toLowerCase()}-basic-default` },
    ...extra,
  } as any);
  return getServer(id)!;
}
const webWas = (id: string, os: 'Linux' | 'Windows', scriptParts: Record<string, string> = COMMAND_IDS) => make(id, os, {
  roles: ['WEB', 'WAS'], products: { WEB: 'WebtoB', WAS: 'JEUS' },
  policyIds: { BASIC: `${os.toLowerCase()}-basic-default`, WEB: `${os.toLowerCase()}-web-default`, WAS: `${os.toLowerCase()}-was-default` },
  roleChecks: { WEB: ['WEB_ENGINE_STATUS'], WAS: ['WAS_ENGINE_STATUS'] }, scriptParts,
});

test('조립: 명령 템플릿을 고른 항목은 원래 조각 대신 실행기 조각 한 번, SAVE 바로 앞', () => {
  const server = webWas('CMD-L1', 'Linux');
  const parts = selectScriptParts(server, templates(), 'Linux', '@@CONFIG_BASH@@');
  assert.equal(parts.filter((p) => p === '# RUNNER').length, 1);
  assert.equal(parts.at(-2), '# RUNNER');
  assert.ok(!parts.includes(seedPart('LINUX-PART-WEB_ENGINE_STATUS')));
});

test('조립: Linux는 실행기 조각이 없으면 건너뛰고, Windows는 오류', () => {
  const noRunner = templates().filter((t) => t.item !== 'COMMAND_RUNNER');
  const linux = selectScriptParts(webWas('CMD-L2', 'Linux'), noRunner, 'Linux', '@@CONFIG_BASH@@');
  assert.ok(!linux.includes('# RUNNER'));
  assert.throws(() => selectScriptParts(webWas('CMD-W2', 'Windows'), noRunner, 'Windows', '@@CONFIG_BASE64@@'), /COMMAND_RUNNER.*등록되어 있지 않습니다/);
});

test('조립: Windows도 실행기 조각이 SAVE 앞에 한 번', () => {
  const parts = selectScriptParts(webWas('CMD-W1', 'Windows'), templates(), 'Windows', '@@CONFIG_BASE64@@');
  assert.equal(parts.filter((p) => p === '# RUNNER').length, 1);
  assert.equal(parts.at(-2), '# RUNNER');
});

test('조립: WAS 엔진 상태를 안 고르면 실행기가 미수집 문구를 받는다', () => {
  const server = webWas('CMD-L3', 'Linux', { WEB_ENGINE_STATUS: COMMAND_IDS.WEB_ENGINE_STATUS });
  const config = buildScriptConfig(server, [], [], templates());
  assert.deepEqual(config.commands.find((c) => c.item === 'WAS_ENGINE_STATUS'), { role: 'WAS', item: 'WAS_ENGINE_STATUS', templateId: '', name: '', content: '', message: COMMAND_NOT_SELECTED_MESSAGE });
  assert.deepEqual(config.commands.map((c) => c.item), ['WEB_ENGINE_STATUS', 'WAS_ENGINE_STATUS']);
  assert.equal(selectScriptParts(server, templates(), 'Linux', '@@CONFIG_BASH@@').filter((p) => p === '# RUNNER').length, 1);
});

test('조립: 명령 항목이 없으면 실행기 조각도 commands도 없다(기존 서버 스크립트 그대로)', () => {
  const server = make('CMD-L4', 'Linux', { roles: ['WEB'], products: { WEB: 'Nginx' }, policyIds: { BASIC: 'linux-basic-default', WEB: 'linux-web-default' }, roleChecks: { WEB: ['WEB_ENGINE_STATUS'] } });
  assert.ok(!selectScriptParts(server, templates(), 'Linux', '@@CONFIG_BASH@@').includes('# RUNNER'));
  assert.deepEqual(buildScriptConfig(server, [], [], templates()).commands, []);
  assert.ok(!assembleLinuxScript(server, templates()).includes('OPSBOX_COMMAND_'));
  const windows = make('CMD-W4', 'Windows', { roles: ['WEB'], products: { WEB: 'Nginx' }, policyIds: { BASIC: 'windows-basic-default', WEB: 'windows-web-default' }, roleChecks: { WEB: ['WEB_ENGINE_STATUS'] } });
  const script = assembleWindowsScript(windows, templates());
  const encoded = /FromBase64String\('([^']+)'\)/.exec(script)?.[1] ?? /([A-Za-z0-9+/=]{200,})/.exec(script)?.[1];
  assert.ok(encoded);
  assert.ok(!('commands' in JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8'))));
});

test('조립: COMMAND 내용의 {{SERVER_IP}}는 바꾸지 않고 줄바꿈은 \\n', () => {
  const server = webWas('CMD-L5', 'Linux');
  const tpl = templates().map((t) => (t.id === COMMAND_IDS.WEB_ENGINE_STATUS ? { ...t, content: 'a {{SERVER_IP}}\r\nb' } : t));
  const entry = buildScriptConfig(server, [], [], tpl).commands.find((c) => c.item === 'WEB_ENGINE_STATUS')!;
  assert.equal(entry.content, 'a {{SERVER_IP}}\nb');
  assert.equal(entry.name, tpl.find((t) => t.id === COMMAND_IDS.WEB_ENGINE_STATUS)!.name);
});

test('조립: 고른 명령 템플릿을 중지하거나 item이 다르면 스크립트 만들기 오류', () => {
  const server = webWas('CMD-L6', 'Linux');
  const stopped = templates().map((t) => (t.id === COMMAND_IDS.WAS_ENGINE_STATUS ? { ...t, enabled: false } : t));
  assert.throws(() => selectScriptParts(server, stopped, 'Linux', '@@CONFIG_BASH@@'), /사용할 수 없습니다/);
  const moved = templates().map((t) => (t.id === COMMAND_IDS.WAS_ENGINE_STATUS ? { ...t, item: 'WEB_ENGINE_STATUS' } : t));
  assert.throws(() => selectScriptParts(server, moved, 'Linux', '@@CONFIG_BASH@@'), /사용할 수 없습니다/);
});

test('Linux 설정 블록: OPSBOX_COMMAND_* 배열이 같은 순서로 들어가고 실행기는 정리 단계 앞', () => {
  const script = assembleLinuxScript(webWas('CMD-L7', 'Linux'), templates());
  assert.match(script, /OPSBOX_COMMAND_ROLES=\('WEB' 'WAS'\)/);
  assert.match(script, /OPSBOX_COMMAND_ITEMS=\('WEB_ENGINE_STATUS' 'WAS_ENGINE_STATUS'\)/);
  assert.match(script, /OPSBOX_COMMAND_NAMES=\(/);
  assert.match(script, /OPSBOX_COMMAND_CONTENTS=\(/);
  assert.match(script, /OPSBOX_COMMAND_MESSAGES=\(''  ?''\)/);
  assert.ok(script.indexOf('# RUNNER') > 0 && script.indexOf('# RUNNER') < script.indexOf('# ---- 역할별 점검 결과 정리'));
});

test('Windows 설정 JSON에 commands가 들어간다', () => {
  const script = assembleWindowsScript(webWas('CMD-W7', 'Windows'), templates());
  const encoded = /([A-Za-z0-9+/=]{200,})/.exec(script)![1];
  const config = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assert.deepEqual(config.commands.map((c: any) => c.item), ['WEB_ENGINE_STATUS', 'WAS_ENGINE_STATUS']);
});
