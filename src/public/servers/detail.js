const params = new URLSearchParams(window.location.search);
const serverId = params.get('id');

let currentServer = null;

async function init() {
  if (!serverId) {
    location.href = '/servers';
    return;
  }

  await loadServer();
}

async function loadServer() {
  const response = await fetch(`/api/servers/${serverId}`);

  if (!response.ok) {
    alert('서버 조회 실패');
    return;
  }

  const server = await response.json();

  currentServer = server;

  renderServerInfo(server);
  bindServerEdit(server);

  await loadScripts(server);
  await loadLatestResult(server.id);
  await loadResultHistory(server.id);
  await loadPolicy(serverId);
}

function renderServerInfo(server) {
  const year = new Date().getFullYear();

  document.getElementById('server-title').textContent = `${server.id} - ${server.name}`;
  document.getElementById('server-id').textContent = server.id;
  document.getElementById('server-name').textContent = server.name;
  document.getElementById('server-product').textContent = server.product || '미지정';
  const httpPolicy = document.getElementById('http-check-policy');
  if (httpPolicy) httpPolicy.hidden = server.os !== 'Windows' || server.type === 'DB';
  document.getElementById('server-ip').textContent = server.ip;
  document.getElementById('server-shared-path').textContent = server.sharedPath;
  document.getElementById('server-script-path').textContent = `${server.sharedPath}\\scripts`;
  document.getElementById('server-result-path').textContent = `${server.sharedPath}\\results\\${year}\\${server.id}`;
  [
    ['btn-add-directory', addDirectoryRow],
    ['btn-add-file-check', addFileCheckRow],
    ['btn-add-port', addPortRow],
    ['btn-add-http-check', addHttpCheckRow],
    ['btn-add-process', addProcessRow],
    ['btn-save-policy', savePolicy],
  ].forEach(([id, handler]) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', handler);
  });

  const typeCell = document.getElementById('server-type');
  typeCell.replaceChildren();

  const typeBadge = document.createElement('span');
  typeBadge.className = 'server-badge';
  typeBadge.textContent = server.type === 'OTHER' ? '기타' : server.type;
  typeCell.appendChild(typeBadge);

  const osCell = document.getElementById('server-os');
  osCell.replaceChildren();

  const osBadge = document.createElement('span');
  osBadge.className = 'server-badge';
  osBadge.textContent = server.os;
  osCell.appendChild(osBadge);
}

