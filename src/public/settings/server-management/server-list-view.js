/* 서버 목록: 요약 카드, 역할 탭, 서버 행, 등록 폼의 역할·제품 선택 */
import { codeList, roleLabel } from '../../shared/js/codes.js';
import { el, option } from '../../shared/js/dom.js';

const rolesOf = (server) => server.roles ?? [];

/** 사용 중인 서버만 셉니다(미사용 포함을 켜도 같음). roles: 공통코드 serverRoles 목록 */
export function summarizeServers(servers, roles) {
  const active = servers.filter((server) => server.enabled !== false);
  return {
    total: active.length,
    byRole: Object.fromEntries(roles.map(({ value }) => [value, active.filter((server) => rolesOf(server).includes(value)).length])),
  };
}

export function renderSummaryCards(container, summary, roles) {
  const card = (label, count) => {
    const box = el('div', 'summary-card');
    box.append(el('span', '', label), el('strong', '', String(count)));
    return box;
  };
  container.replaceChildren(card('Total', summary.total), ...roles.map(({ value }) => card(roleLabel(value), summary.byRole[value] ?? 0)));
}

/** 검색어(ID·이름·IP·역할·제품)와 역할 탭으로 거릅니다. */
export function filterServers(servers, { keyword = '', role = 'ALL' } = {}) {
  const word = keyword.trim().toLowerCase();
  return servers
    .filter((server) => !word || [server.id, server.name, server.ip, rolesOf(server).join(' '), Object.values(server.products || {}).join(' ')].some((text) => String(text).toLowerCase().includes(word)))
    .filter((server) => role === 'ALL' || rolesOf(server).includes(role));
}

/** 역할 탭: 전체 + 공통코드 역할, 건수는 검색에 맞는 서버 수 */
export function renderRoleTabs(container, roles, matching, active) {
  const tab = (value, label, count) => {
    const button = el('button', '', label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('data-role', value);
    button.setAttribute('aria-selected', String(value === active));
    button.tabIndex = value === active ? 0 : -1;
    button.append(' ', el('span', '', String(count)));
    return button;
  };
  container.replaceChildren(
    tab('ALL', '전체', matching.length),
    ...roles.map(({ value }) => tab(value, roleLabel(value), matching.filter((server) => rolesOf(server).includes(value)).length)),
  );
}

/** 서버 행. 미사용 서버는 흐리게 + "미사용" 배지 + [다시 사용] */
export function renderServerRows(tbody, servers, { onToggle }) {
  if (!servers.length) {
    const row = el('tr');
    const cell = el('td', 'server-list-empty', '조건에 맞는 서버가 없습니다.');
    cell.colSpan = 6;
    row.append(cell);
    tbody.replaceChildren(row);
    return;
  }
  tbody.replaceChildren(...servers.map((server) => {
    const inactive = server.enabled === false;
    const row = el('tr', inactive ? 'server-inactive' : '');
    const detailHref = `/settings/server-management/detail?id=${encodeURIComponent(server.id)}`;
    const idCell = el('td');
    const link = el('a', '', server.id);
    link.href = detailHref;
    idCell.append(link);
    const nameCell = el('td', '', server.name);
    if (inactive) nameCell.append(' ', el('span', 'server-inactive-badge', '미사용'));
    const roleText = rolesOf(server).map((role) => `${roleLabel(role)}${server.products?.[role] ? ` · ${server.products[role]}` : ''}`).join(' / ');
    const actions = el('td');
    const detail = el('a', 'btn btn-small', '상세');
    detail.href = detailHref;
    // 서버는 지우지 않고 미사용으로 바꿉니다(점검 결과·보고서를 남기고 나중에 다시 쓸 수 있게).
    const toggle = el('button', inactive ? 'btn btn-primary btn-small' : 'btn btn-small', inactive ? '다시 사용' : '미사용');
    toggle.type = 'button';
    toggle.addEventListener('click', () => onToggle(server));
    actions.append(detail, toggle);
    row.append(idCell, nameCell, el('td', '', roleText), el('td', '', server.os), el('td', '', server.ip), actions);
    return row;
  }));
}

/**
 * 등록 폼의 역할·제품 선택. 제품 목록(공통코드 productsByRole)이 있는 역할에만 제품 선택을 둡니다.
 * read()로 { roles, products }를 읽습니다(고른 역할의 제품만).
 */
/** 역할 선택지: 사용 중인 역할 + 서버가 가진 사용 안 함 역할(이름은 _labels) — 저장할 때 지워지지 않게 */
export function roleChoices(selectedRoles = []) {
  const active = codeList('serverRoles');
  const kept = selectedRoles.filter((role) => !active.some((code) => code.value === role)).map((role) => ({ value: role, label: roleLabel(role) }));
  return [...active, ...kept];
}

export function renderRoleProductFields(container, selectedRoles = [], selectedProducts = {}) {
  const fields = roleChoices(selectedRoles).map(({ value: role, label: roleName }) => {
    const row = el('div', 'role-product-row');
    const label = el('label', 'role-choice-label');
    const checkbox = el('input', 'role-choice-checkbox');
    checkbox.type = 'checkbox';
    checkbox.value = role;
    checkbox.checked = selectedRoles.includes(role);
    label.append(checkbox, ` ${roleName}`);
    row.append(label);
    const products = codeList('productsByRole', role);
    let select;
    if (products.length) {
      select = el('select');
      select.setAttribute('data-role-product', role);
      select.append(option('', '제품 선택'), ...products.map(({ value, label: name }) => option(value, name)));
      select.value = selectedProducts[role] || '';
      row.append(select);
    }
    const sync = () => {
      row.classList.toggle('active', checkbox.checked);
      if (!checkbox.checked && select) select.value = '';
    };
    checkbox.addEventListener('change', sync);
    sync();
    return { role, checkbox, select, row };
  });
  container.replaceChildren(...fields.map((field) => field.row));
  return {
    read() {
      const chosen = fields.filter((field) => field.checkbox.checked);
      return {
        roles: chosen.map((field) => field.role),
        products: Object.fromEntries(chosen.filter((field) => field.select?.value).map((field) => [field.role, field.select.value])),
      };
    },
  };
}
