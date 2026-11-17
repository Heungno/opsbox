import { FastifyInstance } from 'fastify';

import { getReport } from '../services/reportService';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/report/:serverId/:fileName', async (request) => {
    const { serverId, fileName } = request.params as {
      serverId: string;
      fileName: string;
    };

    const report = getReport(serverId, fileName);

    if (!report) {
      return {
        success: false,
        message: 'Report not found',
      };
    }

    return {
      success: true,
      data: report,
    };
  });
}
