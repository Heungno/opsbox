import { readCollection, transaction, writeCollection } from '../db/database';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../shared/errors';
import type { ExecutorType, Policy, PolicyCategory, PolicyDraft, PolicyItem, ResultView } from '../types/policy';
import { getCommonCodes, getCommonCodeValues } from './commonCodeService';
import { builderInputs, builderResult, validateBuilderSpec } from './checkBuilder/spec';
import { generatedTemplateId, syncGeneratedTemplates } from './checkBuilder/templates';
import type { BuilderOs, BuilderSpec } from './checkBuilder/types';

export type { PolicyCategory } from '../types/policy';
const executorTypes = () => getCommonCodeValues('policyExecutors');
const resultViews = () => getCommonCodeValues('resultViews');

function inferItem(id: string, category: PolicyCategory, os: 'Windows' | 'Linux'): PolicyItem {
  const code = getCommonCodes().scriptItems.find((entry) => entry.value === id);
  const name = code?.label || id;
  const type: ExecutorType = id.endsWith('_LOG') ? 'LOG_ANALYSIS'
    : id.startsWith('DB_') ? 'SQL_QUERY'
      : id === 'WEB_ENGINE_STATUS' ? 'CONSOLE_COMMAND'
        : id === 'HTTP' ? 'HTTP_CHECK'
          : id === 'PORT' ? 'TCP_CHECK'
            : id === 'PROCESS' ? 'PROCESS_CHECK'
              : ['DIRECTORY', 'FILE_SIZE', 'DISK'].includes(id) ? 'FILESYSTEM_CHECK' : 'SCRIPT';
  const views: ResultView[] = type === 'SQL_QUERY' ? ['SUMMARY', 'TABLE']
    : type === 'LOG_ANALYSIS' ? ['SUMMARY', 'LOG_TABLE']
    : type === 'CONSOLE_COMMAND' ? ['SUMMARY', 'CONSOLE']
        : ['SUMMARY', ['CPU', 'MEMORY', 'DISK', 'UPTIME'].includes(id) ? 'METRIC' : 'TABLE'] as ResultView[];
  const templateId = type === 'SQL_QUERY' ? `WINDOWS-QUERY-${id}` : `WINDOWS-PART-${id}`;
  return {
    id, name, enabled: true,
    executor: { type, ...(type === 'SQL_QUERY' ? { dbms: 'MSSQL', templateId } : type === 'SCRIPT' || type === 'CONSOLE_COMMAND' ? { templateId: `${os.toUpperCase()}-PART-${id}` } : {}) },
    inputs: type === 'LOG_ANALYSIS' ? [{ key: 'logDirectories', label: '로그 경로', type: 'PATH_LIST', scope: 'SERVER', required: true }] : [],
    result: { components: views.map((view) => ({ type: view, ...(type === 'LOG_ANALYSIS' && view === 'LOG_TABLE' ? { columns: [{ key: 'timestamp', label: '시각' }, { key: 'severity', label: '심각도' }, { key: 'path', label: '파일 경로' }, { key: 'message', label: '로그 내용' }] } : {}) })), ...(type === 'SQL_QUERY' ? { statusField: '__OPSBOX_STATUS' } : {}) },
  };
}

function normalizePolicy(raw: any): Policy {
  const category = raw.category as PolicyCategory;
  const items: PolicyItem[] = Array.isArray(raw.items) ? raw.items : (raw.checks ?? []).map((id: string) => inferItem(id, category, raw.os));
  const normalized = items.map((item) => ({
    id: item.id, name: item.name || item.id, enabled: item.enabled !== false,
    executor: { ...(item.executor || {}), type: item.executor?.type || 'SCRIPT' },
    inputs: Array.isArray(item.inputs) ? item.inputs : [],
    result: {
      ...(item.result || {}),
      components: Array.isArray(item.result?.components) ? item.result.components
        : (Array.isArray((item.result as any)?.views) ? (item.result as any).views : ['SUMMARY']).map((type: ResultView) => ({ type, ...((item.result as any)?.columns && ['TABLE', 'LOG_TABLE'].includes(type) ? { columns: (item.result as any).columns } : {}) })),
    },
  }));
  return { id: raw.id, name: raw.name, os: raw.os, category, enabled: raw.enabled !== false, items: normalized, checks: normalized.filter((item) => item.enabled).map((item) => item.id) };
}

function write(policies: Policy[]) {
  const stored = policies.map(({ checks: _checks, ...policy }) => policy as Policy);
  writeCollection('policies', stored, (policy) => policy.id);
}

function read(): Policy[] {
  const rawPolicies = readCollection<any>('policies');
  const policies = rawPolicies.map(normalizePolicy);
  if (policies.some((policy, index) => JSON.stringify(policy.items) !== JSON.stringify(rawPolicies[index]?.items))) write(policies);
  return policies;
}

export function getPolicies() { return read(); }

export function savePolicy(input: Partial<PolicyDraft>, id?: string) {
  const policies = read();
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
  const policy = normalizePolicy({ id: id || randomUUID(), name, os: input.os, category: input.category, enabled: input.enabled, items: normalizedItems });
  if (policies.some((entry) => entry.id !== id && entry.os === policy.os && entry.category === policy.category && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new ValidationError([{ field: 'name', message: '같은 OS와 유형에 동일한 정책명이 있습니다.' }]);
  }
  if (index >= 0) policies[index] = policy; else policies.push(policy);
  // 정책과 생성 템플릿을 함께 저장 (하나라도 실패하면 둘 다 되돌림)
  transaction(() => {
    write(policies);
    syncGeneratedTemplates(before, policy);
  });
  return policy;
}

export function deletePolicy(id: string) {
  const policies = read(); const filtered = policies.filter((policy) => policy.id !== id);
  if (filtered.length === policies.length) throw new NotFoundError(`점검 정책을 찾을 수 없습니다: ${id}`);
  const before = policies.find((policy) => policy.id === id);
  transaction(() => {
    write(filtered);
    syncGeneratedTemplates(before, undefined);
  });
}
