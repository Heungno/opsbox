import type { FastifyInstance } from 'fastify';

import { deleteTemplate, getTemplateHistory, getTemplates, restoreTemplateVersion, saveTemplate } from '../services/templateService';
import type { IdParams } from '../types/api';
import type { ManagedTemplate } from '../types/template';
import { ok, requireObject } from '../utils/http';

export async function templateRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { kind?: string } }>('/templates', async (request) => ok(getTemplates(request.query)));

  app.post<{ Body: Partial<ManagedTemplate> }>('/templates', async (request) => ok(saveTemplate(requireObject<Partial<ManagedTemplate>>(request.body))));

  app.put<{ Params: IdParams; Body: Partial<ManagedTemplate> }>('/templates/:id', async (request) =>
    ok(saveTemplate(requireObject<Partial<ManagedTemplate>>(request.body), request.params.id)),
  );

  app.get<{ Params: IdParams }>('/templates/:id/history', async (request) => ok(getTemplateHistory(request.params.id)));

  app.post<{ Params: IdParams & { versionId: string } }>('/templates/:id/history/:versionId/restore', async (request) =>
    ok(restoreTemplateVersion(request.params.id, request.params.versionId)),
  );

  app.delete<{ Params: IdParams }>('/templates/:id', async (request) => {
    deleteTemplate(request.params.id);
    return ok(null);
  });
}
