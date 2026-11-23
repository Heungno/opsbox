import './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { PAGE_PATHS, PUBLIC_ROOT } from '../src/shared/pages';

/*
 * 화면 JS가 만드는 화면 이동 주소(href·location.href)가 실제 있는 화면 주소인지,
 * 쿼리 이름이 깨지지 않았는지(예: state.serverId=) 확인
 */
function publicScripts(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return publicScripts(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const LINK = /[hH]ref\s*=\s*[`'"](\/[^`'"?#$]*)(\?[^`'"]*)?[`'"]/g;

const links = publicScripts(PUBLIC_ROOT).flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(LINK)].map((match) => ({
    where: `${path.relative(PUBLIC_ROOT, file)}: ${match[0]}`,
    pathname: match[1],
    query: match[2] ?? '',
  }));
});

test('화면 JS에서 화면 이동 주소를 찾는다', () => {
  assert.ok(links.length >= 5, `찾은 링크가 너무 적음: ${links.length}`);
});

test('화면 이동 주소는 모두 실제 화면 주소다', () => {
  const broken = links.filter((link) => !PAGE_PATHS.has(link.pathname)).map((link) => link.where);
  assert.deepEqual(broken, []);
});

test('화면 이동 주소의 쿼리 이름은 영문 이름이다', () => {
  const broken = links
    .filter((link) => [...link.query.matchAll(/[?&]([^=&]+)=/g)].some((match) => !/^[A-Za-z]+$/.test(match[1])))
    .map((link) => link.where);
  assert.deepEqual(broken, []);
});
