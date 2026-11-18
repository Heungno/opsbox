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

export interface FileCheckResult {
  path: string;
  exists: boolean;
  sizeBytes: number;
  sizeMB: number;
  status: 'Healthy' | 'Warning' | 'Critical';
}

export interface DiskCheckResult {
  device: string;
  mountPoint?: string;
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usagePercent: number;
  status: 'Healthy' | 'Warning' | 'Critical';
}

export interface PortCheckResult {
  port: number;
  protocol: 'TCP' | 'UDP';
  listening: boolean;
  processName?: string;
  description?: string;
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
  fileChecks?: FileCheckResult[];
  disks?: DiskCheckResult[];
  ports?: PortCheckResult[];
}
