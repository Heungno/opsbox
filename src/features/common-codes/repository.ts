import { db, transaction } from '../../db/connection';
import type { CategoryRow, CommonCodeRow, CommonCodeTables, OverrideRow } from './codec';

/* 공통코드 테이블 읽기·쓰기. 관리 화면이 문서 전체를 저장하므로 쓰기는 세 테이블을 한 번에 바꿉니다. */

const toBool = (value: unknown) => (value === null || value === undefined ? null : Boolean(value));
const toInt = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

export function readTables(): CommonCodeTables {
  const categories = db.prepare('SELECT category, shape, position FROM common_code_categories ORDER BY position').all() as unknown as CategoryRow[];
  const rows = (db.prepare('SELECT category, group_key, value, label, enabled, sort_order, extra, position FROM common_codes ORDER BY position').all() as any[])
    .map((row): CommonCodeRow => ({
      category: row.category,
      groupKey: row.group_key,
      value: row.value,
      label: row.label,
      enabled: toBool(row.enabled),
      sortOrder: row.sort_order,
      extra: row.extra === null ? null : JSON.parse(row.extra),
      position: row.position,
    }));
  const overrides = (db.prepare('SELECT meta_key, label, enabled, sort_order FROM common_code_overrides ORDER BY rowid').all() as any[])
    .map((row): OverrideRow => ({ metaKey: row.meta_key, label: row.label, enabled: toBool(row.enabled), sortOrder: row.sort_order }));
  return { categories, rows, overrides };
}

export function replaceTables({ categories, rows, overrides }: CommonCodeTables) {
  transaction(() => {
    db.exec('DELETE FROM common_code_overrides; DELETE FROM common_codes; DELETE FROM common_code_categories;');
    const insertCategory = db.prepare('INSERT INTO common_code_categories (category, shape, position) VALUES (?, ?, ?)');
    categories.forEach((row) => insertCategory.run(row.category, row.shape, row.position));
    const insertRow = db.prepare('INSERT INTO common_codes (category, group_key, value, label, enabled, sort_order, extra, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    rows.forEach((row) => insertRow.run(row.category, row.groupKey, row.value, row.label, toInt(row.enabled), row.sortOrder, row.extra === null ? null : JSON.stringify(row.extra), row.position));
    const insertOverride = db.prepare('INSERT INTO common_code_overrides (meta_key, label, enabled, sort_order) VALUES (?, ?, ?, ?)');
    overrides.forEach((row) => insertOverride.run(row.metaKey, row.label, toInt(row.enabled), row.sortOrder));
  });
}
