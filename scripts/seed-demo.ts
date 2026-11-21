/*
 * 데모 데이터 생성 (npm run demo:seed 로 실행 — scripts/demo.cjs가 데모 DB 경로를 설정합니다)
 *
 * 화면 확인용 서버 12대와 서버별 최근 14일 점검 결과를 만듭니다.
 * 결과 JSON은 실제 점검 스크립트(schemaVersion 2)와 같은 모양이고, 서버마다 상황을 하나씩 넣었습니다.
 *   디스크 사용률 증가 · DB 백업 실패 후 재점검 · WebtoB 서비스 중지 · JVM Heap 증가 · Heap Dump 발견 ·
 *   로그 오류 급증 · 포트 미리스닝 · HTTP 응답 실패 · CUBRID HA 이상 · 결과 미수신(3일째) 등
 * 같은 시드로 만들어 매번 같은 데이터가 나옵니다(날짜만 실행일 기준).
 *
 * 저장은 화면의 [결과 파일 올리기]와 같은 경로(storeUploadedResult)를 써서 검증·백업까지 거칩니다.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';

// 운영 DB 보호: demo 폴더 안의 DB가 아니면 실행하지 않습니다.
if (!process.env.OPSBOX_DB_PATH?.includes(`${path.sep}demo${path.sep}`)) {
  console.error('데모 DB 경로가 아닙니다. npm run demo:seed 로 실행하세요. (운영 DB 보호)');
  process.exit(1);
}

type Status = 'Healthy' | 'Warning' | 'Critical' | 'NotCollected';
type Role = 'WEB' | 'WAS' | 'DB' | 'OTHER';

const DAYS = 14;
const DEMO_USER = 'demo';
const DEMO_PASSWORD = 'demo1234';

/* ---------- 공통 도우미 ---------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fileStamp = (d: Date) => stamp(d).replace(' ', '_').replace(/:/g, '-');
const RANK: Record<Status, number> = { Critical: 3, Warning: 2, Healthy: 1, NotCollected: 0 };
/** 여러 상태 종합: 위험 > 주의 > 정상, 모두 미수집이면 미수집 (점검 스크립트와 같은 규칙) */
function worst(statuses: Status[]): Status {
  const known = statuses.filter((status) => status !== 'NotCollected');
  if (!known.length) return 'NotCollected';
  return known.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'Healthy' as Status);
}
const byPercent = (value: number, warning = 70, critical = 90): Status => (value >= critical ? 'Critical' : value >= warning ? 'Warning' : 'Healthy');

/* ---------- 데모 서버 정의 ---------- */

interface DayContext {
  /** 0 = 가장 오래된 날, DAYS-1 = 오늘 */
  day: number;
  date: Date;
  rnd: () => number;
}

interface DemoServer {
  id: string;
  name: string;
  os: 'Windows' | 'Linux';
  osName: string;
  osVersion: string;
  ip: string;
  roles: Role[];
  products: Partial<Record<Role, string>>;
  sharedPath?: string;
  processes: { name: string }[];
  directories: { path: string; warningPercent?: number; criticalPercent?: number }[];
  fileChecks: { path: string; warningSizeMB: number; criticalSizeMB: number }[];
  ports: { port: number; protocol: 'TCP' | 'UDP'; description: string }[];
  httpChecks: { name: string; url: string; expectedStatus: number }[];
  logDirectories?: Partial<Record<'WEB_LOG' | 'WAS_LOG', string[]>>;
  dbTargets?: string[];
  base: { cpu: number; memory: number; volumes: { mount: string; totalGB: number; usedPercent: number; growthPerDay?: number }[] };
  /** 결과가 없는 날 (미수신 재현) */
  skipDays?: number[];
  /** 같은 날 다시 점검한 결과를 하나 더 만드는 날 (조치 후 재점검) */
  recheckDays?: number[];
  scenario?: (ctx: DayContext & { recheck: boolean }, r: ResultBuilder) => void;
}

