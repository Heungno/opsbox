import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diffStyles, normalizeValue } from './visual/style-diff';

test('같은 스냅샷은 차이 없음', () => {
  const snap = { 'body>div:0': { color: 'rgb(22, 33, 43)', 'padding-top': '24px' } };
  assert.deepEqual(diffStyles(snap, structuredClone(snap)), []);
});

test('값이 바뀌거나 요소가 사라지면 차이', () => {
  const diffs = diffStyles({ a: { color: 'rgb(0, 0, 0)' }, b: { color: 'rgb(1, 1, 1)' } }, { a: { color: 'rgb(0, 0, 1)' } });
  assert.deepEqual(diffs, [
    { path: 'a', property: 'color', before: 'rgb(0, 0, 0)', after: 'rgb(0, 0, 1)' },
    { path: 'b', property: '*', before: 'present', after: undefined },
  ]);
});

test('새로 생긴 요소도 차이', () => {
  assert.deepEqual(diffStyles({}, { c: { color: 'rgb(0, 0, 0)' } }), [{ path: 'c', property: '*', before: undefined, after: 'present' }]);
});

test('color-mix 소수 채널은 반올림해 같게 본다', () => {
  assert.equal(normalizeValue('background-color', 'rgb(227.4, 238.6, 242)'), normalizeValue('background-color', 'rgb(227, 239, 242)'));
  assert.equal(normalizeValue('color', 'color(srgb 0.5 0.5 0.5)'), 'rgb(128, 128, 128)');
  assert.equal(normalizeValue('color', 'rgba(10.2, 20, 30, 0.333)'), 'rgba(10, 20, 30, 0.33)');
  assert.equal(normalizeValue('padding-top', '12.004px'), '12px');
});
