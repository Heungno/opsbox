import { TEST_ROOT } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

/*
 * 재구성 전 OpsBox가 만든 DB(user_version 0, 예전 테이블)를 열면
 * SQLite 오류 대신 무엇을 해야 하는지 알려 주고 멈춰야 합니다.
 */
test('예전 구조의 DB는 알아볼 수 있는 안내와 함께 시작을 멈춘다', () => {
  const dir = path.join(TEST_ROOT, 'legacy-db');
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'opsbox.db');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec('CREATE TABLE templates (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL)');
  legacy.close();

  const run = spawnSync(process.execPath, ['--no-warnings', '--import', 'tsx', '-e', "require('./src/db')"],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, OPSBOX_DB_PATH: dbPath, OPSBOX_LOG_DIR: path.join(dir, 'logs') }, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /이전 버전 OpsBox가 만든 DB입니다/);
  assert.match(run.stderr, /백업한 뒤 지우고/);
  assert.doesNotMatch(run.stderr, /already exists/);
});
