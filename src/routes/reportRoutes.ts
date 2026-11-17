import { FastifyInstance } from 'fastify';
import { getReport, getAllReports } from '../services/reportService';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports', async (request) => {
    const query = request.query as {
      serverId?: string;
      startDate?: string;
      endDate?: string;
    };

    const reports = getAllReports(query);

    return {
      success: true,
      count: reports.length,
      data: reports,
    };
  });

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
