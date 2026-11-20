import type { FastifyInstance } from 'fastify';
import { deletePolicy, getPolicies, savePolicy } from '../services/policyService';

export async function policyRoutes(app: FastifyInstance) {
  app.get('/policies', async () => getPolicies());
  app.post('/policies', async (request) => ({ success: true, data: savePolicy(request.body as any) }));
  app.put('/policies/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { success: true, data: savePolicy(request.body as any, id) };
  });
  app.delete('/policies/:id', async (request) => {
    const { id } = request.params as { id: string };
    deletePolicy(id); return { success: true };
  });
}
