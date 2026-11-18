import { FastifyInstance } from 'fastify';
import { generateScript } from '../services/scriptService';
import { getServer } from '../services/serverService';

export async function scriptRoutes(app: FastifyInstance) {
  app.get('/scripts/generate/:serverId', async (req, reply) => {
    const { serverId } = req.params as {
      serverId: string;
    };
    const script = generateScript(serverId);

    const extension = getServer(serverId)?.os === 'Linux' ? 'sh' : 'ps1';

    reply.header('Content-Disposition', `attachment; filename=${serverId}.${extension}`);

    reply.type('text/plain; charset=utf-8');

    // Windows PowerShell 5 interprets BOM-less UTF-8 script files using the local ANSI code page.
    return extension === 'ps1' ? `\uFEFF${script}` : script;
  });
}
