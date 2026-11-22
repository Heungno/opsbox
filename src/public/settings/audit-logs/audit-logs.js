import { api, apiRequest, notifyError } from '/shared/js/api.js';
import { loadCodes } from '/shared/js/codes.js';
import { localDate, renderAuditRows } from './audit-logs-view.js';

const PAGE_SIZE = 50;
const $ = (id) => document.getElementById(id);
const form = $('audit-filter');
const rows = $('audit-rows');
/** 화면 상태 */
const state = { actionLabels: {}, page: 1, total: 0 };

function buildQuery() {
  const params = new URLSearchParams({ page: String(state.page), pageSize: String(PAGE_SIZE) });
  // 날짜는 이 화면(브라우저) 기준 하루의 시작~끝을 UTC 시각으로 바꿔 보냅니다.
  if ($('audit-from').value) params.set('from', new Date(`${$('audit-from').value}T00:00:00`).toISOString());
  if ($('audit-to').value) params.set('to', new Date(`${$('audit-to').value}T23:59:59.999`).toISOString());
  if ($('audit-action').value) params.set('action', $('audit-action').value);
  if ($('audit-user').value.trim()) params.set('username', $('audit-user').value.trim());
  if ($('audit-q').value.trim()) params.set('q', $('audit-q').value.trim());
  return params;
}

function render(items) {
  renderAuditRows(rows, items, state.actionLabels);
  $('audit-empty').hidden = items.length > 0;
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  $('audit-total').textContent = `총 ${state.total.toLocaleString()}건`;
  $('audit-page').textContent = `${state.page} / ${pages}`;
  $('audit-prev').disabled = state.page <= 1;
  $('audit-next').disabled = state.page >= pages;
}

async function load() {
  try {
    const result = await apiRequest(`/api/audit-logs?${buildQuery()}`);
    state.total = result.total;
    render(result.data || []);
  } catch (error) {
    notifyError(error, '변경 이력을 불러오지 못했습니다.');
  }
}

async function init() {
  await loadCodes(); // 대상 이름(공통코드 auditTargets)
  const actions = await api('/api/audit-logs/actions');
  state.actionLabels = Object.fromEntries(actions.map((item) => [item.value, item.label]));
  actions.forEach((item) => $('audit-action').add(new Option(item.label, item.value)));

  // 기본: 최근 7일
  const today = new Date();
  $('audit-to').value = localDate(today);
  $('audit-from').value = localDate(new Date(today.getTime() - 6 * 86400000));

  form.addEventListener('submit', (event) => { event.preventDefault(); state.page = 1; load(); });
  $('audit-reset').addEventListener('click', () => { form.reset(); $('audit-to').value = localDate(new Date()); $('audit-from').value = localDate(new Date(Date.now() - 6 * 86400000)); state.page = 1; load(); });
  $('audit-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  $('audit-next').addEventListener('click', () => { state.page++; load(); });
  await load();
}

init().catch((error) => notifyError(error, '변경 이력 화면을 초기화하지 못했습니다.'));
