export interface ProcessCheck {
  name: string;
}

export interface DirectoryCheck {
  path: string;
  warningPercent: number;
  criticalPercent: number;
}

export interface FileCheck {
  path: string;
  warningSizeMB: number;
  criticalSizeMB: number;
}

export interface ServerPolicy {
  minUptimeMinutes: number;
}

export interface PortCheck {
  port: number;
  protocol?: "TCP" | "UDP";
  description?: string;
}

export interface HttpCheck { name: string; url: string; expectedStatus?: number; }

export interface Server {
  id: string;
  name: string;
  type: 'WEB' | 'WAS' | 'DB' | 'OTHER';
  product?: 'WebtoB' | 'Apache HTTP Server' | 'IIS' | 'Nginx' | 'JEUS' | 'Apache Tomcat' | 'JBoss' | 'Node.js' | 'MSSQL' | 'MariaDB' | 'CUBRID' | 'PostgreSQL';
  os: 'Windows' | 'Linux';
  ip: string;
  policy?: ServerPolicy;
  sharedPath: string;
  processes: ProcessCheck[];
  directories: DirectoryCheck[];
  fileChecks?: FileCheck[];
  ports?: PortCheck[];
  httpChecks?: HttpCheck[];
}

