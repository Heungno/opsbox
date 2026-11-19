import fs from 'fs';
import path from 'path';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { ValidationError } from '../types/error';
import { getCommonCodes } from './commonCodeService';

const FILE = 'data/templates.json';
const MIGRATION_FILE = 'data/template-migrations.json';

function hasMigration(id: string) {
  if (!fs.existsSync(MIGRATION_FILE)) return false;
  try { return (JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf8')) as string[]).includes(id); } catch { return false; }
}

function markMigration(id: string) {
  let completed: string[] = [];
  if (fs.existsSync(MIGRATION_FILE)) {
    try { completed = JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf8')) as string[]; } catch { completed = []; }
  }
  if (!completed.includes(id)) fs.writeFileSync(MIGRATION_FILE, JSON.stringify([...completed, id], null, 2));
}

function sampleTemplates(): ManagedTemplate[] {
  // First-run seed: preserve the requested MSSQL query example and all default Windows item scripts.
  const updatedAt = '2026-11-18T00:00:00.000Z';
  const sample = (id: string, name: string, kind: ManagedTemplate['kind'], file: string, os?: ManagedTemplate['os']): ManagedTemplate => ({
    id, name, kind, os, enabled: true,
    content: fs.readFileSync(path.join('src', 'template-samples', file), 'utf8'), updatedAt,
  });
  return [
    sample('SAMPLE-WINDOWS-COMMON', '예제 · Windows 공통 자원만 (정책·제품 점검 제외)', 'SCRIPT', 'windows-common.ps1', 'Windows'),
    sample('SAMPLE-LINUX-COMMON', '예제 · Linux 공통 자원만 (정책·제품 점검 제외)', 'SCRIPT', 'linux-common.sh', 'Linux'),
    sample('SAMPLE-MSSQL-DATABASES', '예제 · MSSQL 데이터베이스 상태', 'QUERY', 'mssql-databases.sql'),
    ...scriptParts(),
  ];
}

function scriptParts(): ManagedTemplate[] {
  const items: Array<[ScriptPart, string, string]> = [
    ['START', '실행 준비·로깅', '00-start.ps1'],
    ['HOST_INFO', '서버 기본정보·가동시간', '01-host-info.ps1'],
    ['CPU', 'CPU 사용률', '10-cpu.ps1'],
    ['MEMORY', '메모리 사용률', '11-memory.ps1'],
    ['UPTIME', '서버 가동시간', '12-uptime.ps1'],
    ['DISK', '디스크 사용량', '13-disk.ps1'],
    ['PROCESS', '프로세스', '20-process.ps1'],
    ['DIRECTORY', '디렉터리', '30-directory.ps1'],
    ['FILE_SIZE', '파일 크기', '40-file-size.ps1'],
    ['PORT', '포트', '50-port.ps1'],
    ['HTTP', 'HTTP 응답', '60-http.ps1'],
    ['WEB_ENGINE_STATUS', 'WEB 엔진 상태', '80-web.ps1'],
    ['WAS_JVM_HEAP', 'JVM Heap 사용률', '70-was.ps1'],
    ['DB_INSTANCE_STATUS', 'DB 인스턴스·접속 상태', '90-database.ps1'],
    ['DB_CUSTOM_QUERY', '기타 사용자 쿼리', '91-db-custom-query.ps1'],
    ['SAVE', '결과 저장·종료', '99-save.ps1'],
  ];
  return items.map(([item, label, file]) => ({
    id: `WINDOWS-PART-${item}`,
    name: `Windows 점검 항목 · ${label}`,
    kind: 'SCRIPT_PART',
    os: 'Windows',
    item,
    usesQueryTemplate: item === 'DB_INSTANCE_STATUS' || item === 'DB_CUSTOM_QUERY',
    enabled: true,
    content: fs.readFileSync(path.join('src', 'script-parts', 'windows', file), 'utf8'),
    updatedAt: '2026-11-18T00:00:00.000Z',
  }));
}

function read(): ManagedTemplate[] {
  if (!fs.existsSync(FILE)) return sampleTemplates();
  const items = JSON.parse(fs.readFileSync(FILE, 'utf8')) as ManagedTemplate[];
  // Migrate existing stores once; explicit deletions remain respected afterward.
  if (!items.some((item) => item.kind === 'SCRIPT_PART')) {
    const seeded = [...items, ...scriptParts()];
    write(seeded);
    return seeded;
  }
  let changed = false;
  const splittingLegacyBasics = items.some((item) => item.kind === 'SCRIPT_PART' && (item.item as string | undefined) === 'OS_DISK');
  const roleItemRenames: Record<string, ScriptPart> = { WEB: 'WEB_ENGINE_STATUS', WAS: 'WAS_JVM_HEAP', DATABASE: 'DB_INSTANCE_STATUS' };
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.kind !== 'SCRIPT_PART') continue;
    if ((item.item as string | undefined) === 'OS_DISK') { items.splice(index, 1); changed = true; continue; }
    if ((item.item as string | undefined) === 'WEBTOB') {
      item.item = 'WEB_ENGINE_STATUS';
      if (item.id === 'WINDOWS-PART-WEBTOB') item.id = 'WINDOWS-PART-WEB_ENGINE_STATUS';
      changed = true;
    } else if (item.item && roleItemRenames[item.item]) {
      const previous = item.item;
      item.item = roleItemRenames[previous];
      if (item.id === `WINDOWS-PART-${previous}`) item.id = `WINDOWS-PART-${item.item}`;
      changed = true;
    }
  }
  if (splittingLegacyBasics) {
    const requiredBasics = scriptParts().filter((item) => ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'].includes(item.item ?? ''));
    for (const item of requiredBasics) {
      if (!items.some((existing) => existing.id === item.id)) { items.push(item); changed = true; }
    }
  }
  const customQueryMigration = 'db-custom-query-template-v1';
  if (!hasMigration(customQueryMigration)) {
    if (!items.some((item) => item.kind === 'SCRIPT_PART' && item.item === 'DB_CUSTOM_QUERY')) {
      const customQueryPart = scriptParts().find((item) => item.item === 'DB_CUSTOM_QUERY');
      if (customQueryPart) { items.push(customQueryPart); changed = true; }
    }
    markMigration(customQueryMigration);
  }
  for (const currentDefault of scriptParts()) {
    const index = items.findIndex((item) => item.id === currentDefault.id);
    if (index >= 0 && items[index].updatedAt === currentDefault.updatedAt) {
      if (items[index].content !== currentDefault.content) { items[index] = currentDefault; changed = true; }
      else if (currentDefault.usesQueryTemplate && items[index].usesQueryTemplate !== true) { items[index].usesQueryTemplate = true; changed = true; }
    }
  }
  if (changed) write(items);
  return items;
}

function write(templates: ManagedTemplate[]) {
  fs.writeFileSync(FILE, JSON.stringify(templates, null, 2));
}

function validate(input: Partial<ManagedTemplate>) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.name?.trim()) errors.push({ field: 'name', message: '템플릿 이름은 필수입니다.' });
  if (!['SCRIPT', 'SCRIPT_PART', 'QUERY'].includes(input.kind ?? '')) errors.push({ field: 'kind', message: '템플릿 종류를 선택하세요.' });
  if (!input.content?.trim()) errors.push({ field: 'content', message: '템플릿 내용을 입력하세요.' });
  if (['SCRIPT', 'SCRIPT_PART'].includes(input.kind ?? '') && !['Windows', 'Linux'].includes(input.os ?? '')) errors.push({ field: 'os', message: '스크립트 템플릿은 운영체제를 지정해야 합니다.' });
  if (input.kind === 'SCRIPT_PART' && input.os !== 'Windows') errors.push({ field: 'os', message: '점검 항목 스크립트는 현재 Windows 템플릿만 지원합니다.' });
  if (input.kind === 'SCRIPT_PART' && !input.item) errors.push({ field: 'item', message: '스크립트 점검 항목을 지정해야 합니다.' });
  if (input.kind === 'SCRIPT_PART' && input.item && !['START', 'SAVE', ...getCommonCodes().scriptItems.map(({ value }) => value)].includes(input.item)) errors.push({ field: 'item', message: '점검 항목이 올바르지 않습니다.' });
  if (input.usesQueryTemplate && !['DB_INSTANCE_STATUS', 'DB_CUSTOM_QUERY'].includes(input.item ?? '')) errors.push({ field: 'usesQueryTemplate', message: 'DB 인스턴스 상태 또는 기타 사용자 쿼리 스크립트에서만 쿼리 템플릿을 사용할 수 있습니다.' });
  if (input.role && !['WEB', 'WAS', 'DB', 'OTHER'].includes(input.role)) errors.push({ field: 'role', message: '대상 역할이 올바르지 않습니다.' });
  if (errors.length) throw new ValidationError(errors);
}

export function getTemplates(filter?: { kind?: string }) {
  return read().filter((item) => !filter?.kind || item.kind === filter.kind).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function getTemplate(id?: string) {
  return id ? read().find((item) => item.id === id) : undefined;
}

export function saveTemplate(input: Partial<ManagedTemplate>, id?: string) {
  validate(input);
  const items = read();
  const index = id ? items.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new Error(`Template not found: ${id}`);
  const item: ManagedTemplate = {
    id: id ?? `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name!.trim(), kind: input.kind!, os: input.os, role: input.role, product: input.product, item: input.item, usesQueryTemplate: input.usesQueryTemplate === true,
    enabled: input.enabled !== false, content: input.content!, updatedAt: new Date().toISOString(),
  };
  if (index >= 0) items[index] = item; else items.push(item);
  write(items);
  return item;
}

export function deleteTemplate(id: string) {
  const items = read();
  const remaining = items.filter((item) => item.id !== id);
  if (remaining.length === items.length) throw new Error(`Template not found: ${id}`);
  write(remaining);
}
