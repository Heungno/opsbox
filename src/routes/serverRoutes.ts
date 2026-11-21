import type { FastifyInstance } from 'fastify';

import { NotFoundError, ValidationError } from '../errors';
import { recordAudit } from '../services/auditService';
import { createServer, deleteServer, getAllServers, getCheckConfig, getServer, updateCheckConfig, updateServer } from '../services/serverService';
import type { IdParams } from '../types/api';
import type { CheckConfigInput, Server } from '../types/server';
import { ok, requireObject } from '../utils/http';

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
  app.get('/servers', async () => ok(getAllServers()));

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

  app.delete<{ Params: IdParams }>('/servers/:id', async (request) => {
    const before = getServer(request.params.id);
    deleteServer(request.params.id);
    recordAudit(request, { action: 'SERVER_DELETE', targetId: request.params.id, summary: `서버 삭제: ${before?.name ?? ''} (${request.params.id})`, before, after: {} });
    return ok(null);
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
