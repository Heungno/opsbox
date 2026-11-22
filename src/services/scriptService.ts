import { BadRequestError, NotFoundError } from '../shared/errors';
import { getServer, getServerProduct } from './serverService';
import { getTemplate, getTemplates } from './templateService';
import { assembleWindowsScript } from './windowsScriptService';
import { assembleLinuxScript } from './linuxScriptService';
import { resolveQueryTemplate } from './dbQueryDefaults';
import { getPolicies } from './policyService';
import { isBuilderItemIn } from './scriptAssembly';

export function generateScript(serverId: string): string {
  const server = getServer(serverId);

  if (!server) {
    throw new NotFoundError(`서버를 찾을 수 없습니다: ${serverId}`);
  }

  // 쿼리 실행기에는 SQL 항목만 넘깁니다(점검 만들기 항목은 각자의 스크립트 조각으로 실행).
  const builderItems = new Set(isBuilderItemIn(getPolicies(), server.policyIds?.DB, server.roleChecks?.DB ?? []));
  const queryItems = (server.roleChecks?.DB ?? []).filter((item) => item !== 'DB_CUSTOM_QUERY' && !builderItems.has(item));
  const policyQueryTemplates = server.os === 'Windows' && getServerProduct(server, 'DB') === 'MSSQL' ? queryItems
    .map((item) => {
      const selectedId = server.rolePolicySettings?.[item]?.queryTemplateId
        || `WINDOWS-QUERY-${item}`;
      const template = getTemplate(selectedId);
      if (!template?.enabled || template.kind !== 'QUERY' || (template.dbms ?? 'MSSQL') !== getServerProduct(server, 'DB')) {
        throw new BadRequestError(`${item} 점검에 사용할 DB 쿼리 템플릿을 선택하세요.`);
      }
      return { ...template, item };
    }) : [];
  const customQueryTemplates = (server.customQueryTemplateIds ?? []).map((id) => {
    const template = getTemplate(id);
    if (!template?.enabled || template.kind !== 'QUERY' || (template.dbms ?? 'MSSQL') !== getServerProduct(server, 'DB')) throw new BadRequestError(`DBMS에 맞는 기타 쿼리 템플릿을 사용할 수 없습니다: ${id}`);
    return template;
  });
  if (server.os === 'Windows') return assembleWindowsScript(server, getTemplates({ kind: 'SCRIPT_PART' }), policyQueryTemplates, customQueryTemplates);

  // Linux: 항목마다 서버 DB 제품용 쿼리를 고릅니다. 쿼리가 없는 항목은 스크립트를 막지 않고 결과에 미수집으로 남깁니다.
  const dbms = getServerProduct(server, 'DB');
  const linuxQueryTemplates = queryItems
    .flatMap((item) => {
      const template = resolveQueryTemplate(getTemplate, dbms, item, server.rolePolicySettings?.[item]?.queryTemplateId);
      return template ? [{ ...template, item }] : [];
    });
  return assembleLinuxScript(server, getTemplates({ kind: 'SCRIPT_PART' }), linuxQueryTemplates, customQueryTemplates);
}