const SERVERS: DemoServer[] = [
  {
    id: 'WEB-01', name: '대민 포털 WEB #1', os: 'Windows', osName: 'Microsoft Windows Server 2019 Standard', osVersion: '10.0.17763', ip: '10.10.1.11',
    roles: ['WEB'], products: { WEB: 'WebtoB' }, sharedPath: '\\\\fileserver\\opsbox',
    processes: [{ name: 'wsm' }, { name: 'htl' }, { name: 'hth' }], directories: [{ path: 'D:\\WebtoB\\log', warningPercent: 70, criticalPercent: 90 }],
    fileChecks: [{ path: 'D:\\WebtoB\\config\\http.m', warningSizeMB: 1, criticalSizeMB: 5 }],
    ports: [{ port: 80, protocol: 'TCP', description: 'HTTP' }, { port: 443, protocol: 'TCP', description: 'HTTPS' }],
    httpChecks: [{ name: '포털 메인', url: 'https://portal.example.go.kr/', expectedStatus: 200 }],
    logDirectories: { WEB_LOG: ['D:\\WebtoB\\log'] },
    base: { cpu: 18, memory: 46, volumes: [{ mount: 'C:', totalGB: 120, usedPercent: 52 }, { mount: 'D:', totalGB: 300, usedPercent: 38, growthPerDay: 0.3 }] },
    // 사흘 전 아침에 서비스 하나가 내려가 위험, 낮에 조치 후 재점검
    recheckDays: [DAYS - 4],
    scenario: ({ day, recheck }, r) => {
      if (day === DAYS - 4 && !recheck) r.webtob({ downService: 'APP_SVC' });
    },
  },
  {
    id: 'WEB-02', name: '대민 포털 WEB #2', os: 'Linux', osName: 'Rocky Linux', osVersion: '9.4 (Blue Onyx)', ip: '10.10.1.12',
    roles: ['WEB'], products: { WEB: 'Nginx' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'nginx' }], directories: [{ path: '/var/log/nginx', warningPercent: 70, criticalPercent: 90 }],
    fileChecks: [{ path: '/etc/nginx/nginx.conf', warningSizeMB: 1, criticalSizeMB: 2 }],
    ports: [{ port: 80, protocol: 'TCP', description: 'HTTP' }, { port: 443, protocol: 'TCP', description: 'HTTPS' }],
    httpChecks: [{ name: '포털 메인', url: 'https://portal.example.go.kr/', expectedStatus: 200 }, { name: '상태 확인', url: 'http://127.0.0.1/health', expectedStatus: 200 }],
    logDirectories: { WEB_LOG: ['/var/log/nginx'] },
    base: { cpu: 12, memory: 38, volumes: [{ mount: '/', totalGB: 50, usedPercent: 41 }, { mount: '/var', totalGB: 100, usedPercent: 55, growthPerDay: 0.4 }] },
    // 최근 이틀간 5xx 오류 급증, 오늘은 HTTP 응답 실패
    scenario: ({ day }, r) => {
      if (day >= DAYS - 2) r.logSpike('WEB_LOG', day === DAYS - 1 ? 42 : 17);
      if (day === DAYS - 1) r.httpFail('상태 확인', 502);
    },
  },
  {
    id: 'WEB-03', name: '내부 업무 WEB', os: 'Linux', osName: 'Red Hat Enterprise Linux', osVersion: '8.10 (Ootpa)', ip: '10.10.1.13',
    roles: ['WEB'], products: { WEB: 'Apache HTTP Server' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'httpd' }], directories: [{ path: '/var/log/httpd' }], fileChecks: [],
    ports: [{ port: 80, protocol: 'TCP', description: 'HTTP' }], httpChecks: [{ name: '업무 포털', url: 'http://intra.example.local/', expectedStatus: 200 }],
    logDirectories: { WEB_LOG: ['/var/log/httpd'] },
    base: { cpu: 7, memory: 29, volumes: [{ mount: '/', totalGB: 80, usedPercent: 33 }] },
  },
  {
    id: 'WAS-01', name: '대민 포털 WAS #1', os: 'Windows', osName: 'Microsoft Windows Server 2022 Standard', osVersion: '10.0.20348', ip: '10.10.2.21',
    roles: ['WAS'], products: { WAS: 'JEUS' }, sharedPath: '\\\\fileserver\\opsbox',
    processes: [{ name: 'java' }], directories: [{ path: 'E:\\jeus\\logs' }], fileChecks: [],
    ports: [{ port: 9736, protocol: 'TCP', description: 'JEUS 관리' }, { port: 8088, protocol: 'TCP', description: 'JEUS HTTP' }],
    httpChecks: [{ name: '업무 API', url: 'http://10.10.2.21:8088/api/health', expectedStatus: 200 }],
    logDirectories: { WAS_LOG: ['E:\\jeus\\logs'] },
    base: { cpu: 31, memory: 62, volumes: [{ mount: 'C:', totalGB: 150, usedPercent: 47 }, { mount: 'E:', totalGB: 500, usedPercent: 44, growthPerDay: 0.2 }] },
    // JVM Heap이 날마다 늘어 주의 → 위험 (메모리 누수 의심)
    scenario: ({ day }, r) => r.heap(55 + day * 3.2),
  },
  {
    id: 'WAS-02', name: '민원 처리 WAS', os: 'Linux', osName: 'Rocky Linux', osVersion: '9.4 (Blue Onyx)', ip: '10.10.2.22',
    roles: ['WAS'], products: { WAS: 'Apache Tomcat' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'java' }], directories: [{ path: '/opt/tomcat/logs' }], fileChecks: [],
    ports: [{ port: 8080, protocol: 'TCP', description: 'Tomcat HTTP' }, { port: 8005, protocol: 'TCP', description: 'Tomcat 종료 포트' }],
    httpChecks: [{ name: '민원 API', url: 'http://10.10.2.22:8080/minwon/health', expectedStatus: 200 }],
    logDirectories: { WAS_LOG: ['/opt/tomcat/logs'] },
    base: { cpu: 24, memory: 58, volumes: [{ mount: '/', totalGB: 100, usedPercent: 49 }] },
    // 닷새 전 OutOfMemory로 Heap Dump 생성, 이후 계속 남아 있음
    scenario: ({ day }, r) => {
      r.heap(48 + (day % 4) * 4);
      if (day >= DAYS - 5) r.heapDump('/opt/tomcat/dump/java_pid21457.hprof', 2048);
      if (day === DAYS - 5) r.logSpike('WAS_LOG', 9, 'java.lang.OutOfMemoryError: Java heap space');
    },
  },
  {
    id: 'APP-01', name: '통계 서비스 (WEB+WAS)', os: 'Linux', osName: 'Ubuntu', osVersion: '22.04.4 LTS (Jammy Jellyfish)', ip: '10.10.3.31',
    roles: ['WEB', 'WAS'], products: { WEB: 'Nginx', WAS: 'Node.js' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'nginx' }, { name: 'node' }], directories: [{ path: '/srv/stat/logs' }], fileChecks: [],
    ports: [{ port: 443, protocol: 'TCP', description: 'HTTPS' }, { port: 3000, protocol: 'TCP', description: 'Node.js 앱' }],
    httpChecks: [{ name: '통계 대시보드', url: 'https://stat.example.go.kr/', expectedStatus: 200 }],
    logDirectories: { WEB_LOG: ['/var/log/nginx'], WAS_LOG: ['/srv/stat/logs'] },
    base: { cpu: 15, memory: 44, volumes: [{ mount: '/', totalGB: 60, usedPercent: 58 }] },
    // 어제 Node.js 앱이 죽어 3000 포트 미리스닝
    scenario: ({ day }, r) => {
      if (day === DAYS - 2) { r.processDown('node'); r.portDown(3000); }
    },
  },
  {
    id: 'DB-01', name: '포털 DB (MSSQL)', os: 'Windows', osName: 'Microsoft Windows Server 2019 Datacenter', osVersion: '10.0.17763', ip: '10.10.4.41',
    roles: ['DB'], products: { DB: 'MSSQL' }, sharedPath: '\\\\fileserver\\opsbox',
    processes: [{ name: 'sqlservr' }, { name: 'SQLAGENT' }], directories: [{ path: 'F:\\MSSQL\\Backup', warningPercent: 75, criticalPercent: 90 }], fileChecks: [],
    ports: [{ port: 1433, protocol: 'TCP', description: 'MSSQL' }], httpChecks: [],
    dbTargets: ['10.10.4.41,1433'],
    base: { cpu: 22, memory: 64, volumes: [{ mount: 'C:', totalGB: 150, usedPercent: 40 }, { mount: 'F:', totalGB: 1000, usedPercent: 61, growthPerDay: 0.35 }] },
    // 엿새 전 야간 전체 백업 실패 → 아침 점검 위험, 수동 백업 후 재점검 정상
    recheckDays: [DAYS - 6],
    scenario: ({ day, recheck }, r) => {
      if (day === DAYS - 6 && !recheck) r.backupFailed();
    },
  },
  {
    id: 'DB-02', name: '민원 DB (PostgreSQL)', os: 'Linux', osName: 'Rocky Linux', osVersion: '9.4 (Blue Onyx)', ip: '10.10.4.42',
    roles: ['DB'], products: { DB: 'PostgreSQL' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'postgres' }], directories: [{ path: '/var/lib/pgsql/16/data' }], fileChecks: [],
    ports: [{ port: 5432, protocol: 'TCP', description: 'PostgreSQL' }], httpChecks: [],
    dbTargets: ['localhost:5432/minwon'],
    base: { cpu: 14, memory: 52, volumes: [{ mount: '/', totalGB: 50, usedPercent: 37 }, { mount: '/var/lib/pgsql', totalGB: 500, usedPercent: 48, growthPerDay: 0.25 }] },
    // 세션이 점점 늘어 오늘 주의
    scenario: ({ day }, r) => r.sessions(40 + day * 3, 100),
  },
  {
    id: 'DB-03', name: '통계 DB (MariaDB)', os: 'Linux', osName: 'Ubuntu', osVersion: '22.04.4 LTS (Jammy Jellyfish)', ip: '10.10.4.43',
    roles: ['DB'], products: { DB: 'MariaDB' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'mariadbd' }], directories: [{ path: '/var/lib/mysql', warningPercent: 70, criticalPercent: 90 }], fileChecks: [],
    ports: [{ port: 3306, protocol: 'TCP', description: 'MariaDB' }], httpChecks: [],
    dbTargets: ['/run/mysqld/mysqld.sock'],
    // 데이터 디스크가 하루 2.3%p씩 차서 일주일 전부터 주의, 오늘 위험
    base: { cpu: 19, memory: 49, volumes: [{ mount: '/', totalGB: 50, usedPercent: 31 }, { mount: '/var/lib/mysql', totalGB: 400, usedPercent: 62, growthPerDay: 2.3 }] },
  },
  {
    id: 'DB-04', name: '행정 DB (CUBRID)', os: 'Linux', osName: 'CentOS Linux', osVersion: '7.9.2009 (Core)', ip: '10.10.4.44',
    roles: ['DB'], products: { DB: 'CUBRID' }, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'cub_server' }, { name: 'cub_master' }, { name: 'cub_broker' }], directories: [{ path: '/home/cubrid/database' }], fileChecks: [],
    ports: [{ port: 33000, protocol: 'TCP', description: 'CUBRID 브로커' }, { port: 1523, protocol: 'TCP', description: 'CUBRID 마스터' }], httpChecks: [],
    dbTargets: ['admindb@localhost'],
    base: { cpu: 11, memory: 57, volumes: [{ mount: '/', totalGB: 100, usedPercent: 44 }, { mount: '/home', totalGB: 300, usedPercent: 52, growthPerDay: 0.2 }] },
    // 나흘 전부터 이틀간 HA 상태가 maintenance (대기 서버 점검)
    scenario: ({ day }, r) => {
      if (day === DAYS - 4 || day === DAYS - 3) r.cubridHa('maintenance');
    },
  },
  {
    id: 'FILE-01', name: '파일 서버', os: 'Windows', osName: 'Microsoft Windows Server 2016 Standard', osVersion: '10.0.14393', ip: '10.10.5.51',
    roles: ['OTHER'], products: {}, sharedPath: '\\\\fileserver\\opsbox',
    processes: [{ name: 'LanmanServer' }], directories: [{ path: 'D:\\Share', warningPercent: 80, criticalPercent: 95 }], fileChecks: [],
    ports: [{ port: 445, protocol: 'TCP', description: 'SMB' }], httpChecks: [],
    base: { cpu: 6, memory: 35, volumes: [{ mount: 'C:', totalGB: 100, usedPercent: 63 }, { mount: 'D:', totalGB: 4000, usedPercent: 64, growthPerDay: 0.2 }] },
    // 사흘째 결과가 들어오지 않음 (점검 누락 재현)
    skipDays: [DAYS - 3, DAYS - 2, DAYS - 1],
  },
  {
    id: 'BATCH-01', name: '야간 배치 서버', os: 'Linux', osName: 'Rocky Linux', osVersion: '8.9 (Green Obsidian)', ip: '10.10.5.52',
    roles: ['OTHER'], products: {}, sharedPath: '/mnt/opsbox',
    processes: [{ name: 'crond' }], directories: [{ path: '/batch/out' }],
    fileChecks: [{ path: '/batch/out/daily_extract.csv', warningSizeMB: 500, criticalSizeMB: 1000 }],
    ports: [], httpChecks: [],
    // 배치 시간과 겹쳐 CPU가 높은 날이 섞임
    base: { cpu: 35, memory: 41, volumes: [{ mount: '/', totalGB: 200, usedPercent: 46 }] },
    scenario: ({ day }, r) => {
      if (day % 5 === 2) r.cpu(93);
      r.fileSize('/batch/out/daily_extract.csv', 380 + day * 12);
    },
  },
];

