import { api } from '/shared/js/api.js';
import { applyStatusLabels, loadStatusLabels, statusLabel } from '/shared/js/status.js';

await loadStatusLabels(); // 상태 이름(공통코드 healthStatuses)을 그리기 전에 불러옴
applyStatusLabels();

async function init() {
  await loadSummary();

  await loadRecentChecks();
}

async function loadSummary() {
  const data = await api('/api/dashboard/summary');

  document.getElementById('total-count').textContent = data.total;
  document.getElementById('healthy-count').textContent = data.healthy;
  document.getElementById('warning-count').textContent = data.warning;
  document.getElementById('critical-count').textContent = data.critical;
  document.getElementById('web-count').textContent = data.web;
  document.getElementById('was-count').textContent = data.was;
  document.getElementById('db-count').textContent = data.db;
  document.getElementById('other-count').textContent = data.other;
  renderFleetBar(data);
}

// 상태 분포 막대: 각 구간 너비를 서버 수 비율로 설정 (점검 기록이 없는 서버는 회색 구간)
function renderFleetBar(data) {
  const total = Number(data.total) || 0;
  const counts = {
    healthy: Number(data.healthy) || 0,
    warning: Number(data.warning) || 0,
    critical: Number(data.critical) || 0,
  };
  counts.unknown = Math.max(0, total - counts.healthy - counts.warning - counts.critical);

  document.querySelectorAll('#fleet-bar [data-seg]').forEach((segment) => {
    const count = counts[segment.dataset.seg] || 0;
    segment.style.flexGrow = String(count);
    segment.hidden = count === 0;
  });
  document.getElementById('unknown-count').textContent = counts.unknown;
  document.getElementById('fleet-unknown').hidden = counts.unknown === 0;
  document.getElementById('fleet-bar').setAttribute(
    'aria-label',
    `전체 ${total}대 중 ${statusLabel('Healthy')} ${counts.healthy}, ${statusLabel('Warning')} ${counts.warning}, ${statusLabel('Critical')} ${counts.critical}, 점검 기록 없음 ${counts.unknown}`,
  );
}

async function loadRecentChecks() {
  renderRecentChecks(await api('/api/dashboard/recent'));
}

function renderRecentChecks(checks) {
  const tbody = document.getElementById('recent-checks');

  tbody.replaceChildren();

  checks.forEach((item) => {
    const row = document.createElement('tr');
    const serverName = document.createElement('td');
    const linkServer = document.createElement('a');

    linkServer.href = `/settings/server-management/detail?id=${encodeURIComponent(item.serverId)}`;
    linkServer.textContent = item.serverName;
    linkServer.className = 'server-link';
    serverName.appendChild(linkServer);

    const serverType = document.createElement('td');
    serverType.textContent = item.serverType === 'OTHER' ? '기타' : item.serverType;

    const checkDate = document.createElement('td');
    checkDate.textContent = item.checkDate;

    const healthCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `history-status ${item.health.toLowerCase()}`;
    badge.textContent = statusLabel(item.health);
    healthCell.appendChild(badge);

    const cpu = document.createElement('td');
    cpu.className = 'num';
    cpu.textContent = `${item.cpu}%`;

    const memory = document.createElement('td');
    memory.className = 'num';
    memory.textContent = `${item.memory}%`;

    const disk = document.createElement('td');
    disk.className = 'num';
    disk.textContent = `${item.disk}%`;

    const Report = document.createElement('td');
    const linkReport = document.createElement('a');
    linkReport.className = 'btn btn-small btn-secondary';
    linkReport.textContent = '보고서 보기';
    linkReport.href = `/reports/detail?serverId=${item.serverId}&file=${encodeURIComponent(item.fileName)}`;
    Report.appendChild(linkReport);

    row.appendChild(serverName);
    row.appendChild(serverType);
    row.appendChild(checkDate);
    row.appendChild(healthCell);
    row.appendChild(cpu);
    row.appendChild(memory);
    row.appendChild(disk);
    row.appendChild(Report);

    tbody.appendChild(row);
  });
}

init();
