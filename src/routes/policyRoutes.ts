import type { FastifyInstance } from 'fastify';

import { deletePolicy, getPolicies, savePolicy } from '../services/policyService';
import type { IdParams } from '../types/api';
import type { PolicyDraft } from '../types/policy';
import { ok, requireObject } from '../utils/http';

export async function policyRoutes(app: FastifyInstance) {
  app.get('/policies', async () => ok(getPolicies()));

  app.post<{ Body: Partial<PolicyDraft> }>('/policies', async (request) => ok(savePolicy(requireObject<Partial<PolicyDraft>>(request.body))));

  app.put<{ Params: IdParams; Body: Partial<PolicyDraft> }>('/policies/:id', async (request) =>
    ok(savePolicy(requireObject<Partial<PolicyDraft>>(request.body), request.params.id)),
  );

  app.delete<{ Params: IdParams }>('/policies/:id', async (request) => {
    deletePolicy(request.params.id);
    return ok(null);
  });
}
