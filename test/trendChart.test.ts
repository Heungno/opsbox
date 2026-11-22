import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

/*
 * 보고서 추세 그래프 그리기: 브라우저 없이 최소한의 DOM 흉내로 구조와 동작을 확인합니다.
 * (실제 모양은 데모 서버 스크린샷으로 따로 확인)
 */
class FakeElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();
  hidden = false;
  private text = '';
  constructor(tag: string) { this.tagName = tag.toLowerCase(); }
  setAttribute(name: string, value: unknown) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value: string) { this.setAttribute('class', value); }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  append(...nodes: Array<FakeElement | string>) { for (const node of nodes) this.children.push(typeof node === 'string' ? Object.assign(new FakeElement('#text'), { text: node }) as FakeElement : node); }
  replaceChildren(...nodes: FakeElement[]) { this.children = []; this.text = ''; this.append(...nodes); }
  addEventListener(type: string, handler: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]); }
  dispatch(type: string, event: any = {}) { for (const handler of this.listeners.get(type) ?? []) handler({ preventDefault() {}, target: this, ...event }); }
  all(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  find(tag: string, cls?: string) { return this.all().filter((node) => node.tagName === tag && (!cls || node.className.split(/\s+/).includes(cls))); }
}

beforeEach(() => {
  (globalThis as any).document = {
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  };
});

const results = [
  { fileName: 'd1.json', checkDate: '2026-11-17 09:00:00', cpu: 10, memory: 40, disk: 60 },
  { fileName: 'd2.json', checkDate: '2026-11-18 09:00:00', cpu: 12, memory: 41, disk: 62 },
  { fileName: 'd3.json', checkDate: '2026-11-19 09:00:00', cpu: 14, memory: 42, disk: 64 },
  { fileName: 'd4.json', checkDate: '2026-11-20 09:00:00', cpu: 16, memory: 43, disk: 66 },
  { fileName: 'd5.json', checkDate: '2026-11-21 09:00:00', cpu: 18, memory: 44, disk: 68 },
];
const render = async (overrides: Record<string, unknown> = {}) => {
  const { renderTrendChart } = await import('../src/public/reports/trend-chart.js');
  const container = new FakeElement('div');
  const selected: string[] = [];
  renderTrendChart(container, { results, endDate: '2026-11-21 09:00:00', days: 28, currentFile: 'd5.json', compareFile: 'd4.json', onSelect: (file: string) => selected.push(file), ...overrides });
  return { container, selected };
};

test('계열마다 선 하나와 결과마다 점, 지금 보고서·비교 점검 점을 구분한다', async () => {
  const { container } = await render();
  assert.equal(container.find('path', 'trend-line').length, 3);
  assert.equal(container.find('circle', 'trend-point').length, 15);
  assert.equal(container.find('circle', 'is-current').length, 3);
  assert.equal(container.find('circle', 'is-compare').length, 3);
});

test('범례와 선 끝 이름표로 색만으로 구분하지 않는다', async () => {
  const { container } = await render();
  const legend = container.find('ul', 'trend-legend')[0];
  assert.match(legend.textContent, /CPU.*메모리.*디스크/);
  assert.equal(container.find('text', 'trend-end-label').length, 3);
});

test('주의·위험 기준선은 글자와 함께 표시한다', async () => {
  const { container } = await render();
  assert.equal(container.find('line', 'trend-threshold').length, 2);
  assert.match(container.textContent, /주의 70%/);
  assert.match(container.textContent, /위험 90%/);
});

test('비교 점검이 기간 밖이면 빈 점 없이 그린다', async () => {
  const { container } = await render({ compareFile: 'old.json', days: 14 });
  assert.equal(container.find('circle', 'is-compare').length, 0);
  assert.equal(container.find('path', 'trend-line').length, 3);
});

test('점은 키보드로 고를 수 있고 Enter로 그 보고서를 연다', async () => {
  const { container, selected } = await render();
  const hit = container.find('rect', 'trend-hit')[1];
  assert.equal(hit.getAttribute('tabindex'), '0');
  assert.match(hit.getAttribute('aria-label') ?? '', /2026-11-18 09:00:00 .*CPU 12%.*메모리 41%.*디스크 62%/);
  hit.dispatch('keydown', { key: 'Enter' });
  hit.dispatch('click');
  assert.deepEqual(selected, ['d2.json', 'd2.json']);
});

test('점에 포커스·마우스를 올리면 값 상자와 세로 안내선을 보이고, 벗어나면 숨긴다', async () => {
  const { container } = await render();
  const tooltip = container.find('div', 'trend-tooltip')[0];
  const guide = container.find('line', 'trend-guide')[0];
  assert.equal(tooltip.hidden, true);
  const hit = container.find('rect', 'trend-hit')[2];
  hit.dispatch('focus');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /2026-11-19 09:00:00/);
  assert.match(tooltip.textContent, /CPU\s*14%/);
  assert.match(tooltip.textContent, /메모리\s*42%/);
  assert.match(tooltip.textContent, /디스크\s*64%/);
  assert.equal(guide.getAttribute('visibility'), 'visible');
  hit.dispatch('blur');
  assert.equal(tooltip.hidden, true);
  assert.equal(guide.getAttribute('visibility'), 'hidden');
  hit.dispatch('mouseenter');
  assert.equal(tooltip.hidden, false);
  hit.dispatch('mouseleave');
  assert.equal(tooltip.hidden, true);
});

test('결과가 1건뿐이면 그래프 대신 안내 문구만 보인다', async () => {
  const { container } = await render({ results: [results[4]] });
  assert.equal(container.find('svg').length, 0);
  assert.match(container.textContent, /추세를 그릴 점검 결과가 부족합니다/);
});

test('사용자 값(파일 이름)은 글자로만 들어가고 HTML로 해석되지 않는다', async () => {
  const { container } = await render({ results: results.map((entry) => ({ ...entry, checkDate: entry.checkDate })), currentFile: '<img src=x onerror=alert(1)>' });
  assert.equal(container.find('img').length, 0);
});