/* ---------- 결과 JSON 만들기 ---------- */

type Definitions = {
  rolePolicies: Record<string, { item: string; name: string; result?: unknown; executorType?: string }[]>;
  policyItems: Record<string, unknown>;
};

class ResultBuilder {
  cpuValue: number;
  memoryValue: number;
  volumes: any[];
  processes: any[];
  directories: any[];
  files: any[];
  ports: any[];
  http: any[];
  heapPercent: number | null = null;
  heapDumpFile: { path: string; sizeMB: number } | null = null;
  webtobDown: string | null = null;
  logCounts: Record<string, { count: number; text?: string }> = {};
  backupFailure = false;
  sessionUsage: { sessions: number; max: number } | null = null;
  haState = 'active';

  constructor(private server: DemoServer, private ctx: DayContext) {
    const { rnd, day } = ctx;
    const noise = (spread: number) => (rnd() - 0.5) * 2 * spread;
    this.cpuValue = round(clamp(server.base.cpu + noise(8), 1, 99));
    this.memoryValue = round(clamp(server.base.memory + noise(4), 5, 99));
    this.volumes = server.base.volumes.map((volume) => {
      const usage = round(clamp(volume.usedPercent + (volume.growthPerDay ?? 0) * day + noise(0.4)));
      const usedGB = round((volume.totalGB * usage) / 100, 2);
      return {
        device: server.os === 'Windows' ? volume.mount : `/dev/mapper/vg0-${volume.mount === '/' ? 'root' : volume.mount.split('/').pop()}`,
        mountPoint: volume.mount, volumeName: server.os === 'Windows' ? (volume.mount === 'C:' ? 'System' : 'Data') : volume.mount,
        totalGB: volume.totalGB, usedGB, freeGB: round(volume.totalGB - usedGB, 2), usagePercent: usage, status: byPercent(usage),
      };
    });
    this.processes = server.processes.map((process, index) => ({
      name: process.name, running: true, cpuSeconds: Math.round(5000 + rnd() * 90000), memoryMB: round(80 + rnd() * 900),
      uptimeMinutes: (day + 30) * 1440 + index * 7, status: 'Healthy',
    }));
    this.directories = server.directories.map((directory) => {
      const disk = this.volumes[this.volumes.length - 1];
      return {
        path: directory.path, exists: true, sizeBytes: Math.round((2 + rnd() * 40) * 1024 ** 3), sizeGB: round(2 + rnd() * 40, 2),
        usedGB: disk.usedGB, freeGB: disk.freeGB, totalGB: disk.totalGB, usagePercent: disk.usagePercent,
        status: byPercent(disk.usagePercent, directory.warningPercent ?? 70, directory.criticalPercent ?? 90),
      };
    });
    this.files = server.fileChecks.map((file) => ({ path: file.path, exists: true, sizeBytes: 24_576, sizeMB: 0.02, status: 'Healthy' }));
    this.ports = server.ports.map((port) => ({ port: port.port, protocol: port.protocol, description: port.description, listening: true, processName: server.processes[0]?.name ?? null }));
    this.http = server.httpChecks.map((check) => ({
      name: check.name, url: check.url, expectedStatus: check.expectedStatus, statusCode: check.expectedStatus,
      responseTimeMs: Math.round(40 + rnd() * 260), success: true, error: null,
    }));
    this.heapPercent = server.roles.includes('WAS') ? 45 + rnd() * 15 : null;
  }

