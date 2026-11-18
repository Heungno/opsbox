import fs from 'fs';
import path from 'path';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { ValidationError } from '../types/error';

const FILE = 'data/templates.json';

function sampleTemplates(): ManagedTemplate[] {
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
    ['OS_DISK', 'OS·디스크', '10-os-disk.ps1'],
    ['PROCESS', '프로세스', '20-process.ps1'],
    ['DIRECTORY', '디렉터리', '30-directory.ps1'],
    ['FILE_SIZE', '파일 크기', '40-file-size.ps1'],
    ['PORT', '포트', '50-port.ps1'],
    ['HTTP', 'HTTP 응답', '60-http.ps1'],
    ['WAS', 'WAS·JVM', '70-was.ps1'],
    ['WEBTOB', 'WebtoB', '80-webtob.ps1'],
    ['DATABASE', 'DB·MSSQL', '90-database.ps1'],
    ['SAVE', '결과 저장·종료', '99-save.ps1'],
  ];
  return items.map(([item, label, file]) => ({
    id: `WINDOWS-PART-${item}`,
    name: `Windows 점검 항목 · ${label}`,
    kind: 'SCRIPT_PART',
    os: 'Windows',
    item,
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
  for (const currentDefault of scriptParts()) {
    const index = items.findIndex((item) => item.id === currentDefault.id);
    if (index >= 0 && items[index].updatedAt === currentDefault.updatedAt && items[index].content !== currentDefault.content) {
      items[index] = currentDefault;
      changed = true;
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
  if (input.kind === 'SCRIPT_PART' && input.item && !['START', 'OS_DISK', 'PROCESS', 'DIRECTORY', 'FILE_SIZE', 'PORT', 'HTTP', 'WAS', 'WEBTOB', 'DATABASE', 'SAVE'].includes(input.item)) errors.push({ field: 'item', message: '점검 항목이 올바르지 않습니다.' });
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
  if (input.kind === 'SCRIPT_PART' && input.enabled !== false) {
    const duplicate = items.find((item, itemIndex) => itemIndex !== index && item.kind === 'SCRIPT_PART' && item.os === input.os && item.item === input.item && item.enabled);
    if (duplicate) throw new ValidationError([{ field: 'item', message: `같은 운영체제·점검 항목의 사용 템플릿이 이미 있습니다. (${duplicate.name})` }]);
  }
  const item: ManagedTemplate = {
    id: id ?? `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name!.trim(), kind: input.kind!, os: input.os, role: input.role, product: input.product, item: input.item,
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
