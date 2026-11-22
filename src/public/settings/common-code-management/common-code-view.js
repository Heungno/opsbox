/*
 * 공통코드 관리: 관리 문서(GET /api/common-codes/manage) 계산과 표 그리기
 *
 * 문서 모양: 분류 → 목록(문자열 또는 { value, label, ...}) 또는 그룹별 목록, 그리고 _codeMeta.
 * _codeMeta['분류::그룹::코드'] = { label, enabled, sortOrder } 는 문자열 코드의 사용 여부·순서를 담고,
 * 항목에 같은 값이 있어도 _codeMeta가 우선합니다(서버 getCommonCodes와 같은 규칙).
 */
import { el } from '../../shared/js/dom.js';

export const META = '_codeMeta';

export const metaKey = (category, group, value) => [category, group || '', value].join('::');

export function isGrouped(codes, category) {
  const value = codes[category];
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

/** 분류의 그룹 이름 목록. 그룹이 없는 분류는 [''] */
export function groupsOf(codes, category) {
  return isGrouped(codes, category) ? Object.keys(codes[category]) : [''];
}

export function listOf(codes, category, group) {
  const list = isGrouped(codes, category) ? codes[category][group] : codes[category];
  return Array.isArray(list) ? list : [];
}

export function countCodes(codes, category) {
  return groupsOf(codes, category).reduce((total, group) => total + listOf(codes, category, group).length, 0);
}

/** 시작·저장 조각은 지울 수 없습니다(서버도 거부). */
export function isSystemCode(category, item) {
  if (category !== 'scriptItems') return false;
  const value = item && typeof item === 'object' ? String(item.value) : String(item);
  return value === 'START' || value === 'SAVE' || item?.group === '시스템';
}

function setMeta(codes, category, group, value, meta) {
  codes[META] ||= {};
  const key = metaKey(category, group, value);
  if (meta.enabled && meta.sortOrder === 0 && !meta.label) delete codes[META][key];
  else codes[META][key] = meta;
}

/** 화면 행: 사용 여부·순서는 _codeMeta → 항목 값 → 원래 순서 */
export function codeRows(codes, category, group) {
  return listOf(codes, category, group).map((item, index) => {
    const object = Boolean(item) && typeof item === 'object';
    const value = String(object ? item.value : item);
    const extra = object ? item : {};
    const meta = codes[META]?.[metaKey(category, group, value)] || {};
    return {
      group, index, value, object, extra,
      label: meta.label || extra.label || value,
      enabled: meta.enabled ?? extra.enabled ?? true,
      sortOrder: Number(meta.sortOrder ?? extra.sortOrder ?? index),
      protected: isSystemCode(category, item),
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.index - b.index);
}

/**
 * 추가(editing=null) 또는 수정. 문서를 바꾸고, 문제가 있으면 오류 문구를 돌려줍니다(문서는 그대로).
 * 객체 목록은 항목에 사용 여부·순서를 넣고, 문자열 목록은 _codeMeta에 기록합니다.
 */
export function applyEdit(codes, category, group, editing, { value, label, enabled, sortOrder }) {
  const list = listOf(codes, category, group);
  if (list.some((item, index) => String(item && typeof item === 'object' ? item.value : item) === value && (!editing || index !== editing.index))) return '같은 코드 값이 이미 있습니다.';
  const objectList = editing?.object ?? list.some((item) => item && typeof item === 'object');
  if (editing) list.splice(editing.index, 1);
  if (objectList) {
    list.push({ ...(editing?.extra || {}), value, label, enabled, sortOrder });
  } else {
    list.push(value);
    setMeta(codes, category, group, value, { label: label === value ? '' : label, enabled, sortOrder });
  }
  if (editing && editing.value !== value) setMeta(codes, category, group, editing.value, { enabled: true, sortOrder: 0, label: '' });
  return null;
}

export function removeRow(codes, category, row) {
  listOf(codes, category, row.group).splice(row.index, 1);
  setMeta(codes, category, row.group, row.value, { enabled: true, sortOrder: 0, label: '' });
}

/** 분류를 지우고 그 분류의 _codeMeta도 지웁니다. */
export function removeCategory(codes, category) {
  delete codes[category];
  for (const key of Object.keys(codes[META] || {})) if (key.startsWith(`${category}::`)) delete codes[META][key];
}

/** groups: [{ group, rows }] */
export function renderCodeTable(tbody, groups, { onEdit, onDelete }) {
  tbody.replaceChildren();
  for (const { group, rows } of groups) {
    for (const row of rows) {
      const tr = el('tr');
      for (const value of [group ? `${group} / ${row.value}` : row.value, row.label, row.enabled ? '사용' : '미사용', String(row.sortOrder)]) tr.append(el('td', '', value));
      const actions = el('td');
      const edit = el('button', 'btn btn-small', '수정');
      edit.addEventListener('click', () => onEdit(row));
      actions.append(edit);
      if (row.protected) {
        actions.append(' ', el('small', 'policy-help', '시스템'));
      } else {
        const remove = el('button', 'btn btn-small btn-danger', '삭제');
        remove.addEventListener('click', () => onDelete(row));
        actions.append(' ', remove);
      }
      tr.append(actions);
      tbody.append(tr);
    }
  }
}

/** 왼쪽 분류 목록 */
export function renderCategoryList(list, codes, selected, { onSelect, onDelete }) {
  list.replaceChildren(...Object.keys(codes).filter((key) => key !== META).map((name) => {
    const item = el('button', `template-list-item${name === selected ? ' is-selected' : ''}`);
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(name === selected));
    const info = el('div');
    info.append(el('strong', '', name), el('small', '', `${countCodes(codes, name)}개 코드`));
    const remove = el('button', 'btn btn-small btn-danger', '삭제');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${name} 분류 삭제`);
    remove.addEventListener('click', (event) => { event.stopPropagation(); onDelete(name); });
    item.append(info, remove);
    item.addEventListener('click', () => onSelect(name));
    return item;
  }));
}
