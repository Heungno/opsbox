import type { FastifyInstance } from 'fastify';

import { getDashboardSummary, getRecentChecks } from '../services/dashboardService';
import { ok } from '../shared/http';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard/summary', async () => ok(getDashboardSummary()));
  app.get('/dashboard/recent', async () => ok(getRecentChecks()));
}
