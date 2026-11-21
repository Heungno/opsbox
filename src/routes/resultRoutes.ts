import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors';
import { getImportStatus, importResults } from '../services/resultImportService';
import { getHealthStatus, getLatestResult, getResultByFile, getResults } from '../services/resultService';
import type { ResultFileParams, ServerIdParams } from '../types/api';
import { ok } from '../utils/http';

export async function resultRoutes(app: FastifyInstance) {
  // 공유 폴더의 점검 결과 JSON을 지금 바로 가져오기 (DB 저장 → 암호화 백업 → 원본 삭제)
  app.post('/results/import', async () => ok(importResults()));

  app.get('/results/import/status', async () => ok(getImportStatus()));

  app.get<{ Params: ServerIdParams }>('/results/:serverId', async (request) => {
    const results = getResults(request.params.serverId);
    return ok(results, { count: results.length });
  });

  // 결과가 아직 없으면 오류가 아니라 data: null
  app.get<{ Params: ServerIdParams }>('/results/:serverId/latest', async (request) => {
    const result = getLatestResult(request.params.serverId);
    return ok(result, { health: result ? getHealthStatus(result) : null });
  });

  app.get<{ Params: ResultFileParams }>('/results/:serverId/file/:fileName', async (request) => {
    const result = getResultByFile(request.params.serverId, request.params.fileName);
    if (!result) throw new NotFoundError('점검 결과를 찾을 수 없습니다.');
    return ok(result, { health: getHealthStatus(result) });
  });
}
