import type { ScriptPart } from './template';
import type { OperatingSystem, PolicyCategory, PolicyRoleCategory } from './policy';
import type { CommonCodeValue } from './commonCode';
export type { PolicyCategory } from './policy';

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
  protocol?: CommonCodeValue;
  description?: string;
}

export interface HttpCheck { name: string; url: string; expectedStatus?: number; }

export type ServerRole = CommonCodeValue;
export type RolePolicyType = PolicyRoleCategory;
export type ServerProduct = CommonCodeValue;

export interface RolePolicySetting {
  logDirectories?: string[];
  periodDays?: number;
  instanceTargets?: string[];
  queryTemplateId?: string;
  inputs?: Record<string, string | number>;
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
  policyIds?: Partial<Record<PolicyCategory, string>>;
  queryTemplateId?: string;
  customQueryTemplateIds?: string[];
  os: OperatingSystem;
  ip: string;
  policy?: ServerPolicy;
  sharedPath: string;
  processes: ProcessCheck[];
  directories: DirectoryCheck[];
  fileChecks?: FileCheck[];
  ports?: PortCheck[];
  httpChecks?: HttpCheck[];
}