function bindServerEdit() {
  const dialog = document.getElementById('server-edit-dialog');
  const form = document.getElementById('server-edit-form');
  const type = document.getElementById('edit-server-type');
  const product = document.getElementById('edit-server-product');
  const fillProducts = (selected = '') => {
    const productsByType = { WEB: ['WebtoB', 'Apache HTTP Server', 'IIS', 'Nginx'], WAS: ['JEUS', 'Apache Tomcat', 'JBoss', 'Node.js'], DB: ['MSSQL', 'MariaDB', 'CUBRID', 'PostgreSQL'] };
    product.replaceChildren(new Option('제품 선택', ''));
    (productsByType[type.value] || []).forEach((name) => product.add(new Option(name, name)));
    product.value = selected;
  };
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  type.addEventListener('change', () => fillProducts());
  document.getElementById('btn-edit-server').addEventListener('click', () => {
    document.getElementById('edit-server-name').value = currentServer.name;
    type.value = currentServer.type;
    fillProducts(currentServer.product || '');
    document.getElementById('edit-server-os').value = currentServer.os;
    document.getElementById('edit-server-ip').value = currentServer.ip;
    document.getElementById('edit-server-shared-path').value = currentServer.sharedPath || '';
    dialog.showModal();
  });
  document.getElementById('btn-close-server-edit').addEventListener('click', () => dialog.close());
  document.getElementById('btn-cancel-server-edit').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {
      name: document.getElementById('edit-server-name').value.trim(),
      type: type.value,
      product: product.value,
      os: document.getElementById('edit-server-os').value,
      ip: document.getElementById('edit-server-ip').value.trim(),
      sharedPath: document.getElementById('edit-server-shared-path').value.trim(),
    };
    try {
      const response = await fetch(`/api/servers/${encodeURIComponent(currentServer.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || '서버 정보 수정에 실패했습니다.');
      dialog.close();
      await loadServer();
    } catch (error) {
      console.error(error);
      alert(error.message || '서버 정보 수정 중 오류가 발생했습니다.');
    }
  });
}

function loadScripts(server) {
  const container = document.getElementById('script-list');
  container.replaceChildren();

  const card = document.createElement('div');
  card.className = 'script-item';

  const title = document.createElement('h3');
  title.textContent = `📄 ${server.id} 맞춤형 점검 스크립트 (${server.os})`;

  const desc = document.createElement('div');
  desc.className = 'script-desc';
  desc.textContent = '서버에 설정된 프로세스 및 디렉토리 점검 정책이 자동으로 반영된 실행 스크립트입니다.';

  const commandTitle = document.createElement('div');
  commandTitle.className = 'command-title';
  commandTitle.textContent = '실행 명령어 (결과 폴더 자동 저장)';

  const year = new Date().getFullYear();
  const scriptFileName = server.os.toLowerCase() === 'windows' ? `${server.id}.ps1` : `${server.id}.sh`;
  
  const command = server.os.toLowerCase() === 'windows'
    ? `$year = (Get-Date).Year; $resPath = "${server.sharedPath}\\results\\$year\\${server.id}"; if (-not (Test-Path $resPath)) { New-Item -ItemType Directory -Path $resPath -Force }; powershell -ExecutionPolicy Bypass -File ".\\${scriptFileName}" | Out-File -Encoding utf8 "$resPath\\$((Get-Date).ToString('yyyy-MM-dd_HH-mm-ss')).json"`
    : `year=$(date +%Y); resPath="${server.sharedPath}/results/$year/${server.id}"; mkdir -p "$resPath"; bash ./${scriptFileName} > "$resPath/$(date +%Y-%m-%d_%H-%M-%S).json"`;

  const commandBox = document.createElement('pre');
  commandBox.className = 'command-box';
  commandBox.textContent = command;

  const buttons = document.createElement('div');
  buttons.className = 'button-area';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'btn btn-primary';
  downloadButton.textContent = '스크립트 다운로드';
  downloadButton.onclick = () => {
    window.open(`/api/scripts/generate/${server.id}`, '_blank');
  };

  const copyButton = document.createElement('button');
  copyButton.className = 'btn';
  copyButton.textContent = '명령어 복사';
  copyButton.onclick = async () => {
    await navigator.clipboard.writeText(command);
    alert('실행 명령어가 복사되었습니다.');
  };

  buttons.appendChild(downloadButton);
  buttons.appendChild(copyButton);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(commandTitle);
  card.appendChild(commandBox);
  card.appendChild(buttons);

  container.appendChild(card);
}

async function loadLatestResult(serverId) {
  const response = await fetch(`/api/results/${serverId}/latest`);

  const result = await response.json();

  if (!result.success) {
    document.getElementById('latest-result').textContent = '점검 결과가 없습니다.';

    return;
  }

  renderLatestResult(result.data, result.health);
}

function renderHealthSummary(health) {
  const container = document.getElementById('health-summary');

  container.replaceChildren();

  const badge = document.createElement('div');

  badge.className = `summary-badge badge-${health.toLowerCase()}`;

  badge.textContent = health;

  container.appendChild(badge);
}

function renderLatestResult(result, health) {
  const container = document.getElementById('latest-result');

  container.replaceChildren();

  const grid = document.createElement('div');

  grid.className = 'result-grid';

  const items = [
    {
      label: 'CPU',
      value: `${result.cpu}%`,
    },
    {
      label: 'MEM',
      value: `${result.memory}%`,
    },
    {
      label: 'DISK',
      value: `${result.disk}%`,
    },
    {
      label: 'NETWORK',
      value: result.network,
    },
  ];

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'result-item';

    const label = document.createElement('span');
    label.textContent = item.label;

    const value = document.createElement('strong');
    value.textContent = item.value;

    card.appendChild(label);
    card.appendChild(value);
    grid.appendChild(card);
  });

  const badge = document.createElement('div');

  badge.className = 'summary-badge';

  badge.textContent = health;

  if (health === 'Healthy') {
    badge.classList.add('badge-success');
  } else if (health === 'Warning') {
    badge.classList.add('badge-warning');
  } else {
    badge.classList.add('badge-danger');
  }

  const date = document.createElement('div');
  date.className = 'result-date';
  date.textContent = `점검일시 : ${result.checkDate}`;

  container.appendChild(badge);
  container.appendChild(grid);
  container.appendChild(date);

  renderHealthSummary(health);
}

async function loadResultHistory(serverId) {
  const response = await fetch(`/api/results/${serverId}`);
  const result = await response.json();
  const container = document.getElementById('result-history');

  container.replaceChildren();

  if (!result.success) {
    container.textContent = '점검 이력이 없습니다.';
    return;
  }

  result.data.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.textContent = `${item.checkDate} | CPU ${item.cpu}% | MEM ${item.memory}% | DISK ${item.disk}%`;
    container.appendChild(row);
  });
}

async function loadResultHistory(serverId) {
  try {
    const response = await fetch(`/api/results/${serverId}`);
    const result = await response.json();

    if (!result.success) {
      document.getElementById('result-history').textContent = '점검 이력이 없습니다.';
      return;
    }

    renderResultHistory(result.data);
  } catch (error) {
    console.error(error);
    document.getElementById('result-history').textContent = '이력 조회 실패';
  }
}

function renderResultHistory(results) {
  const tbody = document.getElementById('result-history');

  tbody.replaceChildren();

  if (!results || results.length === 0) {
    const row = document.createElement('tr');

    const td = document.createElement('td');

    td.colSpan = 6;
    td.textContent = '점검 이력이 없습니다.';

    row.appendChild(td);
    tbody.appendChild(row);

    return;
  }

  results.forEach((item) => {
    const row = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = item.checkDate;

    const cpu = document.createElement('td');
    cpu.textContent = `${item.cpu}%`;

    const memory = document.createElement('td');
    memory.textContent = `${item.memory}%`;

    const disk = document.createElement('td');
    disk.textContent = `${item.disk}%`;

    const statusCell = document.createElement('td');
    const health = getHealthStatus(item);
    const badge = document.createElement('span');

    badge.className = `history-status ${health.toLowerCase()}`;
    badge.textContent = health;
    statusCell.appendChild(badge);

    const report = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'btn btn-small btn-primary';
    link.textContent = 'Report';
    link.href = `/reports/detail?serverId=${encodeURIComponent(currentServer.id)}&file=${encodeURIComponent(item.fileName)}`;
    report.appendChild(link);

    row.appendChild(date);
    row.appendChild(cpu);
    row.appendChild(memory);
    row.appendChild(disk);
    row.appendChild(statusCell);
    row.appendChild(report);

    tbody.appendChild(row);
  });
}

function getHealthStatus(result) {
  if (result.fileChecks?.some((file) => file.status === 'Critical' || file.exists === false)) {
    return 'Critical';
  }
  if (result.disks?.some((disk) => disk.status === 'Critical')) {
    return 'Critical';
  }
  if (result.ports?.some((port) => port.listening === false)) {
    return 'Critical';
  }
  if (result.httpChecks?.some((check) => check.success === false)) return 'Critical';
  if (result.wasChecks?.some((check) => check.status === 'Critical')) return 'Critical';
  if (result.ports?.some((port) => port.listening === false)) {
    return 'Critical';
  }
  const max = Math.max(result.cpu || 0, result.memory || 0, result.disk || 0);

  if (max >= 90) {
    return 'Critical';
  }

  if (max >= 70) {
    return 'Warning';
  }

  if (result.fileChecks?.some((file) => file.status === 'Warning')) {
    return 'Warning';
  }
  if (result.disks?.some((disk) => disk.status === 'Warning')) {
    return 'Warning';
  }
  if (result.wasChecks?.some((check) => check.status === 'Warning')) return 'Warning';

  return 'Healthy';
}

async function loadPolicy(serverId) {
  const response = await fetch(`/api/servers/${serverId}/check-config`);
  if (!response.ok) return;

  const config = await response.json();
  document.getElementById('process-container')?.replaceChildren();
  document.getElementById('directory-container')?.replaceChildren();
  document.getElementById('file-check-container')?.replaceChildren();
  document.getElementById('port-container')?.replaceChildren();
  document.getElementById('http-check-container')?.replaceChildren();
  (config.processes ?? []).forEach((process) => addProcessRow(process));
  (config.directories ?? []).forEach((directory) => addDirectoryRow(directory));
  (config.fileChecks ?? []).forEach((fileCheck) => addFileCheckRow(fileCheck));
  (config.ports ?? []).forEach((port) => addPortRow(port));
  (config.httpChecks ?? []).forEach((check) => addHttpCheckRow(check));
}

function addDirectoryRow(data = {}) {
  const container = document.getElementById('directory-container');
  const row = document.createElement('div');

  row.className = 'directory-row';

  const path = document.createElement('input');
  path.className = 'directory-path';
  path.placeholder = '/logs';
  path.value = data.path ?? '';

  const warning = document.createElement('input');
  warning.type = 'number';
  warning.min = '0';
  warning.max = '100';
  warning.className = 'directory-warning';
  warning.placeholder = '70';
  warning.value = data.warningPercent ?? '';

  const critical = document.createElement('input');
  critical.type = 'number';
  critical.min = '0';
  critical.max = '100';
  critical.className = 'directory-critical';
  critical.placeholder = '90';
  critical.value = data.criticalPercent ?? '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-danger';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => row.remove());
  row.appendChild(path);
  row.appendChild(warning);
  row.appendChild(critical);
  row.appendChild(removeButton);

  container.appendChild(row);
}

function getDirectories() {
  return [...document.querySelectorAll('.directory-row')].map((row) => ({
    path: row.querySelector('.directory-path').value.trim(),
    warningPercent: Number(row.querySelector('.directory-warning').value),
    criticalPercent: Number(row.querySelector('.directory-critical').value),
  }));
}

function addFileCheckRow(data = {}) {
  const container = document.getElementById('file-check-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'file-check-row';

  const path = document.createElement('input');
  path.className = 'file-check-path';
  path.placeholder = 'C:\\app\\logs\\app.log 또는 /var/log/app.log';
  path.value = data.path ?? '';

  const warning = document.createElement('input');
  warning.type = 'number';
  warning.min = '0';
  warning.step = '0.01';
  warning.className = 'file-check-warning';
  warning.placeholder = '100';
  warning.value = data.warningSizeMB ?? '';

  const critical = document.createElement('input');
  critical.type = 'number';
  critical.min = '0.01';
  critical.step = '0.01';
  critical.className = 'file-check-critical';
  critical.placeholder = '500';
  critical.value = data.criticalSizeMB ?? '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-danger';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => row.remove());

  row.append(path, warning, critical, removeButton);
  container.appendChild(row);
}

function getFileChecks() {
  return [...document.querySelectorAll('.file-check-row')].map((row) => ({
    path: row.querySelector('.file-check-path').value.trim(),
    warningSizeMB: Number(row.querySelector('.file-check-warning').value),
    criticalSizeMB: Number(row.querySelector('.file-check-critical').value),
  }));
}

function addPortRow(data = {}) {
  const container = document.getElementById('port-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'port-row';

  const protocol = document.createElement('select');
  protocol.className = 'port-protocol';
  protocol.innerHTML = '<option value="TCP">TCP</option><option value="UDP">UDP</option>';
  protocol.value = data.protocol ?? 'TCP';

  const port = document.createElement('input');
  port.type = 'number';
  port.min = '1';
  port.max = '65535';
  port.step = '1';
  port.className = 'port-number';
  port.placeholder = '443';
  port.value = data.port ?? '';

  const description = document.createElement('input');
  description.type = 'text';
  description.className = 'port-description';
  description.placeholder = '예: HTTPS';
  description.value = data.description ?? '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-danger';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => row.remove());

  row.append(protocol, port, description, removeButton);
  container.appendChild(row);
}

function getPorts() {
  return [...document.querySelectorAll('.port-row')].map((row) => ({
    protocol: row.querySelector('.port-protocol').value,
    port: Number(row.querySelector('.port-number').value),
    description: row.querySelector('.port-description').value.trim(),
  }));
}

function addHttpCheckRow(data = {}) {
  const container = document.getElementById('http-check-container');
  if (!container) return;
  const row = document.createElement('div'); row.className = 'http-check-row';
  const name = document.createElement('input'); name.className = 'http-check-name'; name.placeholder = '예: 메인 페이지'; name.value = data.name ?? '';
  const url = document.createElement('input'); url.type = 'url'; url.className = 'http-check-url'; url.placeholder = 'https://example.internal/health'; url.value = data.url ?? '';
  const status = document.createElement('input'); status.type = 'number'; status.min = '100'; status.max = '599'; status.className = 'http-check-status'; status.value = data.expectedStatus ?? 200;
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-danger'; remove.textContent = '삭제'; remove.addEventListener('click', () => row.remove());
  row.append(name, url, status, remove); container.appendChild(row);
}

function getHttpChecks() {
  return [...document.querySelectorAll('.http-check-row')].map((row) => ({
    name: row.querySelector('.http-check-name').value.trim(),
    url: row.querySelector('.http-check-url').value.trim(),
    expectedStatus: Number(row.querySelector('.http-check-status').value || 200),
  }));
}

function addProcessRow(data = {}) {
  const container = document.getElementById('process-container');
  if (!container) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'process-row';

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'process-name';
  name.placeholder = 'nginx';
  name.value = data.name ?? '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-danger';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => row.remove());
  row.appendChild(name);
  row.appendChild(removeButton);

  container.appendChild(row);
}

function getProcesses() {
  return [...document.querySelectorAll('.process-row')]
    .map((row) => ({
      name: row.querySelector('.process-name')?.value.trim(),
    }))
    .filter((process) => process.name);
}

async function savePolicy() {
  try {
    const processes = getProcesses();
    const directories = getDirectories();
    const fileChecks = getFileChecks();
    const ports = getPorts();
    const httpChecks = getHttpChecks();
    const response = await fetch(`/api/servers/${serverId}/check-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        processes,
        directories,
        fileChecks,
        ports,
        httpChecks,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(result);
      alert(result.message ?? '정책 저장에 실패했습니다.');
      return;
    }

    alert('정책이 저장되었습니다.');
  } catch (error) {
    console.error(error);
    alert('정책 저장 중 오류가 발생했습니다.');
  }
}

init();
