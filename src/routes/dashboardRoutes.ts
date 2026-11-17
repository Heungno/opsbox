import { FastifyInstance } from 'fastify';

import { getDashboardSummary, getRecentChecks } from '../services/dashboardService';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard/summary', async () => {
    return {
      success: true,
      data: getDashboardSummary(),
    };
  });

  app.get('/dashboard/recent', async () => {
    return {
      success: true,
      data: getRecentChecks(),
    };
  });
}
