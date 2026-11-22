import { TEST_ROOT } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

/*
 * 새로 설치할 때 scripts/create-user.cjs로 계정을 먼저 만들고 OpsBox를 시작해도 DB가 열려야 합니다.
 * (create-user가 users 테이블만 먼저 만들어 둔 상태)
 */
test('계정을 먼저 만든 빈 DB에서도 OpsBox가 스키마·기본값을 준비한다', () => {
  const dir = path.join(TEST_ROOT, 'create-user-first');
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'opsbox.db');
  const pre = new DatabaseSync(dbPath);
  pre.exec('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY COLLATE NOCASE, display_name TEXT, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL)');
  pre.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('admin', '관리자', 's', 'h');
  pre.close();

  const run = spawnSync(process.execPath, ['--no-warnings', '--import', 'tsx', '-e', "const { db } = require('./src/db'); console.log(JSON.stringify({ users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c, templates: db.prepare('SELECT COUNT(*) AS c FROM templates').get().c }))"],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, OPSBOX_DB_PATH: dbPath, OPSBOX_LOG_DIR: path.join(dir, 'logs') }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const counts = JSON.parse(run.stdout.trim().split('\n').at(-1)!);
  assert.equal(counts.users, 1, '먼저 만든 계정 유지');
  assert.ok(counts.templates > 0, '기본 템플릿이 들어감');
});
