import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../services/auditService';
import { generateScript } from '../services/scriptService';
import { getServer } from '../features/servers/service';
import type { ServerIdParams } from '../types/api';

export async function scriptRoutes(app: FastifyInstance) {
  // 점검 스크립트 다운로드. 생성 실패(설정 누락 등)는 JSON 오류로 응답합니다.
  app.get<{ Params: ServerIdParams }>('/scripts/generate/:serverId', async (request, reply) => {
    const { serverId } = request.params;
    const script = generateScript(serverId);
    const extension = getServer(serverId)?.os === 'Linux' ? 'sh' : 'ps1';

    recordAudit(request, { action: 'SCRIPT_DOWNLOAD', targetId: serverId, summary: `점검 스크립트 다운로드: ${serverId}.${extension}` });

    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(serverId)}.${extension}"`);
    reply.type('text/plain; charset=utf-8');

    // PowerShell 5.1이 한글을 읽을 수 있도록 UTF-8 BOM을 붙여 바이트로 보냅니다.
    if (extension === 'ps1') {
      const content = Buffer.from(script.replace(/^﻿/, ''), 'utf8');
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]);
    }
    return script;
  });
}
