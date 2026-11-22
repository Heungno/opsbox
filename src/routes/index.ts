import type { FastifyInstance } from 'fastify';
import { serverRoutes } from '../features/servers/routes';
import { scriptRoutes } from '../features/scripts/routes';
import { resultRoutes } from '../features/results/routes';
import { dashboardRoutes } from '../features/dashboard/routes';
import { reportRoutes } from '../features/reports/routes';
import { templateRoutes } from '../features/templates/routes';
import { commonCodeRoutes } from '../features/common-codes/routes';
import { policyRoutes } from '../features/policies/routes';
import { authRoutes } from '../features/auth/routes';
import { auditRoutes } from '../features/audit/routes';
import { checkBuilderRoutes } from '../features/scripts/check-builder/routes';
import { settingsRoutes } from '../features/settings/routes';

export async function routes(app: FastifyInstance) {
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
