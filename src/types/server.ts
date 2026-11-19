import type { ScriptPart } from './template';

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

export type ServerRole = 'WEB' | 'WAS' | 'DB' | 'OTHER';
export type RolePolicyType = 'WEB' | 'WAS' | 'DB';
export type ServerProduct = 'WebtoB' | 'Apache HTTP Server' | 'IIS' | 'Nginx' | 'JEUS' | 'Apache Tomcat' | 'JBoss' | 'Node.js' | 'MSSQL' | 'MariaDB' | 'CUBRID' | 'PostgreSQL';

export interface RolePolicySetting {
  logDirectories?: string[];
  periodDays?: number;
  instanceTargets?: string[];
}

export interface Server {
  id: string;
  name: string;
  /** `type` and `product` are kept for compatibility with older single-role records. */
  type: ServerRole;
  product?: ServerProduct;
  roles?: ServerRole[];
  products?: Partial<Record<ServerRole, ServerProduct>>;
  scriptParts?: Partial<Record<ScriptPart, string>>;
  roleChecks?: Partial<Record<RolePolicyType, ScriptPart[]>>;
  rolePolicySettings?: Partial<Record<ScriptPart, RolePolicySetting>>;
  queryTemplateId?: string;
  customQueryTemplateIds?: string[];
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

