import { FastifyInstance } from 'fastify';
import { deleteTemplate, getTemplates, saveTemplate } from '../services/templateService';

export async function templateRoutes(app: FastifyInstance) {
  app.get('/templates', async (request) => getTemplates(request.query as { kind?: string }));
  app.post('/templates', async (request) => ({ success: true, data: saveTemplate(request.body as any) }));
  app.put('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { success: true, data: saveTemplate(request.body as any, id) };
  });
  app.delete('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteTemplate(id);
    return { success: true };
  });
}
