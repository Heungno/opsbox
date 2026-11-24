import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { parseCommandTemplate } from '../src/features/templates/command-template';

const seedContent = (id: string): string => (JSON.parse(fs.readFileSync('seeds/templates.json', 'utf8')) as { id: string; content: string }[]).find((entry) => entry.id === id)!.content;

test('명령 템플릿: 기본 JEUS 6 템플릿을 읽는다', () => {
  const { template, errors } = parseCommandTemplate(seedContent('JEUS6-COMMAND-WAS_ENGINE_STATUS'));
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

test('명령 템플릿: 실행기가 무시할 판정 줄(~ 앞뒤 공백 없음, 빈 정규식)은 오류', () => {
  for (const line of ['# @opsbox-status Healthy~OK', '# @opsbox-status Healthy ~ ', '# @opsbox-status Healthy ~']) {
    const { errors } = parseCommandTemplate(`# @opsbox-tool x\n${line}\nst\n`);
    assert.deepEqual(errors.map((e) => e.message), ["2번 줄: 판정 규칙은 '<수준> ~ <정규식>' 형식이어야 합니다."], line);
  }
});

test('명령 템플릿: 모르는 키는 경고, CRLF도 같게 읽고, -P${VAR}는 경고 없음', () => {
  const unknown = parseCommandTemplate('# @opsbox-tool x\n# @opsbox-foo bar\n# @opsbox-status Healthy ~ OK\nst\n');
  assert.deepEqual(unknown.errors, []);
  assert.match(unknown.warnings[0].message, /@opsbox-foo는 모르는 머리 주석이라 무시합니다/);
  const lf = '# @opsbox-tool x\n# @opsbox-args -P${PW}\n# @opsbox-status Healthy ~ OK\nst\n';
  const a = parseCommandTemplate(lf);
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(parseCommandTemplate(lf.replace(/\n/g, '\r\n')), a);
});
