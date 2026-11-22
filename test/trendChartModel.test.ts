import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTrendModel, parseCheckDate, TREND_SERIES } from '../src/public/reports/trend-chart-model.js';

/*
 * 보고서 추세 그래프: 좌표·눈금·선 경로 계산 (브라우저 없이 확인)
 */
const result = (checkDate: string, cpu: unknown, memory: unknown, disk: unknown, fileName = `${checkDate}.json`) => ({ fileName, checkDate, cpu, memory, disk });
const END = '2026-11-21 09:00:00';
const options = (days: number) => ({ endDate: END, days, width: 720, height: 240, padding: { top: 12, right: 16, bottom: 28, left: 40 } });
const series = (model: any, key: string) => model.series.find((entry: any) => entry.key === key);

test('점검 일시 문자열을 로컬 시각으로 읽고, 형식이 아니면 NaN', () => {
  assert.equal(parseCheckDate('2026-11-21 09:05:00'), new Date(2026, 10, 21, 9, 5, 0).getTime());
  assert.ok(Number.isNaN(parseCheckDate('')));
  assert.ok(Number.isNaN(parseCheckDate('2026/11/21')));
  assert.ok(Number.isNaN(parseCheckDate(undefined as any)));
});

test('계열은 CPU·메모리·디스크', () => {
  assert.deepEqual(TREND_SERIES.map((entry: any) => entry.key), ['cpu', 'memory', 'disk']);
});

test('기간 안(끝점 포함, 이후 제외) 결과만 시간순으로 쓴다', () => {
  const model = buildTrendModel([
    result('2026-11-22 09:00:00', 1, 1, 1), result('2026-11-21 09:00:00', 2, 2, 2), result('2026-11-01 09:00:00', 3, 3, 3), result('2026-11-08 09:00:00', 4, 4, 4),
  ], options(14));
  assert.deepEqual(series(model, 'cpu').points.map((point: any) => point.value), [4, 2]);
  assert.equal(model.enough, true);
});

test('y 좌표는 0~100%로 자르고 표시 값은 원래 숫자를 남긴다', () => {
  const model = buildTrendModel([result('2026-11-20 09:00:00', 100, 0, 150), result('2026-11-21 09:00:00', -5, 50, 50)], options(14));
  const cpu = series(model, 'cpu').points;
  assert.equal(cpu[0].y, 12);
  assert.equal(cpu[1].y, 212);
  assert.equal(series(model, 'memory').points[0].y, 212);
  assert.equal(series(model, 'disk').points[0].y, 12);
  assert.equal(series(model, 'disk').points[0].value, 150);
});

test('값이 없는 점검에서 선을 끊는다', () => {
  const model = buildTrendModel([
    result('2026-11-18 09:00:00', 10, 20, 30), result('2026-11-19 09:00:00', 11, null, 31), result('2026-11-20 09:00:00', 12, 22, 32), result('2026-11-21 09:00:00', 13, 23, 33),
  ], options(14));
  assert.equal(series(model, 'memory').paths.length, 2);
  assert.equal(series(model, 'memory').points.length, 3);
  assert.equal(series(model, 'cpu').paths.length, 1);
  assert.match(series(model, 'cpu').paths[0], /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3}$/);
});

test('같은 시각 점검이 여러 건이어도 좌표가 숫자이고, 결과가 1건이면 부족으로 알린다', () => {
  const same = buildTrendModel([result(END, 10, 10, 10, 'a.json'), result(END, 20, 20, 20, 'b.json')], options(14));
  const points = series(same, 'cpu').points;
  assert.equal(points[0].x, points[1].x);
  assert.ok(points.every((point: any) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const single = buildTrendModel([result(END, 10, 10, 10)], options(14));
  assert.equal(single.enough, false);
  assert.equal(series(single, 'cpu').points[0].x, 40 + (720 - 40 - 16) / 2);
});

test('점검 일시가 비거나 형식이 다른 결과는 뺀다', () => {
  const model = buildTrendModel([result('', 10, 10, 10), result('어제', 10, 10, 10), result('2026-11-20 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(14));
  assert.equal(series(model, 'cpu').points.length, 2);
});

test('기준선(주의 70·위험 90)과 y 눈금(0~100%)', () => {
  const model = buildTrendModel([result('2026-11-20 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(14));
  assert.deepEqual(model.thresholds.map((line: any) => [line.value, line.label]), [[70, '주의'], [90, '위험']]);
  assert.equal(model.thresholds[0].y, 12 + 200 * 0.3);
  assert.deepEqual(model.yTicks.map((tick: any) => tick.label), ['0%', '25%', '50%', '75%', '100%']);
});

test('x 눈금은 기간에 맞는 간격과 MM/DD 라벨', () => {
  const four = buildTrendModel([result('2026-10-25 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(28));
  assert.ok(four.xTicks.length >= 3 && four.xTicks.length <= 5, String(four.xTicks.length));
  assert.ok(four.xTicks.every((tick: any) => /^\d{2}\/\d{2}$/.test(tick.label)));
  assert.ok(four.xTicks.every((tick: any) => tick.x >= 40 && tick.x <= 720 - 16));
  const two = buildTrendModel([result('2026-11-08 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(14));
  assert.ok(two.xTicks.length >= 6 && two.xTicks.length <= 8, String(two.xTicks.length));
});

test('주간점검용 긴 기간: 12주는 2주 간격, 26주는 4주 간격 눈금', () => {
  const twelve = buildTrendModel([result('2026-09-01 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(84));
  assert.ok(twelve.xTicks.length >= 6 && twelve.xTicks.length <= 7, String(twelve.xTicks.length));
  const half = buildTrendModel([result('2026-06-01 09:00:00', 1, 1, 1), result(END, 2, 2, 2)], options(182));
  assert.ok(half.xTicks.length >= 6 && half.xTicks.length <= 7, String(half.xTicks.length));
  assert.ok(half.xTicks.every((tick: any) => tick.x >= 40 && tick.x <= 720 - 16));
});

test('점검 시점별 묶음(entries)에 x·일시·파일·세 값을 담는다', () => {
  const model = buildTrendModel([result('2026-11-20 09:00:00', 1, null, 3, 'a.json'), result(END, 4, 5, 6, 'b.json')], options(14));
  assert.equal(model.entries.length, 2);
  assert.deepEqual(model.entries[0].values, { cpu: 1, memory: null, disk: 3 });
  assert.equal(model.entries[1].fileName, 'b.json');
  assert.equal(model.entries[1].x, series(model, 'cpu').points[1].x);
});
