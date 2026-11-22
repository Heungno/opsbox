import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installFakeDocument } from '../helpers/fakeDom';
import { createDiffBadge, formatUptime, osInfo, summarizeDisks, summarizeHttp, summarizePorts, summarizeProcesses, summarizeRolePolicyDetail } from '../../src/public/reports/report-sections.js';

beforeEach(installFakeDocument);

test('요약 문구: 프로세스·포트·HTTP·디스크', () => {
  assert.deepEqual(summarizeProcesses([{ name: 'nginx', running: true }, { name: 'cron', running: false }]), { status: 'Critical', detail: '중지: cron' });
  assert.deepEqual(summarizePorts([]), { status: 'NotCollected', detail: '포트 점검 미등록' });
  assert.deepEqual(summarizeHttp([{ success: true, responseTimeMs: 10 }, { success: true, responseTimeMs: 30 }]), { status: 'Healthy', detail: '2개 URL 정상 · 평균 20 ms' });
  assert.deepEqual(summarizeDisks([{ usagePercent: 71 }, { usagePercent: 40 }]), { status: 'Warning', detail: '2개 디스크 · 최대 71%' });
  assert.deepEqual(summarizeDisks([], 95), { status: 'Critical', detail: '95%' });
});

test('역할 점검 요약: 메시지 우선, 로그는 기간·건수', () => {
  assert.equal(summarizeRolePolicyDetail({ message: '미수집 이유' }), '미수집 이유');
  assert.match(summarizeRolePolicyDetail({ item: 'WEB_LOG', detail: { periodDays: 3, checkedFileCount: 2, categories: { fatal: 1 } } }), /^최근 3일 · 파일 2개 · Fatal 1/);
});

test('가동 시간: 년·개월·일·시간·분, 0이면 0분', () => {
  assert.equal(formatUptime(61), '1시간 1분');
  assert.equal(formatUptime(0), '0분');
  assert.equal(formatUptime(0, { days: 2, hours: 3 }), '2일 3시간');
});

test('이전 점검 비교 배지', () => {
  assert.equal(createDiffBadge(50, undefined), null);
  assert.equal(createDiffBadge(50, 50).textContent, '- (변화없음)');
  assert.equal(createDiffBadge(55.5, 50).textContent, '▲ +5.5%');
  assert.equal(createDiffBadge(40, 50, false).className, 'diff-badge diff-down');
});

test('OS 정보: 결과 파일 값 우선, 없으면 등록 정보', () => {
  assert.deepEqual(osInfo({ host: { osName: 'Rocky Linux', osVersion: '9.3' } }, 'Linux'), { name: 'Rocky Linux', version: '9.3', collected: true, label: 'Rocky Linux (9.3)' });
  assert.equal(osInfo({}, 'Linux').label, 'Linux');
});
