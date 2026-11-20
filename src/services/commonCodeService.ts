import fs from 'fs';

const FILE = 'data/common-codes.json';

export interface CommonCode { value: string; label: string; [key: string]: unknown }
export interface CommonCodes {
  serverRoles: CommonCode[];
  operatingSystems: CommonCode[];
  productsByRole: Record<string, string[]>;
  portProtocols: CommonCode[];
  templateKinds: CommonCode[];
  scriptItems: CommonCode[];
  rolePolicies: Record<'WEB' | 'WAS' | 'DB', string[]>;
}

export function getRawCommonCodes(): CommonCodes {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as CommonCodes;
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
    throw new Error('공통코드 JSON 구조가 올바르지 않습니다.');
  }
  for (const value of Object.values(codes)) {
    if (Array.isArray(value) && value.some((item) => typeof item !== 'string' && (!item || typeof item.value !== 'string' || typeof item.label !== 'string'))) {
      throw new Error('각 코드 항목은 문자열 또는 문자열 value와 label을 가진 객체여야 합니다.');
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const list of Object.values(value)) if (Array.isArray(list) && list.some((item) => typeof item !== 'string' && (!item || typeof item.value !== 'string' || typeof item.label !== 'string'))) {
        throw new Error('그룹별 코드 항목의 형식이 올바르지 않습니다.');
      }
    }
  }
  fs.writeFileSync(FILE, `${JSON.stringify(codes, null, 2)}\n`, 'utf8');
  return codes;
}
