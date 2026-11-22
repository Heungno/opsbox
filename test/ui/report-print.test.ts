import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { formatPrintDate, printRoleText, roleListText } from '../../src/public/reports/report-print.js';

beforeEach(() => { resetCodes(); setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타 서버' }] }); });

test('인쇄 머리말 역할: 공통코드 이름, 제품은 괄호', () => {
  assert.equal(printRoleText(['WEB', 'OTHER'], { WEB: 'Nginx' }), 'WEB (Nginx), 기타 서버');
});

test('보고서 제목 역할: 공통코드 이름을 + 로', () => {
  assert.equal(roleListText(['WEB', 'OTHER']), 'WEB + 기타 서버');
});

test('인쇄 날짜: YYYY. M. D.', () => {
  assert.equal(formatPrintDate(new Date(2026, 10, 3)), '2026. 11. 3.');
});
