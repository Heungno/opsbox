async function init() {
  const params = new URLSearchParams(location.search);

  const serverId = params.get('serverId');

  const file = params.get('file');

  if (!serverId || !file) {
    return;
  }

  await loadReport(serverId, file);
}

async function loadReport(serverId, fileName) {
  const response = await fetch(`/api/results/${serverId}/file/${encodeURIComponent(fileName)}`);

  const result = await response.json();

  if (!result.success) {
    return;
  }

  renderReport(result);
}

function renderReport(result) {
  const data = result.data;

  document.getElementById('report-title').textContent = `${data.server} / ${data.checkDate}`;

  renderHealth(result.health);

  renderMetrics(data);
}

function renderHealth(health) {
  const container = document.getElementById('health-summary');

  const badge = document.createElement('span');

  badge.className = `summary-badge ${
    health === 'Healthy' ? 'badge-success' : health === 'Warning' ? 'badge-warning' : 'badge-danger'
  }`;

  badge.textContent = health;

  container.replaceChildren(badge);
}

function renderMetrics(data) {
  const container = document.getElementById('report-result');

  container.replaceChildren();

  const grid = document.createElement('div');

  grid.className = 'result-grid';

  const items = [
    ['CPU', `${data.cpu}%`],
    ['MEM', `${data.memory}%`],
    ['DISK', `${data.disk}%`],
    ['NETWORK', data.network],
    ['LOG ERROR', data.logError ? 'YES' : 'NO'],
  ];

  items.forEach(([label, value]) => {
    const item = document.createElement('div');

    item.className = 'result-item';

    const title = document.createElement('span');

    title.textContent = label;

    const strong = document.createElement('strong');

    strong.textContent = value;

    item.appendChild(title);

    item.appendChild(strong);

    grid.appendChild(item);
  });

  const date = document.createElement('div');

  date.className = 'result-date';

  date.textContent = `점검일시 : ${data.checkDate}`;

  container.appendChild(grid);

  container.appendChild(date);
}

init();
