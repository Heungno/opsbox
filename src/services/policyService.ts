import fs from 'fs';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../types/error';
import type { ExecutorType, Policy, PolicyCategory, PolicyDraft, PolicyFile, PolicyItem, ResultView } from '../types/policy';
import { getCommonCodes, getCommonCodeValues } from './commonCodeService';

const FILE = 'data/policy.json';
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
    executor: { type: item.executor?.type || 'SCRIPT', ...(item.executor || {}) },
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
  const file: PolicyFile = { schemaVersion: 1, policies: policies.map(({ checks: _checks, ...policy }) => policy as Policy) };
  fs.writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`);
}

function read(): Policy[] {
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{"schemaVersion":1,"policies":[]}\n');
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const rawPolicies = Array.isArray(parsed) ? parsed : parsed.policies;
  const policies = (rawPolicies as unknown[]).map(normalizePolicy);
  if (Array.isArray(parsed) || parsed.schemaVersion !== 1 || policies.some((policy, index) => JSON.stringify(policy.items) !== JSON.stringify(rawPolicies[index]?.items))) write(policies);
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
    if (input.category === 'DB' && item.executor?.type !== 'SQL_QUERY') errors.push({ field: `items.${index}.executor.type`, message: 'DB 정책은 DB 쿼리 실행 방식을 사용하세요.' });
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
  if (id && index < 0) throw new NotFoundError(`Policy not found: ${id}`);
  const policy = normalizePolicy({ id: id || randomUUID(), name, os: input.os, category: input.category, enabled: input.enabled, items });
  if (policies.some((entry) => entry.id !== id && entry.os === policy.os && entry.category === policy.category && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new ValidationError([{ field: 'name', message: '같은 OS와 유형에 동일한 정책명이 있습니다.' }]);
  }
  if (index >= 0) policies[index] = policy; else policies.push(policy);
  write(policies);
  return policy;
}

export function deletePolicy(id: string) {
  const policies = read(); const filtered = policies.filter((policy) => policy.id !== id);
  if (filtered.length === policies.length) throw new NotFoundError(`Policy not found: ${id}`);
  write(filtered);
}
