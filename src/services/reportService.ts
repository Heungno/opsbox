import { getResultByFile, getHealthStatus } from './resultService';
import { getReportFields } from './reportRuleService';

export function getReport(serverId: string, fileName: string) {
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
