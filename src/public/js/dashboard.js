async function init() {
  await loadSummary();

  await loadRecentChecks();
}

async function loadSummary() {
  const response = await fetch('/api/dashboard/summary');

  const result = await response.json();

  const data = result.data;

  document.getElementById('total-count').textContent = data.total;

  document.getElementById('healthy-count').textContent = data.healthy;

  document.getElementById('warning-count').textContent = data.warning;

  document.getElementById('critical-count').textContent = data.critical;

  document.getElementById('web-count').textContent = data.web;

  document.getElementById('was-count').textContent = data.was;

  document.getElementById('db-count').textContent = data.db;
}

async function loadRecentChecks() {
  const response = await fetch('/api/dashboard/recent');

  const result = await response.json();

  renderRecentChecks(result.data);
}

function renderRecentChecks(checks) {
  const tbody = document.getElementById('recent-checks');

  tbody.replaceChildren();

  checks.forEach((item) => {
    const row = document.createElement('tr');

    const serverName = document.createElement('td');

    const link = document.createElement('a');

    link.href = `/server-detail.html?id=${encodeURIComponent(item.serverId)}`;

    link.textContent = item.serverName;

    link.className = 'server-link';

    serverName.appendChild(link);

    const serverType = document.createElement('td');

    serverType.textContent = item.serverType;

    const checkDate = document.createElement('td');

    checkDate.textContent = item.checkDate;

    const healthCell = document.createElement('td');

    const badge = document.createElement('span');

    badge.className = `history-status ${item.health.toLowerCase()}`;

    badge.textContent = item.health;

    healthCell.appendChild(badge);

    const cpu = document.createElement('td');

    cpu.textContent = `${item.cpu}%`;

    const memory = document.createElement('td');

    memory.textContent = `${item.memory}%`;

    const disk = document.createElement('td');

    disk.textContent = `${item.disk}%`;

    row.appendChild(serverName);
    row.appendChild(serverType);
    row.appendChild(checkDate);
    row.appendChild(healthCell);
    row.appendChild(cpu);
    row.appendChild(memory);
    row.appendChild(disk);

    tbody.appendChild(row);
  });
}

init();
