import { Server } from '../types/server';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { getServerProduct, getServerRoles } from './serverService';

const CONFIG_TOKEN = '@@CONFIG_BASE64@@';

const DEFAULT_MSSQL_QUERY = `SET NOCOUNT ON;
SELECT (N'SERVER|' COLLATE DATABASE_DEFAULT)
  + (ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('ServerName')), N'') COLLATE DATABASE_DEFAULT)
  + (N'|' COLLATE DATABASE_DEFAULT)
  + (ISNULL(CONVERT(nvarchar(64), SERVERPROPERTY('ProductVersion')), N'') COLLATE DATABASE_DEFAULT)
  + (N'|' COLLATE DATABASE_DEFAULT)
  + (ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('Edition')), N'') COLLATE DATABASE_DEFAULT);
SELECT (N'DATABASE|' COLLATE DATABASE_DEFAULT)
  + (CONVERT(nvarchar(256), d.name) COLLATE DATABASE_DEFAULT)
  + (N'|' COLLATE DATABASE_DEFAULT)
  + (CONVERT(nvarchar(60), d.state_desc) COLLATE DATABASE_DEFAULT)
  + (N'|' COLLATE DATABASE_DEFAULT)
  + (CONVERT(nvarchar(60), d.recovery_model_desc) COLLATE DATABASE_DEFAULT)
  + (N'|' COLLATE DATABASE_DEFAULT)
  + (CONVERT(nvarchar(32), CAST(ISNULL(SUM(CASE WHEN mf.type = 0 THEN CAST(mf.size AS bigint) ELSE 0 END), 0) * 8.0 / 1024 AS decimal(18,2))) COLLATE DATABASE_DEFAULT)
FROM sys.databases d
LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
GROUP BY d.database_id, d.name, d.state_desc, d.recovery_model_desc;`;

function getParts(server: Server, templates: ManagedTemplate[]): string[] {
  const roles = getServerRoles(server);
  const selected: ScriptPart[] = ['START', 'OS_DISK'];
  if (server.processes?.length) selected.push('PROCESS');
  if (server.directories?.length) selected.push('DIRECTORY');
  if (server.fileChecks?.length) selected.push('FILE_SIZE');
  if (server.ports?.length) selected.push('PORT');
  if (server.httpChecks?.length) selected.push('HTTP');
  if (roles.includes('WAS')) selected.push('WAS');
  if (roles.includes('WEB') && getServerProduct(server, 'WEB') === 'WebtoB') selected.push('WEBTOB');
  if (roles.includes('DB')) selected.push('DATABASE');
  selected.push('SAVE');

  return selected.map((item) => {
    const matches = templates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Windows' && template.item === item);
    if (matches.length !== 1) throw new Error(`Windows 점검 항목 템플릿 '${item}'은 사용 가능한 항목이 정확히 하나 필요합니다. (현재 ${matches.length}개)`);
    if (item === 'START' && !matches[0].content.includes(CONFIG_TOKEN)) throw new Error('Windows 실행 준비 템플릿에 @@CONFIG_BASE64@@ 토큰이 필요합니다.');
    return matches[0].content;
  });
}

export function assembleWindowsScript(server: Server, templates: ManagedTemplate[], queryTemplate?: string): string {
  const roles = getServerRoles(server);
  const products = Object.fromEntries(roles.map((role) => [role, getServerProduct(server, role)]).filter(([, product]) => product));
  const rawQuery = queryTemplate ?? DEFAULT_MSSQL_QUERY;
  const query = rawQuery
    .replace(/\{\{SERVER_IP\}\}/g, server.ip)
    .replace(/\{\{SERVER_NAME\}\}/g, server.name);
  const config = {
    server: {
      id: server.id,
      name: server.name,
      ip: server.ip,
      sharedPath: server.sharedPath,
      type: server.type,
      product: server.product ?? products[server.type],
      roles,
      products,
    },
    checks: {
      processes: server.processes ?? [],
      directories: server.directories ?? [],
      fileChecks: server.fileChecks ?? [],
      ports: server.ports ?? [],
      httpChecks: (server.httpChecks ?? []).map((item) => ({ ...item, expectedStatus: item.expectedStatus ?? 200 })),
    },
    database: { query },
  };
  const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');

  return getParts(server, templates)
    .map((part) => part.replace(CONFIG_TOKEN, encodedConfig))
    .join('\r\n\r\n');
}
