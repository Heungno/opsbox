/* 보고서 목록: 거르기·요약 계산과 요약 카드·보고서 표 그리기 */
import { el } from '../shared/js/dom.js';
import { statusLabel } from '../shared/js/status.js';

const HEALTHS = [['Healthy', 'healthy'], ['Warning', 'warning'], ['Critical', 'critical']];

/**
 * serverIds: Set(그 서버들만) 또는 null(거르지 않음), health: 'Healthy'|'Warning'|'Critical'|null.
 * 결과는 점검일시 최신순.
 */
export function filterReports(reports, { serverIds = null, health = null } = {}) {
  return reports
    .filter((item) => !serverIds || serverIds.has(item.serverId))
    .filter((item) => !health || item.health === health)
    .sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''));
}

export function summarizeReports(reports) {
  const count = (health) => reports.filter((item) => item.health === health).length;
  const latest = reports.reduce((best, item) => (!best || (item.checkDate || '') > (best.checkDate || '') ? item : best), null);
  return {
    total: reports.length,
    servers: new Set(reports.map((item) => item.serverId)).size,
    healthy: count('Healthy'),
    warning: count('Warning'),
    critical: count('Critical'),
    latest: latest ? { checkDate: latest.checkDate, serverName: latest.serverName } : null,
  };
}

function card(tag, label, value, className = '') {
  const box = el(tag, `summary-card${className ? ` ${className}` : ''}`);
  box.append(el('span', '', label), el('strong', '', String(value)));
  return box;
}

/** 요약 카드. 정상·경고·위험 카드는 눌러서 표를 그 상태로 거름(다시 누르면 풂). */
export function renderReportSummary(container, summary, { showServers, activeHealth, onHealth }) {
  const cards = [card('div', '보고서', summary.total)];
  if (showServers) cards.push(card('div', '서버', summary.servers));
  for (const [health, key] of HEALTHS) {
    const button = card('button', statusLabel(health), summary[key], `report-summary-${key}`);
    button.type = 'button';
    button.setAttribute('data-health', health);
    button.setAttribute('aria-pressed', String(activeHealth === health));
    button.addEventListener('click', () => onHealth(activeHealth === health ? null : health));
    cards.push(button);
  }
  const latest = card('div', '최근 점검', summary.latest?.checkDate || '-', 'report-summary-latest');
  if (summary.latest) latest.append(el('small', '', summary.latest.serverName));
  cards.push(latest);
  container.replaceChildren(...cards);
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
