import { highlightJsonBlock } from '../../shared/js/syntax-highlight.js';

await window.opsboxLayoutReady;

const params = new URLSearchParams(window.location.search);
const serverId = params.get('id');

let currentServer = null;
let managedTemplates = [];
let selectedScriptParts = {};
let selectedRoleChecks = {};
let selectedRolePolicySettings = {};
let selectedQueryTemplateId = '';
let selectedCustomQueryTemplateIds = [];
let commonCodes;

async function init() {
  if (!serverId) {
    location.href = '/settings/server-management';
    return;
  }

  const modalResponse = await fetch('/shared/fragments/server-modal.html');
  if (!modalResponse.ok) throw new Error('서버 정보 모달을 불러오지 못했습니다.');
  document.getElementById('server-modal-container').innerHTML = await modalResponse.text();
  const pickerResponse = await fetch('/shared/fragments/script-template-picker-modal.html');
  if (!pickerResponse.ok) throw new Error('스크립트 선택 모달을 불러오지 못했습니다.');
  document.getElementById('script-template-picker-container').innerHTML = await pickerResponse.text();
  const codeResponse = await fetch('/api/common-codes');
  if (!codeResponse.ok) throw new Error('공통코드를 불러오지 못했습니다.');
  commonCodes = await codeResponse.json();
  populateOptions(document.getElementById('server-form-os'), commonCodes.operatingSystems);
  bindScriptTemplatePicker();
  await loadManagedTemplates();

  await loadServer();
}

async function loadManagedTemplates() {
  const response = await fetch('/api/templates');
  managedTemplates = response.ok ? await response.json() : [];
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
  const roles = server.roles?.length ? server.roles : [server.type];
  document.getElementById('server-product').textContent = roles.map((role) => `${role}: ${server.products?.[role] || (server.type === role ? server.product : '') || '미지정'}`).join(' · ');
  const httpPolicy = document.getElementById('http-check-policy');
  if (httpPolicy) httpPolicy.hidden = server.os !== 'Windows' || !roles.some((role) => role === 'WEB' || role === 'WAS');
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
  typeBadge.textContent = roles.map((role) => role === 'OTHER' ? '기타' : role).join(' + ');
  typeCell.appendChild(typeBadge);

  const osCell = document.getElementById('server-os');
  osCell.replaceChildren();

  const osBadge = document.createElement('span');
  osBadge.className = 'server-badge';
  osBadge.textContent = server.os;
  osCell.appendChild(osBadge);
}

