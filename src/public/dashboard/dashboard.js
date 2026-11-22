import { api } from '/shared/js/api.js';
import { loadCodes } from '/shared/js/codes.js';
import { applyStatusLabels } from '/shared/js/status.js';
import { applyRoleLabels, fleetCounts, fleetLabel, renderRecentChecks } from './dashboard-view.js';

await loadCodes(); // 공통코드(역할·상태 이름)를 그리기 전에 불러옴
applyStatusLabels();
applyRoleLabels(document.querySelectorAll('[data-role]')); // 유형별 서버 수의 역할 이름(공통코드)

async function init() {
  await loadSummary();
  renderRecentChecks(document.getElementById('recent-checks'), await api('/api/dashboard/recent'));
}

async function loadSummary() {
  const data = await api('/api/dashboard/summary');
  for (const key of ['total', 'healthy', 'warning', 'critical', 'web', 'was', 'db', 'other']) {
    document.getElementById(`${key}-count`).textContent = data[key];
  }
  renderFleetBar(data);
}

// 상태 분포 막대: 각 구간 너비를 서버 수 비율로 설정 (점검 기록이 없는 서버는 회색 구간)
function renderFleetBar(data) {
  const counts = fleetCounts(data);
  document.querySelectorAll('#fleet-bar [data-seg]').forEach((segment) => {
    const count = counts[segment.dataset.seg] || 0;
    segment.style.flexGrow = String(count);
    segment.hidden = count === 0;
  });
  document.getElementById('unknown-count').textContent = counts.unknown;
  document.getElementById('fleet-unknown').hidden = counts.unknown === 0;
  document.getElementById('fleet-bar').setAttribute('aria-label', fleetLabel(Number(data.total) || 0, counts));
}

init();