  /* 시나리오에서 쓰는 조작 */
  cpu(value: number) { this.cpuValue = value; }
  heap(percent: number) { this.heapPercent = clamp(percent, 1, 99); }
  heapDump(path: string, sizeMB: number) { this.heapDumpFile = { path, sizeMB }; }
  webtob(options: { downService: string }) { this.webtobDown = options.downService; }
  logSpike(item: 'WEB_LOG' | 'WAS_LOG', count: number, text?: string) { this.logCounts[item] = { count, text }; }
  backupFailed() { this.backupFailure = true; }
  sessions(sessions: number, max: number) { this.sessionUsage = { sessions, max }; }
  cubridHa(state: string) { this.haState = state; }
  processDown(name: string) {
    for (const process of this.processes) if (process.name === name) Object.assign(process, { running: false, cpuSeconds: 0, memoryMB: 0, uptimeMinutes: 0, status: 'Critical' });
  }
  portDown(port: number) {
    for (const entry of this.ports) if (entry.port === port) Object.assign(entry, { listening: false, processName: null });
  }
  httpFail(name: string, statusCode: number) {
    for (const check of this.http) if (check.name === name) Object.assign(check, { statusCode, success: false, error: `예상 응답 ${check.expectedStatus}, 실제 ${statusCode}`, responseTimeMs: 3012 });
  }
  fileSize(path: string, sizeMB: number) {
    const rule = this.server.fileChecks.find((file) => file.path === path);
    for (const file of this.files) {
      if (file.path !== path) continue;
      Object.assign(file, { sizeMB, sizeBytes: Math.round(sizeMB * 1024 * 1024) });
      file.status = rule && sizeMB >= rule.criticalSizeMB ? 'Critical' : rule && sizeMB >= rule.warningSizeMB ? 'Warning' : 'Healthy';
    }
  }

  /* 역할별 항목 */
  private processList(names: string[]) {
    return names.map((name, index) => ({ processName: name, processId: 2000 + index * 37, startedAt: stamp(new Date(this.ctx.date.getTime() - (30 + this.ctx.day) * 86400_000)) }));
  }

  private logDetail(item: 'WEB_LOG' | 'WAS_LOG') {
    const paths = this.server.logDirectories?.[item] ?? [];
    const spike = this.logCounts[item];
    const { rnd, date } = this.ctx;
    const errors = spike?.count ?? (rnd() < 0.06 ? 1 : 0);
    const warnings = Math.round(rnd() * 6);
    const http5xx = item === 'WEB_LOG' ? (spike ? spike.count : 0) : 0;
    const http4xx = item === 'WEB_LOG' ? Math.round(3 + rnd() * 20) : 0;
    const status: Status = spike ? 'Critical' : errors ? 'Warning' : 'Healthy';
    const sep = this.server.os === 'Windows' ? '\\' : '/';
    const file = `${paths[0] ?? ''}${sep}${item === 'WEB_LOG' ? (this.server.products.WEB === 'Nginx' ? 'error.log' : 'access.log') : 'server.log'}`;
    const at = (minutesAgo: number) => stamp(new Date(date.getTime() - minutesAgo * 60_000));
    const samples = [
      ...(spike ? [{ path: file, timestamp: at(35), text: `${at(35)} ERROR ${spike.text ?? (item === 'WEB_LOG' ? 'upstream timed out (110: Connection timed out) while reading response header from upstream' : '요청 처리 중 예외 발생')}` }] : []),
      ...(errors && !spike ? [{ path: file, timestamp: at(180), text: `${at(180)} ERROR DB 연결 재시도 (1/3)` }] : []),
      ...(warnings ? [{ path: file, timestamp: at(90), text: `${at(90)} WARN 응답 지연 3.2초 /api/minwon/list` }] : []),
      ...(http5xx ? [{ path: file, timestamp: at(20), text: `10.10.9.7 - - [${at(20)}] "GET /api/stat HTTP/1.1" 502 157` }] : []),
    ];
    return {
      status, periodDays: 7, since: stamp(new Date(date.getTime() - 7 * 86400_000)), checkedPaths: paths, missingPaths: [],
      checkedFileCount: paths.length ? 3 : 0, scannedLineCount: Math.round(20_000 + rnd() * 80_000), matchedLineCount: errors + warnings + http5xx + http4xx,
      categories: { fatal: 0, errorException: errors, warning: warnings, http5xx, http4xx }, readErrorCount: 0, readErrors: [], samples,
    };
  }