function bindServerEdit() {
  const dialog = document.getElementById('server-modal');
  const form = document.getElementById('server-modal-form');
  const roleContainer = document.getElementById('server-form-role-products');
  const renderRoleProducts = (selectedRoles = [], selectedProducts = {}) => {
    roleContainer.replaceChildren();
    commonCodes.serverRoles.forEach(({ value: role, label: roleLabel }) => {
      const row = document.createElement('div'); row.className = 'role-product-row';
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = role; checkbox.checked = selectedRoles.includes(role);
      checkbox.className = 'role-choice-checkbox'; checkbox.style.cssText = 'appearance:checkbox;width:16px;height:16px;min-width:16px;max-width:16px;min-height:16px;max-height:16px;flex:0 0 16px;padding:0;margin:0;box-shadow:none;'; label.className = 'role-choice-label';
      label.append(checkbox, document.createTextNode(` ${roleLabel}`)); row.append(label);
      if (role !== 'OTHER') { const select = document.createElement('select'); select.dataset.roleProduct = role; select.add(new Option('제품 선택', '')); (commonCodes.productsByRole[role] || []).forEach((name) => select.add(new Option(name, name))); select.value = selectedProducts[role] || ''; row.append(select); }
      checkbox.addEventListener('change', () => { row.classList.toggle('active', checkbox.checked); if (!checkbox.checked && row.querySelector('select')) row.querySelector('select').value = ''; }); checkbox.dispatchEvent(new Event('change')); roleContainer.appendChild(row);
    });
  };
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  document.getElementById('btn-edit-server').addEventListener('click', () => {
    document.getElementById('server-modal-title').textContent = '서버 정보 수정';
    document.getElementById('server-modal-save').textContent = '변경 저장';
    document.getElementById('server-id-group').hidden = true;
    document.getElementById('server-form-id').required = false;
    document.getElementById('server-form-name').value = currentServer.name;
    renderRoleProducts(currentServer.roles?.length ? currentServer.roles : [currentServer.type], currentServer.products || { [currentServer.type]: currentServer.product });
    document.getElementById('server-form-os').value = currentServer.os;
    document.getElementById('server-form-ip').value = currentServer.ip;
    document.getElementById('server-form-shared-path').value = currentServer.sharedPath || '';
    dialog.showModal();
  });
  document.getElementById('server-modal-close').addEventListener('click', () => dialog.close());
  document.getElementById('server-modal-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const roles = [...roleContainer.querySelectorAll('input[type=checkbox]:checked')].map((input) => input.value);
    const products = Object.fromEntries([...roleContainer.querySelectorAll('select[data-role-product]')].filter((select) => roles.includes(select.dataset.roleProduct) && select.value).map((select) => [select.dataset.roleProduct, select.value]));
    const data = {
      name: document.getElementById('server-form-name').value.trim(),
      roles, products, type: roles[0], product: products[roles[0]],
      os: document.getElementById('server-form-os').value,
      ip: document.getElementById('server-form-ip').value.trim(),
      sharedPath: document.getElementById('server-form-shared-path').value.trim(),
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

function populateOptions(select, codes, placeholder) {
  if (!select) return;
  select.replaceChildren();
  if (placeholder) select.add(new Option(placeholder, ''));
  codes.forEach(({ value, label }) => select.add(new Option(label, value)));
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
  desc.textContent = server.os === 'Windows'
    ? '정책에 연결된 점검 스크립트를 조립합니다. 실행 명령의 $resultDirectory에 경로를 입력하면 그곳에 저장하고, 비워 두면 서버정보의 공유 경로를 사용합니다.'
    : '스크립트 파일이 있는 폴더에서 실행하세요. 결과 JSON은 서버 공유 경로에 저장됩니다.';

  const commandTitle = document.createElement('div');
  commandTitle.className = 'command-title';
  commandTitle.textContent = server.os === 'Windows' ? '실행 명령어 (로그는 콘솔, 결과는 JSON 저장)' : '실행 명령어 (JSON 결과 저장)';

  const scriptFileName = server.os.toLowerCase() === 'windows' ? `${server.id}.ps1` : `${server.id}.sh`;
  
  const quotePowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const scriptFilter = quotePowerShell(`${server.id}*.ps1`);
  const command = server.os.toLowerCase() === 'windows'
    ? `$resultDirectory = ''; $script = Get-ChildItem -File -Filter ${scriptFilter} | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName; if (-not $script) { throw '점검 스크립트를 찾을 수 없습니다. 스크립트 폴더에서 실행하세요.' }; $scriptArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script); if (-not [string]::IsNullOrWhiteSpace($resultDirectory)) { $scriptArgs += @('-ResultDirectory', $resultDirectory) }; powershell.exe @scriptArgs`
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

  grid.className = 'result-grid compact-result-grid';

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

  results.slice(0, 5).forEach((item) => {
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
  selectedQueryTemplateId = config.queryTemplateId || currentServer?.queryTemplateId || '';
  selectedCustomQueryTemplateIds = config.customQueryTemplateIds ?? currentServer?.customQueryTemplateIds ?? [];
  selectedRoleChecks = config.roleChecks ?? currentServer?.roleChecks ?? {};
  selectedRolePolicySettings = config.rolePolicySettings ?? currentServer?.rolePolicySettings ?? {};
  renderPolicyScriptControls(config.scriptParts ?? currentServer?.scriptParts ?? {}, config.queryTemplateId ?? currentServer?.queryTemplateId ?? '', selectedRoleChecks);
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
  commonCodes.portProtocols.forEach(({ value, label }) => protocol.add(new Option(label, value)));
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
    const scriptParts = { ...selectedScriptParts };
    const rolePolicySettings = structuredClone(selectedRolePolicySettings);
    document.querySelectorAll('[data-log-directories]').forEach((input) => {
      const item = input.getAttribute('data-log-directories') || input.dataset.logDirectories;
      if (!['WEB_LOG', 'WAS_LOG'].includes(item)) return;
      rolePolicySettings[item] = {
        ...(rolePolicySettings[item] ?? {}),
        logDirectories: input.value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean),
      };
    });
    document.querySelectorAll('[data-log-period-days]').forEach((input) => {
      const item = input.getAttribute('data-log-period-days') || input.dataset.logPeriodDays;
      if (!['WEB_LOG', 'WAS_LOG'].includes(item)) return;
      rolePolicySettings[item] = { ...(rolePolicySettings[item] ?? {}), periodDays: Number(input.value) };
    });
    document.querySelectorAll('[data-db-instance-targets]').forEach((input) => {
      const item = input.getAttribute('data-db-instance-targets');
      if (!commonCodes.rolePolicies.DB.includes(item)) return;
      rolePolicySettings[item] = {
        ...(rolePolicySettings[item] ?? {}),
        instanceTargets: input.value.split(/\r?\n/).map((target) => target.trim()).filter(Boolean),
      };
    });
    const queryTemplateId = '';
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
        scriptParts,
        roleChecks: selectedRoleChecks,
        rolePolicySettings,
        queryTemplateId,
        customQueryTemplateIds: selectedCustomQueryTemplateIds,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(result);
      const validationMessages = Array.isArray(result.errors)
        ? result.errors.map((error) => error.message).filter(Boolean).join('\n')
        : '';
      alert(validationMessages || result.message || '정책 저장에 실패했습니다.');
      return;
    }

    alert('정책이 저장되었습니다.');
    currentServer.processes = processes;
    currentServer.directories = directories;
    currentServer.fileChecks = fileChecks;
    currentServer.ports = ports;
    currentServer.httpChecks = httpChecks;
    currentServer.scriptParts = scriptParts;
    currentServer.roleChecks = selectedRoleChecks;
    selectedRolePolicySettings = rolePolicySettings;
    currentServer.rolePolicySettings = rolePolicySettings;
    currentServer.queryTemplateId = queryTemplateId;
    currentServer.customQueryTemplateIds = selectedCustomQueryTemplateIds;
    renderPolicyScriptControls(scriptParts, queryTemplateId);
  } catch (error) {
    console.error(error);
    alert('정책 저장 중 오류가 발생했습니다.');
  }
}

function renderPolicyScriptControls(selectedParts = {}, queryTemplateId = '', roleChecks = selectedRoleChecks) {
  if (!currentServer) return;
  const roles = currentServer.roles?.length ? currentServer.roles : [currentServer.type];
  const products = currentServer.products || { [currentServer.type]: currentServer.product };
  selectedScriptParts = Object.fromEntries(Object.entries(selectedParts).filter(([item]) => !commonCodes?.rolePolicies.DB.includes(item)));
  selectedRoleChecks = structuredClone(roleChecks || {});
  selectedQueryTemplateId = queryTemplateId || '';
  const isWindows = currentServer.os === 'Windows';
  const commonPanel = document.getElementById('common-script-policy');
  commonPanel.hidden = !isWindows;
  const commonItems = ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'];
  const commonControls = document.getElementById('common-script-controls');
  commonControls.replaceChildren();
  commonItems.forEach((item) => commonControls.appendChild(createPolicyScriptControl(item, getScriptItemLabel(item), true)));

  const policyControls = [
    ['PROCESS', 'process-script-control'], ['DIRECTORY', 'directory-script-control'],
    ['FILE_SIZE', 'file-script-control'], ['PORT', 'port-script-control'], ['HTTP', 'http-script-control'],
  ];
  policyControls.forEach(([item, id]) => {
    const container = document.getElementById(id);
    container.replaceChildren(createPolicyScriptControl(item, getScriptItemLabel(item)));
    container.hidden = !isWindows || (item === 'HTTP' && !roles.some((role) => role === 'WEB' || role === 'WAS'));
  });

  renderRolePolicyGroups(roles, products, isWindows);
  renderFinalJsonExample(getActiveScriptItems(roles, selectedRoleChecks), selectedRoleChecks);
}

function renderRolePolicyGroups(roles, products, isWindows) {
  ['WEB', 'WAS', 'DB'].forEach((role) => {
    const suffix = role.toLowerCase();
    const block = document.getElementById(`${suffix}-role-policy`);
    const container = document.getElementById(`${suffix}-role-policy-controls`);
    block.hidden = !isWindows || !roles.includes(role);
    container.replaceChildren();
    if (block.hidden) return;
    document.getElementById(`${suffix}-role-policy-title`).textContent = `${role} 점검 · ${products[role] || role}`;
    const header = document.createElement('div'); header.className = 'role-policy-group-header';
    const addControls = document.createElement('div'); addControls.className = 'role-policy-add-controls';
    const chooser = document.createElement('select'); chooser.setAttribute('aria-label', `${role} 점검 항목 선택`);
    chooser.add(new Option('점검 항목 선택', ''));
    const currentItems = selectedRoleChecks[role] ?? [];
    commonCodes.rolePolicies[role].forEach((item) => {
      if (role === 'DB' && item === 'DB_CUSTOM_QUERY' && products.DB !== 'MSSQL') return;
      const policy = commonCodes.scriptItems.find((entry) => entry.value === item);
      const option = new Option(policy?.label || item, item);
      option.disabled = currentItems.includes(item);
      chooser.add(option);
    });
    const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'btn btn-small btn-primary'; addButton.textContent = `+ ${role} 점검 추가`;
    addButton.addEventListener('click', () => {
      if (!chooser.value) { alert('추가할 점검 항목을 선택하세요.'); return; }
      selectedRoleChecks[role] = [...(selectedRoleChecks[role] ?? []), chooser.value];
      renderPolicyScriptControls(selectedScriptParts, selectedQueryTemplateId, selectedRoleChecks);
    });
    addControls.append(chooser, addButton);
    header.appendChild(addControls); container.appendChild(header);
    const list = document.createElement('div'); list.className = 'role-policy-list';
    currentItems.forEach((item) => {
      const policy = commonCodes.scriptItems.find((entry) => entry.value === item);
      const row = document.createElement('div'); row.className = 'role-policy-row';
      const description = document.createElement('div'); description.className = 'role-policy-description';
      const name = document.createElement('strong'); name.textContent = policy?.label || item;
      const help = document.createElement('small'); help.textContent = policy?.description || '점검 결과는 연결된 항목별 스크립트가 생성합니다.';
      description.append(name, help);
      const scriptControl = createPolicyScriptControl(item, policy?.label || item);
      if (['WEB_LOG', 'WAS_LOG'].includes(item)) {
        const setting = selectedRolePolicySettings[item] ?? { logDirectories: [], periodDays: 7 };
        const folderField = document.createElement('label'); folderField.className = 'role-policy-option';
        const folderLabel = document.createElement('span'); folderLabel.textContent = `${role} 로그 폴더 (한 줄에 하나씩)`;
        const folderInput = document.createElement('textarea'); folderInput.rows = 2; folderInput.placeholder = item === 'WEB_LOG' ? '예: C:\\WebtoB\\log' : '예: C:\\JEUS6\\domains\\domain1\\servers\\server1\\logs'; folderInput.value = (setting.logDirectories ?? []).join('\n');
        folderInput.setAttribute('data-log-directories', item);
        const folderHelp = document.createElement('small'); folderHelp.textContent = '지정한 폴더의 하위 폴더도 함께 검사합니다.';
        folderInput.addEventListener('input', () => {
          selectedRolePolicySettings[item] = { ...setting, ...(selectedRolePolicySettings[item] ?? {}), logDirectories: folderInput.value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean) };
        });
        folderField.append(folderLabel, folderInput, folderHelp);
        description.appendChild(folderField);
        const periodField = document.createElement('label'); periodField.className = 'role-policy-option';
        const periodLabel = document.createElement('span'); periodLabel.textContent = '조회 기간 (최근 일)';
        const periodInput = document.createElement('input'); periodInput.type = 'number'; periodInput.min = '1'; periodInput.max = '90'; periodInput.step = '1'; periodInput.value = String(setting.periodDays ?? 7);
        periodInput.setAttribute('data-log-period-days', item);
        periodInput.addEventListener('input', () => {
          const periodDays = Number(periodInput.value);
          selectedRolePolicySettings[item] = { ...setting, ...(selectedRolePolicySettings[item] ?? {}), periodDays };
        });
        periodField.append(periodLabel, periodInput);
        description.appendChild(periodField);
      }
      if (role === 'DB' && products.DB === 'MSSQL') {
        const setting = selectedRolePolicySettings[item] ?? {};
        const instanceField = document.createElement('label'); instanceField.className = 'role-policy-option';
        const instanceLabel = document.createElement('span'); instanceLabel.textContent = 'MSSQL 인스턴스 대상 (한 줄에 하나씩)';
        const instanceInput = document.createElement('textarea'); instanceInput.rows = 2;
        instanceInput.placeholder = '예: .\\testdb 또는 localhost,1433';
        const inheritedTargets = selectedRolePolicySettings.DB_INSTANCE_STATUS?.instanceTargets;
        const initialTargets = Array.isArray(setting.instanceTargets)
          ? setting.instanceTargets
          : inheritedTargets?.length ? inheritedTargets : [`${currentServer.ip},1433`];
        instanceInput.value = initialTargets.join('\n');
        instanceInput.setAttribute('data-db-instance-targets', item);
        const instanceHelp = document.createElement('small');
        instanceHelp.textContent = item === 'DB_CUSTOM_QUERY'
          ? '선택한 사용자 쿼리를 입력한 각 인스턴스에서 실행합니다. Windows 통합 인증을 사용합니다.'
          : '이 항목에서 선택한 SQL 쿼리를 입력한 각 인스턴스에서 실행합니다. Windows 통합 인증을 사용합니다.';
        instanceInput.addEventListener('input', () => {
          selectedRolePolicySettings[item] = {
            ...(selectedRolePolicySettings[item] ?? setting),
            instanceTargets: instanceInput.value.split(/\r?\n/).map((target) => target.trim()).filter(Boolean),
          };
        });
        instanceField.append(instanceLabel, instanceInput, instanceHelp);
        description.appendChild(instanceField);
      }
      if (item === 'DB_CUSTOM_QUERY') {
        const queryCount = document.createElement('small'); queryCount.className = 'custom-query-count';
        queryCount.textContent = `쿼리 ${selectedCustomQueryTemplateIds.length}개 선택`;
        scriptControl.appendChild(queryCount);
      }
      row.append(description, scriptControl);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제';
      remove.addEventListener('click', () => {
        selectedRoleChecks[role] = (selectedRoleChecks[role] ?? []).filter((value) => value !== item);
        delete selectedScriptParts[item];
        if (item === 'DB_CUSTOM_QUERY') selectedCustomQueryTemplateIds = [];
        if (role === 'DB') delete selectedRolePolicySettings[item];
        if (['WEB_LOG', 'WAS_LOG'].includes(item)) delete selectedRolePolicySettings[item];
        renderPolicyScriptControls(selectedScriptParts, selectedQueryTemplateId, selectedRoleChecks);
      });
      row.appendChild(remove); list.appendChild(row);
    });
    container.appendChild(list);
  });
}

function getScriptItemLabel(item) {
  return commonCodes.scriptItems.find((entry) => entry.value === item)?.label || item;
}

function usesQueryTemplate(item) {
  if (commonCodes?.rolePolicies.DB.includes(item)) return true;
  const selectedId = selectedScriptParts[item];
  const template = selectedId
    ? managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  return template?.usesQueryTemplate === true;
}

function createPolicyScriptControl(item, label, showLabel = false) {
  const wrapper = document.createElement('div'); wrapper.className = `policy-script-control${showLabel ? ' is-common' : ''}`;
  wrapper.hidden = currentServer.os !== 'Windows';
  if (showLabel) { const title = document.createElement('label'); title.textContent = label; wrapper.appendChild(title); }
  if (commonCodes?.rolePolicies.DB.includes(item)) {
    const setting = selectedRolePolicySettings[item] ?? {};
    const query = managedTemplates.find((template) => template.id === (setting.queryTemplateId || `WINDOWS-QUERY-${item}`) && template.kind === 'QUERY');
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'btn btn-small policy-script-select';
    choose.textContent = item === 'DB_CUSTOM_QUERY' ? `쿼리 ${selectedCustomQueryTemplateIds.length}개 선택` : (query?.name || `${label} 쿼리 선택`);
    choose.setAttribute('aria-label', `${label} DB 쿼리 선택`);
    choose.addEventListener('click', () => openScriptTemplatePicker(item, label));
    wrapper.append(choose);
    return wrapper;
  }
  const available = managedTemplates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === currentServer.os && template.item === item);
  const selectedId = selectedScriptParts[item] || '';
  const selected = available.find((template) => template.id === selectedId);
  const defaultTemplate = getDefaultScriptTemplate(item);
  const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'btn btn-small policy-script-select';
  choose.textContent = selected
    ? selected.name
    : selectedId ? '저장된 템플릿 없음' : (defaultTemplate?.name || getDefaultScriptTemplateName(item));
  choose.setAttribute('aria-label', `${label} 스크립트 선택`);
  choose.addEventListener('click', () => openScriptTemplatePicker(item, label));
  wrapper.append(choose);
  return wrapper;
}

