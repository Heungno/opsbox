import { getAllServers, getServerRoles } from '../servers/service';

import { getLatestResult, getHealthStatus } from '../results/service';
import type { DashboardSummary, RecentCheck } from '../reports/types';

export function getDashboardSummary(): DashboardSummary {
  const servers = getAllServers();

  let web = 0;
  let was = 0;
  let db = 0;
  let other = 0;

  let healthy = 0;
  let warning = 0;
  let critical = 0;

  servers.forEach((server) => {
    const roles = getServerRoles(server);
    if (roles.includes('WEB')) web++;
    if (roles.includes('WAS')) was++;
    if (roles.includes('DB')) db++;
    if (roles.includes('OTHER')) other++;

    const latest = getLatestResult(server.id);

    if (!latest) {
      return;
    }

    const health = getHealthStatus(latest);

    switch (health) {
      case 'Healthy':
        healthy++;
        break;

      case 'Warning':
        warning++;
        break;

      case 'Critical':
        critical++;
        break;
    }
  });

  return {
    total: servers.length,
    web,
    was,
    db,
    other,
    healthy,
    warning,
    critical,
  };
}

export function getRecentChecks(): RecentCheck[] {
  const servers = getAllServers();

  const checks: RecentCheck[] = [];

  servers.forEach((server) => {
    const latest = getLatestResult(server.id);

    if (!latest) {
      return;
    }

    checks.push({
      serverId: server.id,

      serverName: server.name,

      serverType: getServerRoles(server)[0],
      serverTypes: getServerRoles(server),

      fileName: latest.fileName,

      checkDate: latest.checkDate,

      health: getHealthStatus(latest),

      cpu: latest.cpu,

      memory: latest.memory,

      disk: latest.disk,
    });
  });

  return checks.sort((a, b) => b.checkDate.localeCompare(a.checkDate)).slice(0, 10);
}
