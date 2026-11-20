import { FastifyInstance } from 'fastify';
import { deleteTemplate, getTemplateHistory, getTemplates, restoreTemplateVersion, saveTemplate } from '../services/templateService';

export async function templateRoutes(app: FastifyInstance) {
  app.get('/templates', async (request) => getTemplates(request.query as { kind?: string }));
  app.post('/templates', async (request) => ({ success: true, data: saveTemplate(request.body as any) }));
  app.put('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { success: true, data: saveTemplate(request.body as any, id) };
  });
  app.get('/templates/:id/history', async (request) => {
    const { id } = request.params as { id: string };
    return getTemplateHistory(id);
  });
  app.post('/templates/:id/history/:versionId/restore', async (request) => {
    const { id, versionId } = request.params as { id: string; versionId: string };
    return { success: true, data: restoreTemplateVersion(id, versionId) };
  });
  app.delete('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteTemplate(id);
    return { success: true };
  });
}