function bindScriptTemplatePicker() {
  const dialog = document.getElementById('script-template-picker');
  document.getElementById('script-template-picker-close').addEventListener('click', () => dialog.close());
  document.getElementById('script-template-picker-cancel').addEventListener('click', () => dialog.close());
  document.getElementById('script-template-picker-refresh').addEventListener('click', async () => {
    await loadManagedTemplates();
    populateScriptTemplatePicker(dialog.dataset.item);
  });
  document.getElementById('script-template-picker-edit').addEventListener('click', openSelectedTemplatePage);
  document.getElementById('script-template-picker-select').addEventListener('change', () => {
    updateSelectedTemplateEditButton();
    if (!commonCodes?.rolePolicies.DB.includes(dialog.dataset.item)) updateQueryTemplatePicker(dialog.dataset.item);
  });
  document.getElementById('script-template-picker-save').addEventListener('click', () => {
    const item = dialog.dataset.item;
    const templateId = document.getElementById('script-template-picker-select').value;
    if (commonCodes?.rolePolicies.DB.includes(item)) {
      const setting = selectedRolePolicySettings[item] ?? {};
      if (item === 'DB_CUSTOM_QUERY') selectedCustomQueryTemplateIds = [...document.getElementById('db-query-template-select').selectedOptions].map((option) => option.value).filter(Boolean);
      else selectedRolePolicySettings[item] = { ...setting, queryTemplateId: document.getElementById('db-query-template-select').value || `WINDOWS-QUERY-${item}` };
      dialog.close();
      renderPolicyScriptControls(selectedScriptParts, selectedQueryTemplateId);
      return;
    }
    if (templateId) selectedScriptParts[item] = templateId; else delete selectedScriptParts[item];
    const queryOptionHidden = document.getElementById('db-query-template-option').hidden;
    if (item === 'DB_INSTANCE_STATUS') selectedQueryTemplateId = queryOptionHidden ? '' : document.getElementById('db-query-template-select').value;
    if (item === 'DB_CUSTOM_QUERY') selectedCustomQueryTemplateIds = queryOptionHidden ? [] : [...document.getElementById('db-query-template-select').selectedOptions].map((option) => option.value).filter(Boolean);
    dialog.close();
    renderPolicyScriptControls(selectedScriptParts, selectedQueryTemplateId);
  });
}