  private webtobOutput() {
    const down = this.webtobDown;
    const svc = (name: string, status: string) => `${name.padEnd(12)}${status.padEnd(8)}${'0'.padStart(5)}${String(Math.round(this.ctx.rnd() * 900)).padStart(9)}`;
    return [
      '$ wsadmin -C "wi"',
      `   WebtoB Information`,
      `   - version : WebtoB 4.1.9.0 B215`,
      `   - node    : ${this.server.id}`,
      '',
      '$ wsadmin -C "ci -s"',
      `   Total Client Count : ${Math.round(120 + this.ctx.rnd() * 300)}`,
      '',
      '$ wsadmin -C "st -s"',
      '   SVR_NAME    STATUS   PID    COUNT',
      svc('htmls', 'RUN'),
      svc('APP_SVC', down === 'APP_SVC' ? 'DOWN' : 'RUN'),
      svc('MINWON_SVC', 'RUN'),
      down ? '\n   ERROR: APP_SVC server process is not running' : '',
    ].join('\n');
  }

  private webItems(): Record<string, { status: Status; detail: unknown }> {
    const product = this.server.products.WEB!;
    const engine = product === 'WebtoB'
      ? { product, status: (this.webtobDown ? 'Critical' : 'Healthy') as Status, command: 'wsadmin: wi, ci -s, st -v, st -s', output: this.webtobOutput(), message: null }
      : { product, status: 'Healthy' as Status, processCount: 2, processes: this.processList(product === 'Nginx' ? ['nginx', 'nginx'] : ['httpd', 'httpd']), services: [], message: null };
    return {
      WEB_ENGINE_STATUS: { status: engine.status, detail: engine },
      WEB_WAS_CONNECTION: { status: 'NotCollected', detail: { product, status: 'NotCollected', message: 'WEB-WAS 대상 주소와 포트가 정책에 설정되지 않아 연결 검사를 수행할 수 없습니다.' } },
      WEB_REQUEST_VOLUME: { status: 'NotCollected', detail: { product, status: 'NotCollected', message: 'WEB 관리 주소 또는 요청량 수집 명령 설정이 없어 자동 수집하지 않았습니다.' } },
      WEB_LOG: { status: this.logDetail('WEB_LOG').status, detail: this.logDetail('WEB_LOG') },
    };
  }

  private heapItems() {
    const percent = round(this.heapPercent ?? 0);
    const capacity = this.server.products.WAS === 'Node.js' ? 2048 : 4096;
    return [{ processId: 21457, processName: this.server.products.WAS === 'Node.js' ? 'node' : 'java', heapUsedMB: round((capacity * percent) / 100), heapCapacityMB: capacity, heapUsagePercent: percent, status: byPercent(percent) }];
  }

  private wasItems(): Record<string, { status: Status; detail: unknown }> {
    const product = this.server.products.WAS!;
    const heap = this.heapItems();
    const dump = this.heapDumpFile;
    const log = this.logDetail('WAS_LOG');
    const jmx = (message: string) => ({ status: 'NotCollected' as Status, detail: { product, status: 'NotCollected', message } });
    return {
      WAS_JVM_HEAP: { status: heap[0].status as Status, detail: heap },
      WAS_THREAD_POOL: jmx('Thread Pool 사용량은 JEUS/JMX 관리 주소와 인증 설정이 필요합니다. 서버별 관리 접속 정보를 정책에 등록하세요.'),
      WAS_LONG_RUNNING_THREAD: jmx('장기 수행 Thread 판별에는 JEUS/JMX의 Thread Dump 수집과 기준 시간이 필요합니다.'),
      WAS_DB_CONNECTION_POOL: jmx('DB Connection Pool 수집에는 JEUS/JMX 관리 주소와 인증 설정이 필요합니다.'),
      WAS_DEPLOYMENT: { status: 'Healthy', detail: { product, status: 'Healthy', processCount: 1, processes: this.processList([heap[0].processName]), message: '프로세스 기동 상태를 확인했습니다. 애플리케이션 배포 상태는 관리 콘솔에서 별도 확인해야 합니다.' } },
      WAS_HEAP_DUMP: dump
        ? { status: 'Warning', detail: { status: 'Warning', configuredPaths: [dump.path.slice(0, dump.path.lastIndexOf('/'))], existingFileCount: 1, files: [{ path: dump.path, sizeMB: dump.sizeMB, modifiedAt: stamp(new Date(this.ctx.date.getTime() - (this.ctx.day - (DAYS - 5)) * 86400_000 - 3_600_000)) }] } }
        : { status: 'Healthy', detail: { status: 'Healthy', configuredPaths: [], existingFileCount: 0, files: [] } },
      WAS_STARTUP_SCRIPT: jmx('비교할 기준 파일 또는 체크섬이 정책에 등록되지 않아 변경 여부를 판정할 수 없습니다.'),
      WAS_LOG: { status: log.status, detail: log },
    };
  }

