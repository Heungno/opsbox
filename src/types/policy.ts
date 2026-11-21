import type { CommonCodeValue } from './commonCode';

export type OperatingSystem = CommonCodeValue;
export type PolicyCategory = 'BASIC' | 'WEB' | 'WAS' | 'DB';
export type PolicyRoleCategory = Exclude<PolicyCategory, 'BASIC'>;

export type ExecutorType =
  | 'SCRIPT'
  | 'SQL_QUERY'
  | 'LOG_ANALYSIS'
  | 'CONSOLE_COMMAND'
  | 'HTTP_CHECK'
  | 'TCP_CHECK'
  | 'PROCESS_CHECK'
  | 'FILESYSTEM_CHECK';

export type ResultView = 'SUMMARY' | 'METRIC' | 'TABLE' | 'LOG_TABLE' | 'CONSOLE' | 'JSON';
export type PolicyInputType = 'TEXT' | 'NUMBER' | 'PATH' | 'PATH_LIST' | 'PORT';
export type PolicyInputScope = 'POLICY' | 'SERVER';

export interface ResultColumn {
  key: string;
  label: string;
}

export interface ResultComponent {
  type: ResultView;
  columns?: ResultColumn[];
}

export interface PolicyInput {
  key: string;
  label: string;
  type: PolicyInputType;
  scope: PolicyInputScope;
  required?: boolean;
  defaultValue?: string | number;
}

export interface PolicyExecutor {
  type: ExecutorType;
  templateId?: string;
  dbms?: string;
  options?: Record<string, unknown>;
}

export interface PolicyItemResult {
  components: ResultComponent[];
  statusField?: string;
  statusRules?: Record<string, unknown>;
}

export interface PolicyItem {
  id: string;
  name: string;
  enabled: boolean;
  executor: PolicyExecutor;
  inputs: PolicyInput[];
  result: PolicyItemResult;
}

export interface Policy {
  id: string;
  name: string;
  os: OperatingSystem;
  category: PolicyCategory;
  enabled: boolean;
  items: PolicyItem[];
  /** Derived field retained for the current server-config API. */
  checks: string[];
}

export type PolicyDraft = Omit<Policy, 'id' | 'checks'> & { id?: string };