function updateSelectedTemplateEditButton() {
  const item = document.getElementById('script-template-picker').dataset.item;
  if (commonCodes?.rolePolicies.DB.includes(item)) {
    document.getElementById('script-template-picker-edit').hidden = !getDefaultScriptTemplate('DB_QUERY_RUNNER');
    document.getElementById('script-template-picker-edit').textContent = '공통 DB 실행기 수정';
    return;
  }
  const selectedId = document.getElementById('script-template-picker-select').value;
  const template = selectedId
    ? managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  const editButton = document.getElementById('script-template-picker-edit');
  editButton.hidden = !template;
  editButton.textContent = selectedId ? '선택 스크립트 수정' : '기본 스크립트 수정';
}

function openScriptTemplatePicker(item, label) {
  const dialog = document.getElementById('script-template-picker');
  dialog.dataset.item = item;
  document.getElementById('script-template-picker-title').textContent = commonCodes?.rolePolicies.DB.includes(item) ? `${label} 쿼리 선택` : `${label} 스크립트 선택`;
  document.getElementById('script-template-picker-label').textContent = `${currentServer.name} · ${currentServer.os}`;
  dialog.showModal();
  loadManagedTemplates().then(() => populateScriptTemplatePicker(item));
}

function populateScriptTemplatePicker(item) {
  const select = document.getElementById('script-template-picker-select');
  const isDatabasePolicy = commonCodes?.rolePolicies.DB.includes(item) === true;
  select.closest('.form-group').hidden = isDatabasePolicy;
  const defaultTemplate = getDefaultScriptTemplate(item);
  select.replaceChildren(new Option(`기본값 사용 · ${defaultTemplate?.name || getDefaultScriptTemplateName(item)}`, ''));
  const scriptItem = isDatabasePolicy ? 'DB_QUERY_RUNNER' : item;
  const scriptDefault = getDefaultScriptTemplate(scriptItem);
  const available = managedTemplates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === currentServer.os && template.item === scriptItem);
  available.forEach((template) => {
    const category = isDefaultScriptTemplate(template, item) ? '기본 제공' : '사용자 지정';
    select.add(new Option(`${category} · ${template.name}`, template.id));
  });
  const selectedId = selectedScriptParts[scriptItem] || '';
  if (selectedId && !available.some((template) => template.id === selectedId)) select.add(new Option('저장된 템플릿을 찾을 수 없음', selectedId));
  select.value = selectedId;
  updateSelectedTemplateEditButton();
  const querySelect = document.getElementById('db-query-template-select');
  querySelect.multiple = item === 'DB_CUSTOM_QUERY';
  querySelect.size = querySelect.multiple ? 7 : 1;
  querySelect.replaceChildren();
  if (isDatabasePolicy) {
    const setting = selectedRolePolicySettings[item] ?? {};
    const itemQueries = managedTemplates.filter((template) => template.enabled && template.kind === 'QUERY' && template.item === item);
    if (item !== 'DB_CUSTOM_QUERY' && !itemQueries.some((template) => template.id === `WINDOWS-QUERY-${item}`)) querySelect.add(new Option('기본 쿼리 사용', `WINDOWS-QUERY-${item}`));
    itemQueries.forEach((template) => querySelect.add(new Option(template.name, template.id)));
    if (item === 'DB_CUSTOM_QUERY') [...querySelect.options].forEach((option) => { option.selected = selectedCustomQueryTemplateIds.includes(option.value); });
    else querySelect.value = setting.queryTemplateId || `WINDOWS-QUERY-${item}`;
  } else if (item === 'DB_INSTANCE_STATUS' || item === 'DB_CUSTOM_QUERY') {
    managedTemplates.filter((template) => template.enabled && template.kind === 'QUERY').forEach((template) => querySelect.add(new Option(template.name, template.id)));
    querySelect.value = selectedQueryTemplateId;
  }
  updateSelectedTemplateEditButton();
  document.getElementById('db-query-template-option').hidden = !isDatabasePolicy;
  document.getElementById('db-query-template-help').hidden = true;
  document.querySelector('#db-query-template-option label').textContent = item === 'DB_CUSTOM_QUERY'
    ? '실행할 DB 쿼리 템플릿 (여러 개 선택 가능)'
    : `${getScriptItemLabel(item)} 쿼리 템플릿`;
}

