import type { ScriptPart } from '../features/templates/types';
import type { OperatingSystem, PolicyCategory, PolicyRoleCategory } from '../features/policies/types';
import type { CommonCodeValue } from '../features/common-codes/types';
export type { PolicyCategory } from '../features/policies/types';

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
  /** `type`·`product`는 역할이 하나였던 예전 서버 데이터와의 호환용입니다. 새 코드는 roles·products를 씁니다. */
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

type ScriptPartMap = Partial<Record<ScriptPart, string>>;
type RoleSettings = Partial<Record<ScriptPart, RolePolicySetting>>;

/** DB(servers.data)에 저장하는 서버 구조 (기본정보 / 역할 / 정책 영역으로 나눔) */
export interface StoredServer {
  basicInfo: Pick<Server, 'id' | 'name' | 'os' | 'ip' | 'sharedPath'>;
  roles: { selected: ServerRole[]; products: Server['products'] };
  policy: {
    basic: Pick<Server, 'processes' | 'directories' | 'fileChecks' | 'ports' | 'httpChecks' | 'policy' | 'queryTemplateId' | 'policyIds'> & { scriptParts: ScriptPartMap; settings?: RoleSettings };
    web: { checks: ScriptPart[]; settings: RoleSettings; scriptParts: ScriptPartMap };
    was: { checks: ScriptPart[]; settings: RoleSettings; scriptParts: ScriptPartMap };
    db: { checks: ScriptPart[]; settings: RoleSettings; scriptParts: ScriptPartMap; customQueryTemplateIds: string[] };
  };
}
