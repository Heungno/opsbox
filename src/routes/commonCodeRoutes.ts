import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../services/auditService';
import { getCommonCodes, getRawCommonCodes, saveCommonCodes } from '../services/commonCodeService';
import type { AuditChange } from '../types/audit';
import type { CommonCodes } from '../types/commonCode';
import { ok, requireObject } from '../shared/http';

/** 공통코드는 분류별로 추가·삭제·변경된 코드를 정리해 남깁니다. */
function diffCommonCodes(before: CommonCodes, after: CommonCodes): AuditChange[] {
  const codesOf = (value: unknown): Map<string, string> => {
    const map = new Map<string, string>();
    const add = (items: unknown, group = '') => Array.isArray(items) && items.forEach((item) => {
      const code = typeof item === 'string' ? item : String((item as { value?: unknown })?.value ?? '');
      map.set(group ? `${group}/${code}` : code, JSON.stringify(item));
    });
    if (Array.isArray(value)) add(value);
    else if (value && typeof value === 'object') Object.entries(value).forEach(([group, items]) => add(items, group));
    return map;
  };
  const changes: AuditChange[] = [];
  const categories = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const category of categories) {
    const a = (before as unknown as Record<string, unknown>)[category];
    const b = (after as unknown as Record<string, unknown>)[category];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (category === '_codeMeta') { changes.push({ field: '사용 여부·정렬', before: '(변경 전)', after: '(변경됨)' }); continue; }
    const beforeCodes = codesOf(a);
    const afterCodes = codesOf(b);
    const added = [...afterCodes.keys()].filter((code) => !beforeCodes.has(code));
    const removed = [...beforeCodes.keys()].filter((code) => !afterCodes.has(code));
    const modified = [...afterCodes.keys()].filter((code) => beforeCodes.has(code) && beforeCodes.get(code) !== afterCodes.get(code));
    changes.push({
      field: category,
      before: removed.length || modified.length ? [...removed.map((code) => `-${code}`), ...modified.map((code) => `~${code}`)].join(', ') : undefined,
      after: [added.length ? `추가: ${added.join(', ')}` : '', removed.length ? `삭제: ${removed.join(', ')}` : '', modified.length ? `변경: ${modified.join(', ')}` : ''].filter(Boolean).join(' / ') || '(순서 변경)',
    });
  }
  return changes;
}

export async function commonCodeRoutes(app: FastifyInstance) {
  // 관리 화면용: 사용 여부·정렬 정보(_codeMeta)를 포함한 원본
  app.get('/common-codes/manage', async () => ok(getRawCommonCodes()));
  // 일반 화면용: 사용 중인 코드만 정렬해서
  app.get('/common-codes', async () => ok(getCommonCodes()));
  app.put<{ Body: CommonCodes }>('/common-codes', async (request) => {
    const before = getRawCommonCodes();
    const saved = saveCommonCodes(requireObject<CommonCodes>(request.body));
    const changes = diffCommonCodes(before, saved);
    recordAudit(request, { action: 'COMMON_CODE_UPDATE', summary: `공통코드 변경: ${changes.map((change) => change.field).join(', ') || '변경 없음'}`, changes });
    return ok(saved);
  });
}
