import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { itemSummary, renderCategoryTabs } from '../../src/public/settings/policy-management/policy-view.js';

beforeEach(() => {
  installFakeDocument();
  resetCodes();
  setCodes({
    policyCategories: [{ value: 'BASIC', label: '기본' }, { value: 'WEB', label: 'WEB' }],
    policyExecutors: [{ value: 'SCRIPT', label: '스크립트' }],
    resultViews: [{ value: 'SUMMARY', label: '요약' }, { value: 'TABLE', label: '표' }],
  });
});

test('정책 관리: 분류 탭은 공통코드 policyCategories 이름과 건수', () => {
  const tabs = new FakeElement('div');
  renderCategoryTabs(tabs, [{ category: 'WEB' }, { category: 'WEB' }], 'WEB');
  assert.deepEqual(tabs.find('button').map((b) => [b.getAttribute('data-category'), b.textContent, b.getAttribute('aria-selected')]), [['BASIC', '기본 0', 'false'], ['WEB', 'WEB 2', 'true']]);
});

test('정책 관리: 항목 요약은 실행 방식·결과 표시 이름(공통코드)', () => {
  assert.equal(itemSummary({ id: 'X', name: '디스크', executor: { type: 'SCRIPT' }, result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE' }] } }), '디스크 · 스크립트 · 요약+표');
  assert.equal(itemSummary({ id: 'X', executor: { type: 'NEW' }, result: { components: [] } }), 'X · NEW · ');
});
