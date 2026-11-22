import type { ScriptPart } from '../templates/types';
import type { OperatingSystem, PolicyCategory, PolicyRoleCategory } from '../policies/types';
import type { CommonCodeValue } from '../common-codes/types';
export type { PolicyCategory } from '../policies/types';

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
  /** 이 서버만 다른 결과 저장 경로(대상 서버가 보는 경로). 없으면 설정 → 결과 수집의 OS별 기본값 */
  resultPath?: string;
  /** 미사용 서버는 false (대시보드·스크립트·결과 가져오기에서 빠지고 보고서는 남음) */
  enabled: boolean;
  processes: ProcessCheck[];
  directories: DirectoryCheck[];
  fileChecks?: FileCheck[];
  ports?: PortCheck[];
  httpChecks?: HttpCheck[];
}


/** 점검 정책 설정 (GET/PUT /api/servers/:id/check-config) */
export interface CheckConfig {
  processes: ProcessCheck[];
  directories: DirectoryCheck[];
  fileChecks: FileCheck[];
  ports: PortCheck[];
  httpChecks: HttpCheck[];
  scriptParts: Partial<Record<ScriptPart, string>>;
  roleChecks: Partial<Record<RolePolicyType, ScriptPart[]>>;
  rolePolicySettings: Partial<Record<ScriptPart, RolePolicySetting>>;
  queryTemplateId: string;
  customQueryTemplateIds: string[];
  policyIds: Partial<Record<PolicyCategory, string>>;
}

export type CheckConfigInput = Partial<CheckConfig>;

/** check_config 열에 저장하는 점검 설정 (화면에서 저장한 값) */
export type StoredCheckConfig = Omit<CheckConfig, 'queryTemplateId'> & { queryTemplateId?: string };

/** servers·server_roles·server_policies 행을 모은 저장 형태 */
export interface ServerRecord {
  id: string;
  name: string;
  os: OperatingSystem;
  ip: string;
  resultPath: string | null;
  enabled: boolean;
  roles: ServerRole[];
  products: Partial<Record<ServerRole, ServerProduct>>;
  policyIds: Partial<Record<PolicyCategory, string>>;
  checkConfig: StoredCheckConfig;
}
