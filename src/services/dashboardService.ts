import { getAllServers } from './serverService';

import { getLatestResult, getHealthStatus } from './resultService';

export function getDashboardSummary() {
  const servers = getAllServers();

  let web = 0;
  let was = 0;
  let db = 0;

  let healthy = 0;
  let warning = 0;
  let critical = 0;

  servers.forEach((server) => {
    switch (server.type) {
      case 'WEB':
        web++;
        break;

      case 'WAS':
        was++;
        break;

      case 'DB':
        db++;
        break;
    }

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
    healthy,
    warning,
    critical,
  };
}

export function getRecentChecks() {
  const servers = getAllServers();

  const checks: any[] = [];

  servers.forEach((server) => {
    const latest = getLatestResult(server.id);

    if (!latest) {
      return;
    }

    checks.push({
      serverId: server.id,

      serverName: server.name,

      serverType: server.type,

      checkDate: latest.checkDate,

      health: getHealthStatus(latest),

      cpu: latest.cpu,

      memory: latest.memory,

      disk: latest.disk,
    });
  });

  return checks.sort((a, b) => b.checkDate.localeCompare(a.checkDate)).slice(0, 10);
}
