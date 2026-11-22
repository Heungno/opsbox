import type { FastifyInstance } from 'fastify';

import { NotFoundError, ValidationError } from '../../shared/errors';
import { recordAudit } from '../audit/service';
import { activateServer, createServer, deactivateServer, getAllServers, getCheckConfig, getServer, updateCheckConfig, updateServer } from './service';
import type { IdParams } from '../../shared/api-types';
import type { CheckConfigInput, Server } from './types';
import { ok, requireObject } from '../../shared/http';

const LIST_FIELDS = ['processes', 'directories', 'fileChecks', 'ports', 'httpChecks', 'customQueryTemplateIds'] as const;
const MAP_FIELDS = ['scriptParts', 'roleChecks', 'rolePolicySettings', 'policyIds'] as const;

/** 점검 설정 본문의 기본 형식 확인 (목록은 배열, 설정은 객체) */
function assertCheckConfigShape(body: CheckConfigInput) {
  const errors = [
    ...LIST_FIELDS.filter((field) => body[field] !== undefined && !Array.isArray(body[field])).map((field) => ({ field, message: `${field}는 목록(배열)이어야 합니다.` })),
    ...MAP_FIELDS.filter((field) => body[field] !== undefined && (typeof body[field] !== 'object' || body[field] === null || Array.isArray(body[field]))).map((field) => ({ field, message: `${field}는 객체여야 합니다.` })),
    ...(body.queryTemplateId !== undefined && typeof body.queryTemplateId !== 'string' ? [{ field: 'queryTemplateId', message: 'queryTemplateId는 문자열이어야 합니다.' }] : []),
  ];
  if (errors.length) throw new ValidationError(errors);
}

export async function serverRoutes(app: FastifyInstance) {
  // 기본은 사용 중인 서버만. ?includeInactive=1 이면 미사용 서버도 함께
  app.get<{ Querystring: { includeInactive?: string } }>('/servers', async (request) => ok(getAllServers({ includeInactive: ['1', 'true'].includes(String(request.query.includeInactive ?? '')) })));

  app.get<{ Params: IdParams }>('/servers/:id', async (request) => {
    const server = getServer(request.params.id);
    if (!server) throw new NotFoundError(`서버를 찾을 수 없습니다: ${request.params.id}`);
    return ok(server);
  });

  app.post<{ Body: Server }>('/servers', async (request) => {
    const created = createServer(requireObject<Server>(request.body));
    recordAudit(request, { action: 'SERVER_CREATE', targetId: created.id, summary: `서버 등록: ${created.name} (${created.id})`, before: {}, after: created });
    return ok(created);
  });

  app.put<{ Params: IdParams; Body: Partial<Server> }>('/servers/:id', async (request) => {
    const before = getServer(request.params.id);
    const updated = updateServer(request.params.id, requireObject<Partial<Server>>(request.body));
    recordAudit(request, { action: 'SERVER_UPDATE', targetId: updated.id, summary: `서버 정보 수정: ${updated.name} (${updated.id})`, before, after: updated });
    return ok(updated);
  });

  // 미사용 / 다시 사용 (서버는 지우지 않습니다: 점검 결과와 보고서를 남기고 나중에 되살릴 수 있게)
  app.post<{ Params: IdParams }>('/servers/:id/deactivate', async (request) => {
    const before = getServer(request.params.id);
    const updated = deactivateServer(request.params.id);
    recordAudit(request, { action: 'SERVER_DEACTIVATE', targetId: updated.id, summary: `서버 미사용: ${updated.name} (${updated.id})`, before, after: updated });
    return ok(updated);
  });

  app.post<{ Params: IdParams }>('/servers/:id/activate', async (request) => {
    const before = getServer(request.params.id);
    const updated = activateServer(request.params.id);
    recordAudit(request, { action: 'SERVER_ACTIVATE', targetId: updated.id, summary: `서버 다시 사용: ${updated.name} (${updated.id})`, before, after: updated });
    return ok(updated);
  });

  app.get<{ Params: IdParams }>('/servers/:id/check-config', async (request) => ok(getCheckConfig(request.params.id)));

  app.put<{ Params: IdParams; Body: CheckConfigInput }>('/servers/:id/check-config', async (request) => {
    const body = requireObject<CheckConfigInput>(request.body);
    assertCheckConfigShape(body);
    const before = getCheckConfig(request.params.id);
    const { processes, directories, fileChecks, ports, httpChecks, scriptParts, roleChecks, rolePolicySettings, queryTemplateId, customQueryTemplateIds, policyIds } = body;
    const result = updateCheckConfig(request.params.id, {
      processes,
      directories,
      fileChecks,
      ports,
      httpChecks,
      scriptParts,
      roleChecks,
      rolePolicySettings,
      queryTemplateId,
      customQueryTemplateIds,
      policyIds,
    });
    recordAudit(request, { action: 'SERVER_CHECK_CONFIG_UPDATE', targetId: request.params.id, summary: `서버 점검 정책 저장: ${request.params.id}`, before, after: getCheckConfig(request.params.id) });
    return ok(result);
  });
}
