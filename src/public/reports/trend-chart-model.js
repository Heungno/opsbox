/*
 * 보고서 자원 사용 추세 그래프: 좌표·눈금·선 경로 계산 (DOM 없음, node 테스트로 검증)
 *
 * 입력은 보고서 화면이 불러온 점검 이력({ fileName, checkDate, cpu, memory, disk }).
 * 끝점(endDate)에서 days일 전까지의 결과를 시간 비례 x축, 0~100% y축에 놓습니다.
 */

export const TREND_SERIES = [
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: '메모리' },
  { key: 'disk', label: '디스크' },
];

const DAY_MS = 86_400_000;
const THRESHOLDS = [{ value: 70, label: '주의' }, { value: 90, label: '위험' }];
const pad = (n) => String(n).padStart(2, '0');
const round = (n) => Math.round(n * 10) / 10;

/** 'YYYY-MM-DD HH:mm:ss' → 로컬 시각(ms). 형식이 아니면 NaN */
export function parseCheckDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(text ?? ''));
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)).getTime();
}

const isValue = (value) => typeof value === 'number' && Number.isFinite(value);

/** x 눈금 간격(일): 2주 이하 2일, 4주 7일, 12주 14일, 그보다 길면(26주) 28일 */
function tickStepDays(days) {
  if (days <= 14) return 2;
  if (days <= 28) return 7;
  if (days <= 84) return 14;
  return 28;
}

export function buildTrendModel(results, { endDate, days, width = 720, height = 240, padding = { top: 12, right: 16, bottom: 28, left: 40 } }) {
  const end = parseCheckDate(endDate);
  const start = end - days * DAY_MS;
  const left = padding.left;
  const right = width - padding.right;
  const top = padding.top;
  const bottom = height - padding.bottom;
  const plotWidth = right - left;
  const plotHeight = bottom - top;

  const inRange = (Array.isArray(results) ? results : [])
    .map((entry) => ({ entry, time: parseCheckDate(entry?.checkDate) }))
    .filter(({ time }) => Number.isFinite(time) && Number.isFinite(end) && time >= start && time <= end)
    .sort((a, b) => a.time - b.time);
  const withValues = inRange.filter(({ entry }) => TREND_SERIES.some(({ key }) => isValue(entry[key])));
  const enough = withValues.length >= 2;

  const xOf = (time) => (enough ? round(left + ((time - start) / (end - start)) * plotWidth) : round(left + plotWidth / 2));
  const yOf = (value) => round(bottom - (Math.min(100, Math.max(0, value)) / 100) * plotHeight);

  const series = TREND_SERIES.map(({ key, label }) => {
    const points = [];
    const paths = [];
    let segment = [];
    for (const { entry, time } of inRange) {
      if (!isValue(entry[key])) {
        if (segment.length) paths.push(segment);
        segment = [];
        continue;
      }
      const point = { x: xOf(time), y: yOf(entry[key]), value: entry[key], fileName: entry.fileName, date: entry.checkDate };
      points.push(point);
      segment.push(point);
    }
    if (segment.length) paths.push(segment);
    return { key, label, points, paths: paths.map((list) => list.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')) };
  });

  const xTicks = [];
  if (Number.isFinite(end)) {
    const step = tickStepDays(days);
    const first = new Date(start);
    first.setHours(0, 0, 0, 0);
    if (first.getTime() < start) first.setDate(first.getDate() + 1);
    for (const tick = new Date(first); tick.getTime() <= end; tick.setDate(tick.getDate() + step)) {
      xTicks.push({ x: round(left + ((tick.getTime() - start) / (end - start)) * plotWidth), label: `${pad(tick.getMonth() + 1)}/${pad(tick.getDate())}` });
    }
  }
  const yTicks = [0, 25, 50, 75, 100].map((value) => ({ y: yOf(value), label: `${value}%` }));
  const thresholds = THRESHOLDS.map(({ value, label }) => ({ y: yOf(value), value, label }));

  // 점검 시점별 묶음 (값 상자·클릭 대상): 값이 하나라도 있는 결과만
  const entries = withValues.map(({ entry, time }) => ({
    x: xOf(time), date: entry.checkDate, fileName: entry.fileName,
    values: Object.fromEntries(TREND_SERIES.map(({ key }) => [key, isValue(entry[key]) ? entry[key] : null])),
  }));

  return { enough, start, end, width, height, left, right, top, bottom, series, entries, xTicks, yTicks, thresholds };
}
