import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { parseCommandTemplate } from '../src/features/templates/command-template';

test('명령 템플릿: 시험판 jeus-6.cmd를 읽는다', () => {
  const { template, errors } = parseCommandTemplate(fs.readFileSync('docs/spikes/command-templates/jeus-6.cmd', 'utf8'));
  assert.deepEqual(errors, []);
  assert.equal(template.tool, 'jeusadmin'); assert.equal(template.timeoutSeconds, 30);
  assert.deepEqual(template.require, ['JEUS_NODE', 'OPSBOX_JEUS_USER', 'OPSBOX_JEUS_PASSWORD']);
  assert.deepEqual(template.commands, ['allenginenames', 'pidlist']);
  assert.deepEqual(template.rules.map((r) => r.level), ['Critical', 'Healthy']);
});

test('명령 템플릿: 도구·판정·명령이 없거나 수준·정규식이 틀리면 줄 번호와 함께 오류', () => {
  const { errors } = parseCommandTemplate('# @opsbox-status Fatal ~ X\n# @opsbox-status Healthy ~ (RDY\n');
  assert.deepEqual(errors.map((e) => e.message), [
    '@opsbox-tool(관리 도구 이름)이 필요합니다.',
    '1번 줄: 수준은 Critical·Warning·Healthy 중 하나여야 합니다.',
    '2번 줄: 정규식이 올바르지 않습니다.',
    '도구에 넣을 명령 줄이 1개 이상 필요합니다.',
  ]);
});

test('명령 템플릿: @opsbox-args에 ${…} 아닌 -P 값이 있으면 경고(저장은 됨)', () => {
  const { errors, warnings } = parseCommandTemplate('# @opsbox-tool x\n# @opsbox-args -Psecret\n# @opsbox-status Healthy ~ OK\nst\n');
  assert.deepEqual(errors, []);
  assert.match(warnings[0].message, /비밀번호를 직접 적었을 수 있습니다/);
});
