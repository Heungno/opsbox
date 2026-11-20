import fs from 'fs';
import { ManagedTemplate, ScriptPart } from '../types/template';
import { ValidationError } from '../types/error';
import { getCommonCodes } from './commonCodeService';

const FILE = 'data/templates.json';
function read(): ManagedTemplate[] {
  if (!fs.existsSync(FILE)) throw new Error(`기본 템플릿 데이터 파일이 없습니다: ${FILE}`);
  const items = JSON.parse(fs.readFileSync(FILE, 'utf8')) as ManagedTemplate[];
  let changed = false;
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

  const uniqueIds = new Set<string>();
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.id.startsWith('SAMPLE-') || uniqueIds.has(item.id)) {
      items.splice(index, 1);
      changed = true;
      continue;
    }
    uniqueIds.add(item.id);
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
  if (input.kind === 'QUERY' && input.item && !getCommonCodes().rolePolicies.DB.includes(input.item)) errors.push({ field: 'item', message: 'DB 쿼리의 점검 항목이 올바르지 않습니다.' });
  if (input.kind === 'QUERY' && !input.item) errors.push({ field: 'item', message: 'DB 쿼리의 점검 항목을 선택하세요.' });
  if (input.usesQueryTemplate && input.item !== 'DB_QUERY_RUNNER') errors.push({ field: 'usesQueryTemplate', message: 'DB 공통 쿼리 실행기에서만 쿼리 템플릿을 사용할 수 있습니다.' });
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
