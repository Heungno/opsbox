import { transaction } from '../../db';
import { findPolicy, listPolicies, removePolicy, upsertPolicy } from './repository';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../../shared/errors';
import type { Policy, PolicyDraft, PolicyItem } from './types';
import { getCommonCodes, getCommonCodeValues } from '../common-codes/service';
import { builderInputs, builderResult, validateBuilderSpec } from '../../services/checkBuilder/spec';
import { generatedTemplateId, syncGeneratedTemplates } from '../../services/checkBuilder/templates';
import type { BuilderOs, BuilderSpec } from '../../services/checkBuilder/types';

export type { PolicyCategory } from './types';
const executorTypes = () => getCommonCodeValues('policyExecutors');
const resultViews = () => getCommonCodeValues('resultViews');

/** 저장할 점검 항목 모양을 맞춥니다(빠진 기본값 채우기). */
export function normalizeItems(items: PolicyItem[]): PolicyItem[] {
  return items.map((item) => ({
    id: item.id, name: item.name || item.id, enabled: item.enabled !== false,
    executor: { ...(item.executor || {}), type: item.executor?.type || 'SCRIPT' },
    inputs: Array.isArray(item.inputs) ? item.inputs : [],
    result: { ...(item.result || {}), components: Array.isArray(item.result?.components) ? item.result.components : [{ type: 'SUMMARY' }] },
  }));
}

export function getPolicies(): Policy[] { return listPolicies(); }

export function getPolicy(id: string): Policy | undefined { return findPolicy(id); }

export function savePolicy(input: Partial<PolicyDraft>, id?: string) {
  const policies = listPolicies();
  const errors: { field: string; message: string }[] = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) errors.push({ field: 'name', message: '정책명은 1~80자로 입력하세요.' });
  if (!getCommonCodeValues('operatingSystems').includes(input.os || '')) errors.push({ field: 'os', message: '운영체제를 선택하세요.' });
  if (!getCommonCodeValues('policyCategories').includes(input.category || '')) errors.push({ field: 'category', message: '정책 유형을 선택하세요.' });
  if (!Array.isArray(input.items)) errors.push({ field: 'items', message: '점검 항목 구성이 올바르지 않습니다.' });
  const items = Array.isArray(input.items) ? input.items : [];
  if (new Set(items.map((item) => item.id)).size !== items.length) errors.push({ field: 'items', message: '점검 항목 ID가 중복되었습니다.' });
  items.forEach((item, index) => {
    if (!item.id?.trim() || !item.name?.trim()) errors.push({ field: `items.${index}`, message: '점검 항목 ID와 이름을 입력하세요.' });
    if (!executorTypes().includes(item.executor?.type)) errors.push({ field: `items.${index}.executor.type`, message: '실행 방식을 선택하세요.' });
    if (input.category === 'DB' && item.executor?.type !== 'SQL_QUERY' && item.executor?.type !== 'CHECK_BUILDER') errors.push({ field: `items.${index}.executor.type`, message: 'DB 정책은 DB 쿼리 또는 점검 만들기 실행 방식을 사용하세요.' });
    if (item.executor?.type === 'CHECK_BUILDER') {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(item.id ?? '')) errors.push({ field: `items.${index}.id`, message: '점검 만들기 항목 ID는 영문·숫자·_ 만 쓸 수 있습니다.' });
      if (input.os === 'Windows' || input.os === 'Linux') errors.push(...validateBuilderSpec(item.executor?.options?.builder, input.os, `items.${index}.executor.options.builder`));
    }
    if (input.category !== 'DB' && item.executor?.type === 'SQL_QUERY') errors.push({ field: `items.${index}.executor.type`, message: 'DB 쿼리는 DB 정책에 추가하세요.' });
    const warningPercent = item.executor?.options?.warningPercent;
    const criticalPercent = item.executor?.options?.criticalPercent;
    if (warningPercent !== undefined || criticalPercent !== undefined) {
      if (typeof warningPercent !== 'number' || typeof criticalPercent !== 'number' || !Number.isFinite(warningPercent) || !Number.isFinite(criticalPercent) || warningPercent < 0 || criticalPercent > 100 || warningPercent >= criticalPercent) {
        errors.push({ field: `items.${index}.executor.options`, message: '임계값은 0 이상 100 이하로, 경고 기준보다 위험 기준을 크게 입력하세요.' });
      }
    }
    if (item.executor?.templateId !== undefined && typeof item.executor.templateId !== 'string') errors.push({ field: `items.${index}.executor.templateId`, message: '실행 템플릿 ID 형식이 올바르지 않습니다.' });
    if (!Array.isArray(item.result?.components) || !item.result.components.length || item.result.components.some((component) => !resultViews().includes(component.type))) errors.push({ field: `items.${index}.result.components`, message: '결과 표시 컴포넌트를 하나 이상 선택하세요.' });
  });
  if (errors.length) throw new ValidationError(errors);
  const index = id ? policies.findIndex((policy) => policy.id === id) : -1;
  if (id && index < 0) throw new NotFoundError(`점검 정책을 찾을 수 없습니다: ${id}`);
  // 점검 만들기 항목: 서버별 입력·결과 표시·연결 템플릿은 폼 데이터로 정합니다.
  const normalizedItems = items.map((item) => {
    if (item.executor?.type !== 'CHECK_BUILDER') return item;
    const spec = item.executor.options!.builder as BuilderSpec;
    return { ...item, inputs: builderInputs(spec), result: builderResult(spec), executor: { ...item.executor, templateId: generatedTemplateId(item.id, input.os as BuilderOs) } };
  });
  const before = index >= 0 ? policies[index] : undefined;
  const policy: Policy = { id: id || randomUUID(), name, os: input.os!, category: input.category!, enabled: input.enabled !== false, items: normalizeItems(normalizedItems) };
  if (policies.some((entry) => entry.id !== id && entry.os === policy.os && entry.category === policy.category && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new ValidationError([{ field: 'name', message: '같은 OS와 유형에 동일한 정책명이 있습니다.' }]);
  }
  // 정책과 생성 템플릿을 함께 저장 (하나라도 실패하면 둘 다 되돌림)
  transaction(() => {
    upsertPolicy(policy);
    syncGeneratedTemplates(before, policy);
  });
  return policy;
}

export function deletePolicy(id: string) {
  const before = findPolicy(id);
  if (!before) throw new NotFoundError(`점검 정책을 찾을 수 없습니다: ${id}`);
  transaction(() => {
    removePolicy(id);
    syncGeneratedTemplates(before, undefined);
  });
}
