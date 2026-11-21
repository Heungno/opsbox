import { BadRequestError, NotFoundError } from '../errors';
import { getServer, getServerProduct } from './serverService';
import { getTemplate, getTemplates } from './templateService';
import { assembleWindowsScript } from './windowsScriptService';
import { assembleLinuxScript } from './linuxScriptService';

export function generateScript(serverId: string): string {
  const server = getServer(serverId);

  if (!server) {
    throw new NotFoundError(`서버를 찾을 수 없습니다: ${serverId}`);
  }

  const policyQueryTemplates = server.os === 'Windows' && getServerProduct(server, 'DB') === 'MSSQL' ? (server.roleChecks?.DB ?? [])
    .filter((item) => item !== 'DB_CUSTOM_QUERY')
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
  return server.os === 'Windows'
    ? assembleWindowsScript(server, getTemplates({ kind: 'SCRIPT_PART' }), policyQueryTemplates, customQueryTemplates)
    : assembleLinuxScript(server, getTemplates({ kind: 'SCRIPT_PART' }));
}
