import assert from 'node:assert/strict';
import { test } from 'node:test';

import { builderChoices } from '../../src/public/settings/policy-management/check-builder-choices.js';

test('점검 만들기 폼: 종류·판정 수준 선택지는 서버가 준 목록 그대로', () => {
  const meta = { types: [{ value: 'COMMAND_NUMBER', label: '숫자 비교', help: '도움말' }], levels: [{ value: 'Critical', label: '위험' }, { value: 'Warning', label: '주의' }] };
  const choices = builderChoices(meta);
  assert.deepEqual(choices.types, [['COMMAND_NUMBER', '숫자 비교']]);
  assert.deepEqual(choices.levels, [['Critical', '위험'], ['Warning', '주의']]);
  assert.equal(choices.help('COMMAND_NUMBER'), '도움말');
  assert.equal(choices.help('NOPE'), '');
});
