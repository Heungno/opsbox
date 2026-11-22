import type { FastifyInstance } from 'fastify';

import { BadRequestError, NotFoundError } from '../../shared/errors';
import { recordAudit } from '../../services/auditService';
import { getImportStatus, importResults, logImportSummary, storeUploadedResult } from './importer';
import { getHealthStatus, getLatestResult, getResultByFile, getResults } from './service';
import type { ResultFileParams, ServerIdParams } from '../../types/api';
import { ok } from '../../shared/http';

// 결과 JSON에는 콘솔 출력·쿼리 결과가 들어갈 수 있어 기본 한도(1MB)보다 넉넉히 둡니다.
const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

export async function resultRoutes(app: FastifyInstance) {
  // 공유 폴더의 점검 결과 JSON을 지금 바로 가져오기 (DB 저장 → 암호화 백업 → 원본 삭제)
  app.post('/results/import', async (request) => {
    const summary = importResults();
    logImportSummary(summary, 'manual');
    recordAudit(request, {
      action: 'RESULT_IMPORT',
      summary: `수동 가져오기: 신규 ${summary.imported}건, 중복 ${summary.duplicates}건, 실패 ${summary.failed}건`,
      detail: { trigger: 'manual', imported: summary.imported, duplicates: summary.duplicates, failed: summary.failed, errors: summary.errors },
    });
    return ok(summary);
  });

  app.get('/results/import/status', async () => ok(getImportStatus()));

  // 점검자가 내려받은 결과 파일을 화면에서 올리기. 공유 폴더 가져오기와 같은 검증·저장·백업을 거칩니다.
  // 브라우저가 파일을 읽어 { fileName, content, serverId? } JSON으로 보냅니다.
  app.post<{ Body: { fileName?: unknown; content?: unknown; serverId?: unknown } }>(
    '/results/upload',
    { bodyLimit: UPLOAD_LIMIT_BYTES },
    async (request) => {
      const { fileName, content, serverId } = request.body ?? {};
      if (typeof content !== 'string' || !content.trim()) throw new BadRequestError('올릴 결과 파일을 선택하세요.');
      const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'result.json';
      const expected = typeof serverId === 'string' && serverId.trim() ? serverId.trim() : undefined;
      const stored = storeUploadedResult(Buffer.from(content, 'utf8'), name, expected);
      recordAudit(request, {
        action: 'RESULT_UPLOAD',
        targetId: stored.serverId,
        summary: `결과 파일 올리기: ${stored.fileName} (${stored.outcome === 'imported' ? '신규' : '이미 있는 결과'})`,
        detail: { fileName: stored.fileName, checkDate: stored.checkDate, outcome: stored.outcome },
      });
      return ok(stored);
    },
  );

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
