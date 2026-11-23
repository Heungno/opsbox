/*
 * 시나리오마다 계산된 스타일(JSON)과 전체 페이지 스크린샷(PNG)을 저장합니다.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Browser, Page } from 'puppeteer-core';

import type { Scenario } from './scenarios';
import type { StyleSnapshot } from './style-diff';

/** 비교할 CSS 속성. width·height 값 자체는 글자(시각 등)에 따라 변해서 넣지 않습니다(배치는 스크린샷이 봄). */
export const PROPERTIES = [
  'color', 'background-color', 'background-image',
  ...['top', 'right', 'bottom', 'left'].flatMap((side) => [`border-${side}-color`, `border-${side}-width`, `border-${side}-style`, `padding-${side}`, `margin-${side}`]),
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line',
  'display', 'position', 'gap', 'grid-template-columns', 'flex-direction', 'flex-grow', 'flex-wrap', 'align-items', 'justify-content',
  'box-shadow', 'outline-color', 'outline-style', 'outline-width', 'outline-offset', 'opacity', 'visibility', 'overflow-x', 'white-space', 'word-break', 'cursor',
  'fill', 'stroke',
  // 글자에 따라 안 변하는 크기·위치 (width/height 자체는 글자 길이에 따라 변해서 제외)
  'min-width', 'max-width', 'min-height', 'max-height', 'flex-basis', 'flex-shrink', 'grid-template-rows', 'grid-column-start', 'grid-column-end',
  'top', 'right', 'bottom', 'left', 'z-index', 'transform', 'vertical-align', 'list-style-type', 'text-overflow', 'overflow-y', 'font-style', 'font-variant-numeric', 'font-feature-settings', 'backdrop-filter', 'filter',
];

/** 브라우저 안에서 실행: 요소 경로 → 계산된 스타일 */
function collect(properties: string[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const pathOf = (element: Element): string => {
    const parts: string[] = [];
    for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${node.id}`); break; }
      const parent: Element | null = node.parentElement;
      const index = parent ? [...parent.children].filter((child) => child.tagName === node!.tagName).indexOf(node) : 0;
      parts.unshift(`${node.tagName.toLowerCase()}:${index}`);
    }
    return parts.join('>');
  };
  const read = (style: CSSStyleDeclaration) => Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
  for (const element of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'TEMPLATE', 'NOSCRIPT'].includes(element.tagName)) continue;
    const key = pathOf(element);
    result[key] = read(getComputedStyle(element));
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (style.content && style.content !== 'none' && style.content !== 'normal') result[`${key}${pseudo}`] = { content: style.content, ...read(style) };
    }
  }
  result.body = read(getComputedStyle(document.body));
  return result;
}

async function resolveUrl(page: Page, baseUrl: string, url: string): Promise<string> {
  const match = /^\{REPORT:(.+)\}$/.exec(url);
  if (!match) return url;
  const reports = await page.evaluate(async (base) => (await (await fetch(`${base}/api/reports`)).json()).data, baseUrl);
  const report = reports.find((item: { serverId: string }) => item.serverId === match[1]);
  return `/reports/detail?serverId=${match[1]}&file=${encodeURIComponent(report.fileName)}`;
}

export async function captureScenario(browser: Browser, anonymousBrowser: Browser, baseUrl: string, scenario: Scenario, outDir: string): Promise<void> {
  const page = await (scenario.anonymous ? anonymousBrowser : browser).newPage();
  try {
    await page.setViewport({ width: scenario.width, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: scenario.theme }]);
    const storage = { 'opsbox-theme': scenario.theme, 'sidebar-collapsed': 'false', ...scenario.storage };
    // tsx(esbuild)가 함수에 넣는 이름 도우미 __name을 브라우저에도 둡니다(page.evaluate에 넘긴 함수가 씀)
    await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn');
    await page.evaluateOnNewDocument((values: Record<string, string>) => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, storage);
    await page.goto(`${baseUrl}/api/health`);
    const url = await resolveUrl(page, baseUrl, scenario.url);
    await page.goto(`${baseUrl}${url}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // 글꼴은 font-display: optional — 캐시에 없는 조각은 그 페이지 끝까지 대체 글꼴로 그려 ch 폭·글자 폭이 실행마다 달라집니다.
    // 이 페이지가 쓰는 조각을 한 번 받아 둔 뒤 다시 열어, 항상 IBM Plex Sans KR로 그려진 모양을 찍습니다.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // 애니메이션·전환을 끝난 상태로 (hover 색이 바뀌는 중간에 찍히지 않게)
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (scenario.prepare) await scenario.prepare(page);
    if (scenario.print) await page.emulateMediaType('print');
    await new Promise((resolve) => setTimeout(resolve, 200));
    const styles: StyleSnapshot = await page.evaluate(collect, PROPERTIES);
    fs.writeFileSync(path.join(outDir, `${scenario.name}.json`), JSON.stringify(styles));
    await page.screenshot({ path: path.join(outDir, `${scenario.name}.png`) as `${string}.png`, fullPage: true });
  } finally {
    await page.close();
  }
}
