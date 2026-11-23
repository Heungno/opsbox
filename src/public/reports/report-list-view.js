/* 보고서 목록: 서버로 거르기와 보고서 표 그리기 */
import { el } from '../shared/js/dom.js';
import { statusLabel } from '../shared/js/status.js';

/** serverIds: Set(그 서버들만) 또는 null(거르지 않음). 결과는 점검일시 최신순. */
export function filterReports(reports, { serverIds = null } = {}) {
  return reports
    .filter((item) => !serverIds || serverIds.has(item.serverId))
    .sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''));
}

/** 보고서 표(최신순으로 받은 그대로). 0건이면 안내 문구. */
export function renderReportTable(container, reports) {
  if (!reports.length) {
    container.replaceChildren(el('p', 'report-list-empty', '조건에 맞는 보고서가 없습니다.'));
    return;
  }
  const table = el('table', 'server-table report-list-table');
  const thead = el('thead');
  const header = el('tr');
  header.append(...['점검일시', '서버', '상태', 'CPU', 'MEM', 'DISK', '보고서'].map((label) => el('th', '', label)));
  thead.append(header);
  const tbody = el('tbody');
  for (const item of reports) {
    const row = el('tr');
    const state = el('td');
    state.append(el('span', `history-status ${(item.health || '').toLowerCase()}`, statusLabel(item.health)));
    const action = el('td');
    const link = el('a', 'btn btn-small btn-primary', '보고서 보기');
    link.href = `/reports/detail?serverId=${encodeURIComponent(item.serverId)}&file=${encodeURIComponent(item.fileName || '')}`;
    action.append(link);
    row.append(el('td', '', item.checkDate || '-'), el('td', '', `${item.serverName || item.serverId} (${item.serverId})`), state,
      el('td', '', `${item.cpu ?? '-'}%`), el('td', '', `${item.memory ?? '-'}%`), el('td', '', `${item.disk ?? '-'}%`), action);
    tbody.append(row);
  }
  table.append(thead, tbody);
  container.replaceChildren(table);
}
