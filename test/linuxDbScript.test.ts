import { makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';

import { createServer, updateCheckConfig } from '../src/features/servers/service';
import { generateScript } from '../src/services/scriptService';
import { saveTemplate } from '../src/features/templates/service';
import { getHealthStatus, parseResultJson } from '../src/features/results/service';

/*
 * Linux DB 점검 테스트
 * 실제 DB 대신 가짜 psql·mariadb·sqlcmd가 쿼리 내용에 따라 정해진 결과나 오류를 돌려줍니다.
 * 대상 해석, 결과 표(columns/rows) 변환, 상태 판정, 오류 분류(연결 실패/권한 부족)를 확인합니다.
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';
const bashPath = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || '/bin/bash';

const fakeBin = makeDir('fake-bin');
const scriptDir = makeDir('db-scripts');
const argsLog = path.join(makeDir('db-logs'), 'args.log');

function fake(name: string, body: string) {
  const file = path.join(fakeBin, name);
  fs.writeFileSync(file, `#!${bashPath}\nprintf '%s\\n' "${name} $*" >> '${argsLog}'\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

const tsv = (...lines: string[][]) => lines.map((cells) => `printf '%s\\n' '${cells.join('\t')}'`).join('\n');

fake('psql', `
host=''; sql=''
while [ $# -gt 0 ]; do case "$1" in -h) host=$2; shift ;; -c) sql=$2; shift ;; esac; shift; done
if [ "$host" = down.example ]; then echo 'psql: error: connection to server at "down.example" failed: Connection refused' >&2; exit 2; fi
case "$sql" in
  *pg_database*) ${tsv(['__OPSBOX_STATUS', 'serverName', 'version', 'edition', 'databaseName', 'state', 'recoveryModel', 'dataSizeMB'],
    ['Healthy', 'pg-main', '16.4', 'PostgreSQL', 'appdb', 'ONLINE', 'PRIMARY', '12.50'],
    ['Warning', 'pg-main', '16.4', 'PostgreSQL', 'locked "db"', 'NO CONNECT', 'PRIMARY', ''])} ;;
  *pg_stat_activity*) ${tsv(['__OPSBOX_STATUS', 'current_user_sessions', 'configured_max_connections', 'usage_percent'], ['Warning', '75', '97', '77.32'])} ;;
  *pg_ls_waldir*) echo 'ERROR:  permission denied for function pg_ls_waldir' >&2; exit 1 ;;
  *pg_stat_replication*) ${tsv(['__OPSBOX_STATUS', 'role', 'message'], ['NotCollected', 'PRIMARY', '연결된 대기(복제) 서버가 없습니다.'])} ;;
  *) ${tsv(['one'], ['1'])} ;;
esac`);

fake('mariadb', `
echo 'mariadb: Deprecated program name. It will be removed in a future release' >&2
sql=''; while [ $# -gt 0 ]; do case "$1" in -e) sql=$2; shift ;; esac; shift; done
case "$sql" in
  *SCHEMATA*) ${tsv(['__OPSBOX_STATUS', 'serverName', 'version', 'edition', 'databaseName', 'state', 'recoveryModel', 'dataSizeMB'],
    ['Healthy', 'maria01', '10.11.6-MariaDB', 'MariaDB Server', 'shop', 'ONLINE', 'BINLOG OFF', '3.25'])} ;;
  *log_bin*) ${tsv(['__OPSBOX_STATUS', 'binaryLog', 'binlogFormat'], ['Warning', 'OFF', 'MIXED'])} ;;
esac`);

fake('sqlcmd', `
${tsv(['__OPSBOX_STATUS', 'serverName', 'version', 'edition', 'databaseName', 'state', 'recoveryModel', 'dataSizeMB'])}
printf '%s\\n' '-------- ---------- -------'
${tsv(['Healthy', 'MSSQL01', '16.0', 'Developer', 'master', 'ONLINE', 'SIMPLE', '6.00'], ['Critical', 'MSSQL01', '16.0', 'Developer', 'old', 'OFFLINE', 'FULL', '0'])}`);

// CUBRID SHOW 문은 상태 열을 만들 수 없어, 쿼리의 '-- @opsbox-status' 규칙으로 판정합니다.
fake('csql', `
sql=''; while [ $# -gt 0 ]; do case "$1" in -c) sql=$2; shift ;; esac; shift; done
case "$sql" in
  *'JOB QUEUES'*) ${tsv(['Jobq_index', 'Num_total_workers', 'Num_busy_workers', 'Num_connection_workers'], ['0', '10', '8', '2'], ['1', '10', '1', '0'])} ;;
  *'VOLUME HEADER'*) ${tsv(['Volume_id', 'Purpose', 'Num_total_sectors', 'Num_free_sectors', 'Full_name'], ['0', 'Permanent data purpose', '512', '459', '/db/demodb'])} ;;
  *'LOG HEADER'*) printf '%s\\n' "Backup_info_level0\tHa_server_state\tNum_active_log_pages\tNext_archive_num" "'time: N/A'\t'na'\t1000\t12" ;;
  *db_root*) ${tsv(['__OPSBOX_STATUS', 'version', 'edition', 'databaseName', 'state'], ['Healthy', '11.2.0', 'CUBRID', 'demodb', 'ONLINE'])} ;;
esac`);

const linuxServer = (id: string, product: string, roleChecks: string[], extra: Record<string, unknown> = {}) => createServer({
  id, name: id, type: 'DB', roles: ['DB'], products: { DB: product }, os: 'Linux', ip: '10.0.0.20',
  policyIds: { BASIC: 'linux-basic-default' }, roleChecks: { DB: roleChecks }, processes: [], directories: [], ...extra,
} as any);

const custom = saveTemplate({ name: '사용자 쿼리 · 하나', kind: 'QUERY', dbms: 'PostgreSQL', enabled: true, content: 'SELECT 1 AS one' });
linuxServer('LNX-PG', 'PostgreSQL', ['DB_INSTANCE_STATUS', 'DB_PROCESS_LIMIT', 'DB_BACKUP', 'DB_TRANSACTION_LOG', 'DB_REPLICATION', 'DB_CUSTOM_QUERY'], {
  customQueryTemplateIds: [custom.id],
  rolePolicySettings: {
    DB_INSTANCE_STATUS: { instanceTargets: ['down.example', 'localhost:5432/appdb'] },
    DB_PROCESS_LIMIT: { instanceTargets: ['localhost'] },
    DB_BACKUP: { instanceTargets: ['localhost'] },
    DB_TRANSACTION_LOG: { instanceTargets: ['localhost'] },
    DB_REPLICATION: { instanceTargets: ['localhost'] },
    DB_CUSTOM_QUERY: { instanceTargets: ['localhost'] },
  },
});
linuxServer('LNX-MARIA', 'MariaDB', ['DB_INSTANCE_STATUS', 'DB_ARCHIVE_MODE'], { rolePolicySettings: { DB_INSTANCE_STATUS: { instanceTargets: ['/run/mysqld/test.sock'] } } });
linuxServer('LNX-MSSQL', 'MSSQL', ['DB_INSTANCE_STATUS']);
linuxServer('LNX-CUB', 'CUBRID', ['DB_INSTANCE_STATUS', 'DB_PROCESS_LIMIT']);
linuxServer('LNX-CUB2', 'CUBRID', ['DB_INSTANCE_STATUS', 'DB_PROCESS_LIMIT', 'DB_TABLESPACE', 'DB_BACKUP', 'DB_ARCHIVE_MODE', 'DB_TRANSACTION_LOG', 'DB_REPLICATION'], {
  rolePolicySettings: { DB_INSTANCE_STATUS: { instanceTargets: ['demodb@localhost'] } },
});

const results: Record<string, any> = {};

function run(id: string) {
  const scriptPath = path.join(scriptDir, `${id}.sh`);
  fs.writeFileSync(scriptPath, generateScript(id));
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };
  delete env.PGUSER; delete env.SQLCMDUSER;
  const run = spawnSync('bash', [scriptPath, scriptDir], { cwd: scriptDir, encoding: 'utf8', timeout: 60_000, env });
  assert.equal(run.status, 0, `${id} 실행 실패\n${run.stdout}\n${run.stderr}`);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, run.stdout);
  const text = fs.readFileSync(saved, 'utf8');
  results[id] = { text, json: JSON.parse(text) };
}

before(() => {
  if (!canRunBash) return;
  for (const id of ['LNX-PG', 'LNX-MARIA', 'LNX-MSSQL', 'LNX-CUB', 'LNX-CUB2']) run(id);
});

const item = (id: string, name: string) => results[id].json.checks.rolePolicies.DB.items.find((entry: any) => entry.item === name);

test('PostgreSQL: 대상별로 실행하고 연결 실패는 위험, 결과 표와 DB 요약을 남긴다', { skip: !canRunBash }, () => {
  const instance = item('LNX-PG', 'DB_INSTANCE_STATUS');
  assert.equal(instance.status, 'Critical');
  const [down, local] = instance.detail.queries;
  assert.equal(down.target, 'down.example');
  assert.equal(down.status, 'Critical');
  assert.match(down.message, /Connection refused/);
  assert.equal(local.status, 'Warning');
  assert.equal(local.rowCount, 2);
  assert.equal(local.columns[0], '__OPSBOX_STATUS');
  assert.equal(local.rows[1][4], 'locked "db"', '따옴표가 든 값도 그대로');

  const summary = results['LNX-PG'].json.checks.database.detail;
  assert.equal(summary.product, 'PostgreSQL');
  assert.equal(summary.serverName, 'pg-main');
  assert.equal(summary.targetCount, 2);
  assert.equal(summary.databaseCount, 2);
  assert.equal(summary.databases[0].sizeMB, 12.5);

  const log = fs.readFileSync(argsLog, 'utf8');
  assert.match(log, /psql .*-d appdb .*-h localhost -p 5432/);
});

test('PostgreSQL: 권한 부족은 미수집, 쿼리가 돌려준 상태 값을 따른다', { skip: !canRunBash }, () => {
  assert.equal(item('LNX-PG', 'DB_PROCESS_LIMIT').status, 'Warning');
  const wal = item('LNX-PG', 'DB_TRANSACTION_LOG');
  assert.equal(wal.status, 'NotCollected');
  assert.match(wal.detail.queries[0].message, /permission denied/);
  assert.equal(item('LNX-PG', 'DB_REPLICATION').status, 'NotCollected', '상태 값이 NotCollected뿐이면 미수집');
});

test('PostgreSQL: 사용자 쿼리는 이름과 함께 실행 결과를 남긴다', { skip: !canRunBash }, () => {
  const query = item('LNX-PG', 'DB_CUSTOM_QUERY');
  assert.equal(query.status, 'Healthy');
  assert.equal(query.detail.queries[0].name, '사용자 쿼리 · 하나');
  assert.deepEqual(query.detail.queries[0].rows, [['1']]);
});

test('MariaDB: 소켓 대상을 쓰고, 정상 종료 시 stderr 경고는 결과에 섞지 않는다', { skip: !canRunBash }, () => {
  const instance = item('LNX-MARIA', 'DB_INSTANCE_STATUS');
  assert.equal(instance.status, 'Healthy');
  assert.equal(instance.detail.queries[0].rows[0][4], 'shop');
  assert.equal(item('LNX-MARIA', 'DB_ARCHIVE_MODE').status, 'Warning');
  assert.match(fs.readFileSync(argsLog, 'utf8'), /mariadb .*--socket=\/run\/mysqld\/test\.sock/);
});

test('MSSQL(Linux): sqlcmd 구분선을 빼고 읽으며 Windows용 T-SQL 기본 쿼리를 쓴다', { skip: !canRunBash }, () => {
  const instance = item('LNX-MSSQL', 'DB_INSTANCE_STATUS');
  assert.equal(instance.status, 'Critical');
  assert.equal(instance.detail.queryName, 'MSSQL 쿼리 · DB 인스턴스·접속 상태');
  assert.equal(instance.detail.queries[0].rowCount, 2);
  assert.equal(results['LNX-MSSQL'].json.checks.database.detail.offlineCount, 1);
  assert.match(fs.readFileSync(argsLog, 'utf8'), /sqlcmd -S localhost .* -E -Q/);
});

test('CUBRID: 대상 DB가 없으면 실행하지 않고 미수집과 안내를 남긴다', { skip: !canRunBash }, () => {
  for (const name of ['DB_INSTANCE_STATUS', 'DB_PROCESS_LIMIT']) {
    const entry = item('LNX-CUB', name);
    assert.equal(entry.status, 'NotCollected');
    assert.match(entry.detail.queries[0].message, /대상 DB\(DB이름@호스트\)/);
  }
});

test('CUBRID: SHOW 문 결과를 쿼리의 상태 규칙(-- @opsbox-status)으로 판정한다', { skip: !canRunBash }, () => {
  assert.equal(item('LNX-CUB2', 'DB_INSTANCE_STATUS').status, 'Healthy');
  assert.equal(item('LNX-CUB2', 'DB_PROCESS_LIMIT').status, 'Warning', '작업 스레드 80% 사용');
  assert.equal(item('LNX-CUB2', 'DB_TABLESPACE').status, 'Healthy', '남은 섹터 약 90%');
  assert.equal(item('LNX-CUB2', 'DB_BACKUP').status, 'Warning', "백업 정보 'time: N/A'");
  assert.equal(item('LNX-CUB2', 'DB_ARCHIVE_MODE').status, 'Healthy');
  assert.equal(item('LNX-CUB2', 'DB_TRANSACTION_LOG').status, 'Healthy');
  assert.equal(item('LNX-CUB2', 'DB_REPLICATION').status, 'NotCollected', "HA 미사용('na')");
  assert.equal(item('LNX-CUB2', 'DB_PROCESS_LIMIT').detail.queries[0].rows[0][2], '8');
  assert.match(fs.readFileSync(argsLog, 'utf8'), /csql -u dba --plain-output -c .* demodb@localhost/);
});

test('결과 파일은 OpsBox가 읽을 수 있고 종합 상태를 판정한다', { skip: !canRunBash }, () => {
  const parsed = parseResultJson(results['LNX-PG'].text);
  assert.equal(parsed.databaseChecks?.status, 'Critical');
  assert.equal(getHealthStatus(parsed), 'Critical');
});

test('점검 설정 저장: Linux CUBRID는 대상 DB가 필요하고, PostgreSQL은 비워도 된다', () => {
  assert.throws(() => updateCheckConfig('LNX-CUB', { roleChecks: { DB: ['DB_INSTANCE_STATUS'] }, rolePolicySettings: {} } as any), /CUBRID 대상/);
  const saved = updateCheckConfig('LNX-PG', { roleChecks: { DB: ['DB_INSTANCE_STATUS'] }, rolePolicySettings: { DB_INSTANCE_STATUS: { instanceTargets: [] } }, customQueryTemplateIds: [] } as any);
  assert.ok(saved);
});
