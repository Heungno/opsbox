import { buildTrendModel, TREND_SERIES } from './trend-chart-model.js?v=20261122-weekly';

/*
 * 보고서 자원 사용 추세 그래프 (SVG, 라이브러리 없음)
 *
 * - 계열: CPU·메모리·디스크 (색은 CSS 변수 --trend-cpu 등, 범례 + 선 끝 이름표로 색만으로 구분하지 않음)
 * - 기준선: 주의 70%·위험 90% 회색 점선 + 글자
 * - 지금 보고서 점(●, is-current)·비교 점검 점(○, is-compare)
 * - 점검 시점마다 세로 띠(trend-hit)를 두어 마우스·키보드로 값 상자와 세로 안내선을 보이고, 클릭·Enter로 그 보고서를 엽니다.
 * DOM은 createElement(NS) + textContent만 사용합니다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 320;
const HEIGHT = 240;
const PADDING = { top: 12, right: 64, bottom: 28, left: 40 };

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function html(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const percent = (value) => (value === null || value === undefined ? '-' : `${Math.round(value * 10) / 10}%`);

/** 선 끝 이름표가 겹치지 않게 세로로 벌립니다(최소 간격 12px). */
function spreadLabels(labels, minGap = 12) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return labels;
}

export function renderTrendChart(container, { results, endDate, days, currentFile, compareFile, onSelect }) {
  // 그래프 폭 = 컨테이너 실제 폭(픽셀) — 휴대폰에서도 축 글자가 줄어들지 않게 (화면 크기가 바뀌면 다시 그림)
  const WIDTH = Math.max(MIN_WIDTH, Math.round(container.clientWidth || DEFAULT_WIDTH));
  const model = buildTrendModel(results, { endDate, days, width: WIDTH, height: HEIGHT, padding: PADDING });
  if (!model.enough) {
    container.replaceChildren(html('p', 'policy-help', '추세를 그릴 점검 결과가 부족합니다. (선택한 기간 안에 점검 결과가 2건 이상 있어야 합니다)'));
    return;
  }

  const legend = html('ul', 'trend-legend');
  for (const { key, label } of TREND_SERIES) {
    const item = html('li', `trend-legend-item trend-${key}`);
    item.append(html('span', 'trend-swatch'), html('span', null, label));
    legend.append(item);
  }

  const chart = svg('svg', { class: 'trend-svg', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'group', 'aria-label': `최근 ${days}일 CPU·메모리·디스크 사용률 추세 — ←·→로 점검 시점 이동, Enter로 보고서 열기` });

  // 눈금·격자 (뒤쪽, 연하게)
  for (const tick of model.yTicks) {
    chart.append(svg('line', { class: 'trend-grid', x1: model.left, x2: model.right, y1: tick.y, y2: tick.y }));
    chart.append(svg('text', { class: 'trend-axis', x: model.left - 6, y: tick.y + 4, 'text-anchor': 'end' }, tick.label));
  }
  for (const tick of model.xTicks) {
    chart.append(svg('text', { class: 'trend-axis', x: tick.x, y: model.bottom + 18, 'text-anchor': 'middle' }, tick.label));
  }
  // 기준선 (주의·위험): 상태 색 대신 회색 점선 + 글자
  for (const line of model.thresholds) {
    chart.append(svg('line', { class: 'trend-threshold', x1: model.left, x2: model.right, y1: line.y, y2: line.y }));
  }

  // 세로 안내선 (값 상자와 함께)
  const guide = svg('line', { class: 'trend-guide', x1: 0, x2: 0, y1: model.top, y2: model.bottom, visibility: 'hidden' });
  chart.append(guide);

  // 선과 점
  const endLabels = [];
  for (const series of model.series) {
    for (const d of series.paths) chart.append(svg('path', { class: `trend-line trend-${series.key}`, d }));
    for (const point of series.points) {
      const classes = ['trend-point', `trend-${series.key}`];
      if (point.fileName === currentFile) classes.push('is-current');
      else if (compareFile && point.fileName === compareFile) classes.push('is-compare');
      chart.append(svg('circle', { class: classes.join(' '), cx: point.x, cy: point.y, r: classes.length > 2 ? 5 : 3 }));
    }
    const last = series.points[series.points.length - 1];
    if (last) endLabels.push({ label: series.label, key: series.key, x: last.x, y: last.y + 4 });
  }
  // 기준선 글자는 데이터 선 위에 그려(배경색 테두리) 선이 지나가도 읽히게 합니다.
  for (const line of model.thresholds) {
    chart.append(svg('text', { class: 'trend-threshold-label', x: model.left + 4, y: line.y - 4 }, `${line.label} ${line.value}%`));
  }
  for (const label of spreadLabels(endLabels)) {
    chart.append(svg('text', { class: `trend-end-label trend-${label.key}-label`, x: label.x + 8, y: label.y }, label.label));
  }

  // 값 상자 + 점검 시점별 세로 띠 (마우스·키보드 대상)
  const tooltip = html('div', 'trend-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'status');
  const show = (entry) => {
    const title = html('strong', null, entry.date);
    const rows = TREND_SERIES.map(({ key, label }) => {
      const row = html('div', `trend-tooltip-row trend-${key}`);
      row.append(html('span', 'trend-swatch'), html('span', null, `${label} ${percent(entry.values[key])}`));
      return row;
    });
    tooltip.replaceChildren(title, ...rows);
    const left = Math.min(Math.max((entry.x / WIDTH) * 100, 8), 80);
    tooltip.setAttribute('style', `left: ${left}%;`);
    tooltip.hidden = false;
    guide.setAttribute('x1', entry.x);
    guide.setAttribute('x2', entry.x);
    guide.setAttribute('visibility', 'visible');
  };
  const hide = () => {
    tooltip.hidden = true;
    guide.setAttribute('visibility', 'hidden');
  };

  // 키보드: Tab 정지는 하나(지금 보고서 시점, 없으면 마지막)만 두고 ←·→·Home·End로 시점을 옮깁니다(로빙 tabindex).
  const currentIndex = model.entries.findIndex((entry) => entry.fileName === currentFile);
  const tabIndex = currentIndex >= 0 ? currentIndex : model.entries.length - 1;
  const hits = [];
  const moveFocus = (from, to) => {
    const target = Math.min(Math.max(to, 0), hits.length - 1);
    if (target === from) return;
    hits[from].setAttribute('tabindex', '-1');
    hits[target].setAttribute('tabindex', '0');
    hits[target].focus();
  };

  model.entries.forEach((entry, index) => {
    const prev = model.entries[index - 1]?.x ?? model.left;
    const next = model.entries[index + 1]?.x ?? model.right;
    const from = index === 0 ? model.left : (prev + entry.x) / 2;
    const to = index === model.entries.length - 1 ? model.right : (entry.x + next) / 2;
    const label = `${entry.date} ${TREND_SERIES.map(({ key, label: name }) => `${name} ${percent(entry.values[key])}`).join(', ')} — 이 보고서 열기`;
    const hit = svg('rect', { class: 'trend-hit', x: from, y: model.top, width: Math.max(to - from, 1), height: model.bottom - model.top, tabindex: index === tabIndex ? '0' : '-1', role: 'button', 'aria-label': label });
    hits.push(hit);
    hit.addEventListener('mouseenter', () => show(entry));
    hit.addEventListener('focus', () => show(entry));
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('click', () => onSelect?.(entry.fileName));
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(entry.fileName); return; }
      const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: hits.length - 1 }[event.key];
      if (to !== undefined) { event.preventDefault(); moveFocus(index, to); }
    });
    chart.append(hit);
  });

  const wrap = html('div', 'trend-chart-wrap');
  wrap.append(chart, tooltip);
  container.replaceChildren(legend, wrap);
}
