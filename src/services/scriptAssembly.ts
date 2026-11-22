import { BadRequestError } from '../shared/errors';
import { Server } from '../types/server';
import { ManagedTemplate, ScriptPart } from '../features/templates/types';
import { getServerProduct, getServerRoles } from './serverService';
import { getCommonCodes } from '../features/common-codes/service';
import { getPolicies } from '../features/policies/service';

/*
 * Windows·Linux 공통 점검 스크립트 조립
 *
 * 1) selectScriptParts: 서버의 점검 정책과 설정에 맞는 스크립트 조각(SCRIPT_PART 템플릿)을 고릅니다.
 * 2) buildScriptConfig: 스크립트 안에 넣을 서버 설정(점검 대상·정책)을 만듭니다.
 * OS별 서비스(windowsScriptService, linuxScriptService)가 이 둘로 최종 스크립트를 만듭니다.
 */

export type ScriptOs = 'Windows' | 'Linux';

/** 템플릿 id 접두어: WINDOWS-PART-CPU, LINUX-PART-CPU … */
const PART_PREFIX: Record<ScriptOs, string> = { Windows: 'WINDOWS-PART', Linux: 'LINUX-PART' };

/** 반드시 있어야 하는 조각. 그 밖의 조각은 Linux에서 템플릿이 없으면 건너뜁니다(결과에는 미수집으로 남음). */
const REQUIRED_PARTS: ReadonlySet<string> = new Set(['START', 'SAVE']);

export function selectScriptParts(server: Server, templates: ManagedTemplate[], os: ScriptOs, configToken: string): string[] {
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
      // DB: SQL 항목은 공통 쿼리 실행기 하나로, 점검 만들기 항목은 각자의 조각으로 실행합니다.
      const builderItems = new Set(isBuilderItemIn(catalog, server.policyIds?.DB, items));
      if (items.some((item) => !builderItems.has(item))) selected.push('DB_QUERY_RUNNER');
      selected.push(...items.filter((item) => builderItems.has(item)));
    } else selected.push(...items);
  }
  selected.push('SAVE');

  const parts: string[] = [];
  for (const item of selected) {
    const usable = (template: ManagedTemplate) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === os;
    const selectedId = server.scriptParts?.[item];
    const selectedTemplate = selectedId ? templates.find((template) => template.id === selectedId && usable(template)) : undefined;
    if (selectedId && !selectedTemplate) throw new BadRequestError(`${os} 점검 항목 '${item}'에 지정한 스크립트 템플릿을 사용할 수 없습니다. 서버 정책에서 템플릿을 다시 선택하세요.`);
    const defaults = templates.filter((template) => usable(template) && template.item === item);
    const chosen = selectedTemplate
      ?? defaults.find((template) => template.id === `${PART_PREFIX[os]}-${item}`)
      ?? defaults.find((template) => template.generated?.itemId === item)
      ?? (defaults.length === 1 ? defaults[0] : undefined);
    if (!chosen) {
      // Linux는 아직 조각이 없는 항목(DB 쿼리 실행기 등)이 있어, 필수 조각이 아니면 건너뜁니다.
      if (os === 'Linux' && !defaults.length && !REQUIRED_PARTS.has(item)) continue;
      const reason = defaults.length ? '여러 개 등록되어 있습니다' : '등록되어 있지 않습니다';
      throw new BadRequestError(`${os} 점검 항목 템플릿 '${item}'이 ${reason}. 서버 정책에서 템플릿을 선택하거나 템플릿 설정에서 추가하세요.`);
    }
    if (item === 'START' && !chosen.content.includes(configToken)) throw new BadRequestError(`${os} 실행 준비 템플릿에 ${configToken} 토큰이 필요합니다.`);
    parts.push(chosen.content);
  }
  return parts;
}

/** 지정한 정책에서 점검 만들기(CHECK_BUILDER) 항목인 것만 */
export function isBuilderItemIn(policies: { id: string; items: { id: string; executor: { type: string } }[] }[], policyId: string | undefined, items: string[]): string[] {
  const policy = policies.find((entry) => entry.id === policyId);
  return items.filter((item) => policy?.items.find((entry) => entry.id === item)?.executor.type === 'CHECK_BUILDER');
}

export function buildScriptConfig(server: Server, policyQueryTemplates: ManagedTemplate[] = [], customQueryTemplates: ManagedTemplate[] = []) {
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
  return {
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
}

export type ScriptConfig = ReturnType<typeof buildScriptConfig>;
