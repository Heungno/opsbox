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

    // Return raw UTF-8 bytes so the BOM is not removed by string response handling.
    if (extension === 'ps1') {
      const content = Buffer.from(script.replace(/^\uFEFF/, ''), 'utf8');
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]);
    }
    return script;
  });
}
