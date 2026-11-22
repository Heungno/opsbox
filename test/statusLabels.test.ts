import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { resetStatusLabels, setStatusLabels, statusLabel } from '../src/public/shared/js/status.js';

/*
 * 상태 표시 이름: 공통코드 healthStatuses 를 따르고, 불러오지 못하면 기본 한글 이름
 */
beforeEach(() => resetStatusLabels());

test('공통코드를 불러오기 전에도 기본 한글 이름을 쓴다', () => {
  assert.equal(statusLabel('Healthy'), '정상');
  assert.equal(statusLabel('Warning'), '경고');
  assert.equal(statusLabel('Critical'), '위험');
  assert.equal(statusLabel('NotCollected'), '미수집');
  assert.equal(statusLabel('NotChecked'), '미점검');
  assert.equal(statusLabel('Unknown'), '알 수 없음');
});

test('공통코드의 이름이 있으면 그 이름을 쓴다 (공통코드 관리에서 바꾼 이름 반영)', () => {
  setStatusLabels([{ value: 'Warning', label: '주의' }, { value: 'Critical', label: '심각' }]);
  assert.equal(statusLabel('Warning'), '주의');
  assert.equal(statusLabel('Critical'), '심각');
  assert.equal(statusLabel('Healthy'), '정상', '코드에 없는 값은 기본 이름');
});

test('이름이 비었거나 형식이 다른 코드는 무시한다', () => {
  setStatusLabels([{ value: 'Healthy', label: '' }, { value: 'Warning' }, null, 'x'] as any);
  assert.equal(statusLabel('Healthy'), '정상');
  assert.equal(statusLabel('Warning'), '경고');
});

test('모르는 값은 그대로, 값이 없으면 미판정', () => {
  assert.equal(statusLabel('Pending'), 'Pending');
  assert.equal(statusLabel(undefined), '미판정');
  assert.equal(statusLabel(''), '미판정');
});

test('HTML의 data-status-label 요소를 상태 이름으로 채운다', async () => {
  const { applyStatusLabels } = await import('../src/public/shared/js/status.js');
  const make = (value: string) => ({ textContent: 'Healthy', getAttribute: (name: string) => (name === 'data-status-label' ? value : null) });
  const elements = [make('Healthy'), make('Warning'), make('Critical')];
  setStatusLabels([{ value: 'Warning', label: '주의' }]);
  applyStatusLabels(elements);
  assert.deepEqual(elements.map((element) => element.textContent), ['정상', '주의', '위험']);
});

test('판정 표기 범례는 기호와 상태 이름으로 만든다', async () => {
  const { statusLegend } = await import('../src/public/shared/js/status.js');
  assert.equal(statusLegend(), '○ 정상 · △ 경고 · × 위험 · － 미수집');
});
