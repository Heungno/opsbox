import type { CommonCodes } from '../common-codes/types';
import type { Policy } from '../policies/types';
import type { ScriptPart } from '../templates/types';
import type { RolePolicySetting, RolePolicyType, Server, ServerRecord, StoredCheckConfig } from './types';

/*
 * 저장된 서버(ServerRecord) → 화면·API·스크립트가 쓰는 서버(Server)
 *
 * 할당된 정책이 정하는 값은 저장값 위에 계산해 얹습니다(정책을 바꾸면 바로 반영되도록).
 * - 역할 정책이 있으면: 그 역할의 점검 항목(roleChecks)과 SQL 항목의 쿼리 템플릿·DBMS
 * - 기본·역할 정책 항목의 스크립트 조각(scriptParts)
 * - 역할 정책이 없으면: 저장값, 저장값도 없으면 Windows 기본 역할 점검
 */
const ROLE_POLICY_TYPES: RolePolicyType[] = ['WEB', 'WAS', 'DB'];

export interface PlanContext {
  policies: Policy[];
  /** 공통코드에 있는 서버 역할 */
  roles: string[];
  /** Windows 서버의 역할별 기본 점검 (역할 정책도, 저장값도 없을 때) */
  defaultRoleChecks: Partial<Record<RolePolicyType, ScriptPart[]>>;
}

export function resolveServer(record: ServerRecord, context: PlanContext): Server {
  const stored = record.checkConfig;
  const roles = [...new Set(record.roles.filter((role) => context.roles.includes(role)))];
  const policyIds = record.policyIds;
  const policiesById = new Map(context.policies.filter((policy) => policy.os === record.os).map((policy) => [policy.id, policy]));
  const roleChecks = { ...(stored.roleChecks ?? {}) } as Partial<Record<RolePolicyType, ScriptPart[]>>;
  const rolePolicySettings = { ...(stored.rolePolicySettings ?? {}) };
  ROLE_POLICY_TYPES.forEach((role) => {
    if (!roles.includes(role)) { delete roleChecks[role]; return; }
    const assigned = policiesById.get(policyIds[role] ?? '');
    if (assigned?.category === role && assigned.enabled) {
      roleChecks[role] = assigned.items.filter((item) => item.enabled).map((item) => item.id as ScriptPart);
      assigned.items.filter((item) => item.enabled && item.executor.type === 'SQL_QUERY').forEach((item) => {
        rolePolicySettings[item.id] = { ...(rolePolicySettings[item.id] ?? {}), queryTemplateId: item.executor.templateId || '', dbms: item.executor.dbms } as RolePolicySetting;
      });
    } else if (!Array.isArray(roleChecks[role])) roleChecks[role] = record.os === 'Windows' ? (context.defaultRoleChecks[role] ?? []) : [];
    roleChecks[role] = [...new Set(roleChecks[role])];
  });
  const scriptParts = { ...(stored.scriptParts ?? {}) } as Partial<Record<ScriptPart, string>>;
  const assignedBasic = policiesById.get(policyIds.BASIC ?? '');
  if (assignedBasic?.category === 'BASIC' && assignedBasic.enabled) {
    assignedBasic.items.filter((item) => item.enabled && ['SCRIPT', 'CONSOLE_COMMAND', 'LOG_ANALYSIS'].includes(item.executor.type) && item.executor.templateId)
      .forEach((item) => { scriptParts[item.id as ScriptPart] = item.executor.templateId; });
  }
  ROLE_POLICY_TYPES.forEach((role) => policiesById.get(policyIds[role] ?? '')?.items.filter((item) => item.enabled && item.executor.templateId && item.executor.type !== 'SQL_QUERY')
    .forEach((item) => { scriptParts[item.id as ScriptPart] = item.executor.templateId; }));
  return {
    id: record.id,
    name: record.name,
    os: record.os,
    ip: record.ip,
    sharedPath: record.sharedPath,
    enabled: record.enabled,
    processes: stored.processes ?? [],
    directories: stored.directories ?? [],
    fileChecks: stored.fileChecks ?? [],
    ports: stored.ports ?? [],
    httpChecks: stored.httpChecks ?? [],
    // 점검 설정을 저장한 적이 없으면 값이 없습니다(응답에 키를 넣지 않음).
    ...(stored.queryTemplateId === undefined ? {} : { queryTemplateId: stored.queryTemplateId }),
    roles,
    products: { ...record.products },
    scriptParts,
    roleChecks,
    rolePolicySettings,
    customQueryTemplateIds: [...new Set(stored.customQueryTemplateIds ?? [])],
    policyIds: { ...policyIds },
  };
}

/**
 * 저장할 점검 설정. 항목 설정·스크립트 조각은 "기본 → WEB → WAS → DB" 순서로 정리하고,
 * 어느 역할(공통코드의 역할별 항목 또는 할당된 정책 항목)에도 속하지 않는 항목 설정은 버립니다.
 * (생성 스크립트에 들어가는 설정 JSON의 키 순서가 저장할 때마다 같도록)
 */
export function toStoredCheckConfig(server: Server, codes: Pick<CommonCodes, 'rolePolicies'>, policies: Policy[]): StoredCheckConfig {
  const assignedPolicies = policies.filter((policy) => Object.values(server.policyIds ?? {}).includes(policy.id));
  const customRoleByItem = new Map(assignedPolicies.flatMap((policy) => policy.items.map((item) => [item.id, policy.category] as const)));
  const partRole = (part: string): RolePolicyType | undefined => {
    const builtIn = ROLE_POLICY_TYPES.find((role) => codes.rolePolicies[role]?.includes(part as ScriptPart));
    if (builtIn) return builtIn;
    const category = customRoleByItem.get(part);
    return category === 'WEB' || category === 'WAS' || category === 'DB' ? category : undefined;
  };
  const roleChecks = server.roleChecks ?? {};
  const settings = server.rolePolicySettings ?? {};
  const parts = Object.entries(server.scriptParts ?? {});
  const scriptParts = Object.fromEntries([
    ...parts.filter(([part]) => !partRole(part)),
    ...ROLE_POLICY_TYPES.flatMap((role) => parts.filter(([part]) => partRole(part) === role)),
  ]);
  const roleSettings = (role: RolePolicyType) => [...new Set([...(codes.rolePolicies[role] ?? []), ...(roleChecks[role] ?? [])])]
    .filter((part) => settings[part]).map((part) => [part, settings[part]] as const);
  // 기본 정책 사용자 항목의 서버별 입력(어느 역할에도 속하지 않는 항목 설정)
  const basicSettings = Object.entries(settings).filter(([part]) => !partRole(part) && customRoleByItem.get(part) === 'BASIC');
  return {
    processes: server.processes ?? [],
    directories: server.directories ?? [],
    fileChecks: server.fileChecks ?? [],
    ports: server.ports ?? [],
    httpChecks: server.httpChecks ?? [],
    ...(server.queryTemplateId === undefined ? {} : { queryTemplateId: server.queryTemplateId }),
    scriptParts,
    // 세 역할 모두 목록으로 저장합니다(빈 목록이면 '선택 안 함'으로 보고 Windows 기본 점검을 다시 채우지 않음).
    roleChecks: Object.fromEntries(ROLE_POLICY_TYPES.map((role) => [role, roleChecks[role] ?? []])),
    rolePolicySettings: Object.fromEntries([...basicSettings, ...ROLE_POLICY_TYPES.flatMap(roleSettings)]),
    customQueryTemplateIds: server.customQueryTemplateIds ?? [],
    policyIds: {},
  };
}
