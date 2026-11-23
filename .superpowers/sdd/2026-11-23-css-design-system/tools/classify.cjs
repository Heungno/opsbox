// node classify.cjs → legacy.css 단위마다 어느 화면이 쓰는지
const fs = require('fs'); const path = require('path');
const { units } = require('./cssmove.cjs');
const PUB = path.resolve(__dirname, '../../../../src/public');
const GROUPS = {
  dashboard: ['dashboard'], reports: ['reports'], servers: ['settings/server-management', 'shared/fragments/server-modal.html'],
  policy: ['settings/policy-management'], scripts: ['settings/script-management', 'shared/fragments/script-template-picker-modal.html'],
  'common-codes': ['settings/common-code-management', 'shared/fragments/common-code-category-modal.html', 'shared/fragments/common-code-entry-modal.html', 'shared/fragments/common-code-group-modal.html'],
  'result-collection': ['settings/result-collection'], 'audit-logs': ['settings/audit-logs'], account: ['account'], login: ['login.html', 'login.js'],
  shared: ['shared/js', 'shared/fragments/layout.html'],
};
const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : /\.(html|js)$/.test(p) ? [p] : [];
const text = Object.fromEntries(Object.entries(GROUPS).map(([g, ps]) => [g, ps.flatMap((p) => fs.existsSync(path.join(PUB, p)) ? walk(path.join(PUB, p)) : []).map((f) => fs.readFileSync(f, 'utf8')).join('\n')]));
const has = (g, name) => new RegExp(`(?<![\w-])${name.replace(/[-]/g, '\-')}(?![\w-])`).test(text[g]);
function pagesFor(selector) {
  const names = [...selector.replace(/^:root(\[[^\]]*\])?\s*/, '').replace(/\[[^\]]*\]/g, '').replace(/:not\([^)]*\)/g, '').matchAll(/[.#]([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  if (!names.length) return { names, pages: ['?'] };
  return { names, pages: Object.keys(GROUPS).filter((g) => names.every((n) => has(g, n))), any: Object.keys(GROUPS).filter((g) => names.some((n) => has(g, n))) };
}
module.exports = { pagesFor };
if (require.main === module) {
  const us = units(fs.readFileSync(process.argv[2] ?? path.join(PUB, 'shared/css/legacy.css'), 'utf8'));
  const tally = {};
  for (const u of us) {
    if (u.raw) { console.log('RAW', (u.at || u.raw).slice(0, 60)); continue; }
    const { pages, any } = pagesFor(u.selector);
    const key = pages.join('+') || `NONE(any:${(any || []).join('+')})`;
    (tally[key] ??= []).push(`${u.media ? u.media + ' ' : ''}${u.selector}`);
  }
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n## ${k} (${v.length})`);
    if (!/^(dashboard|reports|servers|policy|scripts|common-codes|result-collection|audit-logs|account|login)$/.test(k)) console.log(v.join('\n'));
  }
}
