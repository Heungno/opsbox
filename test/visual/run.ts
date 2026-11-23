/*
 * 화면 모양 비교 명령
 *   baseline  지금 모양을 기준으로 찍음 (test/visual/.out/baseline)
 *   compare   지금 모양을 찍어(.out/current) 기준과 계산된 스타일을 비교, 차이가 있으면 종료 코드 1
 *   report    기준·현재 스크린샷을 나란히 보는 비교 페이지 (.out/report.html)
 * --only=<글자>  이름에 그 글자가 든 시나리오만 (화면 하나 옮길 때 빠르게)
 */
import fs from 'node:fs';
import path from 'node:path';

import { startApp } from '../e2e/helpers/app';
import { launch, openSession } from '../e2e/helpers/browser';
import { captureScenario } from './capture';
import { writeReport } from './report';
import { scenarios } from './scenarios';
import { diffStyles, type StyleDiff } from './style-diff';

const OUT = path.join(__dirname, '.out');
const [command = 'compare', ...args] = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);

async function capture(label: 'baseline' | 'current') {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const list = scenarios().filter((scenario) => !only || scenario.name.includes(only));
  const app = await startApp();
  // 브라우저를 못 띄우면 서버를 닫고 끝냄 (안 닫으면 프로세스가 끝나지 않고 멈춘 것처럼 보임)
  const session = await openSession(app.baseUrl).catch(async (error) => { await app.stop(); throw error; });
  const anonymous = await launch().catch(async (error) => { await session.browser.close(); await app.stop(); throw error; });
  try {
    for (const [index, scenario] of list.entries()) {
      process.stdout.write(`\r${label} ${index + 1}/${list.length} ${scenario.name}`.padEnd(80));
      await captureScenario(session.browser, anonymous, app.baseUrl, scenario, dir);
    }
    process.stdout.write('\n');
  } finally {
    await anonymous.close();
    await session.browser.close();
    await app.stop();
  }
  return list;
}

function compare(names: string[]) {
  const all: Record<string, StyleDiff[]> = {};
  for (const name of names) {
    const read = (label: string) => JSON.parse(fs.readFileSync(path.join(OUT, label, `${name}.json`), 'utf8'));
    if (!fs.existsSync(path.join(OUT, 'baseline', `${name}.json`))) { all[name] = [{ path: '*', property: '*', before: 'no baseline' }]; continue; }
    const diffs = diffStyles(read('baseline'), read('current'));
    if (diffs.length) all[name] = diffs;
  }
  fs.writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(all, null, 1));
  const total = Object.values(all).reduce((sum, diffs) => sum + diffs.length, 0);
  if (!total) { console.log(`계산된 스타일 차이 0 (시나리오 ${names.length}개)`); return 0; }
  console.log(`계산된 스타일 차이 ${total}개 (시나리오 ${Object.keys(all).length}/${names.length}개), 자세히: ${path.join(OUT, 'diff.json')}`);
  for (const [name, diffs] of Object.entries(all).slice(0, 8)) {
    console.log(`- ${name}: ${diffs.length}`);
    for (const diff of diffs.slice(0, 4)) console.log(`    ${diff.path} ${diff.property}: ${diff.before} → ${diff.after}`);
  }
  return 1;
}

async function main() {
  if (command === 'baseline') { await capture('baseline'); return; }
  if (command === 'compare') { const list = await capture('current'); process.exitCode = compare(list.map((s) => s.name)); return; }
  if (command === 'report') { console.log(writeReport(OUT, scenarios().map((s) => s.name))); return; }
  throw new Error(`모르는 명령: ${command}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
