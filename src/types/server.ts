export interface ProcessCheck {
  name: string;
}

export interface DirectoryCheck {
  path: string;

  warningPercent: number;
  criticalPercent: number;
}

export interface ServerPolicy {
  minUptimeMinutes: number;
}

export interface Server {
  id: string;
  name: string;

  type: 'WEB' | 'WAS' | 'DB';
  os: 'Windows' | 'Linux';

  ip: string;
  policy?: ServerPolicy;

  sharedPath: string;

  processes: ProcessCheck[];

  directories: DirectoryCheck[];
}
