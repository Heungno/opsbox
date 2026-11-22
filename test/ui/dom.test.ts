import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { el, option, replace } from '../../src/public/shared/js/dom.js';

beforeEach(installFakeDocument);

test('el: 태그·클래스·글자, 빈 값은 넣지 않는다', () => {
  const badge = el('span', 'badge', '경고') as unknown as FakeElement;
  assert.equal(badge.tagName, 'span');
  assert.equal(badge.className, 'badge');
  assert.equal(badge.textContent, '경고');
  const plain = el('div') as unknown as FakeElement;
  assert.equal(plain.getAttribute('class'), null);
  assert.equal(plain.textContent, '');
});

test('option: 값·이름·선택', () => {
  const item = option('WEB', '웹', true) as unknown as FakeElement;
  assert.equal(item.value, 'WEB');
  assert.equal(item.textContent, '웹');
  assert.equal(item.selected, true);
});

test('replace: 안의 내용을 바꾼다', () => {
  const box = new FakeElement('div');
  box.append(new FakeElement('p'));
  replace(box as any, el('span', '', 'a') as any, 'b');
  assert.equal(box.textContent, 'ab');
  assert.equal(box.children.length, 2);
});
