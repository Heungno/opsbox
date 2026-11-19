import { ServerRole } from './server';

export type TemplateKind = 'SCRIPT' | 'SCRIPT_PART' | 'QUERY';
export type ScriptPart = 'START' | 'HOST_INFO' | 'CPU' | 'MEMORY' | 'UPTIME' | 'DISK' | 'PROCESS' | 'DIRECTORY' | 'FILE_SIZE' | 'PORT' | 'HTTP' | 'WEB' | 'WAS' | 'DATABASE' | 'SAVE';

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
