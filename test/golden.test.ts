import './helpers/demo-env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { GOLDEN_DIR, collectGolden } from './helpers/golden';

/*
 * 재구성 안전망: 데모 서버의 생성 스크립트와 설정 API 응답이 기준 파일(test/golden)과 같아야 합니다.
 * 기준 파일은 scripts/update-golden.ts 로 만듭니다. 동작을 일부러 바꾼 경우가 아니면 다시 만들지 마세요.
 */
function listGoldenFiles(dir = GOLDEN_DIR, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? listGoldenFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]);
}

test('생성 스크립트와 설정 API 응답이 기준 파일과 같다', async () => {
  const actual = await collectGolden();
  const expectedFiles = listGoldenFiles();
  for (const name of Object.keys(actual)) assert.ok(expectedFiles.includes(name), `기준 파일 없음: ${name}`);
  for (const name of expectedFiles) {
    if (!(name in actual)) continue; // 미사용으로 바뀐 서버의 스크립트·설정은 건너뜀
    const expected = fs.readFileSync(path.join(GOLDEN_DIR, name), 'utf8');
    if (actual[name] === expected) continue;
    const a = actual[name].split('\n'); const e = expected.split('\n');
    const line = a.findIndex((text, index) => text !== e[index]);
    assert.fail(`${name} 다름 (${line + 1}번째 줄)\n  기준: ${e[line]?.slice(0, 300)}\n  실제: ${a[line]?.slice(0, 300)}`);
  }
});
