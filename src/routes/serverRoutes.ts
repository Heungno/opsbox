import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors';
import { createServer, deleteServer, getAllServers, getCheckConfig, getServer, updateCheckConfig, updateServer } from '../services/serverService';
import type { IdParams } from '../types/api';
import type { CheckConfigInput, Server } from '../types/server';
import { ok, requireObject } from '../utils/http';

export async function serverRoutes(app: FastifyInstance) {
  app.get('/servers', async () => ok(getAllServers()));

  app.get<{ Params: IdParams }>('/servers/:id', async (request) => {
    const server = getServer(request.params.id);
    if (!server) throw new NotFoundError(`서버를 찾을 수 없습니다: ${request.params.id}`);
    return ok(server);
  });

  app.post<{ Body: Server }>('/servers', async (request) => ok(createServer(requireObject<Server>(request.body))));

  app.put<{ Params: IdParams; Body: Partial<Server> }>('/servers/:id', async (request) =>
    ok(updateServer(request.params.id, requireObject<Partial<Server>>(request.body))),
  );

  app.delete<{ Params: IdParams }>('/servers/:id', async (request) => {
    deleteServer(request.params.id);
    return ok(null);
  });

  app.get<{ Params: IdParams }>('/servers/:id/check-config', async (request) => ok(getCheckConfig(request.params.id)));

  app.put<{ Params: IdParams; Body: CheckConfigInput }>('/servers/:id/check-config', async (request) => {
    const body = requireObject<CheckConfigInput>(request.body);
    const { processes, directories, fileChecks, ports, httpChecks, scriptParts, roleChecks, rolePolicySettings, queryTemplateId, customQueryTemplateIds, policyIds } = body;
    return ok(updateCheckConfig(request.params.id, {
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
    }));
  });
}
