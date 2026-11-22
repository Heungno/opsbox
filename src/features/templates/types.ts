import type { ServerRole } from '../servers/types';
import type { CommonCodeValue } from '../common-codes/types';
import type { OperatingSystem } from '../policies/types';

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
  /** 점검 만들기가 생성한 조각. 생성 당시 내용 해시와 지금 내용이 다르면 '직접 편집됨'. 화면에서 보낸 값은 무시합니다. */
  generated?: GeneratedInfo;
}

export interface GeneratedInfo {
  by: 'CHECK_BUILDER';
  generatorVersion: number;
  itemId: string;
  contentSha256: string;
}

export interface TemplateVersion {
  versionId: string;
  savedAt: string;
  template: ManagedTemplate;
}
