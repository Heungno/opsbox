import type { CommonCodeValue } from '../features/common-codes/types';

export interface ProcessCheckResult {
  name: string;
  running: boolean;
  memoryMB: number;
  uptimeMinutes: number;
}

export interface DirectoryCheckResult {
  path: string;
  exists: boolean;
  sizeGB: number;
  usedGB: number;
  freeGB: number;
  totalGB: number;
  usagePercent: number;
}

export interface FileCheckResult {
  path: string;
  exists: boolean;
  sizeBytes: number;
  sizeMB: number;
  status: 'Healthy' | 'Warning' | 'Critical';
}

export interface DiskCheckResult {
  device: string;
  mountPoint?: string;
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usagePercent: number;
  status: 'Healthy' | 'Warning' | 'Critical';
}

export interface PortCheckResult {
  port: number;
  protocol: CommonCodeValue;
  listening: boolean;
  processName?: string;
  description?: string;
}

export interface HttpCheckResult { name: string; url: string; expectedStatus: number; statusCode?: number; responseTimeMs?: number; success: boolean; error?: string; }

export interface WasRuntimeCheckResult {
  processId: number;
  processName: string;
  heapUsedMB?: number;
  heapCapacityMB?: number;
  heapUsagePercent?: number;
  status: 'Healthy' | 'Warning' | 'Critical' | 'NotCollected';
  message?: string;
}

export interface WebtoBCheckResult {
  status: 'Healthy' | 'Warning' | 'Critical' | 'NotCollected';
  command: string;
  output?: string;
  message?: string;
}

export interface DatabaseCheckResult {
  product: string;
  status: 'Healthy' | 'Warning' | 'Critical' | 'NotCollected';
  serverName?: string;
  version?: string;
  edition?: string;
  databaseCount?: number;
  offlineCount?: number;
  databases?: Array<{
    name: string;
    state: string;
    recoveryModel?: string;
    sizeMB?: number;
    status: 'Healthy' | 'Warning' | 'Critical';
  }>;
  message?: string;
}

/** 서버 종합 상태 */
export type HealthStatus = 'Healthy' | 'Warning' | 'Critical';
/** 개별 점검 항목 상태 (수집 실패 포함) */
export type CheckStatus = HealthStatus | 'NotCollected';

export interface RolePolicyItemResult {
  item?: string;
  name?: string;
  status?: string;
  message?: string;
  detail?: unknown;
}

export interface RolePolicyResult {
  status?: string;
  items?: RolePolicyItemResult[];
}

/**
 * 화면에서 쓰는 점검 결과 (원본 JSON을 parseResultJson으로 정규화한 형태).
 * 스크립트 버전에 따라 필드가 더 있을 수 있어 나머지는 unknown으로 둡니다.
 */
export interface CheckResult {
  fileName?: string;

  server: string;
  serverType: string;
  serverTypes?: string[];
  product?: string;
  hostname: string;
  checkDate: string;

  cpu: number;
  memory: number;
  disk: number;
  uptimeMinutes?: number;
  uptimeParts?: unknown;

  network?: string;
  logError?: boolean;
  processes?: ProcessCheckResult[];
  directories?: DirectoryCheckResult[];
  fileChecks?: Array<Partial<FileCheckResult>>;
  disks?: Array<Partial<DiskCheckResult>>;
  ports?: Array<Partial<PortCheckResult>>;
  httpChecks?: Array<Partial<HttpCheckResult>>;
  wasChecks?: Array<Partial<WasRuntimeCheckResult>>;
  webtobCheck?: Partial<WebtoBCheckResult>;
  databaseChecks?: Partial<DatabaseCheckResult>;
  rolePolicies?: Partial<Record<'WEB' | 'WAS' | 'DB', RolePolicyResult>>;
  /** 스키마 v2: 수집 시점 정책으로 계산한 종합 상태 */
  summary?: { status?: string };

  [key: string]: unknown;
}

/* 점검 결과 가져오기 (공유 폴더 → DB → 암호화 백업) */
export interface ImportFileError {
  file: string;
  message: string;
  /** 이전 실행에서도 같은 오류였는지 (로그를 반복해서 남기지 않기 위해) */
  repeated?: boolean;
}

export interface ImportSummary {
  startedAt: string;
  finishedAt: string;
  scanned: number;
  imported: number;
  duplicates: number;
  skippedRecent: number;
  failed: number;
  errors: ImportFileError[];
}

export interface PendingImportError {
  file: string;
  serverId: string | null;
  message: string;
  firstSeen: string;
  lastSeen: string;
}

export interface ImportStatus {
  running: boolean;
  lastRun: ImportSummary | null;
  totalResults: number;
  pendingErrors: PendingImportError[];
}
