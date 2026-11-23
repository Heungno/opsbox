import { api, notifyError } from '/shared/js/api.js';
import { loadCodes } from '/shared/js/codes.js';
import { createServerPicker } from '/shared/js/server-picker.js';
import { loadStatusLabels } from '/shared/js/status.js';
import { filterReports, renderReportSummary, renderReportTable, summarizeReports } from './report-list-view.js';

await Promise.all([loadCodes(), loadStatusLabels()]); // 역할·상태 이름을 그리기 전에 불러옴

const ALL_LABEL = '전체 서버';
const state = {
  reports: [],
  serverId: null, // null = 전체 서버(왼쪽 목록에 보이는 서버들)
  health: null, // 요약 카드로 고른 상태
};

const picker = createServerPicker({
  search: document.getElementById('server-search'),
  tabs: document.getElementById('server-picker-role-tabs'),
  list: document.getElementById('server-picker-list'),
  empty: document.getElementById('server-picker-empty'),
  refresh: document.getElementById('server-list-refresh'),
  allLabel: ALL_LABEL,
  fetchServers: () => api('/api/servers?includeInactive=1'),
  onSelect: selectServer,
  onFilterChange: render,
});

function selectServer(id) {
  state.serverId = id;
  history.replaceState(null, '', id ? `/reports?serverId=${encodeURIComponent(id)}` : '/reports');
  picker.setSelected(id);
  render();
}

async function loadReports() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('filter-start-date').value;
  const endDate = document.getElementById('filter-end-date').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  try {
    state.reports = (await api(`/api/reports?${params}`)) || [];
  } catch (error) {
    state.reports = [];
    notifyError(error, '보고서 목록을 불러오지 못했습니다.');
  }
  render();
}

function render() {
  const selected = picker.servers().find((server) => server.id === state.serverId);
  const serverIds = new Set(selected ? [selected.id] : picker.visibleServers().map((server) => server.id));
  const inScope = filterReports(state.reports, { serverIds, health: null });
  // 요약 카드와 상태 거르기는 서버 하나를 골랐을 때만 (전체 서버 요약은 쓰지 않음)
  const shown = selected ? filterReports(inScope, { health: state.health }) : inScope;
  document.getElementById('report-heading').textContent = `보고서 (${selected ? selected.name : ALL_LABEL} · ${shown.length}건)`;
  const summary = document.getElementById('report-summary');
  summary.hidden = !selected;
  if (selected) {
    renderReportSummary(summary, summarizeReports(inScope), {
      activeHealth: state.health,
      onHealth: (health) => { state.health = health; render(); },
    });
  }
  renderReportTable(document.getElementById('report-list'), shown);
}

document.getElementById('filter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadReports();
});
document.getElementById('btn-reset').addEventListener('click', () => {
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
  loadReports();
});

async function init() {
  let servers = [];
  try {
    servers = await picker.load();
  } catch (error) {
    notifyError(error, '서버 목록을 불러오지 못했습니다.');
  }
  const requested = new URLSearchParams(window.location.search).get('serverId');
  selectServer(servers.some((server) => server.id === requested) ? requested : null);
  await loadReports();
}

init();
