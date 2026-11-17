import fs from 'fs';
import path from 'path';

import { FastifyInstance } from 'fastify';
import { getScripts, getScriptById } from '../services/scriptService';

export async function scriptRoutes(app: FastifyInstance) {
  app.get('/scripts/:type/:os', async (request) => {
    const { type, os } = request.params as {
      type: string;
      os: string;
    };

    return getScripts(type, os);
  });

  app.get('/scripts/download/:id', async (request, reply) => {
    const { id } = request.params as {
      id: string;
    };

    const script = getScriptById(id);

    if (!script) {
      reply.code(404);

      return {
        success: false,
        message: '스크립트를 찾을 수 없습니다.',
      };
    }

    const scriptsRoot = path.resolve(process.cwd(), 'scripts');

    const filePath = path.resolve(scriptsRoot, script.path);

    if (!filePath.startsWith(scriptsRoot)) {
      reply.code(403);

      return {
        success: false,
        message: '접근이 거부되었습니다.',
      };
    }

    if (!fs.existsSync(filePath)) {
      reply.code(404);

      return {
        success: false,
        message: '파일이 존재하지 않습니다.',
      };
    }

    reply.header('Content-Disposition', `attachment; filename="${script.name}"`);

    reply.header('Content-Type', 'application/octet-stream');

    return reply.send(fs.createReadStream(filePath));
  });
}
