import fs from 'fs';
import { ManagedTemplate } from '../types/template';
import { ValidationError } from '../types/error';

const FILE = 'data/templates.json';

function read(): ManagedTemplate[] {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as ManagedTemplate[];
}

function write(templates: ManagedTemplate[]) {
  fs.writeFileSync(FILE, JSON.stringify(templates, null, 2));
}

function validate(input: Partial<ManagedTemplate>) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.name?.trim()) errors.push({ field: 'name', message: '템플릿 이름은 필수입니다.' });
  if (!['SCRIPT', 'QUERY'].includes(input.kind ?? '')) errors.push({ field: 'kind', message: '템플릿 종류를 선택하세요.' });
  if (!input.content?.trim()) errors.push({ field: 'content', message: '템플릿 내용을 입력하세요.' });
  if (input.kind === 'SCRIPT' && !['Windows', 'Linux'].includes(input.os ?? '')) errors.push({ field: 'os', message: '스크립트 템플릿은 운영체제를 지정해야 합니다.' });
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
    name: input.name!.trim(), kind: input.kind!, os: input.os, role: input.role, product: input.product,
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
