async function init() {
  bindEvents();
  await loadReports();
}

function bindEvents() {
  const form = document.getElementById('filter-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadReports();
  });

  const resetBtn = document.getElementById('btn-reset');
  resetBtn.addEventListener('click', async () => {
    document.getElementById('filter-server').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    await loadReports();
  });
}

async function loadReports() {
  const server = document.getElementById('filter-server').value.trim();
  const startDate = document.getElementById('filter-start-date').value;
  const endDate = document.getElementById('filter-end-date').value;

  const params = new URLSearchParams();
  if (server) params.set('serverId', server);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const url = `/api/reports?${params.toString()}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
      alert('보고서 목록 조회 실패');
      return;
    }

    renderReportList(result.data || []);
  } catch (err) {
    console.error(err);
    alert('보고서 목록 로딩 중 오류가 발생했습니다.');
  }
}

function renderReportList(reports) {
  const tbody = document.getElementById('report-list');
  const countSpan = document.getElementById('report-count');
  countSpan.textContent = reports.length;

  tbody.replaceChildren();

  if (reports.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="9" style="text-align: center; color: var(--text-light); padding: 30px;">검색된 점검 보고서가 없습니다.</td>';
    tbody.appendChild(tr);
    return;
  }

  reports.forEach((item) => {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = item.checkDate;

    const serverTd = document.createElement('td');
    serverTd.innerHTML = `<strong>${item.serverId}</strong> <span style="color: var(--text-light); font-size: 12px;">(${item.serverName})</span>`;

    const typeTd = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = 'server-badge';
    typeBadge.textContent = item.serverType;
    typeTd.appendChild(typeBadge);

    const osTd = document.createElement('td');
    osTd.textContent = item.os;

    const statusTd = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `history-status ${(item.health || '').toLowerCase()}`;
    statusBadge.textContent = item.health;
    statusTd.appendChild(statusBadge);

    const cpuTd = document.createElement('td');
    cpuTd.textContent = `${item.cpu}%`;

    const memTd = document.createElement('td');
    memTd.textContent = `${item.memory}%`;

    const diskTd = document.createElement('td');
    diskTd.textContent = `${item.disk}%`;

    const actionTd = document.createElement('td');
    const reportLink = document.createElement('a');
    reportLink.className = 'btn btn-small btn-primary';
    reportLink.textContent = '보고서 보기';
    reportLink.href = `/reports/detail?serverId=${encodeURIComponent(item.serverId)}&file=${encodeURIComponent(item.fileName)}`;
    actionTd.appendChild(reportLink);

    tr.appendChild(dateTd);
    tr.appendChild(serverTd);
    tr.appendChild(typeTd);
    tr.appendChild(osTd);
    tr.appendChild(statusTd);
    tr.appendChild(cpuTd);
    tr.appendChild(memTd);
    tr.appendChild(diskTd);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', init);