function updateQueryTemplatePicker(item) {
  const queryOption = document.getElementById('db-query-template-option');
  const selectedId = document.getElementById('script-template-picker-select').value;
  const scriptTemplate = selectedId
    ? managedTemplates.find((template) => template.id === selectedId && template.kind === 'SCRIPT_PART')
    : managedTemplates.find((template) => template.id === `WINDOWS-PART-${item}` && template.kind === 'SCRIPT_PART');
  const needsQueryTemplate = ['DB_INSTANCE_STATUS', 'DB_CUSTOM_QUERY'].includes(item) && scriptTemplate?.usesQueryTemplate === true;
  queryOption.hidden = !needsQueryTemplate;
  document.getElementById('db-query-template-help').hidden = !needsQueryTemplate || item !== 'DB_CUSTOM_QUERY';
  if (needsQueryTemplate) {
    const querySelect = document.getElementById('db-query-template-select');
    const queryLabel = queryOption.querySelector('label');
    queryLabel.textContent = item === 'DB_CUSTOM_QUERY' ? '실행할 쿼리 템플릿 (여러 개 선택 가능)' : 'DB 쿼리 템플릿';
  }
}

function openSelectedTemplatePage() {
  const selectedId = document.getElementById('script-template-picker-select').value;
  const item = document.getElementById('script-template-picker').dataset.item;
  if (commonCodes?.rolePolicies.DB.includes(item)) {
    const runner = getDefaultScriptTemplate('DB_QUERY_RUNNER');
    if (!runner) { alert('공통 DB 쿼리 실행기를 찾을 수 없습니다.'); return; }
    window.open(`/settings/script-management?id=${encodeURIComponent(runner.id)}`, '_blank', 'noopener');
    return;
  }
  const template = selectedId
    ? managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  if (!template) { alert('수정할 스크립트를 찾을 수 없습니다. 스크립트 관리에서 확인하세요.'); return; }
  window.open(`/settings/script-management?id=${encodeURIComponent(template.id)}`, '_blank', 'noopener');
}

