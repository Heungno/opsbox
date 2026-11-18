import { serverRoutes } from './serverRoutes';
import { scriptRoutes } from './scriptRoutes';
import { resultRoutes } from './resultRoutes';
import { dashboardRoutes } from './dashboardRoutes';
import { reportRoutes } from './reportRoutes';
import { templateRoutes } from './templateRoutes';

export async function routes(app: FastifyInstance) {
  await app.register(serverRoutes);
  await app.register(scriptRoutes);
  await app.register(resultRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(templateRoutes);
}
