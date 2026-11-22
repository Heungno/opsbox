import type { FastifyInstance } from 'fastify';

import { AUDIT_ACTIONS, listAuditLogs } from '../services/auditService';
import type { AuditLogQuery } from '../types/audit';
import { ok } from '../shared/http';

export async function auditRoutes(app: FastifyInstance) {
  // 작업 종류 목록 (화면의 필터·표시 이름)
  app.get('/audit-logs/actions', async () => ok(AUDIT_ACTIONS));

  app.get<{ Querystring: AuditLogQuery }>('/audit-logs', async (request) => {
    const { items, ...meta } = listAuditLogs(request.query);
    return ok(items, meta);
  });
}