function getDefaultScriptTemplate(item) {
  return managedTemplates.find((template) => template.id === `${currentServer?.os?.toUpperCase()}-PART-${item}` && template.os === currentServer?.os && template.kind === 'SCRIPT_PART')
    || managedTemplates.find((template) => template.kind === 'SCRIPT_PART' && template.os === currentServer?.os && template.item === item && template.id.startsWith(`${currentServer?.os?.toUpperCase()}-PART-`));
}

function getDefaultScriptTemplateName(item) {
  const names = {
    HOST_INFO: '서버 기본정보', CPU: 'CPU 사용률', MEMORY: '메모리 사용률', UPTIME: '서버 가동시간', DISK: '디스크 사용량',
    PROCESS: '프로세스', DIRECTORY: '디렉터리', FILE_SIZE: '파일 크기', PORT: '포트', HTTP: 'HTTP 응답',
    WEB_ENGINE_STATUS: 'WEB 엔진 상태', WAS_JVM_HEAP: 'JVM Heap 사용률', WAS_LOG: 'WAS 로그 상태', DB_INSTANCE_STATUS: 'DB 인스턴스·접속 상태', DB_CUSTOM_QUERY: '기타 사용자 쿼리',
  };
  return `${currentServer?.os || 'Windows'} 점검 항목 · ${names[item] || getScriptItemLabel(item)}`;
}

