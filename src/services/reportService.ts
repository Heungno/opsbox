import { getResultByFile, getHealthStatus, getResults } from './resultService';
import { getReportFields } from './reportRuleService';
import { getAllServers, getServerRoles } from './serverService';
import type { ReportDetail, ReportListItem, ReportListQuery } from '../types/report';

export function getAllReports(filter?: ReportListQuery): ReportListItem[] {
  const servers = getAllServers();
  const reports: ReportListItem[] = [];

  const targetServers = filter?.serverId
    ? servers.filter(
        (s) =>
          s.id.toLowerCase().includes(filter.serverId!.toLowerCase()) ||
          s.name.toLowerCase().includes(filter.serverId!.toLowerCase()),
      )
    : servers;

  for (const server of targetServers) {
    try {
      const results = getResults(server.id);
      for (const res of results) {
        if (!res.checkDate) continue;

        const checkDay = res.checkDate.slice(0, 10);
        if (filter?.startDate && checkDay < filter.startDate) {
          continue;
        }
        if (filter?.endDate && checkDay > filter.endDate) {
          continue;
        }

        reports.push({
          serverId: server.id,
          serverName: server.name,
          serverType: server.type,
          serverTypes: getServerRoles(server),
          products: server.products,
          os: server.os,
          hostname: res.hostname || '-',
          checkDate: res.checkDate,
          fileName: res.fileName,
          health: getHealthStatus(res),
          cpu: res.cpu,
          memory: res.memory,
          disk: res.disk,
        });
      }
    } catch (e) {
      // Ignore directory or parsing errors for servers with no results
    }
  }

  return reports.sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''));
}

export function getReport(serverId: string, fileName: string): ReportDetail | null {
  const result = getResultByFile(serverId, fileName);

  if (!result) {
    return null;
  }

  const fields = getReportFields(result.serverType);

  const metrics = fields.map((field) => ({
    key: field.key,

    label: field.label,

    category: field.category,

    value: result[field.key],
  }));

  return {
    serverId: result.server,

    serverType: result.serverType,

    health: getHealthStatus(result),

    checkDate: result.checkDate,

    metrics,
  };
}
