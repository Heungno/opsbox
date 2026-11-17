import { serverRoutes } from './serverRoutes';
import { scriptRoutes } from './scriptRoutes';
import { resultRoutes } from './resultRoutes';
import { dashboardRoutes } from './dashboardRoutes';
import { reportRoutes } from './reportRoutes';

export async function routes(app: FastifyInstance) {
  await app.register(serverRoutes);

  await app.register(scriptRoutes);

  await app.register(resultRoutes);

  await app.register(dashboardRoutes);

  await app.register(reportRoutes);
}