function isDefaultScriptTemplate(template, item) {
  return template.id === `WINDOWS-PART-${item}` || template.id === `${currentServer?.os?.toUpperCase()}-PART-${item}`;
}

function getActiveScriptItems(roles, roleChecks) {
  const items = ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'];
  if (currentServer.processes?.length) items.push('PROCESS');
  if (currentServer.directories?.length) items.push('DIRECTORY');
  if (currentServer.fileChecks?.length) items.push('FILE_SIZE');
  if (currentServer.ports?.length) items.push('PORT');
  if (currentServer.httpChecks?.length && roles.some((role) => role === 'WEB' || role === 'WAS')) items.push('HTTP');
  for (const role of ['WEB', 'WAS', 'DB']) if (roles.includes(role)) items.push(...(roleChecks[role] ?? []));
  return items;
}

function renderFinalJsonExample(activeItems, roleChecks) {
  const roles = currentServer.roles?.length ? currentServer.roles : [currentServer.type];
  const example = {
    schemaVersion: 2,
    server: { id: currentServer.id, name: currentServer.name, roles, products: currentServer.products || {} },
    collectedAt: '2026-11-19 10:00:00',
    host: { hostname: 'SERVER01', osName: 'Windows Server', osVersion: '10.0', uptimeMinutes: 123456, status: 'Healthy' },
    resources: {
      cpu: { usagePercent: 28, status: 'Healthy' }, memory: { usagePercent: 62, status: 'Healthy' },
      uptime: { minutes: 123456, status: 'Healthy' }, disk: { maxUsagePercent: 71, status: 'Warning', volumes: [] },
    },
    checks: { rolePolicies: {} },
    summary: { status: 'Healthy', counts: { healthy: activeItems.length, warning: 0, critical: 0, notCollected: 0 } },
  };
  const shapes = {
    PROCESS: { status: 'Healthy', items: [{ name: 'java', running: true, cpu: 1.2, memoryMB: 256, uptimeMinutes: 360 }] },
    DIRECTORY: { status: 'Healthy', items: [{ path: 'C:\\logs', exists: true, sizeGB: 2.4, usagePercent: 35 }] },
    FILE_SIZE: { status: 'Warning', items: [{ path: 'C:\\logs\\app.log', exists: true, sizeMB: 120, status: 'Warning' }] },
    PORT: { status: 'Healthy', items: [{ protocol: 'TCP', port: 8080, listening: true, processName: 'java' }] },
    HTTP: { status: 'Healthy', items: [{ name: 'health', url: 'http://localhost/health', statusCode: 200, responseTimeMs: 18, success: true }] },
    WEB: { status: 'Healthy', product: currentServer.products?.WEB, detail: { status: 'Healthy' } },
    WAS: { status: 'Healthy', product: currentServer.products?.WAS, items: [{ processId: 1200, heapUsagePercent: 48, status: 'Healthy' }] },
    DATABASE: { status: 'Healthy', product: currentServer.products?.DB, detail: { serverName: 'SQL01', databaseCount: 4, offlineCount: 0 } },
  };
  const keys = { PROCESS: 'processes', DIRECTORY: 'directories', FILE_SIZE: 'files', PORT: 'ports', HTTP: 'http', WEB: 'web', WAS: 'was', DATABASE: 'database' };
  activeItems.forEach((item) => { if (shapes[item]) example.checks[keys[item]] = shapes[item]; });
  ['WEB', 'WAS', 'DB'].forEach((role) => {
    const items = roleChecks[role] ?? [];
    if (!items.length) return;
    example.checks.rolePolicies[role] = {
      status: 'NotCollected',
      items: items.map((item) => ({ item, name: getScriptItemLabel(item), status: 'NotCollected', message: '연결한 항목별 스크립트가 결과를 기록합니다.' })),
    };
  });
  const preview = document.getElementById('server-final-json-example');
  if (preview) highlightJsonBlock(preview, JSON.stringify(example, null, 2));
}

init().catch((error) => { console.error(error); alert(error.message || '서버 상세 화면을 초기화하지 못했습니다.'); });
