import { ServerRole } from './server';

export type TemplateKind = 'SCRIPT' | 'QUERY';

export interface ManagedTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  os?: 'Windows' | 'Linux';
  role?: ServerRole;
  product?: string;
  enabled: boolean;
  content: string;
  updatedAt: string;
}
