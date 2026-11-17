import { FastifyInstance } from 'fastify';
import { getResults, getLatestResult, getResultByFile, getHealthStatus } from '../services/resultService';

export async function resultRoutes(app: FastifyInstance) {
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
