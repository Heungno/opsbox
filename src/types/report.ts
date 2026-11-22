import type { ServerProduct, ServerRole } from '../features/servers/types';
import type { CheckStatus } from '../features/results/types';

export interface DashboardSummary {
  total: number;
  web: number;
  was: number;
  db: number;
  other: number;
  healthy: number;
  warning: number;
  critical: number;
}

export interface RecentCheck {
  serverId: string;
  serverName: string;
  serverType: ServerRole;
  serverTypes: ServerRole[];
  fileName?: string;
  checkDate: string;
  health: CheckStatus;
  cpu: number;
  memory: number;
  disk: number;
}

export interface ReportListItem extends RecentCheck {
  products?: Partial<Record<ServerRole, ServerProduct>>;
  os: string;
  hostname: string;
}

export interface ReportListQuery {
  serverId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ReportField {
  key: string;
  label: string;
  category: 'resource' | 'service' | 'network' | 'database';
}

export interface ReportMetric extends ReportField {
  value: unknown;
}

export interface ReportDetail {
  serverId: string;
  serverType: string;
  health: CheckStatus;
  checkDate: string;
  metrics: ReportMetric[];
}
