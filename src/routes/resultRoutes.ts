import { FastifyInstance } from 'fastify';
import { getResults, getLatestResult, getResultByFile, getHealthStatus } from '../services/resultService';
import { getImportStatus, importResults } from '../services/resultImportService';

export async function resultRoutes(app: FastifyInstance) {
  // 공유 폴더의 점검 결과 JSON을 지금 바로 가져오기 (DB 저장 → 암호화 백업 → 원본 삭제)
  app.post('/results/import', async (_request, reply) => {
    try {
      return { success: true, data: importResults() };
    } catch (error) {
      return reply.code(409).send({ success: false, message: (error as Error).message });
    }
  });

  app.get('/results/import/status', async () => ({ success: true, data: getImportStatus() }));

  app.get('/results/:serverId', async (request) => {
    const { serverId } = request.params as {
      serverId: string;
    };

    const results = getResults(serverId);

    return {
      success: true,
      count: results.length,
      data: results,
    };
  });

  app.get('/results/:serverId/latest', async (request) => {
    const { serverId } = request.params as {
      serverId: string;
    };

    const result = getLatestResult(serverId);

    if (!result) {
      return {
        success: false,
        message: '점검 결과가 없습니다.',
      };
    }

    return {
      success: true,
      health: getHealthStatus(result),
      data: result,
    };
  });

  app.get('/results/:serverId/file/:fileName', async (request) => {
    const { serverId, fileName } = request.params as {
      serverId: string;
      fileName: string;
    };

    const result = getResultByFile(serverId, fileName);

    if (!result) {
      return {
        success: false,
        message: '결과 파일을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      health: getHealthStatus(result),
      data: result,
    };
  });
}
