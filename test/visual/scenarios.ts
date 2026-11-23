/*
 * 모양 비교에서 찍을 화면·상태 목록
 * 모든 화면 × 밝은/다크 × 너비 4가지 + 페이지를 열기만 해서는 안 보이는 상태(hover·대화상자·알림 등)
 */
import type { Page } from 'puppeteer-core';

import { PAGES } from '../../src/shared/pages';

export type Theme = 'light' | 'dark';
export type Width = 1440 | 1024 | 768 | 390;

export interface Scenario {
  name: string;
  /** '{REPORT:WEB-01}'은 그 서버의 최신 보고서 상세 주소로 바뀝니다. */
  url: string;
  theme: Theme;
  width: Width;
  print?: boolean;
  /** 로그인하지 않은 상태로 엽니다. */
  anonymous?: boolean;
  /** 열기 전에 localStorage에 넣을 값 */
  storage?: Record<string, string>;
  prepare?: (page: Page) => Promise<void>;
}

const THEMES: Theme[] = ['light', 'dark'];
const WIDTHS: Width[] = [1440, 1024, 768, 390];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 화면 주소 하나 (화면마다 대표 주소) */
function pageUrls(): { name: string; url: string }[] {
  return PAGES.flatMap((page) => {
    const name = page.file.split('/').pop()!.replace('.html', '');
    if (name === 'report-detail') return [{ name, url: '{REPORT:WEB-01}' }];
    if (name === 'server-detail') return [{ name: 'server-detail-web', url: '/settings/server-management?id=WEB-01' }, { name: 'server-detail-db', url: '/settings/server-management?id=DB-02' }];
    return [{ name, url: page.paths[0] }];
  });
}

/** 페이지를 열기만 해서는 안 보이는 상태 (넓은 화면, 밝은·다크) */
const STATES: Omit<Scenario, 'theme' | 'width'>[] = [
  { name: 'server-detail-policy-tab', url: '/settings/server-management?id=DB-02', prepare: async (page) => { await page.click('[data-server-tab="policy"]'); await wait(400); } },
  { name: 'server-detail-scripts-tab', url: '/settings/server-management?id=WEB-01', prepare: async (page) => { await page.click('[data-server-tab="scripts"]'); await wait(400); } },
  { name: 'server-edit-dialog', url: '/settings/server-management?id=WEB-01', prepare: async (page) => { await page.click('#btn-edit-server'); await wait(400); } },
  { name: 'sidebar-collapsed', url: '/dashboard', storage: { 'sidebar-collapsed': 'true' } },
  { name: 'hover-focus-disabled', url: '/servers', prepare: async (page) => {
    await page.evaluate(() => { const buttons = [...document.querySelectorAll('button.btn')] as HTMLButtonElement[]; buttons.at(-1)!.disabled = true; });
    await page.hover('button.btn');
    const input = await page.$('input:not([type=hidden]):not([type=checkbox])');
    await input?.focus();
    await wait(300);
  } },
  { name: 'hover-table-row', url: '/servers', prepare: async (page) => { await page.hover('tbody tr'); await wait(300); } },
  { name: 'toast', url: '/dashboard', prepare: async (page) => {
    await page.evaluate(() => { const api = (window as unknown as { opsboxApi: { showToast(m: string, t: string, o: object): void } }).opsboxApi; api.showToast('기준 알림', 'success', { duration: 600000 }); api.showToast('기준 오류', 'error', { duration: 600000 }); });
    await wait(500);
  } },
  { name: 'result-path-error', url: '/settings/result-collection', prepare: async (page) => {
    await page.$eval('#result-path-linux', (input) => { (input as HTMLInputElement).value = 'relative/dir'; });
    await page.click('#result-path-form button[type="submit"]');
    // 누른 뒤 마우스가 버튼 위에 남으면 hover 색이 찍힐 때마다 달라져서 치웁니다
    await page.mouse.move(0, 0);
    await wait(800);
  } },
  { name: 'empty-report-list', url: '/reports', prepare: async (page) => {
    await page.type('#server-search', 'NO-SUCH-SERVER');
    await wait(800);
  } },
  { name: 'login', url: '/login', anonymous: true },
];

/** 좁은 화면에서 메뉴를 연 상태 */
const MOBILE_STATES: Omit<Scenario, 'theme' | 'width'>[] = [
  { name: 'mobile-menu-open', url: '/dashboard', prepare: async (page) => { await page.click('#sidebar-toggle'); await wait(400); } },
];

export function scenarios(): Scenario[] {
  const list: Scenario[] = [];
  for (const theme of THEMES) {
    for (const width of WIDTHS) for (const page of pageUrls()) list.push({ ...page, name: `${page.name}-${theme}-${width}`, theme, width });
    for (const state of STATES) list.push({ ...state, name: `${state.name}-${theme}-1440`, theme, width: 1440 });
    for (const state of MOBILE_STATES) list.push({ ...state, name: `${state.name}-${theme}-390`, theme, width: 390 });
    list.push({ name: `report-print-${theme}`, url: '{REPORT:WEB-01}', theme, width: 1024, print: true });
  }
  return list;
}
