/*
 * 모든 시나리오에서 요소마다 각 속성의 cascade 승자 선언을 모읍니다 (CDP).
 * 결과: winners.json = { "<file>": { used: ["line:col", ...], matchedRules: ["line:col", ...] } }
 * 상태: 기본 + hover 강제 + focus 강제 (모든 요소에)
 * 사용: node --import tsx winners.ts [--only=substr] [--files=layout.css,base.css]
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Page, CDPSession } from 'puppeteer-core';

import { startApp } from '../../../../test/e2e/helpers/app';
import { launch, openSession } from '../../../../test/e2e/helpers/browser';
import { scenarios, type Scenario } from '../../../../test/visual/scenarios';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const match = args.find((a) => a.startsWith('--match='))?.slice(8);
const files = (args.find((a) => a.startsWith('--files='))?.slice(8) ?? 'layout.css').split(',');
const OUT = path.join(__dirname, 'winners.json');

type Used = Record<string, { used: Set<string>; matchedRules: Set<string> }>;
const result: Used = Object.fromEntries(files.map((f) => [f, { used: new Set<string>(), matchedRules: new Set<string>() }]));
const longhandCache = new Map<string, string[]>();

async function longhandsOf(page: Page, name: string): Promise<string[]> {
  if (name.startsWith('--')) return [name];
  if (!longhandCache.has(name)) {
    const list = await page.evaluate((prop) => {
      const el = document.createElement('div');
      el.style.setProperty(prop, 'initial');
      const out: string[] = [];
      for (let i = 0; i < el.style.length; i++) out.push(el.style[i]);
      return out;
    }, name);
    longhandCache.set(name, list.length ? list : [name]);
  }
  return longhandCache.get(name)!;
}

async function winnersFor(page: Page, sheets: Record<string, string>, matches: any[], inline?: any) {
  // 속성 → {normal, important} 승자 [file, key]
  const normal = new Map<string, [string, string] | null>();
  const important = new Map<string, [string, string] | null>();
  for (const match of matches) {
    const rule = match.rule;
    const file = rule.origin === 'regular' ? sheets[rule.style.styleSheetId] : undefined;
    const tracked = file && result[file];
    if (tracked && rule.style.range) tracked.matchedRules.add(`${rule.style.range.startLine}:${rule.style.range.startColumn}`);
    for (const prop of rule.style.cssProperties) {
      if (!prop.range || prop.disabled) continue;
      const key: [string, string] | null = tracked ? [file!, `${prop.range.startLine}:${prop.range.startColumn}`] : null;
      const isImportant = /!\s*important/i.test(prop.text ?? '');
      for (const longhand of await longhandsOf(page, prop.name)) (isImportant ? important : normal).set(longhand, key);
    }
  }
  if (inline) for (const prop of inline.cssProperties ?? []) {
    if (!prop.range) continue;
    const isImportant = /!\s*important/i.test(prop.text ?? '');
    for (const longhand of await longhandsOf(page, prop.name)) (isImportant ? important : normal).set(longhand, null);
  }
  for (const [prop, key] of normal) {
    const winner = important.has(prop) ? important.get(prop) : key;
    if (winner) result[winner[0]].used.add(winner[1]);
  }
  for (const [, key] of important) if (key) result[key[0]].used.add(key[1]);
}

async function analyze(page: Page, cdp: CDPSession, sheets: Record<string, string>, forced: string[]) {
  const doc: any = await cdp.send('DOM.getDocument', { depth: -1 });
  const nodes: number[] = [];
  const walk = (node: any) => {
    if (node.nodeType === 1 && !['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'TEMPLATE'].includes(node.nodeName)) nodes.push(node.nodeId);
    for (const child of node.children ?? []) walk(child);
  };
  walk(doc.root);
  if (forced.length) await Promise.all(nodes.map((nodeId) => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced }).catch(() => {})));
  const all: any[] = await Promise.all(nodes.map((nodeId) => cdp.send('CSS.getMatchedStylesForNode', { nodeId }).catch(() => null)));
  for (const m of all) {
    if (!m) continue;
    await winnersFor(page, sheets, m.matchedCSSRules ?? [], m.inlineStyle);
    for (const pseudo of m.pseudoElements ?? []) await winnersFor(page, sheets, pseudo.matches ?? []);
  }
  if (forced.length) await Promise.all(nodes.map((nodeId) => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {})));
}

async function resolveUrl(page: Page, baseUrl: string, url: string) {
  const match = /^\{REPORT:(.+)\}$/.exec(url);
  if (!match) return url;
  const reports = await page.evaluate(async (base) => (await (await fetch(`${base}/api/reports`)).json()).data, baseUrl);
  const report = reports.find((item: { serverId: string }) => item.serverId === match[1]);
  return `/reports/detail?serverId=${match[1]}&file=${encodeURIComponent(report.fileName)}`;
}

async function run(browserPage: () => Promise<Page>, baseUrl: string, scenario: Scenario) {
  const page = await browserPage();
  try {
    await page.setViewport({ width: scenario.width, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scenario.theme }]);
    const storage = { 'opsbox-theme': scenario.theme, 'sidebar-collapsed': 'false', ...scenario.storage };
    await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn');
    await page.evaluateOnNewDocument((values: Record<string, string>) => { for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v); }, storage);
    await page.goto(`${baseUrl}/api/health`);
    const url = await resolveUrl(page, baseUrl, scenario.url);
    const cdp = await page.createCDPSession();
    const sheets: Record<string, string> = {};
    cdp.on('CSS.styleSheetAdded', (e: any) => { sheets[e.header.styleSheetId] = (e.header.sourceURL as string).split('?')[0].split('/').pop()!; });
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    await page.goto(`${baseUrl}${url}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 600));
    if (scenario.prepare) await scenario.prepare(page);
    if (scenario.print) await page.emulateMediaType('print');
    await new Promise((r) => setTimeout(r, 200));
    await analyze(page, cdp, sheets, []);
    await analyze(page, cdp, sheets, ['hover']);
    await analyze(page, cdp, sheets, ['focus', 'focus-visible', 'focus-within']);
  } finally {
    await page.close();
  }
}

(async () => {
  const list = scenarios().filter((s) => (!only || s.name.includes(only)) && (!match || new RegExp(match).test(s.name)));
  const app = await startApp();
  const session = await openSession(app.baseUrl);
  const anonymous = await launch();
  try {
    for (const [i, scenario] of list.entries()) {
      process.stdout.write(`\r${i + 1}/${list.length} ${scenario.name}`.padEnd(70));
      await run(() => (scenario.anonymous ? anonymous : session.browser).newPage(), app.baseUrl, scenario);
    }
  } finally {
    await anonymous.close(); await session.browser.close(); await app.stop();
  }
  const prev = fs.existsSync(OUT) && only ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const out = Object.fromEntries(Object.entries(result).map(([f, r]) => [f, {
    used: [...new Set([...(prev[f]?.used ?? []), ...r.used])],
    matchedRules: [...new Set([...(prev[f]?.matchedRules ?? []), ...r.matchedRules])],
  }]));
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('\n' + Object.entries(out).map(([f, r]) => `${f}: used ${r.used.length}, matched rules ${r.matchedRules.length}`).join('\n'));
})();
