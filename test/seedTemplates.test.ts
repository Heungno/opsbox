import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/* 기본 템플릿(seeds/templates.json) 내용 검사 */
const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seeds', 'templates.json'), 'utf8'));

test('기본 Windows 조각은 PS 5 전용 ::new()와, PS 2.0에서 버전 안내 전에 문법 오류를 내는 -in 등을 쓰지 않는다', () => {
  for (const seed of seeds.filter((t: any) => t.os === 'Windows')) {
    assert.doesNotMatch(seed.content, /::new\(|\s-(not)?in\s|^\s*class\s|^\s*using\s/m, `${seed.id}`);
  }
});

test('기본 템플릿 id는 겹치지 않는다', () => {
  const ids = seeds.map((t: any) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});
