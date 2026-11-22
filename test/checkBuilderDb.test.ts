import { makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';

import type { BuilderSpec } from '../src/features/scripts/check-builder/types';
import { getPolicies, savePolicy } from '../src/features/policies/service';
import { generateScript } from '../src/features/scripts/service';
import { createServer, getServer, updateCheckConfig } from '../src/features/servers/service';

/*
 * 점검 만들기: DB 정책 항목도 스크립트에 조립되고, DB 쿼리 실행기는 SQL 항목만 받는다.
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';
const work = makeDir('cb-db');
const fakeBin = makeDir('cb-db', 'bin');
const bashPath = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || '/bin/bash';
fs.writeFileSync(path.join(fakeBin, 'psql'), `#!${bashPath}\nprintf '%s\\n' '__OPSBOX_STATUS\tserverName\tversion\tedition\tdatabaseName\tstate\trecoveryModel\tdataSizeMB' 'Healthy\tpg\t16\tPostgreSQL\tapp\tONLINE\tPRIMARY\t1.00'\n`);
fs.chmodSync(path.join(fakeBin, 'psql'), 0o755);
const backup = path.join(work, 'pg.conf.bak');
fs.writeFileSync(backup, 'x');

const freshness: BuilderSpec = { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24 };
const builderItem = (id: string, name: string) => ({ id, name, enabled: true, executor: { type: 'CHECK_BUILDER', options: { builder: freshness } }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } });
const LINUX_ITEM = 'CUSTOM_DB00000000000001';
const LINUX_ONLY = 'CUSTOM_DB00000000000002';
const WIN_ITEM = 'CUSTOM_DB00000000000003';

// Linux DB 정책: 쿼리 항목 + 점검 만들기 항목
const linuxDb = getPolicies().find((policy) => policy.id === 'linux-db-default')!;
savePolicy({ ...linuxDb, items: [...linuxDb.items, builderItem(LINUX_ITEM, '설정 파일 백업')] } as any, linuxDb.id);
// 점검 만들기 항목만 있는 Linux DB 정책
savePolicy({ name: '빌더 전용 DB 정책', os: 'Linux', category: 'DB', enabled: true, items: [builderItem(LINUX_ONLY, '설정 파일 백업만')] } as any);
const builderOnly = getPolicies().find((policy) => policy.name === '빌더 전용 DB 정책')!;
// Windows DB 정책(MSSQL)
const windowsDb = getPolicies().find((policy) => policy.id === 'windows-db-default')!;
savePolicy({ ...windowsDb, items: [...windowsDb.items, builderItem(WIN_ITEM, 'MSSQL 설정 백업')] } as any, windowsDb.id);

const server = (id: string, os: 'Linux' | 'Windows', product: string, policyId: string) => createServer({
  id, name: id, type: 'DB', roles: ['DB'], products: { DB: product }, os, ip: '10.0.0.50',
  policyIds: { BASIC: `${os.toLowerCase()}-basic-default`, DB: policyId }, processes: [], directories: [],
} as any);
server('LNX-DBCB', 'Linux', 'PostgreSQL', 'linux-db-default');
server('LNX-DBCB2', 'Linux', 'PostgreSQL', builderOnly.id);
server('WIN-DBCB', 'Windows', 'MSSQL', 'windows-db-default');

// 서버 점검 설정 저장 (쿼리 템플릿·접속 대상 없이 저장되어야 함 — 실패하면 모듈 로드에서 오류)
updateCheckConfig('LNX-DBCB', { ...getServer('LNX-DBCB'), roleChecks: { DB: ['DB_INSTANCE_STATUS', LINUX_ITEM] }, rolePolicySettings: { [LINUX_ITEM]: { inputs: { paths: backup } } } } as any);
updateCheckConfig('LNX-DBCB2', { ...getServer('LNX-DBCB2'), roleChecks: { DB: [LINUX_ONLY] }, rolePolicySettings: { [LINUX_ONLY]: { inputs: { paths: backup } } } } as any);
updateCheckConfig('WIN-DBCB', { ...getServer('WIN-DBCB'), roleChecks: { DB: ['DB_INSTANCE_STATUS', WIN_ITEM] }, rolePolicySettings: { DB_INSTANCE_STATUS: { instanceTargets: ['localhost,1433'] }, [WIN_ITEM]: { inputs: { paths: 'D:\\backup\\mssql.bak' } } } } as any);

test('DB 점검 만들기 항목은 쿼리 템플릿·접속 대상 없이 서버 점검 설정에 저장된다', () => {
  // 정책을 지정하면 정책의 활성 항목 전체가 점검 항목(기존 동작) — 점검 만들기 항목도 포함
  assert.ok(getServer('LNX-DBCB')!.roleChecks?.DB?.includes(LINUX_ITEM));
});

test('Linux 스크립트에 쿼리 실행기와 점검 만들기 조각이 모두 들어가고, 쿼리 목록에는 빌더 항목이 없다', () => {
  const script = generateScript('LNX-DBCB');
  assert.match(script, /DB 공통 쿼리 실행기 시작/);
  assert.match(script, /# 점검 만들기 · 설정 파일 백업 \(자동 생성/);
  const queryItems = /OPSBOX_DB_QUERY_ITEMS=\(([^)]*)\)/.exec(script)?.[1] ?? '';
  assert.match(queryItems, /DB_INSTANCE_STATUS/);
  assert.doesNotMatch(queryItems, new RegExp(LINUX_ITEM));
});

test('점검 만들기 항목만 있는 DB 정책에는 쿼리 실행기를 넣지 않는다', () => {
  const script = generateScript('LNX-DBCB2');
  assert.doesNotMatch(script, /DB 공통 쿼리 실행기 시작/);
  assert.match(script, /# 점검 만들기 · 설정 파일 백업만/);
});

test('Windows MSSQL 스크립트도 만들어지고 빌더 항목은 쿼리를 찾지 않는다', () => {
  const script = generateScript('WIN-DBCB');
  assert.match(script, /OpsBoxCb1-Item-CUSTOM_DB00000000000003/);
});

let json: any;
before(() => {
  if (!canRunBash) return;
  const scriptPath = path.join(work, 'LNX-DBCB.sh');
  fs.writeFileSync(scriptPath, generateScript('LNX-DBCB'));
  const run = spawnSync('bash', [scriptPath, work], { cwd: work, encoding: 'utf8', timeout: 60_000, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  json = JSON.parse(fs.readFileSync(/Result JSON: (.+)$/m.exec(run.stdout)![1], 'utf8'));
});

test('실행하면 DB 항목 목록에 쿼리 항목과 점검 만들기 항목 결과가 함께 나온다', { skip: !canRunBash }, () => {
  const items = json.checks.rolePolicies.DB.items;
  assert.equal(items[0].item, 'DB_INSTANCE_STATUS');
  assert.equal(items[0].status, 'Healthy');
  const builder = items.find((item: any) => item.item === LINUX_ITEM);
  assert.equal(builder.status, 'Healthy');
  assert.equal(builder.detail.rows[0].target, backup);
});
