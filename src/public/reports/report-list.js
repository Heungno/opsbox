await window.opsboxLayoutReady;

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
  const tree = document.getElementById('report-tree');
  const countSpan = document.getElementById('report-count');
  countSpan.textContent = reports.length;
  tree.replaceChildren();
  const typeOrder = ['WEB', 'WAS', 'DB', 'OTHER'];
  const typeLabels = { WEB: 'WEB', WAS: 'WAS', DB: 'DB', OTHER: '기타' };
  const grouped = Object.fromEntries(typeOrder.map((type) => [type, new Map()]));

  reports.forEach((item) => {
    const roles = item.serverTypes?.length ? item.serverTypes : [item.serverType];
    [...new Set(roles)].forEach((role) => {
      const type = typeOrder.includes(role) ? role : 'OTHER';
      const servers = grouped[type];
      if (!servers.has(item.serverId)) servers.set(item.serverId, []);
      servers.get(item.serverId).push(item);
    });
  });

  typeOrder.forEach((type) => {
    const servers = grouped[type];
    const typeCount = [...servers.values()].reduce((sum, items) => sum + items.length, 0);
    const typeNode = document.createElement('details');
    typeNode.className = 'report-tree-type';
    typeNode.open = true;
    const typeSummary = document.createElement('summary');
    typeSummary.className = 'report-tree-type-summary';
    typeSummary.append(createTreeTitle(typeLabels[type], `${servers.size}개 서버 · ${typeCount}건`));
    typeNode.appendChild(typeSummary);

    if (servers.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'report-tree-empty';
      empty.textContent = '검색 결과가 없습니다.';
      typeNode.appendChild(empty);
    }

    [...servers.entries()]
      .sort((a, b) => (a[1][0].serverName || a[0]).localeCompare(b[1][0].serverName || b[0], 'ko'))
      .forEach(([serverId, items]) => {
        items.sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''));
        const serverNode = document.createElement('details');
        serverNode.className = 'report-tree-server';
        serverNode.open = true;
        const serverSummary = document.createElement('summary');
        serverSummary.className = 'report-tree-server-summary';
        serverSummary.append(createTreeTitle(`${items[0].serverName || serverId} (${serverId})`, `${items.length}건 · 최근 ${items[0].checkDate || '-'}`));
        serverNode.appendChild(serverSummary);
        serverNode.appendChild(createServerReportsTable(items));
        typeNode.appendChild(serverNode);
      });
    tree.appendChild(typeNode);
  });
}

function createTreeTitle(title, meta) {
  const wrapper = document.createElement('span');
  wrapper.className = 'report-tree-title';
  const main = document.createElement('strong');
  main.textContent = title;
  const detail = document.createElement('small');
  detail.textContent = meta;
  wrapper.append(main, detail);
  return wrapper;
}

function createServerReportsTable(items) {
  const table = document.createElement('table');
  table.className = 'server-table report-tree-table';
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  ['점검일시', '상태', 'CPU', 'MEM', 'DISK', '보고서'].forEach((label) => {
    const th = document.createElement('th'); th.textContent = label; header.appendChild(th);
  });
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  items.forEach((item) => {
    const row = document.createElement('tr');
    const date = document.createElement('td'); date.textContent = item.checkDate || '-';
    const state = document.createElement('td');
    const badge = document.createElement('span'); badge.className = `history-status ${(item.health || '').toLowerCase()}`; badge.textContent = item.health || '미판정'; state.appendChild(badge);
    const cpu = document.createElement('td'); cpu.textContent = `${item.cpu ?? '-'}%`;
    const memory = document.createElement('td'); memory.textContent = `${item.memory ?? '-'}%`;
    const disk = document.createElement('td'); disk.textContent = `${item.disk ?? '-'}%`;
    const action = document.createElement('td');
    const link = document.createElement('a'); link.className = 'btn btn-small btn-primary'; link.textContent = '보고서 보기';
    link.href = `/reports/detail?serverId=${encodeURIComponent(item.serverId)}&file=${encodeURIComponent(item.fileName || '')}`;
    action.appendChild(link);
    row.append(date, state, cpu, memory, disk, action);
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  return table;
}

document.addEventListener('DOMContentLoaded', init);
