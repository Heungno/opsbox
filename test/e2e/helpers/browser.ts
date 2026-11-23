/*
 * 브라우저 테스트용 Chromium: OPSBOX_E2E_BROWSER → Termux chromium → 흔한 Chrome·Edge 설치 경로.
 * 없으면 findBrowser()가 undefined를 돌려주고 테스트는 건너뜁니다.
 */
import fs from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const CANDIDATES = [
  '/data/data/com.termux/files/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findBrowser(): string | undefined {
  const configured = process.env.OPSBOX_E2E_BROWSER;
  if (configured) return configured;
  return CANDIDATES.find((candidate) => fs.existsSync(candidate));
}

/** 무시하는 콘솔 오류: 아이콘 없음(404) */
const IGNORED = [/favicon\.ico/];

export interface BrowserSession {
  browser: Browser;
  page: Page;
  /** 페이지 오류와 콘솔 오류 (무시 목록 제외) */
  errors: string[];
  /** 의도한 실패 요청을 만들기 전에 부르면, 그 뒤의 '4xx' 리소스 오류를 기록하지 않습니다. */
  allowHttpErrors(allow: boolean): void;
}

export async function launch(): Promise<Browser> {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('브라우저가 없습니다. OPSBOX_E2E_BROWSER로 경로를 지정하세요.');
  return puppeteer.launch({ executablePath, args: ['--no-sandbox', '--headless=new'] });
}

export async function openSession(baseUrl: string, { login = true } = {}): Promise<BrowserSession> {
  const browser = await launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  let allowHttp = false;
  page.on('pageerror', (error) => errors.push(`pageerror: ${(error as Error).message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = `${message.text()} ${message.location()?.url ?? ''}`;
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    if (allowHttp && /status of 4\d\d/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  if (login) {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.type('#username', 'demo');
    await page.type('#password', 'demo1234');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#login-form button[type="submit"]')]);
  }
  return { browser, page, errors, allowHttpErrors: (allow) => { allowHttp = allow; } };
}

export const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
