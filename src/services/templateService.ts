import fs from 'fs';
import path from 'path';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { ValidationError } from '../types/error';
import { getCommonCodes } from './commonCodeService';

const FILE = 'data/templates.json';
const MIGRATION_FILE = 'data/template-migrations.json';

function bundledFile(directory: string, ...segments: string[]) {
  const packagedPath = path.join(directory, ...segments);
  return fs.existsSync(packagedPath) ? packagedPath : path.join('src', directory, ...segments);
}

function hasMigration(id: string) {
  if (!fs.existsSync(MIGRATION_FILE)) return false;
  try { return (JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf8')) as string[]).includes(id); } catch { return false; }
}

function markMigration(id: string) {
  let completed: string[] = [];
  if (fs.existsSync(MIGRATION_FILE)) {
    try { completed = JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf8')) as string[]; } catch { completed = []; }
  }
  if (!completed.includes(id)) fs.writeFileSync(MIGRATION_FILE, JSON.stringify([...completed, id], null, 2));
}

function sampleTemplates(): ManagedTemplate[] {
  // First-run seed: preserve the requested MSSQL query example and all default Windows item scripts.
  const updatedAt = '2026-11-18T00:00:00.000Z';
  const sample = (id: string, name: string, kind: ManagedTemplate['kind'], file: string, os?: ManagedTemplate['os'], item?: ScriptPart): ManagedTemplate => ({
    id, name, kind, os, item, enabled: true,
    content: fs.readFileSync(bundledFile('template-samples', file), 'utf8'), updatedAt,
  });
  return [
    sample('SAMPLE-WINDOWS-COMMON', '예제 · Windows 공통 자원만 (정책·제품 점검 제외)', 'SCRIPT', 'windows-common.ps1', 'Windows'),
    sample('SAMPLE-LINUX-COMMON', '예제 · Linux 공통 자원만 (정책·제품 점검 제외)', 'SCRIPT', 'linux-common.sh', 'Linux'),
    sample('SAMPLE-MSSQL-DATABASES', '예제 · MSSQL 데이터베이스 상태', 'QUERY', 'mssql-databases.sql', undefined, 'DB_CUSTOM_QUERY'),
    ...scriptParts(),
    ...databaseQueryTemplates(),
  ];
}

function scriptParts(): ManagedTemplate[] {
  const items: Array<[ScriptPart, string, string]> = [
    ['START', '실행 준비·로깅', 'system/start.ps1'],
    ['HOST_INFO', '서버 기본정보', 'common/server-info.ps1'],
    ['CPU', 'CPU 사용률', 'common/cpu-usage.ps1'],
    ['MEMORY', '메모리 사용률', 'common/memory-usage.ps1'],
    ['UPTIME', '서버 가동시간', 'common/uptime.ps1'],
    ['DISK', '디스크 사용량', 'common/disk-usage.ps1'],
    ['PROCESS', '프로세스', 'common/process-check.ps1'],
    ['DIRECTORY', '디렉터리', 'common/directory-check.ps1'],
    ['FILE_SIZE', '파일 크기', 'common/file-size-check.ps1'],
    ['PORT', '포트', 'common/port-listening.ps1'],
    ['HTTP', 'HTTP 응답', 'common/http-response.ps1'],
    ['WEB_ENGINE_STATUS', 'WEB 엔진 상태', 'web/engine-status.ps1'],
    ['WEB_WAS_CONNECTION', 'WEB-WAS 연동 상태', 'web/was-connection.ps1'],
    ['WEB_REQUEST_VOLUME', '사용자 요청 처리량', 'web/request-volume.ps1'],
    ['WEB_LOG', 'WEB 로그 상태', 'web/log-analysis.ps1'],
    ['WAS_JVM_HEAP', 'JVM Heap 사용률', 'was/jvm-heap-usage.ps1'],
    ['WAS_THREAD_POOL', 'Thread Pool 사용률', 'was/thread-pool-usage.ps1'],
    ['WAS_LONG_RUNNING_THREAD', '장기 수행 Thread', 'was/long-running-thread.ps1'],
    ['WAS_DB_CONNECTION_POOL', 'DB Connection Pool 상태', 'was/db-connection-pool.ps1'],
    ['WAS_DEPLOYMENT', '애플리케이션 배포 상태', 'was/deployment-status.ps1'],
    ['WAS_HEAP_DUMP', 'Heap Dump 파일 상태', 'was/heap-dump-files.ps1'],
    ['WAS_STARTUP_SCRIPT', '기동 스크립트 변경 상태', 'was/startup-script-change.ps1'],
    ['WAS_LOG', 'WAS 로그 상태', 'was/log-analysis.ps1'],
    ['DB_QUERY_RUNNER', 'DB 공통 쿼리 실행기', 'db/query-runner.ps1'],
    ['SAVE', '결과 저장·종료', 'system/save-result.ps1'],
  ];
  return items.map(([item, label, file]) => {
    const sourcePath = bundledFile('script-parts', 'windows', file);
    if (!fs.existsSync(sourcePath)) throw new Error(`Windows 기본 점검 스크립트 파일을 찾을 수 없습니다: ${sourcePath}`);
    return {
      id: `WINDOWS-PART-${item}`,
      name: `Windows 점검 항목 · ${label}`,
      kind: 'SCRIPT_PART',
      os: 'Windows',
      item,
      usesQueryTemplate: item === 'DB_QUERY_RUNNER',
      enabled: true,
      content: fs.readFileSync(sourcePath, 'utf8'),
      updatedAt: '2026-11-18T00:00:00.000Z',
    };
  });
}

function databaseQueryTemplates(): ManagedTemplate[] {
  const updatedAt = '2026-11-19T00:00:00.000Z';
  const definitions: Array<[ScriptPart, string, string]> = [
    ['DB_INSTANCE_STATUS', 'DB 인스턴스·접속 상태', `SET NOCOUNT ON;
SELECT CASE WHEN d.state_desc = 'ONLINE' THEN 'Healthy' ELSE 'Critical' END AS __OPSBOX_STATUS,
  CONVERT(nvarchar(256), SERVERPROPERTY('ServerName')) AS serverName,
  CONVERT(nvarchar(64), SERVERPROPERTY('ProductVersion')) AS version,
  CONVERT(nvarchar(256), SERVERPROPERTY('Edition')) AS edition,
  d.name AS databaseName, d.state_desc AS state, d.recovery_model_desc AS recoveryModel,
  CAST(SUM(CASE WHEN mf.type = 0 THEN mf.size ELSE 0 END) * 8.0 / 1024 AS decimal(18,2)) AS dataSizeMB
FROM sys.databases d LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
GROUP BY d.database_id, d.name, d.state_desc, d.recovery_model_desc ORDER BY d.name;`],
    ['DB_PROCESS_LIMIT', '세션·프로세스 사용률', `SET NOCOUNT ON;
WITH counts AS (SELECT COUNT(*) AS currentSessions FROM sys.dm_exec_sessions WHERE is_user_process = 1),
limits AS (SELECT ISNULL(NULLIF(value_in_use, 0), 32767) AS maxSessions FROM sys.configurations WHERE name = 'user connections')
SELECT CASE WHEN currentSessions * 100.0 / maxSessions >= 90 THEN 'Critical' WHEN currentSessions * 100.0 / maxSessions >= 70 THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  currentSessions, maxSessions, CAST(currentSessions * 100.0 / maxSessions AS decimal(6,2)) AS usagePercent
FROM counts CROSS JOIN limits;`],
    ['DB_TABLESPACE', '데이터 영역 사용률', `SET NOCOUNT ON;
CREATE TABLE #space (databaseName sysname, allocatedMB decimal(18,2), usedMB decimal(18,2));
DECLARE @database sysname, @sql nvarchar(max);
DECLARE db_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' AND database_id > 4;
OPEN db_cursor; FETCH NEXT FROM db_cursor INTO @database;
WHILE @@FETCH_STATUS = 0 BEGIN
  SET @sql = N'USE ' + QUOTENAME(@database) + N'; INSERT INTO #space SELECT DB_NAME(), CAST(SUM(size) * 8.0 / 1024 AS decimal(18,2)), CAST(SUM(FILEPROPERTY(name, ''SpaceUsed'')) * 8.0 / 1024 AS decimal(18,2)) FROM sys.database_files WHERE type = 0;';
  EXEC sys.sp_executesql @sql; FETCH NEXT FROM db_cursor INTO @database;
END; CLOSE db_cursor; DEALLOCATE db_cursor;
SELECT CASE WHEN allocatedMB > 0 AND usedMB * 100.0 / allocatedMB >= 90 THEN 'Critical'
  WHEN allocatedMB > 0 AND usedMB * 100.0 / allocatedMB >= 80 THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  databaseName, allocatedMB, usedMB, CAST(CASE WHEN allocatedMB > 0 THEN usedMB * 100.0 / allocatedMB ELSE 0 END AS decimal(6,2)) AS usagePercent
FROM #space ORDER BY databaseName;`],
    ['DB_BACKUP', '백업 상태', `SET NOCOUNT ON;
SELECT CASE WHEN MAX(b.backup_finish_date) IS NULL OR DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()) >= 336 THEN 'Critical'
  WHEN DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()) >= 168 THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  d.name AS databaseName, ISNULL(CONVERT(varchar(19), MAX(b.backup_finish_date), 120), 'NONE') AS lastFullBackup,
  ISNULL(DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()), -1) AS backupAgeHours
FROM sys.databases d LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'D'
WHERE d.state_desc = 'ONLINE' GROUP BY d.name ORDER BY d.name;`],
    ['DB_ARCHIVE_MODE', '아카이브 모드 상태', `SET NOCOUNT ON;
SELECT CASE WHEN d.recovery_model_desc = 'SIMPLE' THEN 'Warning' WHEN MAX(b.backup_finish_date) IS NULL THEN 'Warning'
  WHEN DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()) >= 24 THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  d.name AS databaseName, d.recovery_model_desc AS recoveryModel,
  ISNULL(DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()), -1) AS lastLogBackupAgeHours
FROM sys.databases d LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'L'
WHERE d.state_desc = 'ONLINE' GROUP BY d.name, d.recovery_model_desc ORDER BY d.name;`],
    ['DB_TRANSACTION_LOG', '트랜잭션 로그 사용률', `SET NOCOUNT ON;
CREATE TABLE #logspace (databaseName sysname, logSizeMB float, usagePercent float, status int);
INSERT INTO #logspace EXEC ('DBCC SQLPERF(LOGSPACE)');
SELECT CASE WHEN usagePercent >= 90 THEN 'Critical' WHEN usagePercent >= 70 THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  databaseName, CAST(logSizeMB AS decimal(18,2)) AS logSizeMB, CAST(usagePercent AS decimal(6,2)) AS usagePercent
FROM #logspace ORDER BY databaseName;`],
    ['DB_REPLICATION', '복제·이중화 상태', `SET NOCOUNT ON;
SELECT CASE WHEN drs.synchronization_health_desc = 'NOT_HEALTHY' THEN 'Critical'
  WHEN ars.connected_state_desc <> 'CONNECTED' OR drs.synchronization_state_desc <> 'SYNCHRONIZED' THEN 'Warning' ELSE 'Healthy' END AS __OPSBOX_STATUS,
  DB_NAME(drs.database_id) AS databaseName, ars.role_desc AS replicaRole, ars.connected_state_desc AS connectionState,
  drs.synchronization_state_desc AS synchronizationState, drs.synchronization_health_desc AS health,
  ISNULL(drs.log_send_queue_size, 0) AS sendQueueKB
FROM sys.dm_hadr_database_replica_states drs JOIN sys.dm_hadr_availability_replica_states ars ON ars.replica_id = drs.replica_id AND ars.is_local = 1;`],
  ];
  return definitions.map(([item, label, content]) => ({
    id: `WINDOWS-QUERY-${item}`, name: `MSSQL 쿼리 · ${label}`, kind: 'QUERY', os: 'Windows', role: 'DB', item,
    enabled: true, content, updatedAt,
  }));
}

function read(): ManagedTemplate[] {
  if (!fs.existsSync(FILE)) return sampleTemplates();
  const items = JSON.parse(fs.readFileSync(FILE, 'utf8')) as ManagedTemplate[];
  let defaults: ManagedTemplate[];
  try { defaults = scriptParts(); } catch (error) {
    console.error('기본 스크립트 소스를 읽지 못했습니다. 저장된 템플릿으로 계속 실행합니다.', error);
    return items;
  }
  // Migrate existing stores once; explicit deletions remain respected afterward.
  if (!items.some((item) => item.kind === 'SCRIPT_PART')) {
    const seeded = [...items, ...defaults];
    write(seeded);
    return seeded;
  }
  let changed = false;
  const roleItemRenames: Record<string, ScriptPart> = { WEB: 'WEB_ENGINE_STATUS', WAS: 'WAS_JVM_HEAP', DATABASE: 'DB_INSTANCE_STATUS' };
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.kind !== 'SCRIPT_PART') continue;
    if ((item.item as string | undefined) === 'OS_DISK') { items.splice(index, 1); changed = true; continue; }
    if ((item.item as string | undefined) === 'WEBTOB') {
      item.item = 'WEB_ENGINE_STATUS';
      if (item.id === 'WINDOWS-PART-WEBTOB') item.id = 'WINDOWS-PART-WEB_ENGINE_STATUS';
      changed = true;
    } else if (item.item && roleItemRenames[item.item]) {
      const previous = item.item;
      item.item = roleItemRenames[previous];
      if (item.id === `WINDOWS-PART-${previous}`) item.id = `WINDOWS-PART-${item.item}`;
      changed = true;
    }
  }
  // Resource basics are always assembled into a Windows script, so restore any
  // missing canonical entries even when the original one-time migrations ran.
  const requiredBasics = defaults.filter((item) => ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'].includes(item.item ?? ''));
  for (const item of requiredBasics) {
    if (!items.some((existing) => existing.id === item.id)) { items.push(item); changed = true; }
  }
  const customQueryMigration = 'db-custom-query-template-v1';
  if (!hasMigration(customQueryMigration)) {
    if (!items.some((item) => item.kind === 'SCRIPT_PART' && item.item === 'DB_CUSTOM_QUERY')) {
      const customQueryPart = defaults.find((item) => item.item === 'DB_CUSTOM_QUERY');
      if (customQueryPart) { items.push(customQueryPart); changed = true; }
    }
    markMigration(customQueryMigration);
  }
  const databaseRunnerMigration = 'single-db-query-runner-v1';
  if (!hasMigration(databaseRunnerMigration)) {
    for (const template of items) {
      if (template.kind === 'QUERY' && !template.item) { template.item = 'DB_CUSTOM_QUERY'; changed = true; }
    }
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index];
      if (item.kind === 'SCRIPT_PART' && item.item?.startsWith('DB_') && item.item !== 'DB_QUERY_RUNNER') {
        items.splice(index, 1);
        changed = true;
      }
    }
    for (const template of [...defaults.filter((item) => item.item === 'DB_QUERY_RUNNER'), ...databaseQueryTemplates()]) {
      if (!items.some((existing) => existing.id === template.id)) { items.push(template); changed = true; }
    }
    markMigration(databaseRunnerMigration);
  }
  const roleDefaultsMigration = 'windows-role-defaults-v1';
  if (!hasMigration(roleDefaultsMigration)) {
    const roleTypes: string[] = ['WEB', 'WAS', 'DB'];
    for (const defaultTemplate of defaults.filter((item) => roleTypes.includes(String(getCommonCodes().scriptItems.find((entry) => entry.value === item.item)?.role ?? '')))) {
      if (!items.some((existing) => existing.id === defaultTemplate.id)) { items.push(defaultTemplate); changed = true; }
    }
    markMigration(roleDefaultsMigration);
  }
  // WAS log analysis was added after the original role-default migration had
  // already run for existing installations. Add its canonical Windows script
  // once without replacing any user-managed template.
  const wasLogMigration = 'windows-was-log-default-v1';
  if (!hasMigration(wasLogMigration)) {
    const wasLogDefault = defaults.find((item) => item.id === 'WINDOWS-PART-WAS_LOG');
    if (wasLogDefault && !items.some((item) => item.id === wasLogDefault.id)) {
      items.push(wasLogDefault);
      changed = true;
    }
    markMigration(wasLogMigration);
  }
  for (const currentDefault of defaults) {
    const index = items.findIndex((item) => item.id === currentDefault.id);
    if (index >= 0 && items[index].updatedAt === currentDefault.updatedAt) {
      if (items[index].name !== currentDefault.name) { items[index].name = currentDefault.name; changed = true; }
      if (items[index].content !== currentDefault.content) { items[index] = currentDefault; changed = true; }
      else if (currentDefault.usesQueryTemplate && items[index].usesQueryTemplate !== true) { items[index].usesQueryTemplate = true; changed = true; }
    }
  }
  if (changed) write(items);
  return items;
}

