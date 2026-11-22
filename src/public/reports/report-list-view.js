/* 보고서 목록: 역할 → 서버 → 점검 결과 트리 */
import { roleLabel } from '../shared/js/codes.js';
import { el } from '../shared/js/dom.js';
import { statusLabel } from '../shared/js/status.js';

const FALLBACK_ROLE = 'OTHER';

/**
 * 역할(공통코드 순서)별로 서버와 보고서를 묶습니다. 한 서버가 여러 역할이면 각 역할에 나옵니다.
 * 공통코드에 없는 역할은 기타(OTHER)로 모읍니다. 역할 목록이 비어 있으면(공통코드를 못 불러옴) 보고서의 역할 순서대로.
 */
export function groupReports(reports, roleOrder) {
  const order = [...roleOrder];
  if (!order.includes(FALLBACK_ROLE)) {
    const extra = reports.flatMap((item) => (item.serverTypes?.length ? item.serverTypes : [item.serverType])).filter((role) => role && !order.includes(role));
    if (!order.length) order.push(...new Set(extra));
    order.push(FALLBACK_ROLE);
  }
  const grouped = new Map(order.map((role) => [role, new Map()]));
  for (const item of reports) {
    const roles = item.serverTypes?.length ? item.serverTypes : [item.serverType];
    for (const role of new Set(roles)) {
      const servers = grouped.get(order.includes(role) ? role : FALLBACK_ROLE);
      if (!servers.has(item.serverId)) servers.set(item.serverId, []);
      servers.get(item.serverId).push(item);
    }
  }
  return order
    .map((role) => ({
      role,
      label: roleLabel(role),
      servers: [...grouped.get(role).entries()]
        .map(([serverId, items]) => ({ serverId, serverName: items[0].serverName || serverId, items: [...items].sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || '')) }))
        .sort((a, b) => a.serverName.localeCompare(b.serverName, 'ko')),
    }))
    .filter((group) => group.role !== FALLBACK_ROLE || roleOrder.includes(FALLBACK_ROLE) || group.servers.length);
}

function treeTitle(title, meta) {
  const wrapper = el('span', 'report-tree-title');
  wrapper.append(el('strong', '', title), el('small', '', meta));
  return wrapper;
}

function reportsTable(items) {
  const table = el('table', 'server-table report-tree-table');
  const thead = el('thead');
  const header = el('tr');
  header.append(...['점검일시', '상태', 'CPU', 'MEM', 'DISK', '보고서'].map((label) => el('th', '', label)));
  thead.append(header);
  const tbody = el('tbody');
  for (const item of items) {
    const row = el('tr');
    const state = el('td');
    state.append(el('span', `history-status ${(item.health || '').toLowerCase()}`, statusLabel(item.health)));
    const action = el('td');
    const link = el('a', 'btn btn-small btn-primary', '보고서 보기');
    link.href = `/reports/detail?serverId=${encodeURIComponent(item.serverId)}&file=${encodeURIComponent(item.fileName || '')}`;
    action.append(link);
    row.append(el('td', '', item.checkDate || '-'), state, el('td', '', `${item.cpu ?? '-'}%`), el('td', '', `${item.memory ?? '-'}%`), el('td', '', `${item.disk ?? '-'}%`), action);
    tbody.append(row);
  }
  table.append(thead, tbody);
  return table;
}

export function renderReportTree(tree, groups) {
  tree.replaceChildren(...groups.map((group) => {
    const typeNode = el('details', 'report-tree-type');
    typeNode.open = true;
    const typeSummary = el('summary', 'report-tree-type-summary');
    const count = group.servers.reduce((sum, server) => sum + server.items.length, 0);
    typeSummary.append(treeTitle(group.label, `${group.servers.length}개 서버 · ${count}건`));
    typeNode.append(typeSummary);
    if (!group.servers.length) typeNode.append(el('p', 'report-tree-empty', '검색 결과가 없습니다.'));
    for (const server of group.servers) {
      const serverNode = el('details', 'report-tree-server');
      serverNode.open = true;
      const summary = el('summary', 'report-tree-server-summary');
      summary.append(treeTitle(`${server.serverName} (${server.serverId})`, `${server.items.length}건 · 최근 ${server.items[0].checkDate || '-'}`));
      serverNode.append(summary, reportsTable(server.items));
      typeNode.append(serverNode);
    }
    return typeNode;
  }));
}
