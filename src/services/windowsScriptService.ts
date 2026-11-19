import { Server } from '../types/server';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { getServerProduct, getServerRoles } from './serverService';
import { getCommonCodes } from './commonCodeService';

const CONFIG_TOKEN = '@@CONFIG_BASE64@@';

function getParts(server: Server, templates: ManagedTemplate[]): string[] {
  const roles = getServerRoles(server);
  const selected: ScriptPart[] = ['START', 'HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'];
  if (server.processes?.length) selected.push('PROCESS');
  if (server.directories?.length) selected.push('DIRECTORY');
  if (server.fileChecks?.length) selected.push('FILE_SIZE');
  if (server.ports?.length) selected.push('PORT');
  if (server.httpChecks?.length) selected.push('HTTP');
  for (const role of ['WEB', 'WAS', 'DB'] as const) {
    if (!roles.includes(role)) continue;
    const items = server.roleChecks?.[role] ?? [];
    if (role === 'DB') {
      if (items.length) selected.push('DB_QUERY_RUNNER');
    } else selected.push(...items);
  }
  selected.push('SAVE');

  return selected.map((item) => {
    const selectedId = server.scriptParts?.[item];
    const selectedTemplate = selectedId ? templates.find((template) => template.id === selectedId && template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Windows' && template.item === item) : undefined;
    if (selectedId && !selectedTemplate) throw new Error(`Windows 점검 항목 '${item}'에 지정한 스크립트 템플릿을 사용할 수 없습니다. 서버 정책에서 템플릿을 다시 선택하세요.`);
    const defaults = templates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Windows' && template.item === item);
    const chosen = selectedTemplate ?? defaults.find((template) => template.id === `WINDOWS-PART-${item}`) ?? (defaults.length === 1 ? defaults[0] : undefined);
    if (!chosen) {
      const reason = defaults.length ? '여러 개 등록되어 있습니다' : '등록되어 있지 않습니다';
      throw new Error(`Windows 점검 항목 템플릿 '${item}'이 ${reason}. 서버 정책에서 템플릿을 선택하거나 템플릿 설정에서 추가하세요.`);
    }
    if (item === 'START' && !chosen.content.includes(CONFIG_TOKEN)) throw new Error('Windows 실행 준비 템플릿에 @@CONFIG_BASE64@@ 토큰이 필요합니다.');
    return chosen.content;
  });
}

export function assembleWindowsScript(server: Server, templates: ManagedTemplate[], policyQueryTemplates: ManagedTemplate[] = [], customQueryTemplates: ManagedTemplate[] = []): string {
  const roles = getServerRoles(server);
  const products = Object.fromEntries(roles.map((role) => [role, getServerProduct(server, role)]).filter(([, product]) => product));
  const policyQueries = policyQueryTemplates.map(({ id, name, item, content }) => ({
    id, name, item,
    content: content.replace(/\{\{SERVER_IP\}\}/g, server.ip).replace(/\{\{SERVER_NAME\}\}/g, server.name),
  }));
  const customQueries = customQueryTemplates.map(({ id, name, content }) => ({
    id,
    name,
    content: content.replace(/\{\{SERVER_IP\}\}/g, server.ip).replace(/\{\{SERVER_NAME\}\}/g, server.name),
  }));
  const labels = new Map(getCommonCodes().scriptItems.map(({ value, label }) => [value, label]));
  const rolePolicies = Object.fromEntries(
    (['WEB', 'WAS', 'DB'] as const).map((role) => [role, (server.roleChecks?.[role] ?? []).map((item) => ({ item, name: labels.get(item) ?? item }))]),
  );
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
      rolePolicies,
      rolePolicySettings: server.rolePolicySettings ?? {},
    },
    database: { policyQueries, customQueries },
  };
  const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');

  return getParts(server, templates)
    .map((part) => part.replace(CONFIG_TOKEN, encodedConfig))
    .join('\r\n\r\n');
}
