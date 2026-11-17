export interface ProcessCheckResult {
  name: string;
  running: boolean;
  memoryMB: number;
  uptimeMinutes: number;
}

export interface DirectoryCheckResult {
  path: string;
  exists: boolean;
  sizeGB: number;
  usedGB: number;
  freeGB: number;
  totalGB: number;
  usagePercent: number;
}

export interface PortCheckResult {
  port: number;
  protocol: 'TCP' | 'UDP';
  listening: boolean;
  processName?: string;
}

export interface CheckResult {
  hostname: string;
  checkDate: string;
  uptimeMinutes: number;
  cpu: number;
  memory: number;
  disk: number;
  processes: ProcessCheckResult[];
  directories: DirectoryCheckResult[];
  ports: PortCheckResult[];
}
