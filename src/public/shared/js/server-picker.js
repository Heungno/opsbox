/*
 * 서버 목록 패널 (왼쪽): 검색(ID·이름·IP) + 역할 탭 + 서버 목록
 * 서버 관리 상세와 보고서 목록이 같이 씁니다. 마크업은 각 화면 HTML의 .template-list-panel.
 * 로직 모듈에서도 쓰므로 상대 경로로만 import 합니다(api.js는 받지 않고 fetchServers를 받음).
 */
import { codeList } from './codes.js';
import { el } from './dom.js';
import { renderRoleTabs } from '../../settings/server-management/server-list-view.js';

const rolesOf = (server) => server.roles ?? [];

/** 검색어(ID·이름·IP, 부분 일치)와 역할 탭('ALL' 또는 역할 값)으로 거릅니다. */
export function pickerMatches(servers, { keyword = '', role = 'ALL' } = {}) {
  const word = keyword.trim().toLowerCase();
  return servers
    .filter((server) => `${server.id} ${server.name} ${server.ip}`.toLowerCase().includes(word))
    .filter((server) => role === 'ALL' || rolesOf(server).includes(role));
}

function listItem(selected, onPick, ...content) {
  const item = el('div', `template-list-item${selected ? ' is-selected' : ''}`);
  item.setAttribute('role', 'button');
  item.tabIndex = 0;
  item.append(...content);
  item.addEventListener('click', onPick);
  item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') onPick(); });
  return item;
}

/** 목록 항목. allLabel이 있으면 맨 앞에 '전체' 항목(고르면 null). */
export function renderPickerList(list, servers, { selectedId = null, allLabel, onSelect }) {
  const items = servers.map((server) => {
    const info = el('div');
    info.append(el('strong', '', server.name), el('small', '', `${server.id} · ${server.ip} · ${server.os}${server.enabled === false ? ' · 미사용' : ''}`));
    return listItem(server.id === selectedId, () => onSelect(server.id), info);
  });
  if (allLabel) items.unshift(listItem(selectedId === null, () => onSelect(null), el('strong', '', allLabel)));
  list.replaceChildren(...items);
}

/**
 * 패널을 화면 요소에 연결합니다.
 * elements: { search, tabs, list, empty, refresh? }, fetchServers: () => Promise<server[]>
 * onFilterChange: 검색어·역할 탭이 바뀌었을 때(보이는 서버가 달라짐)
 */
export function createServerPicker({ search, tabs, list, empty, refresh, allLabel, fetchServers, onSelect, onFilterChange }) {
  let servers = [];
  let role = 'ALL';
  let selectedId = null;

  const matching = () => pickerMatches(servers, { keyword: search.value, role: 'ALL' });
  const visibleServers = () => pickerMatches(servers, { keyword: search.value, role });

  function render() {
    renderRoleTabs(tabs, codeList('serverRoles'), matching(), role);
    const visible = visibleServers();
    renderPickerList(list, visible, { selectedId, allLabel, onSelect });
    empty.hidden = visible.length > 0;
    empty.textContent = servers.length ? '조건에 맞는 서버가 없습니다.' : '등록된 서버가 없습니다.';
  }

  function setRole(next) {
    role = next;
    render();
    onFilterChange?.();
  }

  search.addEventListener('input', () => { render(); onFilterChange?.(); });
  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) setRole(tab.dataset.role);
  });
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const all = [...tabs.querySelectorAll('[role="tab"]')];
    const current = all.findIndex((tab) => tab.dataset.role === role);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
    event.preventDefault();
    setRole(all[next].dataset.role);
    // 탭을 다시 그리므로 새 탭에 포커스를 줍니다.
    tabs.querySelector(`[data-role="${role}"]`)?.focus();
  });

  async function load() {
    servers = (await fetchServers()) || [];
    render();
    return servers;
  }
  refresh?.addEventListener('click', async () => { await load(); onFilterChange?.(); });

  return {
    load,
    servers: () => servers,
    visibleServers,
    setSelected(id) { selectedId = id; render(); },
  };
}