  /** DB 쿼리 결과 한 건 (첫 열이 __OPSBOX_STATUS면 행 상태 종합) */
  private query(target: string, columns: string[], rows: unknown[][], status?: Status) {
    const text = rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))));
    const rowStatuses = columns[0] === '__OPSBOX_STATUS' ? text.map((row) => row[0] as Status) : [];
    return { target, status: status ?? (rowStatuses.length ? worst(rowStatuses) : 'Healthy'), message: null, columns, rows: text, rowCount: text.length };
  }

  private dbItems(): { items: Record<string, { status: Status; detail: unknown }>; summary: any } {
    const product = this.server.products.DB!;
    const target = this.server.dbTargets?.[0] ?? '';
    const { rnd, date } = this.ctx;
    const dataVolume = this.volumes[this.volumes.length - 1];
    const names: Record<string, string[]> = {
      MSSQL: ['master', 'model', 'msdb', 'PORTAL', 'PORTAL_LOG'], PostgreSQL: ['minwon', 'postgres'], MariaDB: ['stat', 'stat_archive', 'mysql'], CUBRID: ['admindb'],
    };
    const dbNames = names[product];
    const sizes = dbNames.map((name, index) => round(index < 2 && product === 'MSSQL' ? 8 + index * 4 : 1200 + index * 830 + this.ctx.day * 14, 2));
    const label = (item: string) => `${product} 쿼리 · ${({ DB_INSTANCE_STATUS: 'DB 인스턴스·접속 상태', DB_PROCESS_LIMIT: '세션·프로세스 사용률', DB_TABLESPACE: '데이터 영역 사용률', DB_BACKUP: '백업 상태', DB_ARCHIVE_MODE: '아카이브 모드 상태', DB_TRANSACTION_LOG: '트랜잭션 로그 사용률', DB_REPLICATION: '복제·이중화 상태' } as Record<string, string>)[item]}`;
    const versions: Record<string, [string, string]> = {
      MSSQL: ['15.0.4375.4', 'Standard Edition (64-bit)'], PostgreSQL: ['16.4', 'PostgreSQL'], MariaDB: ['10.11.8-MariaDB', 'MariaDB Server'], CUBRID: ['11.2.9.0866', 'CUBRID'],
    };
    const [version, edition] = versions[product];
    const sessionUsage = this.sessionUsage ?? { sessions: Math.round(20 + rnd() * 30), max: product === 'MariaDB' ? 151 : product === 'MSSQL' ? 32767 : 100 };
    const sessionPct = round((sessionUsage.sessions * 100) / sessionUsage.max, 2);
    const sessionStatus = byPercent(sessionPct, 80, 90);
    const q: Record<string, ReturnType<ResultBuilder['query']>> = {};

    if (product === 'CUBRID') {
      // SHOW 문 결과는 상태 열이 없고 쿼리의 상태 규칙으로 판정합니다.
      const busy = Math.round(2 + rnd() * 3);
      q.DB_INSTANCE_STATUS = this.query(target, ['__OPSBOX_STATUS', 'version', 'edition', 'databaseName', 'state'], [['Healthy', version, edition, 'admindb', 'ONLINE']]);
      q.DB_PROCESS_LIMIT = this.query(target, ['Jobq_index', 'Num_total_workers', 'Num_busy_workers', 'Num_connection_workers'], [[0, 10, busy, 2], [1, 10, 1, 0]], byPercent(busy * 10));
      const free = Math.round(512 * (1 - dataVolume.usagePercent / 100));
      q.DB_TABLESPACE = this.query(target, ['Volume_id', 'Purpose', 'Num_total_sectors', 'Num_free_sectors', 'Full_name'], [[0, 'Permanent data purpose', 512, free, '/home/cubrid/database/admindb/admindb']], free / 512 <= 0.05 ? 'Critical' : free / 512 <= 0.15 ? 'Warning' : 'Healthy');
      const logHeader = ['Backup_info_level0', 'Ha_server_state', 'Num_active_log_pages', 'Next_archive_num', 'Last_deleted_archive_num', 'Checkpoint'];
      const logRow = [`time: ${stamp(new Date(date.getTime() - 7 * 3_600_000))}`, this.haState, 1000 + this.ctx.day * 13, 120 + this.ctx.day, 100 + this.ctx.day, `(${3400 + this.ctx.day * 17}|1288)`];
      q.DB_BACKUP = this.query(target, logHeader, [logRow], 'Healthy');
      q.DB_ARCHIVE_MODE = this.query(target, logHeader, [logRow], 'Healthy');
      q.DB_TRANSACTION_LOG = this.query(target, logHeader, [logRow], 'Healthy');
      q.DB_REPLICATION = this.query(target, logHeader, [logRow], this.haState === 'dead' ? 'Critical' : this.haState === 'active' ? 'Healthy' : 'Warning');
    } else {
      const states = dbNames.map((name, index) => [ 'Healthy', this.server.id.toLowerCase(), version, edition, name, 'ONLINE', product === 'MSSQL' ? (index < 3 ? 'SIMPLE' : 'FULL') : product === 'MariaDB' ? 'BINLOG ON' : 'PRIMARY', sizes[index]]);
      q.DB_INSTANCE_STATUS = this.query(target, ['__OPSBOX_STATUS', 'serverName', 'version', 'edition', 'databaseName', 'state', 'recoveryModel', 'dataSizeMB'], states);
      q.DB_PROCESS_LIMIT = this.query(target, ['__OPSBOX_STATUS', 'current_user_sessions', 'configured_max_connections', 'usage_percent'], [[sessionStatus, sessionUsage.sessions, sessionUsage.max, sessionPct]]);
      if (product === 'MSSQL') {
        const userDbs = dbNames.slice(3);
        q.DB_TABLESPACE = this.query(target, ['__OPSBOX_STATUS', 'databaseName', 'allocatedMB', 'usedMB', 'usagePercent'], userDbs.map((name, index) => {
          const used = round(62 + index * 9 + this.ctx.day * 0.6, 2);
          return [byPercent(used, 80, 90), name, sizes[index + 3], round((sizes[index + 3] * used) / 100, 2), used];
        }));
        const backupAge = (failed: boolean) => (failed ? round(31 + rnd() * 3, 1) : round(6 + rnd() * 3, 1));
        q.DB_BACKUP = this.query(target, ['__OPSBOX_STATUS', 'databaseName', 'lastFullBackup', 'backupAgeHours'], userDbs.map((name) => {
          const failed = this.backupFailure && name === 'PORTAL';
          const age = backupAge(failed);
          return [failed ? 'Critical' : 'Healthy', name, stamp(new Date(date.getTime() - age * 3_600_000)), age];
        }));
        q.DB_ARCHIVE_MODE = this.query(target, ['__OPSBOX_STATUS', 'databaseName', 'recoveryModel', 'lastLogBackupAgeHours'], userDbs.map((name) => ['Healthy', name, 'FULL', round(0.2 + rnd() * 0.8, 2)]));
        q.DB_TRANSACTION_LOG = this.query(target, ['__OPSBOX_STATUS', 'databaseName', 'logSizeMB', 'usagePercent'], dbNames.map((name) => { const pct = round(5 + rnd() * 40, 2); return [byPercent(pct), name, round(64 + rnd() * 2000, 2), pct]; }));
        q.DB_REPLICATION = this.query(target, ['message'], [['distribution 데이터베이스가 없어 복제 구독 상태를 조회할 수 없습니다.']], 'NotCollected');
      } else if (product === 'PostgreSQL') {
        q.DB_TABLESPACE = this.query(target, ['__OPSBOX_STATUS', 'tablespaceName', 'usedMB', 'location'], [['Healthy', 'pg_default', round(sizes[0] + sizes[1], 2), '(data_directory)'], ['Healthy', 'pg_global', 0.56, '(data_directory)']]);
        q.DB_BACKUP = this.query(target, ['__OPSBOX_STATUS', 'message'], [['NotCollected', 'PostgreSQL은 백업 기록을 DB 안에 남기지 않습니다. 백업 도구(pg_dump, pgBackRest 등)의 로그나 결과 파일로 확인하세요.']], 'NotCollected');
        q.DB_ARCHIVE_MODE = this.query(target, ['__OPSBOX_STATUS', 'archiveMode', 'archivedCount', 'failedCount', 'lastArchivedAt', 'lastFailedAt'], [['Healthy', 'on', 4200 + this.ctx.day * 96, 0, stamp(new Date(date.getTime() - 120_000)), '']]);
        const wal = round(800 + rnd() * 300, 2);
        q.DB_TRANSACTION_LOG = this.query(target, ['__OPSBOX_STATUS', 'walSizeMB', 'maxWalSizeMB', 'usagePercent'], [['Healthy', wal, 2048, round((wal * 100) / 2048, 2)]]);
        q.DB_REPLICATION = this.query(target, ['__OPSBOX_STATUS', 'role', 'peer', 'peerAddress', 'state', 'lagSeconds', 'message'], [['Healthy', 'PRIMARY', 'minwon-standby', '10.10.4.142', 'streaming', round(rnd() * 0.8, 2), '']]);
      } else {
        q.DB_TABLESPACE = this.query(target, ['__OPSBOX_STATUS', 'databaseName', 'usedMB', 'freeMB'], dbNames.map((name, index) => ['Healthy', name, sizes[index], round(rnd() * 40, 2)]));
        q.DB_BACKUP = this.query(target, ['__OPSBOX_STATUS', 'message'], [['NotCollected', 'MariaDB는 백업 기록을 DB 안에 남기지 않습니다. 백업 도구(mariabackup, mysqldump 등)의 로그나 결과 파일로 확인하세요.']], 'NotCollected');
        q.DB_ARCHIVE_MODE = this.query(target, ['__OPSBOX_STATUS', 'binaryLog', 'binlogFormat', 'expireLogsDays', 'binlogExpireLogsSeconds'], [['Healthy', 'ON', 'ROW', '7.000000', '604800']]);
        const age = round(rnd() * 40, 2);
        q.DB_TRANSACTION_LOG = this.query(target, ['__OPSBOX_STATUS', 'checkpointAgeMB', 'checkpointMaxAgeMB', 'usagePercent'], [['Healthy', age, 1622.23, round((age * 100) / 1622.23, 2)]]);
        q.DB_REPLICATION = this.query(target, ['__OPSBOX_STATUS', 'role', 'runningReplicaThreads', 'connectedReplicas', 'message'], [['Healthy', 'PRIMARY', 0, 1, '복제 서버 1대 연결']]);
      }
    }
    // 상태가 NotCollected뿐인 결과는 미수집
    for (const query of Object.values(q)) {
      if (query.columns[0] === '__OPSBOX_STATUS' && query.rows.every((row) => row[0] === 'NotCollected')) query.status = 'NotCollected';
    }
    const items = Object.fromEntries(Object.entries(q).map(([item, query]) => [item, { status: query.status as Status, detail: { queryName: label(item), queries: [query] } }]));
    const databases = product === 'CUBRID'
      ? [{ instanceTarget: target, name: 'admindb', state: 'ONLINE', recoveryModel: '', sizeMB: 0, status: 'Healthy' }]
      : dbNames.map((name, index) => ({ instanceTarget: target, name, state: 'ONLINE', recoveryModel: (q.DB_INSTANCE_STATUS.rows[index] as string[])[6], sizeMB: sizes[index], status: 'Healthy' }));
    const serverName = product === 'CUBRID' ? '' : this.server.id.toLowerCase();
    const summary = {
      product, status: q.DB_INSTANCE_STATUS.status, serverName, version, edition, targetCount: 1, databaseCount: databases.length, offlineCount: 0,
      instances: [{ target, status: q.DB_INSTANCE_STATUS.status, databaseCount: databases.length, serverName, version, edition }], databases,
    };
    return { items, summary };
  }

  build(definitions: Definitions) {
    const s = this.server;
    const cpuStatus = byPercent(this.cpuValue);
    const memoryStatus = byPercent(this.memoryValue);
    const diskMax = Math.max(...this.volumes.map((volume) => volume.usagePercent));
    const diskStatus = worst(this.volumes.map((volume) => volume.status));
    const uptimeMinutes = (this.ctx.day + 47) * 1440 + 312;
    const uptimeParts = { years: 0, months: Math.floor(uptimeMinutes / 43_200), days: Math.floor((uptimeMinutes % 43_200) / 1440), hours: Math.floor((uptimeMinutes % 1440) / 60), minutes: uptimeMinutes % 60 };
    const group = (items: any[]) => ({ status: items.length ? worst(items.map((item) => item.status ?? (item.listening === false || item.success === false ? 'Critical' : 'Healthy'))) : 'NotCollected', items });
    const ports = this.ports.map((port) => ({ ...port }));
    const portStatus: Status = !ports.length ? 'NotCollected' : ports.some((port) => !port.listening) ? 'Critical' : 'Healthy';
    const httpStatus: Status = !this.http.length ? 'NotCollected' : this.http.some((check) => !check.success) ? 'Critical' : 'Healthy';

    const rolePolicies: Record<string, { status: Status; items: any[] }> = {};
    let web: any = { status: 'NotCollected', product: null, detail: null };
    let was: any = { status: 'NotCollected', product: null, items: [] };
    let database: any = { status: 'NotCollected', product: null, detail: null };
    const collected: Partial<Record<'WEB' | 'WAS' | 'DB', Record<string, { status: Status; detail: unknown }>>> = {};
    if (s.roles.includes('WEB')) {
      collected.WEB = this.webItems();
      web = { status: collected.WEB.WEB_ENGINE_STATUS.status, product: s.products.WEB, detail: collected.WEB.WEB_ENGINE_STATUS.detail };
    }
    if (s.roles.includes('WAS')) {
      collected.WAS = this.wasItems();
      was = { status: collected.WAS.WAS_JVM_HEAP.status, product: s.products.WAS, items: collected.WAS.WAS_JVM_HEAP.detail };
    }
    if (s.roles.includes('DB')) {
      const { items, summary } = this.dbItems();
      collected.DB = items;
      database = { status: summary.status, product: s.products.DB, detail: summary };
    }
    for (const role of ['WEB', 'WAS', 'DB'] as const) {
      const defs = definitions.rolePolicies[role] ?? [];
      if (!defs.length) continue;
      const items = defs.map((def) => {
        const value = collected[role]?.[def.item] ?? { status: 'NotCollected' as Status, detail: { status: 'NotCollected', message: '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' } };
        return { role, item: def.item, name: def.name, result: def.result, executorType: def.executorType, status: value.status, detail: value.detail };
      });
      rolePolicies[role] = { status: worst(items.map((item) => item.status)), items };
    }

    const processStatus = group(this.processes).status;
    const allStatuses: Status[] = [
      'Healthy', cpuStatus, memoryStatus, 'Healthy', diskStatus, processStatus, group(this.directories).status, group(this.files).status, portStatus, httpStatus,
      ...Object.values(rolePolicies).map((role) => role.status),
    ];
    const counts = {
      healthy: allStatuses.filter((x) => x === 'Healthy').length, warning: allStatuses.filter((x) => x === 'Warning').length,
      critical: allStatuses.filter((x) => x === 'Critical').length, notCollected: allStatuses.filter((x) => x === 'NotCollected').length,
    };
    return {
      schemaVersion: 2,
      server: { id: s.id, name: s.name, ip: s.ip, roles: s.roles, products: s.products },
      collectedAt: stamp(this.ctx.date),
      host: { hostname: s.id.toLowerCase(), osName: s.osName, osVersion: s.osVersion, uptimeMinutes, uptime: uptimeParts, status: 'Healthy' },
      resources: {
        cpu: { usagePercent: this.cpuValue, status: cpuStatus },
        memory: { usagePercent: this.memoryValue, status: memoryStatus },
        uptime: { minutes: uptimeMinutes, parts: uptimeParts, status: 'Healthy' },
        disk: { maxUsagePercent: diskMax, status: diskStatus, volumes: this.volumes },
      },
      checks: {
        policyDefinitions: definitions.policyItems,
        processes: group(this.processes), directories: group(this.directories), files: group(this.files),
        ports: { status: portStatus, items: ports }, http: { status: httpStatus, items: this.http },
        web, was, database, rolePolicies, policyItems: [],
      },
      summary: { status: worst(allStatuses), counts },
    };
  }
}

