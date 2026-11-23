/* 스크립트 관리: 템플릿 묶음·필터·목록 (항목 이름·역할은 공통코드 scriptItems) */
import { el } from '../../shared/js/dom.js';

const SYSTEM_ITEMS = ['START', 'SAVE'];

/** 정책의 사용자 항목(CUSTOM_)을 항목 선택지로 (역할 정책이면 그 역할) */
export function customScriptItems(policies) {
  const custom = new Map();
  for (const policy of policies) {
    for (const item of policy.items || []) {
      if (!item.id.startsWith('CUSTOM_') || custom.has(item.id)) continue;
      custom.set(item.id, { value: item.id, label: `${item.name} · ${policy.category}`, group: policy.category, role: policy.category === 'BASIC' ? undefined : policy.category, description: `${policy.os} 정책 항목` });
    }
  }
  return [...custom.values()];
}

/** 묶음: DB 쿼리 → DB, 시작·저장 → SYSTEM, 역할 항목 → 그 역할, 나머지 → COMMON */
export function templateGroup(template, scriptItems) {
  if (template.kind === 'QUERY') return 'DB';
  const definition = scriptItems.find((entry) => entry.value === template.item);
  if (definition?.role) return definition.role;
  return SYSTEM_ITEMS.includes(template.item) ? 'SYSTEM' : 'COMMON';
}

const templateOs = (template) => template.os || (template.kind === 'QUERY' ? 'Windows' : '');

/** filters: { kind, os, group('ALL'·묶음), item } */
export function filterTemplates(templates, { kind = '', os = '', group = 'ALL', item = '' } = {}, scriptItems) {
  return templates.filter((template) => (!kind || template.kind === kind)
    && (!os || template.kind === 'COMMAND' || templateOs(template) === os)
    && (group === 'ALL' || templateGroup(template, scriptItems) === group)
    && (!item || template.kind === 'QUERY' || template.item === item));
}

/** 묶음 탭 건수 (종류·OS로 거른 것 기준) */
export function groupCounts(templates, { kind = '', os = '' } = {}, scriptItems, groups) {
  const candidates = filterTemplates(templates, { kind, os }, scriptItems);
  return Object.fromEntries(groups.map((group) => [group, group === 'ALL' ? candidates.length : candidates.filter((template) => templateGroup(template, scriptItems) === group).length]));
}

/** 목록 한 줄 설명 */
export function templateMeta(template) {
  if (template.kind === 'COMMAND') return `관리 명령 · ${template.product || '미지정'} · ${template.item || '미지정'} · ${template.enabled ? '사용' : '중지'}`;
  const typeLabel = template.kind === 'QUERY' ? 'DB 쿼리' : `점검 항목 · ${template.item || '미지정'}`;
  const os = template.kind === 'QUERY' ? '' : template.os || '';
  const dbms = template.kind === 'QUERY' ? ` · DBMS · ${template.dbms || 'MSSQL'}` : '';
  return `${typeLabel}${os ? ` · ${os}` : ''}${dbms} · ${template.enabled ? '사용' : '중지'}`;
}

/** 점검 만들기 조각 배지: 자동 생성 / 직접 편집됨 */
export function generatedBadge(template) {
  if (!template.generatedState) return null;
  return el('span', `generated-badge${template.generatedState === 'DETACHED' ? ' is-detached' : ''}`, template.generatedState === 'DETACHED' ? '직접 편집됨' : '자동 생성');
}

/** 편집기 머리 안내 문구 (점검 만들기 조각이 아니면 '') */
export function generatedNoteText(template) {
  if (!template?.generatedState) return '';
  return template.generatedState === 'DETACHED'
    ? '점검 만들기에서 만든 스크립트를 직접 편집한 상태입니다. 정책 항목의 폼을 바꿔도 이 스크립트에는 반영되지 않습니다. 폼 기준으로 되돌리려면 점검 정책 관리에서 [폼 기준으로 다시 만들기]를 누르세요.'
    : '점검 만들기 폼으로 자동 생성된 스크립트입니다. 여기서 고쳐 저장하면 이후 폼 변경이 반영되지 않습니다. 가능하면 점검 정책 관리에서 폼을 고치세요.';
}

export function renderTemplateList(container, templates, { selectedId, onOpen, onDelete }) {
  if (!templates.length) {
    container.replaceChildren();
    container.textContent = '등록된 템플릿이 없습니다.';
    return;
  }
  container.replaceChildren(...templates.map((template) => {
    const card = el('article', `template-list-item${selectedId === template.id ? ' is-selected' : ''}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${template.name} 편집`);
    card.addEventListener('click', () => onOpen(template));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(template); } });
    const title = el('strong', '', template.name);
    const badge = generatedBadge(template);
    if (badge) title.append(' ', badge);
    const info = el('div');
    info.append(title, el('small', '', templateMeta(template)));
    const actions = el('div', 'button-area');
    if (template.generatedState) {
      // 점검 만들기 조각은 정책 항목이 관리합니다(여기서 삭제 불가)
      const link = el('a', 'btn btn-small', '정책에서 관리');
      link.href = '/settings/policy-management';
      link.addEventListener('click', (event) => event.stopPropagation());
      actions.append(link);
    } else {
      const remove = el('button', 'btn btn-small btn-danger', '삭제');
      remove.setAttribute('aria-label', `${template.name} 삭제`);
      remove.addEventListener('click', (event) => { event.stopPropagation(); onDelete(template); });
      actions.append(remove);
    }
    card.append(info, actions);
    return card;
  }));
}
