import type { ServerRole } from './server';
import type { CommonCodeValue } from './commonCode';
import type { OperatingSystem } from './policy';

export type TemplateKind = CommonCodeValue;
export type ScriptPart = CommonCodeValue;

export interface ManagedTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  os?: OperatingSystem;
  role?: ServerRole;
  product?: string;
  dbms?: string;
  item?: ScriptPart;
  usesQueryTemplate?: boolean;
  enabled: boolean;
  content: string;
  updatedAt: string;
}

export interface TemplateVersion {
  versionId: string;
  savedAt: string;
  template: ManagedTemplate;
}
