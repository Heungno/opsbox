import { getResultByFile, getHealthStatus, getResultSummaries } from '../results/service';
import { getReportFields } from './rules';
import { getAllServers, getServerRoles } from '../servers/service';
import type { ReportDetail, ReportListItem, ReportListQuery } from './types';

export function getAllReports(filter?: ReportListQuery): ReportListItem[] {
  // 미사용 서버의 보고서도 남깁니다(서버를 지우지 않는 이유).
  const servers = getAllServers({ includeInactive: true });
  const reports: ReportListItem[] = [];

  const targetServers = filter?.serverId
    ? servers.filter(
        (s) =>
          s.id.toLowerCase().includes(filter.serverId!.toLowerCase()) ||
          s.name.toLowerCase().includes(filter.serverId!.toLowerCase()),
      )
    : servers;

  const serverById = new Map(targetServers.map((server) => [server.id, server]));
  const summaries = getResultSummaries([...serverById.keys()], { startDate: filter?.startDate, endDate: filter?.endDate });

  for (const summary of summaries) {
    const server = serverById.get(summary.serverId)!;
    reports.push({
      serverId: server.id,
      serverName: server.name,
      serverType: getServerRoles(server)[0],
      serverTypes: getServerRoles(server),
      products: server.products,
      os: server.os,
      hostname: summary.hostname || '-',
      checkDate: summary.checkDate,
      fileName: summary.fileName,
      health: summary.status,
      cpu: summary.cpu as number,
      memory: summary.memory as number,
      disk: summary.disk as number,
    });
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
