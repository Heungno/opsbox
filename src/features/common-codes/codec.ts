import { BadRequestError } from '../../shared/errors';
import type { CommonCodes } from './types';

/*
 * 공통코드 문서(API·화면이 쓰는 모양) ↔ 테이블 행 변환. DB를 쓰지 않는 순수 함수입니다.
 *
 * 문서의 분류는 세 가지 모양입니다.
 * - LIST:   [ 'A', { value, label, ... }, ... ]
 * - GROUPS: { WEB: [ 'Nginx', ... ], WAS: [...] }       (productsByRole, rolePolicies)
 * - META:   _codeMeta { '분류::그룹::코드': { label?, enabled?, sortOrder? } }   (관리 화면의 사용 여부·정렬)
 * 문자열로만 된 코드는 label을 NULL로 저장해 다시 문자열로 돌려놓습니다.
 * 행이 하나도 없는 그룹은 저장하면 문서에서 빠집니다.
 */
export const META_CATEGORY = '_codeMeta';

export interface CategoryRow { category: string; shape: 'LIST' | 'GROUPS' | 'META'; position: number }
export interface CommonCodeRow {
  category: string;
  groupKey: string;
  value: string;
  label: string | null;
  enabled: boolean | null;
  sortOrder: number | null;
  extra: Record<string, unknown> | null;
  position: number;
}
export interface OverrideRow { metaKey: string; label: string | null; enabled: boolean | null; sortOrder: number | null }
export interface CommonCodeTables { categories: CategoryRow[]; rows: CommonCodeRow[]; overrides: OverrideRow[] }

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function toTables(codes: CommonCodes): CommonCodeTables {
  const tables: CommonCodeTables = { categories: [], rows: [], overrides: [] };
  const seen = new Set<string>();
  const addEntries = (category: string, groupKey: string, entries: unknown[]) => {
    for (const entry of entries) {
      const value = typeof entry === 'string' ? entry : String((entry as { value?: unknown }).value);
      const key = `${category}\u0000${groupKey}\u0000${value}`;
      if (seen.has(key)) throw new BadRequestError(`같은 코드가 두 번 있습니다: ${[category, groupKey, value].filter(Boolean).join(' ')}`);
      seen.add(key);
      const row: CommonCodeRow = { category, groupKey, value, label: null, enabled: null, sortOrder: null, extra: null, position: tables.rows.length };
      if (isObject(entry)) {
        const { value: _value, label, enabled, sortOrder, ...extra } = entry;
        row.label = String(label);
        if (enabled !== undefined) row.enabled = Boolean(enabled);
        if (sortOrder !== undefined) row.sortOrder = Number(sortOrder);
        if (Object.keys(extra).length) row.extra = extra;
      }
      tables.rows.push(row);
    }
  };
  Object.entries(codes).forEach(([category, value], position) => {
    if (category === META_CATEGORY) {
      if (!isObject(value)) throw new BadRequestError('_codeMeta는 객체여야 합니다.');
      tables.categories.push({ category, shape: 'META', position });
      for (const [metaKey, meta] of Object.entries(value)) {
        const m = isObject(meta) ? meta : {};
        tables.overrides.push({
          metaKey,
          label: m.label === undefined ? null : String(m.label),
          enabled: m.enabled === undefined ? null : Boolean(m.enabled),
          sortOrder: m.sortOrder === undefined ? null : Number(m.sortOrder),
        });
      }
    } else if (Array.isArray(value)) {
      tables.categories.push({ category, shape: 'LIST', position });
      addEntries(category, '', value);
    } else if (isObject(value) && Object.values(value).every(Array.isArray)) {
      tables.categories.push({ category, shape: 'GROUPS', position });
      for (const [groupKey, entries] of Object.entries(value)) addEntries(category, groupKey, entries as unknown[]);
    } else {
      throw new BadRequestError(`공통코드 분류 ${category}는 목록 또는 그룹별 목록이어야 합니다.`);
    }
  });
  return tables;
}

export function fromTables({ categories, rows, overrides }: CommonCodeTables): CommonCodes {
  const toEntry = (row: CommonCodeRow) => {
    if (row.label === null) return row.value;
    return {
      value: row.value,
      label: row.label,
      ...(row.extra ?? {}),
      ...(row.enabled === null ? {} : { enabled: row.enabled }),
      ...(row.sortOrder === null ? {} : { sortOrder: row.sortOrder }),
    };
  };
  const doc: Record<string, unknown> = {};
  const sortedRows = [...rows].sort((a, b) => a.position - b.position);
  for (const { category, shape } of [...categories].sort((a, b) => a.position - b.position)) {
    if (shape === 'META') {
      doc[category] = Object.fromEntries(overrides.map(({ metaKey, label, enabled, sortOrder }) => [metaKey, {
        ...(label === null ? {} : { label }),
        ...(enabled === null ? {} : { enabled }),
        ...(sortOrder === null ? {} : { sortOrder }),
      }]));
    } else if (shape === 'LIST') {
      doc[category] = sortedRows.filter((row) => row.category === category).map(toEntry);
    } else {
      const groups: Record<string, unknown[]> = {};
      for (const row of sortedRows.filter((entry) => entry.category === category)) (groups[row.groupKey] ??= []).push(toEntry(row));
      doc[category] = groups;
    }
  }
  return doc as unknown as CommonCodes;
}
