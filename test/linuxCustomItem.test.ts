import { TEST_ROOT, makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';

import { createServer, getServer, updateCheckConfig } from '../src/services/serverService';
import { generateScript } from '../src/services/scriptService';
import { getPolicies, savePolicy } from '../src/features/policies/service';
import { saveTemplate } from '../src/features/templates/service';

/*
 * Linux 기본(BASIC) 사용자 항목: 직접 작성한 조각이 opsbox_role_record BASIC … 으로 남긴 결과가
 * policyItems와 종합 상태에 들어가고, 서버별 입력은 opsbox_item_input으로 문자 그대로 읽힌다.
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';
const scriptDir = makeDir('custom-scripts');
const marker = path.join(TEST_ROOT, 'custom-injected');
const ITEM = 'CUSTOM_TEST0000000001';
const SILENT = 'CUSTOM_TEST0000000002';
const tricky = `it's "q" $(touch ${marker}) \`touch ${marker}\` \\`;

const basic = getPolicies().find((policy) => policy.id === 'linux-basic-default')!;
savePolicy({
  ...basic,
  items: [
    ...basic.items,
    { id: ITEM, name: '사용자 항목', enabled: true, executor: { type: 'SCRIPT', options: {} }, result: { components: [{ type: 'SUMMARY' }] },
      inputs: [{ key: 'note', label: '메모', type: 'TEXT', scope: 'SERVER' }, { key: 'list', label: '목록', type: 'PATH_LIST', scope: 'SERVER' }] },
    { id: SILENT, name: '기록하지 않는 항목', enabled: true, executor: { type: 'SCRIPT', options: {} }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } },
  ],
} as any, basic.id);
saveTemplate({
  name: '사용자 항목 조각', kind: 'SCRIPT_PART', os: 'Linux', item: ITEM, enabled: true,
  content: [
    `note=$(opsbox_item_input ${ITEM} note)`,
    `list=$(opsbox_item_input ${ITEM} list)`,
    `lines=$(printf '%s\\n' "$list" | wc -l)`,
    `opsbox_role_record BASIC ${ITEM} Critical "{\\"value\\":$(opsbox_json_string "$note"),\\"lines\\":$lines,\\"missing\\":$(opsbox_json_string "$(opsbox_item_input ${ITEM} nope)")}"`,
  ].join('\n'),
} as any);
saveTemplate({ name: '기록하지 않는 조각', kind: 'SCRIPT_PART', os: 'Linux', item: SILENT, enabled: true, content: 'opsbox_log "아무것도 기록하지 않음"' } as any);

createServer({
  id: 'LNX-CUSTOM', name: '사용자 항목 서버', type: 'OTHER', roles: ['OTHER'], os: 'Linux', ip: '10.0.0.30', sharedPath: '',
  policyIds: { BASIC: 'linux-basic-default' }, processes: [], directories: [],
} as any);
// 서버 상세의 점검 설정 저장과 같은 경로로 서버별 입력을 저장
updateCheckConfig('LNX-CUSTOM', { ...getServer('LNX-CUSTOM'), rolePolicySettings: { [ITEM]: { inputs: { note: tricky, list: 'a;b' } } } } as any);

let json: any;
before(() => {
  if (!canRunBash) return;
  const scriptPath = path.join(scriptDir, 'LNX-CUSTOM.sh');
  fs.writeFileSync(scriptPath, generateScript('LNX-CUSTOM'));
  const run = spawnSync('bash', [scriptPath, scriptDir], { cwd: scriptDir, encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, `실행 실패\n${run.stdout}\n${run.stderr}`);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, run.stdout);
  json = JSON.parse(fs.readFileSync(saved, 'utf8'));
});

const policyItem = (item: string) => json.checks.policyItems.find((entry: any) => entry.item === item);

test('직접 작성한 Linux 조각이 기록한 기본 사용자 항목 결과가 policyItems에 들어간다', { skip: !canRunBash }, () => {
  const entry = policyItem(ITEM);
  assert.equal(entry.status, 'Critical');
  assert.equal(entry.name, '사용자 항목');
  assert.equal(entry.role, 'BASIC');
});

test('서버별 입력은 따옴표·명령 치환이 든 값도 문자 그대로 읽고 실행하지 않는다', { skip: !canRunBash }, () => {
  assert.equal(policyItem(ITEM).detail.value, tricky);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(policyItem(ITEM).detail.missing, '', '없는 입력은 빈 문자열');
});

test('목록 입력의 예전 ; 구분 값은 줄바꿈으로 바꿔 전달한다', { skip: !canRunBash }, () => {
  assert.equal(policyItem(ITEM).detail.lines, 2);
});

test('기록하지 않은 기본 사용자 항목은 미수집과 안내 메시지로 남는다', { skip: !canRunBash }, () => {
  const entry = policyItem(SILENT);
  assert.equal(entry.status, 'NotCollected');
  assert.match(entry.message, /결과를 기록하지 않았습니다/);
});

test('기본 사용자 항목의 상태가 종합 상태 계산에 들어간다', { skip: !canRunBash }, () => {
  // 기본 항목 10개(서버정보·CPU·메모리·가동시간·디스크·프로세스·디렉터리·파일·포트·HTTP) + 사용자 항목 2개
  const { healthy, warning, critical, notCollected } = json.summary.counts;
  assert.equal(healthy + warning + critical + notCollected, 12);
  assert.ok(critical >= 1);
  assert.equal(json.summary.status, 'Critical');
});
