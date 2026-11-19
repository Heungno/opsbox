import { ServerRole } from './server';

export type TemplateKind = 'SCRIPT' | 'SCRIPT_PART' | 'QUERY';
export type ScriptPart = 'START' | 'HOST_INFO' | 'CPU' | 'MEMORY' | 'UPTIME' | 'DISK' | 'PROCESS' | 'DIRECTORY' | 'FILE_SIZE' | 'PORT' | 'HTTP' | 'WEB' | 'WAS' | 'DATABASE' | 'WEB_ENGINE_STATUS' | 'WEB_WAS_CONNECTION' | 'WEB_REQUEST_VOLUME' | 'WEB_LOG' | 'WAS_JVM_HEAP' | 'WAS_THREAD_POOL' | 'WAS_LONG_RUNNING_THREAD' | 'WAS_DB_CONNECTION_POOL' | 'WAS_DEPLOYMENT' | 'WAS_HEAP_DUMP' | 'WAS_STARTUP_SCRIPT' | 'WAS_LOG' | 'DB_QUERY_RUNNER' | 'DB_INSTANCE_STATUS' | 'DB_PROCESS_LIMIT' | 'DB_TABLESPACE' | 'DB_BACKUP' | 'DB_ARCHIVE_MODE' | 'DB_TRANSACTION_LOG' | 'DB_REPLICATION' | 'DB_CUSTOM_QUERY' | 'SAVE';

export interface ManagedTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  os?: 'Windows' | 'Linux';
  role?: ServerRole;
  product?: string;
  item?: ScriptPart;
  usesQueryTemplate?: boolean;
  enabled: boolean;
  content: string;
  updatedAt: string;
}
