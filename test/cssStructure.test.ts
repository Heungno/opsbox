import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findDuplicateSelectorsAcrossFiles, findImportantWithoutReason, findLiteralColors, importedFiles, parseRules } from '../scripts/css-structure';

test('직접 색 찾기: 토큰 블록 안 선언은 허용', () => {
  const css = ':root { --ink: #16212b; }\n.a { color: #fff; border-color: var(--ink); background: transparent; }';
  assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: true }).map((c) => c.value), ['#fff']);
  assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: false }).map((c) => c.value), ['#16212b', '#fff']);
});

test('직접 색 찾기: rgb()·색 이름도, 주석·url·토큰 color-mix는 아님', () => {
  const css = '/* #abc */\n.a { color: rgb(1, 2, 3); background: url("x.svg#red"); fill: white; outline-color: color-mix(in srgb, var(--ok) 10%, transparent); }';
  assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: false }).map((c) => [c.line, c.value]), [[2, 'rgb(1, 2, 3)'], [2, 'white']]);
});

test('!important는 이유 주석이 있어야', () => {
  assert.deepEqual(findImportantWithoutReason('[hidden] { display: none !important; } /* hidden 속성 강제 */\n.b { color: red !important; }'), [2]);
  assert.deepEqual(findImportantWithoutReason('/* 인쇄 강제 */\n.c { color: red !important; }'), []);
});

test('같은 선택자가 두 파일에 있으면 찾는다 (토큰 블록 제외)', () => {
  assert.deepEqual(findDuplicateSelectorsAcrossFiles({ 'a.css': ':root { --x: 1px; }\n.btn, .x { }', 'b.css': ':root[data-theme="dark"] { --x: 2px; }\n@media (max-width: 900px) { .btn { } }' }), [{ selector: '.btn', files: ['a.css', 'b.css'] }]);
});

test('@import 경로', () => {
  assert.deepEqual(importedFiles('@import url("./tokens.css");\n@import "./pages/login.css";\n@import url("../fonts/x/fonts.css");'), ['tokens.css', 'pages/login.css', '../fonts/x/fonts.css']);
});

/*
 * 실제 파일 검사: 디자인 체계 규칙이 앞으로도 지켜지는지
 */
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = path.join(__dirname, '..', 'src', 'public');
const CSS_DIR = path.join(PUBLIC, 'shared', 'css');
const listFiles = (dir: string, ext: RegExp): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name), ext) : ext.test(entry.name) ? [path.join(dir, entry.name)] : []));
/** shared/css 아래 CSS: 상대 경로('pages/x.css') → 내용 */
const readCssTree = (): Record<string, string> => Object.fromEntries(listFiles(CSS_DIR, /\.css$/)
  .map((file) => [path.relative(CSS_DIR, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')]));

test('실제 CSS: 토큰 파일 밖 직접 색 0, 이유 없는 !important 0, 파일 간 중복 선택자 0, 모든 파일을 app.css가 불러옴', () => {
  const files = readCssTree();
  for (const [file, css] of Object.entries(files)) {
    assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: file === 'tokens.css' }), [], file);
    assert.deepEqual(findImportantWithoutReason(css), [], file);
  }
  assert.deepEqual(findDuplicateSelectorsAcrossFiles(files), []);
  assert.deepEqual(importedFiles(files['app.css']).sort(), Object.keys(files).filter((file) => file !== 'app.css').sort());
  assert.match(files['app.css'], /^(\s*@import[^\n]*\n?|\s*\/\*[\s\S]*?\*\/\s*)*$/, 'app.css는 @import만');
});

test('인쇄 CSS: 직접 색은 :root 토큰 블록에만, 인쇄 토큰 블록이 맨 위, 공통 선택자 재정의는 @media print 안에서만', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'reports', 'report-print.css'), 'utf8');
  assert.deepEqual(findLiteralColors(css, { allowInTokenBlocks: true }), []);
  const rules = parseRules(css);
  assert.equal(rules[0].selector, ':root', '첫 규칙은 인쇄 토큰 블록');
  assert.match(rules[0].body, /--print-ink:/);
  // @media print 밖에 둘 수 있는 것: 인쇄 토큰 블록, 화면에서 인쇄 전용 요소를 숨기는 .print-only
  const outside = rules.filter((rule) => !rule.atRules.some((at) => at.startsWith('@media print')) && !rule.atRules.some((at) => at.startsWith('@page')) && !rule.selector.includes('@bottom'));
  assert.deepEqual(outside.map((rule) => rule.selector), [':root', '.print-only']);
});

test('예전 별칭 토큰(--primary, --bg, --text-light, --card-bg, --border, --success, --danger, --warning 등)은 어디에도 없다', () => {
  const ALIASES = ['primary', 'primary-hover', 'primary-bright', 'bg', 'card-bg', 'text', 'text-light', 'border', 'success', 'success-bg', 'danger', 'danger-light', 'warning',
    'surface-muted', 'surface-soft', 'control-bg', 'page-glow', 'shadow-card', 'badge-bg', 'badge-fg', 'badge-border'];
  const pattern = new RegExp(`--(?:${ALIASES.join('|')})(?![\w-])`);
  const offenders = listFiles(PUBLIC, /\.(css|js|html)$/).filter((file) => pattern.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(PUBLIC, file));
  assert.deepEqual(offenders, []);
});

test('HTML에 고정 인라인 스타일(style="…", <style>)이 없다', () => {
  const offenders = listFiles(PUBLIC, /\.html$/).filter((file) => /\sstyle="|<style[\s>]/.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(PUBLIC, file));
  assert.deepEqual(offenders, []);
});
