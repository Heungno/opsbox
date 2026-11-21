import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors';
import { getAllReports, getReport } from '../services/reportService';
import type { ResultFileParams } from '../types/api';
import type { ReportListQuery } from '../types/report';
import { ok } from '../utils/http';

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ReportListQuery }>('/reports', async (request) => {
    const reports = getAllReports(request.query);
    return ok(reports, { count: reports.length });
  });

  app.get<{ Params: ResultFileParams }>('/report/:serverId/:fileName', async (request) => {
    const report = getReport(request.params.serverId, request.params.fileName);
    if (!report) throw new NotFoundError('보고서를 찾을 수 없습니다.');
    return ok(report);
  });
}
