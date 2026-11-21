import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../services/auditService';
import { deleteTemplate, getTemplate, getTemplateHistory, getTemplates, restoreTemplateVersion, saveTemplate } from '../services/templateService';
import type { IdParams } from '../types/api';
import type { ManagedTemplate } from '../types/template';
import { ok, requireObject } from '../utils/http';

/** 변경 전 상태 (이후 저장에서 같은 객체가 바뀌지 않도록 복사) */
const snapshot = (id: string) => structuredClone(getTemplate(id));

export async function templateRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { kind?: string } }>('/templates', async (request) => ok(getTemplates(request.query)));

  app.post<{ Body: Partial<ManagedTemplate> }>('/templates', async (request) => {
    const saved = saveTemplate(requireObject<Partial<ManagedTemplate>>(request.body));
    recordAudit(request, { action: 'TEMPLATE_CREATE', targetId: saved.id, summary: `템플릿 추가: ${saved.name}`, before: {}, after: saved });
    return ok(saved);
  });

  app.put<{ Params: IdParams; Body: Partial<ManagedTemplate> }>('/templates/:id', async (request) => {
    const before = snapshot(request.params.id);
    const saved = saveTemplate(requireObject<Partial<ManagedTemplate>>(request.body), request.params.id);
    recordAudit(request, { action: 'TEMPLATE_UPDATE', targetId: saved.id, summary: `템플릿 수정: ${saved.name}`, before, after: saved });
    return ok(saved);
  });

  app.get<{ Params: IdParams }>('/templates/:id/history', async (request) => ok(getTemplateHistory(request.params.id)));

  app.post<{ Params: IdParams & { versionId: string } }>('/templates/:id/history/:versionId/restore', async (request) => {
    const before = snapshot(request.params.id);
    const restored = restoreTemplateVersion(request.params.id, request.params.versionId);
    recordAudit(request, { action: 'TEMPLATE_RESTORE', targetId: restored.id, summary: `템플릿 버전 복원: ${restored.name}`, before, after: restored, detail: { versionId: request.params.versionId } });
    return ok(restored);
  });

  app.delete<{ Params: IdParams }>('/templates/:id', async (request) => {
    const before = snapshot(request.params.id);
    deleteTemplate(request.params.id);
    recordAudit(request, { action: 'TEMPLATE_DELETE', targetId: request.params.id, summary: `템플릿 삭제: ${before?.name ?? request.params.id}`, before, after: {} });
    return ok(null);
  });
}
