/* 대시보드: 최근 점검 표와 상태 분포 계산 */
import { roleLabel } from '../shared/js/codes.js';
import { el } from '../shared/js/dom.js';
import { statusLabel } from '../shared/js/status.js';

/** 상태 분포: 점검 기록이 없는 서버는 unknown */
export function fleetCounts(summary) {
  const total = Number(summary.total) || 0;
  const counts = { healthy: Number(summary.healthy) || 0, warning: Number(summary.warning) || 0, critical: Number(summary.critical) || 0 };
  return { ...counts, unknown: Math.max(0, total - counts.healthy - counts.warning - counts.critical) };
}

/** 상태 분포 막대의 읽기용 설명 */
export function fleetLabel(total, counts) {
  return `전체 ${total}대 중 ${statusLabel('Healthy')} ${counts.healthy}, ${statusLabel('Warning')} ${counts.warning}, ${statusLabel('Critical')} ${counts.critical}, 점검 기록 없음 ${counts.unknown}`;
}

const numberCell = (text) => el('td', 'num', text);

/** data-role이 붙은 요소의 글자를 역할 이름(공통코드)으로 */
export function applyRoleLabels(elements) {
  for (const element of elements) element.textContent = roleLabel(element.getAttribute('data-role'));
}

export function renderRecentChecks(tbody, checks) {
  tbody.replaceChildren(...checks.map((item) => {
    const row = el('tr');
    const serverCell = el('td');
    const link = el('a', 'server-link', item.serverName);
    link.href = `/settings/server-management?id=${encodeURIComponent(item.serverId)}`;
    serverCell.append(link);
    const healthCell = el('td');
    healthCell.append(el('span', `history-status ${String(item.health || '').toLowerCase()}`, statusLabel(item.health)));
    const reportCell = el('td');
    const report = el('a', 'btn btn-small btn-secondary', '보고서 보기');
    report.href = `/reports/detail?serverId=${item.serverId}&file=${encodeURIComponent(item.fileName)}`;
    reportCell.append(report);
    row.append(serverCell, el('td', '', roleLabel(item.serverType)), el('td', '', item.checkDate), healthCell,
      numberCell(`${item.cpu}%`), numberCell(`${item.memory}%`), numberCell(`${item.disk}%`), reportCell);
    return row;
  }));
}
