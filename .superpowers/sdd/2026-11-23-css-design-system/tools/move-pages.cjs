// node move-pages.cjs <css폴더>  — legacy.css 규칙을 화면 파일·components·layout으로 나누고, 안 쓰는 규칙은 지움
const fs = require('fs'); const path = require('path');
const { units, render } = require('./cssmove.cjs'); const { removeSelectors } = require('./remove.cjs');
const { pagesFor } = require('./classify.cjs');
const dir = path.resolve(process.argv[2]);
const legacy = fs.readFileSync(path.join(dir, 'legacy.css'), 'utf8');
const core = (s) => s.replace(/^:root(\[[^\]]*\])?\s*/, '');
// 정규식 조각에서 [.]은 점, [[.]-]는 이름 글자
const re = (list, anywhere = true) => new RegExp(list.map((p) => `${anywhere ? "(^|[^a-zA-Z0-9_-])" : "^(body)?"}${p.replaceAll('[[.]-]', '[a-zA-Z0-9_-]')}(?![a-zA-Z0-9_-])`).join('|'));
// 지울 것: 선택자의 클래스·id 이름이 하나도 HTML/JS에 없는 규칙 (아래 where). JS가 이어 붙여 만드는 이름(trend-${key}, syntax-${type})은 앞부분이 남아 있어 안 지워짐
const COMPONENTS = re(['[.]template-(workspace|list-panel|list|list-item|editor-panel|management-page|filters)', '[.]check-builder-warning', '[.]server-badge',
  '[.]webtob-console-output', '[.]account-[[.]-]+', '[.]script-template-picker', '#db-query-template-select'], false);
const LAYOUT = re(['#current-user-avatar'], false);
// 이름이 경로 글자(/dashboard)나 여러 화면 글자에 섞여 자동 판정이 틀리는 것: 실제 쓰는 화면을 직접 지정
const OVERRIDE = [[re(['[.]server-table', '#health-summary', '[.]trend-[[.]-]+'], false), 'reports'], [re(['[.]num'], false), 'dashboard'],
  [re(['[.]dashboard'], false), 'servers']];
const PAGES = ['dashboard', 'reports', 'servers', 'policy', 'scripts', 'common-codes', 'result-collection', 'audit-logs', 'account', 'login'];
const TITLES = { dashboard: '대시보드', reports: '점검 보고서 (목록·상세)', servers: '서버 관리 (목록·상세·서버 창)', policy: '점검 정책 관리', scripts: '스크립트 관리',
  'common-codes': '공통코드 관리', 'result-collection': '결과 수집', 'audit-logs': '변경 이력', account: '내 정보', login: '로그인' };
function where(u) {
  if (u.raw) return 'raw';
  const s = core(u.selector);
  if (LAYOUT.test(s)) return 'layout';
  if (COMPONENTS.test(s)) return 'components';
  for (const [r, p] of OVERRIDE) if (r.test(s)) return p;
  const { pages, any = [] } = pagesFor(u.selector);
  if (pages[0] !== '?' && !any.length) return 'dead';
  if (pages.length === 1 && PAGES.includes(pages[0])) return pages[0];
  const used = any.filter((p) => p !== 'shared');
  if (used.length === 1 && PAGES.includes(used[0])) return used[0];
  // 여러 화면에 걸친 이름과 어디에도 없는 이름이 섞인 것(.policy-item-card .section-header): 없는 이름 때문에 맞을 수 없음
  const { names } = pagesFor(u.selector);
  if (names.some((n) => !pagesFor(`.${n}`).any.length && !pagesFor(`#${n}`).any.length)) return 'dead';
  return `?${any.join('+')}`;
}
const us = units(legacy); const buckets = {};
for (const u of us) (buckets[where(u)] ??= []).push(u);
for (const [k, v] of Object.entries(buckets)) console.log(`${k}: ${v.length}`);
const unknown = Object.keys(buckets).filter((k) => k.startsWith('?') || k === 'raw');
const show = process.argv[3] === '--show' ? ['dead', 'components', 'layout', ...unknown] : unknown;
for (const k of show) console.log(`\n## ${k}\n` + buckets[k].map((u) => u.raw ? u.raw.slice(0, 80) : `${u.media} ${u.selector}`).join('\n'));
if (process.argv[3] !== '--write') process.exit(0);
fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
for (const p of PAGES) if (buckets[p]) fs.writeFileSync(path.join(dir, 'pages', `${p}.css`), `/* ${TITLES[p]} 화면에서만 쓰는 규칙 */\n\n${render(buckets[p])}`);
const append = (file, list, title) => list && fs.appendFileSync(path.join(dir, file), `\n/* ---------- ${title} ---------- */\n\n${render(list)}`);
append('components.css', buckets.components, '여러 화면이 함께 쓰는 부품: 목록·편집 작업 공간, 서버 배지, 콘솔 출력, 계정 카드, 템플릿 고르기');
append('layout.css', buckets.layout, '사이드바 사용자 칸 아바타');
const moved = new Set(us.filter((u) => !u.raw && !where(u).startsWith('?')).map((u) => `${u.media}\u0000${u.selector}`));
fs.writeFileSync(path.join(dir, 'legacy.css'), removeSelectors(legacy, (m, s) => moved.has(`${m}\u0000${s.replace(/\s+/g, ' ')}`)));
