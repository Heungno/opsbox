/*
 * 보고서 항목 상자: 항목 하나 = 상자 하나
 *
 *   ┌ 항목 이름                        ● 상태 ┐   ← 요약(SUMMARY)은 제목 옆 배지
 *   │ 요약 메시지(있으면)                      │
 *   │ [추가 내용] 표 / 콘솔 / 측정값 / 로그 표   │   ← 블록이 둘 이상이면 작은 소제목
 *   └─────────────────────────────────────────┘
 *
 * extras[항목ID] = { nodes: Element[], mode: 'replace' | 'prepend', label? }
 *   replace: 일반 결과 대신 넣음(예: 비교가 들어간 기존 상세 표), prepend: 일반 결과 앞에 넣음.
 * DOM은 createElement + textContent만 사용합니다.
 */

const VIEW_LABELS = { TABLE: '표', LOG_TABLE: '로그', CONSOLE: '콘솔 결과', METRIC: '측정값', JSON: 'JSON 상세' };
const BADGE_CLASS = { Healthy: 'badge-success', Warning: 'badge-warning', Critical: 'badge-danger', NotCollected: 'badge-muted' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const cellText = (value) => (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

function buildTable(columns, rows, valueOf) {
  const scroll = el('div', 'table-scroll');
  const table = el('table', 'server-table');
  const head = el('thead');
  const headRow = el('tr');
  columns.forEach((column) => headRow.append(el('th', null, column.label || column.key || String(column))));
  head.append(headRow);
  const body = el('tbody');
  rows.forEach((values) => {
    const row = el('tr');
    columns.forEach((column, index) => row.append(el('td', null, cellText(valueOf(values, column, index)))));
    body.append(row);
  });
  table.append(head, body);
  scroll.append(table);
  return scroll;
}

const emptyNote = (text) => el('p', 'policy-help', text);

function renderTableView(item, components, detail) {
  const configuredColumns = components.find((component) => component.type === 'TABLE')?.columns || [];
  const queries = Array.isArray(detail.queries) ? detail.queries : null;
  if (queries) {
    const wrap = el('div', 'report-item-queries');
    queries.forEach((query) => {
      wrap.append(el('h4', null, [query.name, query.target].filter(Boolean).join(' · ') || item.name || item.item));
      if (query.message) wrap.append(emptyNote(query.message));
      const columns = configuredColumns.length ? configuredColumns : (query.columns || []).map((key) => ({ key, label: key }));
      const rows = query.rows || [];
      wrap.append(columns.length && rows.length
        ? buildTable(columns, rows, (values, column, index) => (Array.isArray(values) ? values[index] : values?.[column.key]))
        : emptyNote('표시할 행 데이터가 없습니다.'));
    });
    return wrap;
  }
  const rows = Array.isArray(detail.rows) ? detail.rows : [];
  const columns = Array.isArray(detail.columns) && detail.columns.length ? detail.columns
    : configuredColumns.length ? configuredColumns
      : (rows[0] && !Array.isArray(rows[0]) ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : []);
  if (!columns.length || !rows.length) return emptyNote('표시할 행 데이터가 없습니다.');
  return buildTable(columns, rows, (values, column, index) => (Array.isArray(values) ? values[index] : values?.[column.key || column]));
}

function renderLogView(components, detail) {
  const configured = components.find((component) => component.type === 'LOG_TABLE')?.columns || [];
  const columns = configured.length ? configured : [{ key: 'timestamp', label: '시각' }, { key: 'path', label: '파일 경로' }, { key: 'message', label: '로그 내용' }];
  const rows = (Array.isArray(detail.samples) ? detail.samples : []).map((sample) => ({ ...sample, message: sample.text || sample.message }));
  if (!rows.length) return emptyNote(detail.message || '표시할 로그 데이터가 없습니다.');
  return buildTable(columns, rows, (values, column) => values[column.key]);
}

function renderMetricView(detail) {
  const values = detail.metrics || Object.fromEntries(Object.entries(detail).filter(([key, value]) => key !== 'status' && key !== 'message' && ['number', 'string'].includes(typeof value)));
  const table = el('table', 'server-table');
  const body = el('tbody');
  Object.entries(values).forEach(([key, value]) => {
    const row = el('tr');
    row.append(el('th', null, key), el('td', null, String(value)));
    body.append(row);
  });
  table.append(body);
  return table;
}

function renderView(view, item, components, detail) {
  if (view === 'TABLE') return renderTableView(item, components, detail);
  if (view === 'LOG_TABLE') return renderLogView(components, detail);
  if (view === 'CONSOLE') return el('pre', 'webtob-console-output', String(detail.output || detail.console?.stdout || detail.command || detail.message || '콘솔 출력이 없습니다.'));
  if (view === 'METRIC') return renderMetricView(detail);
  return el('pre', 'webtob-console-output', JSON.stringify(detail, null, 2));
}

function buildBox(item, extra) {
  const components = item.result?.components || [];
  const detail = item.detail && typeof item.detail === 'object' && !Array.isArray(item.detail) ? item.detail : { rows: Array.isArray(item.detail) ? item.detail : [] };
  const status = item.status || detail.status || 'NotCollected';

  const box = el('section', 'report-item-box');
  box.setAttribute('data-item', item.item);
  const head = el('div', 'report-item-head');
  head.append(el('h3', null, item.name || item.item), el('span', `server-badge ${BADGE_CLASS[status] || 'badge-muted'}`, status));
  box.append(head);
  const message = item.message || detail.message;
  if (message) box.append(el('p', 'report-item-message', String(message)));

  const blocks = [];
  if (extra?.nodes?.length) blocks.push({ label: extra.label || '상세', nodes: extra.nodes });
  if (extra?.mode !== 'replace') {
    components.map((component) => component.type).filter((view) => view !== 'SUMMARY')
      .forEach((view) => blocks.push({ label: VIEW_LABELS[view] || view, nodes: [renderView(view, item, components, detail)] }));
  }
  if (blocks.length) {
    const body = el('div', 'report-item-body');
    blocks.forEach((block) => {
      if (blocks.length > 1) body.append(el('h4', null, block.label));
      body.append(...block.nodes);
    });
    box.append(body);
  }
  return box;
}

export function renderItemBoxes(container, items, { extras = {} } = {}) {
  container.replaceChildren(...(items || []).map((item) => buildBox(item, extras[item.item])));
}
