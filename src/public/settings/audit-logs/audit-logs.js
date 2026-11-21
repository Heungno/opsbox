import { api, apiRequest, notifyError } from '/shared/js/api.js';

await window.opsboxLayoutReady;

const PAGE_SIZE = 50;
const $ = (id) => document.getElementById(id);
const form = $('audit-filter');
const rows = $('audit-rows');
let actionLabels = {};
let page = 1;
let total = 0;

const TARGET_LABELS = { AUTH: '로그인', SERVER: '서버', POLICY: '점검 정책', TEMPLATE: '템플릿', COMMON_CODE: '공통코드', RESULT: '점검 결과', SCRIPT: '스크립트' };
const ACTION_TONE = { LOGIN_FAILURE: 'badge-danger', SERVER_DELETE: 'badge-danger', POLICY_DELETE: 'badge-danger', TEMPLATE_DELETE: 'badge-danger', LOGIN_SUCCESS: 'badge-muted', LOGOUT: 'badge-muted' };

function localDate(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${localDate(date)} ${date.toTimeString().slice(0, 8)}`;
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function buildQuery() {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  // 날짜는 이 화면(브라우저) 기준 하루의 시작~끝을 UTC 시각으로 바꿔 보냅니다.
  if ($('audit-from').value) params.set('from', new Date(`${$('audit-from').value}T00:00:00`).toISOString());
  if ($('audit-to').value) params.set('to', new Date(`${$('audit-to').value}T23:59:59.999`).toISOString());
  if ($('audit-action').value) params.set('action', $('audit-action').value);
  if ($('audit-user').value.trim()) params.set('username', $('audit-user').value.trim());
  if ($('audit-q').value.trim()) params.set('q', $('audit-q').value.trim());
  return params;
}

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function detailRow(entry) {
  const tr = document.createElement('tr');
  tr.className = 'audit-detail-row';
  tr.hidden = true;
  const td = document.createElement('td');
  td.colSpan = 6;
  const box = document.createElement('div');
  box.className = 'audit-detail';

  if (entry.changes?.length) {
    const table = document.createElement('table');
    table.className = 'audit-changes';
    table.innerHTML = '<thead><tr><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead>';
    const body = document.createElement('tbody');
    entry.changes.forEach((change) => {
      const row = document.createElement('tr');
      row.append(cell(change.field), cell(formatValue(change.before), 'audit-before'), cell(formatValue(change.after), 'audit-after'));
      body.append(row);
    });
    table.append(body);
    box.append(table);
  }
  if (entry.detail) {
    const pre = document.createElement('pre');
    pre.className = 'audit-json';
    pre.textContent = JSON.stringify(entry.detail, null, 2);
    box.append(pre);
  }
  const meta = document.createElement('p');
  meta.className = 'policy-help';
  meta.textContent = `요청 ID: ${entry.requestId || '—'} · 기록 번호: ${entry.id}`;
  box.append(meta);

  td.append(box);
  tr.append(td);
  return tr;
}

function render(items) {
  rows.replaceChildren();
  $('audit-empty').hidden = items.length > 0;
  items.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.className = 'audit-row';
    tr.tabIndex = 0;
    const action = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${ACTION_TONE[entry.action] || ''}`;
    badge.textContent = actionLabels[entry.action] || entry.action;
    action.append(badge);
    const target = entry.targetId ? `${TARGET_LABELS[entry.targetType] || entry.targetType} · ${entry.targetId}` : TARGET_LABELS[entry.targetType] || entry.targetType;
    const summary = cell(entry.summary + (entry.changes?.length ? `  (변경 ${entry.changes.length}건)` : ''), 'audit-summary');
    tr.append(cell(formatTime(entry.at), 'audit-time'), cell(entry.username), action, cell(target), summary, cell(entry.ip || '—', 'audit-ip'));
    const detail = detailRow(entry);
    const toggle = () => { detail.hidden = !detail.hidden; tr.classList.toggle('open', !detail.hidden); };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    rows.append(tr, detail);
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('audit-total').textContent = `총 ${total.toLocaleString()}건`;
  $('audit-page').textContent = `${page} / ${pages}`;
  $('audit-prev').disabled = page <= 1;
  $('audit-next').disabled = page >= pages;
}

async function load() {
  try {
    const result = await apiRequest(`/api/audit-logs?${buildQuery()}`);
    total = result.total;
    render(result.data || []);
  } catch (error) {
    notifyError(error, '변경 이력을 불러오지 못했습니다.');
  }
}

async function init() {
  const actions = await api('/api/audit-logs/actions');
  actionLabels = Object.fromEntries(actions.map((item) => [item.value, item.label]));
  actions.forEach((item) => $('audit-action').add(new Option(item.label, item.value)));

  // 기본: 최근 7일
  const today = new Date();
  $('audit-to').value = localDate(today);
  $('audit-from').value = localDate(new Date(today.getTime() - 6 * 86400000));

  form.addEventListener('submit', (event) => { event.preventDefault(); page = 1; load(); });
  $('audit-reset').addEventListener('click', () => { form.reset(); $('audit-to').value = localDate(new Date()); $('audit-from').value = localDate(new Date(Date.now() - 6 * 86400000)); page = 1; load(); });
  $('audit-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('audit-next').addEventListener('click', () => { page++; load(); });
  await load();
}

init().catch((error) => notifyError(error, '변경 이력 화면을 초기화하지 못했습니다.'));
