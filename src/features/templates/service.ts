import { transaction } from '../../db';
import { addVersion, findTemplate, listTemplates, listVersions, removeTemplate, upsertTemplate } from './repository';
import type { ManagedTemplate } from './types';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { getCommonCodes, getCommonCodeValues } from '../common-codes/service';
import { SCRIPT_OS } from '../../shared/constants';
import { getPolicies } from '../policies/service';
import { parseCommandTemplate } from './command-template';


export function getTemplateHistory(id: string) {
  return listVersions(id);
}

export function restoreTemplateVersion(id: string, versionId: string) {
  if (!findTemplate(id)) throw new NotFoundError(`템플릿을 찾을 수 없습니다: ${id}`);
  const version = listVersions(id).find((item) => item.versionId === versionId);
  if (!version) throw new NotFoundError(`템플릿 버전을 찾을 수 없습니다: ${versionId}`);
  const restored = { ...version.template, id, updatedAt: new Date().toISOString() };
  upsertTemplate(restored);
  return restored;
}

function validate(input: Partial<ManagedTemplate>) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.name?.trim()) errors.push({ field: 'name', message: '템플릿 이름은 필수입니다.' });
  if (!getCommonCodeValues('templateKinds').includes(input.kind ?? '')) errors.push({ field: 'kind', message: '템플릿 종류를 선택하세요.' });
  if (!input.content?.trim()) errors.push({ field: 'content', message: '템플릿 내용을 입력하세요.' });
  if (input.kind === 'SCRIPT_PART' && !(SCRIPT_OS as readonly string[]).includes(input.os ?? '')) errors.push({ field: 'os', message: '스크립트 템플릿은 운영체제를 지정해야 합니다.' });
  const customPolicyItems = getPolicies().flatMap((policy) => policy.items.map((item) => item.id));
  if (input.kind === 'SCRIPT_PART' && input.item && !['START', 'SAVE', ...getCommonCodes().scriptItems.map(({ value }) => value), ...customPolicyItems].includes(input.item)) errors.push({ field: 'item', message: '점검 항목이 올바르지 않습니다.' });
  if (input.kind === 'QUERY' && !getCommonCodes().productsByRole.DB.includes(input.dbms ?? '')) errors.push({ field: 'dbms', message: 'DBMS 종류를 선택하세요.' });
  if (input.usesQueryTemplate && input.item !== 'DB_QUERY_RUNNER') errors.push({ field: 'usesQueryTemplate', message: 'DB 공통 쿼리 실행기에서만 쿼리 템플릿을 사용할 수 있습니다.' });
  if (input.kind === 'COMMAND') {
    const codes = getCommonCodes();
    if (!(['WEB', 'WAS'] as const).some((role) => codes.productsByRole[role].includes(input.product ?? ''))) errors.push({ field: 'product', message: '제품을 선택하세요.' });
    if (!codes.scriptItems.some(({ value, role }) => value === input.item && (role === 'WEB' || role === 'WAS'))) errors.push({ field: 'item', message: 'WEB·WAS 점검 항목을 선택하세요.' });
    if (input.content?.trim()) for (const issue of parseCommandTemplate(input.content).errors) errors.push({ field: 'content', message: issue.message });
  }
  if (errors.length) throw new ValidationError(errors);
}

export function getTemplates(filter?: { kind?: string }) {
  return listTemplates().filter((item) => !filter?.kind || item.kind === filter.kind).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function getTemplate(id?: string) {
  return id ? findTemplate(id) : undefined;
}

export function saveTemplate(input: Partial<ManagedTemplate>, id?: string) {
  validate(input);
  const existing = id ? findTemplate(id) : undefined;
  if (id && !existing) throw new NotFoundError(`템플릿을 찾을 수 없습니다: ${id}`);
  const item: ManagedTemplate = {
    id: id ?? `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name!.trim(), kind: input.kind!, os: input.kind === 'COMMAND' ? undefined : input.os, product: input.kind === 'COMMAND' ? input.product : undefined, dbms: input.dbms, item: input.kind === 'SCRIPT_PART' || input.kind === 'COMMAND' ? input.item : undefined, usesQueryTemplate: input.usesQueryTemplate === true,
    enabled: input.enabled !== false, content: input.content!, updatedAt: new Date().toISOString(),
    // 점검 만들기 정보는 기존 값만 유지(화면에서 보낸 값은 무시) — 고쳐 저장해도 '직접 편집됨'을 판단할 수 있게
    ...(existing?.generated ? { generated: existing.generated } : {}),
  };
  transaction(() => {
    if (existing && existing.content !== item.content) addVersion(existing);
    upsertTemplate(item);
  });
  const saved = findTemplate(item.id)!;
  // 경고는 저장하지 않고 응답에만 붙입니다(저장은 됨).
  const warnings = item.kind === 'COMMAND' ? parseCommandTemplate(item.content).warnings.map(({ message }) => message) : [];
  return warnings.length ? { ...saved, warnings } : saved;
}

export function deleteTemplate(id: string) {
  const linked = getPolicies().flatMap((policy) => policy.items).find((item) => item.executor.type === 'CHECK_BUILDER' && item.executor.templateId === id);
  if (linked) throw new ConflictError(`점검 만들기 항목 '${linked.name}'에 연결된 스크립트입니다. 점검 정책 관리에서 항목을 삭제하세요.`);
  if (!removeTemplate(id)) throw new NotFoundError(`템플릿을 찾을 수 없습니다: ${id}`);
}

/*
 * 점검 만들기 전용 저장·삭제 (정책 저장 중에 호출, 검증·삭제 차단을 거치지 않음)
 * 내용이 바뀌면 이전 내용을 이력에 남깁니다.
 */
export function saveGeneratedTemplate(template: ManagedTemplate) {
  transaction(() => {
    const existing = findTemplate(template.id);
    if (existing && existing.content !== template.content) addVersion(existing);
    upsertTemplate(template);
  });
  return template;
}

/** 지우기 전 내용을 이력에 남깁니다(직접 편집한 내용을 잃지 않게). */
export function deleteGeneratedTemplate(id: string) {
  transaction(() => {
    const target = findTemplate(id);
    if (!target) return;
    addVersion(target);
    removeTemplate(id);
  });
}
