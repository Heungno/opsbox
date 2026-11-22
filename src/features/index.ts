import type { FastifyInstance } from 'fastify';
import { serverRoutes } from './servers/routes';
import { scriptRoutes } from './scripts/routes';
import { resultRoutes } from './results/routes';
import { dashboardRoutes } from './dashboard/routes';
import { reportRoutes } from './reports/routes';
import { templateRoutes } from './templates/routes';
import { commonCodeRoutes } from './common-codes/routes';
import { policyRoutes } from './policies/routes';
import { authRoutes } from './auth/routes';
import { auditRoutes } from './audit/routes';
import { checkBuilderRoutes } from './scripts/check-builder/routes';
import { settingsRoutes } from './settings/routes';

/** 모든 기능의 API 라우트 (app.ts에서 /api 아래에 등록) */
export async function apiRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(serverRoutes);
  await app.register(scriptRoutes);
  await app.register(resultRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(templateRoutes);
  await app.register(commonCodeRoutes);
  await app.register(policyRoutes);
  await app.register(auditRoutes);
  await app.register(checkBuilderRoutes);
  await app.register(settingsRoutes);
}