/* ---------- 실행 ---------- */

async function main() {
  // 데모 DB 경로를 정한 뒤에 불러와야 하므로 여기서 import 합니다.
  const { db, readCollection } = await import('../src/db/database');
  const { createServer } = await import('../src/services/serverService');
  const { buildScriptConfig } = await import('../src/services/scriptAssembly');
  const { storeUploadedResult } = await import('../src/services/resultImportService');
  const { getHealthStatus, parseResultJson } = await import('../src/services/resultService');

  const policies = readCollection<any>('policies');

  // 로그인 계정
  const salt = randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)')
    .run(DEMO_USER, '데모 사용자', salt.toString('hex'), scryptSync(DEMO_PASSWORD, salt, 64).toString('hex'));

  const rnd = mulberry32(20261121);
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  let resultCount = 0;
  const statusCount: Record<string, number> = {};

  for (const demo of SERVERS) {
    const policyIds: Record<string, string> = { BASIC: `${demo.os.toLowerCase()}-basic-default` };
    const roleChecks: Record<string, string[]> = {};
    const rolePolicySettings: Record<string, unknown> = {};
    for (const role of demo.roles) {
      if (role === 'OTHER') continue;
      const policy = policies.find((entry) => entry.id === `${demo.os.toLowerCase()}-${role.toLowerCase()}-default`);
      policyIds[role] = policy.id;
      roleChecks[role] = policy.items.map((item: any) => item.id);
    }
    for (const [item, directories] of Object.entries(demo.logDirectories ?? {})) rolePolicySettings[item] = { logDirectories: directories, periodDays: 7 };
    for (const item of roleChecks.DB ?? []) rolePolicySettings[item] = { instanceTargets: demo.dbTargets ?? [] };

    const server = createServer({
      id: demo.id, name: demo.name, type: demo.roles[0], roles: demo.roles, products: demo.products, os: demo.os, ip: demo.ip, sharedPath: demo.sharedPath ?? '',
      policyIds, roleChecks, rolePolicySettings,
      processes: demo.processes, directories: demo.directories, fileChecks: demo.fileChecks, ports: demo.ports, httpChecks: demo.httpChecks,
    } as any);
    const config = buildScriptConfig(server);
    const definitions: Definitions = { rolePolicies: config.checks.rolePolicies as Definitions['rolePolicies'], policyItems: config.checks.policyItems };

    for (let day = 0; day < DAYS; day++) {
      if (demo.skipDays?.includes(day)) continue;
      for (const recheck of demo.recheckDays?.includes(day) ? [false, true] : [false]) {
        const date = new Date(today.getTime() - (DAYS - 1 - day) * 86400_000 + Math.round(rnd() * 40) * 60_000 + (recheck ? 5 * 3_600_000 : 0));
        const ctx = { day, date, rnd };
        const builder = new ResultBuilder(demo, ctx);
        demo.scenario?.({ ...ctx, recheck }, builder);
        const json = builder.build(definitions);
        const content = `${JSON.stringify(json, null, 2)}\n`;
        const fileName = demo.os === 'Windows' ? `${fileStamp(date)}-000.json` : `${demo.id}_${fileStamp(date)}.json`;
        storeUploadedResult(Buffer.from(content, 'utf8'), fileName, demo.id);
        const status = getHealthStatus(parseResultJson(content));
        statusCount[status] = (statusCount[status] ?? 0) + 1;
        resultCount++;
      }
    }
  }

  db.close();
  const statusText = ['Healthy', 'Warning', 'Critical', 'NotCollected'].map((status) => `${status} ${statusCount[status] ?? 0}`).join(', ');
  console.log(`데모 데이터를 만들었습니다: 서버 ${SERVERS.length}대, 점검 결과 ${resultCount}건 (${statusText})`);
  console.log(`DB: ${process.env.OPSBOX_DB_PATH}`);
  console.log(`실행: npm run demo:dev → http://localhost:${process.env.OPSBOX_PORT || 3001}  (아이디 ${DEMO_USER} / 비밀번호 ${DEMO_PASSWORD})`);
}

main().catch((error) => {
  console.error('데모 데이터 생성 실패:', error);
  process.exit(1);
});
