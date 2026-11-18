import { ServerRole } from './server';

export type TemplateKind = 'SCRIPT' | 'SCRIPT_PART' | 'QUERY';
export type ScriptPart = 'START' | 'OS_DISK' | 'PROCESS' | 'DIRECTORY' | 'FILE_SIZE' | 'PORT' | 'HTTP' | 'WAS' | 'WEBTOB' | 'DATABASE' | 'SAVE';

export interface ManagedTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  os?: 'Windows' | 'Linux';
  role?: ServerRole;
  product?: string;
  item?: ScriptPart;
  enabled: boolean;
  content: string;
  updatedAt: string;
}
