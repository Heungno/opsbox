import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../audit/service';
import { deletePolicy, getPolicies, savePolicy } from './service';
import type { IdParams } from '../../shared/api-types';
import type { PolicyDraft } from './types';
import { ok, requireObject } from '../../shared/http';

const findPolicy = (id: string) => getPolicies().find((policy) => policy.id === id);

export async function policyRoutes(app: FastifyInstance) {
  app.get('/policies', async () => ok(getPolicies()));

  app.post<{ Body: Partial<PolicyDraft> }>('/policies', async (request) => {
    const saved = savePolicy(requireObject<Partial<PolicyDraft>>(request.body));
    recordAudit(request, { action: 'POLICY_CREATE', targetId: saved.id, summary: `점검 정책 추가: ${saved.name} (${saved.os} · ${saved.category})`, before: {}, after: saved });
    return ok(saved);
  });

  app.put<{ Params: IdParams; Body: Partial<PolicyDraft> }>('/policies/:id', async (request) => {
    const before = findPolicy(request.params.id);
    const saved = savePolicy(requireObject<Partial<PolicyDraft>>(request.body), request.params.id);
    recordAudit(request, { action: 'POLICY_UPDATE', targetId: saved.id, summary: `점검 정책 수정: ${saved.name} (${saved.os} · ${saved.category})`, before, after: saved });
    return ok(saved);
  });

  app.delete<{ Params: IdParams }>('/policies/:id', async (request) => {
    const before = findPolicy(request.params.id);
    deletePolicy(request.params.id);
    recordAudit(request, { action: 'POLICY_DELETE', targetId: request.params.id, summary: `점검 정책 삭제: ${before?.name ?? request.params.id}`, before, after: {} });
    return ok(null);
  });
}
