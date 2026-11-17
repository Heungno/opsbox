import { FastifyInstance } from 'fastify';
import { generateScript } from '../services/scriptService';

export async function scriptRoutes(app: FastifyInstance) {
  app.get('/scripts/generate/:serverId', async (req, reply) => {
    const { serverId } = req.params as {
      serverId: string;
    };
    const script = generateScript(serverId);

    const extension = script.startsWith('#!') ? 'sh' : 'ps1';

    reply.header('Content-Disposition', `attachment; filename=${serverId}.${extension}`);

    reply.type('text/plain');

    return script;
  });
}
