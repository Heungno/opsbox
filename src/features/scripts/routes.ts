import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../audit/service';
import { DEFAULT_QUERY_PREFIX } from './db-query-defaults';
import { generateScript } from './service';
import { ok } from '../../shared/http';
import { getServer } from '../servers/service';
import type { ServerIdParams } from '../../shared/api-types';

export async function scriptRoutes(app: FastifyInstance) {
  // 점검 스크립트 다운로드. 생성 실패(설정 누락 등)는 JSON 오류로 응답합니다.
  // DB 제품별 기본 쿼리 템플릿 접두어 (서버 상세가 저장 전에 추가한 DB 항목의 기본 쿼리를 고를 때)
  app.get('/scripts/db-query-prefixes', async () => ok(DEFAULT_QUERY_PREFIX));

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