function write(templates: ManagedTemplate[]) {
  fs.writeFileSync(FILE, JSON.stringify(templates, null, 2));
}

function validate(input: Partial<ManagedTemplate>) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.name?.trim()) errors.push({ field: 'name', message: '템플릿 이름은 필수입니다.' });
  if (!['SCRIPT', 'SCRIPT_PART', 'QUERY'].includes(input.kind ?? '')) errors.push({ field: 'kind', message: '템플릿 종류를 선택하세요.' });
  if (!input.content?.trim()) errors.push({ field: 'content', message: '템플릿 내용을 입력하세요.' });
  if (['SCRIPT', 'SCRIPT_PART'].includes(input.kind ?? '') && !['Windows', 'Linux'].includes(input.os ?? '')) errors.push({ field: 'os', message: '스크립트 템플릿은 운영체제를 지정해야 합니다.' });
  if (input.kind === 'SCRIPT_PART' && input.os !== 'Windows') errors.push({ field: 'os', message: '점검 항목 스크립트는 현재 Windows 템플릿만 지원합니다.' });
  if (input.kind === 'SCRIPT_PART' && !input.item) errors.push({ field: 'item', message: '스크립트 점검 항목을 지정해야 합니다.' });
  if (input.kind === 'SCRIPT_PART' && input.item && !['START', 'SAVE', ...getCommonCodes().scriptItems.map(({ value }) => value)].includes(input.item)) errors.push({ field: 'item', message: '점검 항목이 올바르지 않습니다.' });
  if (input.kind === 'QUERY' && input.item && !getCommonCodes().rolePolicies.DB.includes(input.item)) errors.push({ field: 'item', message: 'DB 쿼리의 점검 항목이 올바르지 않습니다.' });
  if (input.kind === 'QUERY' && !input.item) errors.push({ field: 'item', message: 'DB 쿼리의 점검 항목을 선택하세요.' });
  if (input.usesQueryTemplate && input.item !== 'DB_QUERY_RUNNER') errors.push({ field: 'usesQueryTemplate', message: 'DB 공통 쿼리 실행기에서만 쿼리 템플릿을 사용할 수 있습니다.' });
  if (input.role && !['WEB', 'WAS', 'DB', 'OTHER'].includes(input.role)) errors.push({ field: 'role', message: '대상 역할이 올바르지 않습니다.' });
  if (errors.length) throw new ValidationError(errors);
}

export function getTemplates(filter?: { kind?: string }) {
  return read().filter((item) => !filter?.kind || item.kind === filter.kind).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function getTemplate(id?: string) {
  return id ? read().find((item) => item.id === id) : undefined;
}

export function saveTemplate(input: Partial<ManagedTemplate>, id?: string) {
  validate(input);
  const items = read();
  const index = id ? items.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new Error(`Template not found: ${id}`);
  const item: ManagedTemplate = {
    id: id ?? `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name!.trim(), kind: input.kind!, os: input.os, role: input.role, product: input.product, item: input.item, usesQueryTemplate: input.usesQueryTemplate === true,
    enabled: input.enabled !== false, content: input.content!, updatedAt: new Date().toISOString(),
  };
  if (index >= 0) items[index] = item; else items.push(item);
  write(items);
  return item;
}

export function deleteTemplate(id: string) {
  const items = read();
  const remaining = items.filter((item) => item.id !== id);
  if (remaining.length === items.length) throw new Error(`Template not found: ${id}`);
  write(remaining);
}
