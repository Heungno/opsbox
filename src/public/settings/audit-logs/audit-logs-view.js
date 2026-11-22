/* 변경 이력: 표 행과 펼침 상세 */
import { codeLabel } from '../../shared/js/codes.js';
import { el } from '../../shared/js/dom.js';

/** 작업별 배지 색 (표시 규칙) */
const ACTION_TONE = { LOGIN_FAILURE: 'badge-danger', SERVER_DEACTIVATE: 'badge-warning', POLICY_DELETE: 'badge-danger', TEMPLATE_DELETE: 'badge-danger', LOGIN_SUCCESS: 'badge-muted', LOGOUT: 'badge-muted' };

export function localDate(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${localDate(date)} ${date.toTimeString().slice(0, 8)}`;
}

export function formatValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** 대상: 공통코드 auditTargets 이름 · 대상 ID */
export function targetText(entry) {
  const label = codeLabel('auditTargets', entry.targetType);
  return entry.targetId ? `${label} · ${entry.targetId}` : label;
}

function detailRow(entry) {
  const tr = el('tr', 'audit-detail-row');
  tr.hidden = true;
  const td = el('td');
  td.colSpan = 6;
  const box = el('div', 'audit-detail');
  if (entry.changes?.length) {
    const table = el('table', 'audit-changes');
    const head = el('thead');
    const headRow = el('tr');
    headRow.append(el('th', '', '항목'), el('th', '', '변경 전'), el('th', '', '변경 후'));
    head.append(headRow);
    const body = el('tbody');
    for (const change of entry.changes) {
      const row = el('tr');
      row.append(el('td', '', change.field), el('td', 'audit-before', formatValue(change.before)), el('td', 'audit-after', formatValue(change.after)));
      body.append(row);
    }
    table.append(head, body);
    box.append(table);
  }
  if (entry.detail) box.append(el('pre', 'audit-json', JSON.stringify(entry.detail, null, 2)));
  box.append(el('p', 'policy-help', `요청 ID: ${entry.requestId || '—'} · 기록 번호: ${entry.id}`));
  td.append(box);
  tr.append(td);
  return tr;
}

/** 기록마다 행 + 펼침 상세 행 (행을 누르거나 Enter·Space로 펼침) */
export function renderAuditRows(tbody, entries, actionLabels) {
  tbody.replaceChildren();
  for (const entry of entries) {
    const tr = el('tr', 'audit-row');
    tr.tabIndex = 0;
    const action = el('td');
    action.append(el('span', `server-badge ${ACTION_TONE[entry.action] || ''}`.trim(), actionLabels[entry.action] || entry.action));
    const summary = el('td', 'audit-summary', entry.summary + (entry.changes?.length ? `  (변경 ${entry.changes.length}건)` : ''));
    tr.append(el('td', 'audit-time', formatTime(entry.at)), el('td', '', entry.username), action, el('td', '', targetText(entry)), summary, el('td', 'audit-ip', entry.ip || '—'));
    const detail = detailRow(entry);
    const toggle = () => { detail.hidden = !detail.hidden; tr.classList.toggle('open', !detail.hidden); };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    tbody.append(tr, detail);
  }
}
