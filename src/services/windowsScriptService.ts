import { BadRequestError } from '../errors';
import { Server } from '../types/server';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { getServerProduct, getServerRoles } from './serverService';
import { getCommonCodes } from './commonCodeService';
import { getPolicies } from './policyService';

const CONFIG_TOKEN = '@@CONFIG_BASE64@@';

function getParts(server: Server, templates: ManagedTemplate[]): string[] {
  const roles = getServerRoles(server);
  const catalog = getPolicies().filter((policy) => policy.os === server.os);
  const basicPolicy = catalog.find((policy) => policy.id === server.policyIds?.BASIC && policy.category === 'BASIC');
  const basicItems = basicPolicy?.items.filter((item) => item.enabled) ?? [];
  const selected: ScriptPart[] = ['START', ...(basicPolicy ? basicItems.map((item) => item.id as ScriptPart) : ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'] as ScriptPart[])];
  const hasBasicItem = (item: string) => !basicPolicy || basicItems.some((entry) => entry.id === item);
  if (server.processes?.length && hasBasicItem('PROCESS') && !selected.includes('PROCESS')) selected.push('PROCESS');
  if (server.directories?.length && hasBasicItem('DIRECTORY') && !selected.includes('DIRECTORY')) selected.push('DIRECTORY');
  if (server.fileChecks?.length && hasBasicItem('FILE_SIZE') && !selected.includes('FILE_SIZE')) selected.push('FILE_SIZE');
  if (server.ports?.length && hasBasicItem('PORT') && !selected.includes('PORT')) selected.push('PORT');
  if (server.httpChecks?.length && hasBasicItem('HTTP') && !selected.includes('HTTP')) selected.push('HTTP');
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
    const selectedTemplate = selectedId ? templates.find((template) => template.id === selectedId && template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Windows') : undefined;
    if (selectedId && !selectedTemplate) throw new BadRequestError(`Windows 점검 항목 '${item}'에 지정한 스크립트 템플릿을 사용할 수 없습니다. 서버 정책에서 템플릿을 다시 선택하세요.`);
    const defaults = templates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Windows' && template.item === item);
    const chosen = selectedTemplate ?? defaults.find((template) => template.id === `WINDOWS-PART-${item}`) ?? (defaults.length === 1 ? defaults[0] : undefined);
    if (!chosen) {
      const reason = defaults.length ? '여러 개 등록되어 있습니다' : '등록되어 있지 않습니다';
      throw new BadRequestError(`Windows 점검 항목 템플릿 '${item}'이 ${reason}. 서버 정책에서 템플릿을 선택하거나 템플릿 설정에서 추가하세요.`);
    }
    if (item === 'START' && !chosen.content.includes(CONFIG_TOKEN)) throw new BadRequestError('Windows 실행 준비 템플릿에 @@CONFIG_BASE64@@ 토큰이 필요합니다.');
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
  const assignedPolicies = getPolicies().filter((policy) => Object.values(server.policyIds ?? {}).includes(policy.id));
  const itemDefinitions = new Map(assignedPolicies.flatMap((policy) => policy.items.map((item) => [item.id, item] as const)));
  const rolePolicies = Object.fromEntries(
    (['WEB', 'WAS', 'DB'] as const).map((role) => [role, (server.roleChecks?.[role] ?? []).map((item) => {
      const definition = itemDefinitions.get(item);
      return { item, name: definition?.name ?? labels.get(item) ?? item, result: definition?.result, executorType: definition?.executor.type };
    })]),
  );
  const basicPolicy = assignedPolicies.find((policy) => policy.category === 'BASIC');
  const basicPolicyItems = (basicPolicy?.items ?? []).filter((item) => item.enabled && !getCommonCodes().scriptItems.some((code) => code.value === item.id))
    .map((item) => ({ item: item.id, name: item.name, result: item.result, executorType: item.executor.type, inputs: item.inputs }));
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
      basicPolicyItems,
      policyItems: Object.fromEntries(assignedPolicies.filter((policy) => policy.enabled).flatMap((policy) => policy.items.filter((item) => item.enabled).map((item) => [item.id, item]))),
      rolePolicySettings: server.rolePolicySettings ?? {},
    },
    database: { policyQueries, customQueries },
  };
  const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');

  return getParts(server, templates)
    .map((part) => part.replace(CONFIG_TOKEN, encodedConfig))
    .join('\r\n\r\n')
    // Persist the definitions used for this run so historical reports can
    // render the saved result using its original component configuration.
    .replace('checks = [ordered]@{', 'checks = [ordered]@{\n    policyDefinitions = $opsboxConfig.checks.policyItems');
}
