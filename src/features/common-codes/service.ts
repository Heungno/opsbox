import '../../db'; // 스키마·기본값 준비
import { fromTables, toTables } from './codec';
import { readTables, replaceTables } from './repository';
import { BadRequestError } from '../../shared/errors';
import type { CommonCodes } from './types';

const REQUIRED_SYSTEM_SCRIPT_CODES = ['START', 'SAVE'];

export type { CommonCode, CommonCodes } from './types';

export function getCommonCodeValues(category: keyof CommonCodes): string[] {
  const value = getCommonCodes()[category];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === 'string' ? entry : entry.value);
}

export function getRawCommonCodes(): CommonCodes {
  const tables = readTables();
  if (!tables.categories.length) throw new Error('공통코드 데이터가 없습니다. seeds/common-codes.json 기본값 파일을 확인하세요.');
  return fromTables(tables);
}

export function getCommonCodes(): CommonCodes {
  const codes = getRawCommonCodes() as CommonCodes & { _codeMeta?: Record<string, { enabled?: boolean; sortOrder?: number }> };
  const meta = codes._codeMeta ?? {};
  for (const [category, value] of Object.entries(codes)) {
    if (category === '_codeMeta') continue;
    const normalize = (items: unknown[], group = '') => items.map((item, index) => ({ item, index, code: typeof item === 'object' && item !== null ? String((item as any).value) : String(item), extra: typeof item === 'object' && item !== null ? item as any : {} }))
      .filter(({ code, extra }) => (meta[`${category}::${group}::${code}`]?.enabled ?? extra.enabled ?? true) !== false)
      .sort((a, b) => Number(meta[`${category}::${group}::${a.code}`]?.sortOrder ?? a.extra.sortOrder ?? a.index) - Number(meta[`${category}::${group}::${b.code}`]?.sortOrder ?? b.extra.sortOrder ?? b.index))
      .map(({ item }) => item);
    if (Array.isArray(value)) (codes as any)[category] = normalize(value);
    else if (value && typeof value === 'object') for (const [group, items] of Object.entries(value)) if (Array.isArray(items)) (codes as any)[category][group] = normalize(items, group);
  }
  return codes;
}

export function saveCommonCodes(codes: CommonCodes): CommonCodes {
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
    throw new BadRequestError('공통코드 JSON 구조가 올바르지 않습니다.');
  }
  const scriptItems = Array.isArray((codes as any).scriptItems) ? (codes as any).scriptItems : [];
  const submittedScriptValues = new Set(scriptItems.map((item: unknown) => typeof item === 'object' && item !== null ? String((item as any).value) : String(item)));
  if (REQUIRED_SYSTEM_SCRIPT_CODES.some((value) => !submittedScriptValues.has(value))) {
    throw new BadRequestError('시스템 코드는 삭제할 수 없습니다.');
  }
  for (const value of Object.values(codes)) {
    if (Array.isArray(value) && value.some((item) => typeof item !== 'string' && (!item || typeof item.value !== 'string' || typeof item.label !== 'string'))) {
      throw new BadRequestError('각 코드 항목은 문자열 또는 문자열 value와 label을 가진 객체여야 합니다.');
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const list of Object.values(value)) if (Array.isArray(list) && list.some((item) => typeof item !== 'string' && (!item || typeof item.value !== 'string' || typeof item.label !== 'string'))) {
        throw new BadRequestError('그룹별 코드 항목의 형식이 올바르지 않습니다.');
      }
    }
  }
  replaceTables(toTables(codes));
  return codes;
}
