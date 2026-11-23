import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findDuplicateSelectorsAcrossFiles, findImportantWithoutReason, findLiteralColors, importedFiles } from '../scripts/css-structure';

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
