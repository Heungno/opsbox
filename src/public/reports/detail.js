let currentReportData = null;
let historyResults = [];
let selectedCurrentFile = null;

async function init() {
  const params = new URLSearchParams(location.search);
  const serverId = params.get('serverId');
  const file = params.get('file');

  if (!serverId || !file) {
    alert('잘못된 접근입니다.');
    location.href = '/servers';
    return;
  }

  selectedCurrentFile = file;

  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.href = `/servers/detail?id=${encodeURIComponent(serverId)}`;
  }

  await loadHistoryAndReport(serverId, file);
}

async function loadHistoryAndReport(serverId, fileName) {
  try {
    // 1. Fetch history results for comparison
    const historyRes = await fetch(`/api/results/${serverId}`);
    const historyJson = await historyRes.json();
    if (historyJson.success) {
      historyResults = historyJson.data || [];
    }

    // 2. Populate comparison dropdown
    populateCompareSelect(fileName);

    // 3. Load current report data
    const response = await fetch(`/api/results/${serverId}/file/${encodeURIComponent(fileName)}`);
    const result = await response.json();

    if (!result.success) {
      alert(result.message || '보고서를 불러올 수 없습니다.');
      return;
    }

    currentReportData = result;
    renderReport();

    // 4. Bind compare select change event
    document.getElementById('compare-select').addEventListener('change', () => {
      renderReport();
    });
  } catch (err) {
    console.error(err);
    alert('보고서 로딩 중 오류가 발생했습니다.');
  }
}

function populateCompareSelect(currentFileName) {
  const select = document.getElementById('compare-select');
  select.replaceChildren();

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '비교 안 함';
  select.appendChild(defaultOption);

  let previousIndex = -1;
  historyResults.forEach((item, index) => {
    if (item.fileName === currentFileName) {
      previousIndex = index + 1; // direct previous
    }
  });

  historyResults.forEach((item, index) => {
    if (item.fileName === currentFileName) return; // skip current

    const option = document.createElement('option');
    option.value = item.fileName;
    option.textContent = `${item.checkDate} (${item.serverType || 'Server'})`;
    
    // Auto-select the immediate previous check by default
    if (index === previousIndex) {
      option.selected = true;
    }

    select.appendChild(option);
  });
}

function getCompareResult() {
  const compareFileName = document.getElementById('compare-select').value;
  if (!compareFileName) return null;
  return historyResults.find((item) => item.fileName === compareFileName) || null;
}

function renderReport() {
  if (!currentReportData) return;

  const data = currentReportData.data;
  const health = currentReportData.health;
  const compareData = getCompareResult();

  document.getElementById('report-title').textContent = `서버: ${data.server || data.hostname || '-'} | 점검일시: ${data.checkDate}`;

  renderHealth(health);
  renderMetrics(data, compareData);
  renderDisks(data.disks);
  renderProcesses(data.processes, compareData?.processes);
  renderDirectories(data.directories, compareData?.directories);
  renderFileChecks(data.fileChecks);
  renderPorts(data.ports);
}

function renderHealth(health) {
  const container = document.getElementById('health-summary');
  container.replaceChildren();

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

  container.appendChild(badge);
}

function renderDisks(disks) {
  const tbody = document.getElementById('disk-report-list');
  tbody.replaceChildren();
  if (!disks || disks.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" style="text-align:center;color:var(--text-light);">디스크별 상세 정보가 없는 결과입니다. 새 스크립트를 실행하면 표시됩니다.</td>';
    tbody.appendChild(row);
    return;
  }

  disks.forEach((disk) => {
    const row = document.createElement('tr');
    const device = document.createElement('td');
    device.textContent = disk.mountPoint && disk.mountPoint !== disk.device
      ? `${disk.device} (${disk.mountPoint})`
      : disk.device;
    const used = document.createElement('td');
    used.textContent = `${disk.usedGB ?? 0} GB`;
    const total = document.createElement('td');
    total.textContent = `${disk.totalGB ?? 0} GB`;
    const usage = document.createElement('td');
    usage.textContent = `${disk.usagePercent ?? 0}%`;
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${disk.status === 'Healthy' ? 'badge-success' : disk.status === 'Warning' ? 'badge-warning' : 'badge-danger'}`;
    badge.textContent = disk.status ?? '미판정';
    status.appendChild(badge);
    row.append(device, used, total, usage, status);
    tbody.appendChild(row);
  });
}

function createDiffBadge(currentVal, prevVal, isPercent = true) {
  if (prevVal === undefined || prevVal === null || isNaN(prevVal)) return null;
  const diff = Math.round((currentVal - prevVal) * 10) / 10;
  if (diff === 0) {
    const span = document.createElement('span');
    span.className = 'diff-badge diff-same';
    span.textContent = '- (변화없음)';
    return span;
  }

  const span = document.createElement('span');
  if (diff > 0) {
    span.className = 'diff-badge diff-up';
    span.textContent = `▲ +${diff}${isPercent ? '%' : ''}`;
  } else {
    span.className = 'diff-badge diff-down';
    span.textContent = `▼ ${diff}${isPercent ? '%' : ''}`;
  }
  return span;
}

function renderMetrics(data, compareData) {
  const container = document.getElementById('report-result');
  container.replaceChildren();

  const grid = document.createElement('div');
  grid.className = 'result-grid';

  const metrics = [
    { label: 'CPU 사용률', value: data.cpu, prevVal: compareData?.cpu, unit: '%' },
    { label: '메모리 사용률', value: data.memory, prevVal: compareData?.memory, unit: '%' },
    { label: '디스크 사용률', value: data.disk, prevVal: compareData?.disk, unit: '%' },
    { label: '가동 시간', value: data.uptimeMinutes ?? '-', prevVal: compareData?.uptimeMinutes, unit: ' 분', isNum: true },
  ];

  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'result-item';

    const span = document.createElement('span');
    span.textContent = m.label;

    const strong = document.createElement('strong');
    strong.textContent = `${m.value}${m.unit}`;

    if (m.prevVal !== undefined && m.prevVal !== null && typeof m.value === 'number') {
      const diffBadge = createDiffBadge(m.value, m.prevVal, m.unit === '%');
      if (diffBadge) strong.appendChild(diffBadge);
    }

    card.appendChild(span);
    card.appendChild(strong);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function renderProcesses(processes, prevProcesses) {
  const tbody = document.getElementById('process-report-list');
  tbody.replaceChildren();

  if (!processes || processes.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" style="text-align: center; color: var(--text-light);">점검된 프로세스가 없습니다.</td>';
    tbody.appendChild(tr);
    return;
  }

  processes.forEach((proc) => {
    const tr = document.createElement('tr');
    const prevProc = prevProcesses?.find((p) => p.name === proc.name);

    const nameTd = document.createElement('td');
    nameTd.textContent = proc.name;

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${proc.running ? 'badge-success' : 'badge-danger'}`;
    badge.style.minWidth = '50px';
    badge.style.height = '22px';
    badge.style.fontSize = '11px';
    badge.textContent = proc.running ? '실행중' : '중지됨';
    statusTd.appendChild(badge);

    const cpuTd = document.createElement('td');
    cpuTd.textContent = `${proc.cpu ?? 0}%`;
    if (prevProc && prevProc.cpu !== undefined) {
      const diff = createDiffBadge(proc.cpu ?? 0, prevProc.cpu ?? 0, true);
      if (diff) cpuTd.appendChild(diff);
    }

    const memTd = document.createElement('td');
    memTd.textContent = `${proc.memoryMB ?? 0} MB`;
    if (prevProc && prevProc.memoryMB !== undefined) {
      const diff = createDiffBadge(proc.memoryMB ?? 0, prevProc.memoryMB ?? 0, false);
      if (diff) {
        diff.textContent = diff.textContent.replace('%', ' MB');
        memTd.appendChild(diff);
      }
    }

    const uptimeTd = document.createElement('td');
    uptimeTd.textContent = `${proc.uptimeMinutes ?? 0} 분`;

    tr.appendChild(nameTd);
    tr.appendChild(statusTd);
    tr.appendChild(cpuTd);
    tr.appendChild(memTd);
    tr.appendChild(uptimeTd);

    tbody.appendChild(tr);
  });
}

function renderDirectories(directories, prevDirectories) {
  const tbody = document.getElementById('directory-report-list');
  tbody.replaceChildren();

  if (!directories || directories.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" style="text-align: center; color: var(--text-light);">점검된 디렉토리가 없습니다.</td>';
    tbody.appendChild(tr);
    return;
  }

  directories.forEach((dir) => {
    const tr = document.createElement('tr');
    const prevDir = prevDirectories?.find((d) => d.path === dir.path);

    const pathTd = document.createElement('td');
    pathTd.textContent = dir.path;

    const existTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${dir.exists ? 'badge-success' : 'badge-danger'}`;
    badge.style.minWidth = '50px';
    badge.style.height = '22px';
    badge.style.fontSize = '11px';
    badge.textContent = dir.exists ? '존재함' : '없음';
    existTd.appendChild(badge);

    const usedTd = document.createElement('td');
    usedTd.textContent = `${dir.usedGB ?? 0} GB`;

    const totalTd = document.createElement('td');
    const usageTd = document.createElement('td');
    usageTd.textContent = `${dir.usagePercent ?? 0}%`;
    if (prevDir && prevDir.usagePercent !== undefined) {
      const diff = createDiffBadge(dir.usagePercent ?? 0, prevDir.usagePercent ?? 0, true);
      if (diff) usageTd.appendChild(diff);
    }
    totalTd.textContent = `${dir.totalGB ?? 0} GB`;

    tr.appendChild(pathTd);
    tr.appendChild(existTd);
    tr.appendChild(usedTd);
    tr.appendChild(totalTd);
    tr.appendChild(usageTd);

    tbody.appendChild(tr);
  });
}

function renderFileChecks(fileChecks) {
  const tbody = document.getElementById('file-check-report-list');
  tbody.replaceChildren();
  if (!fileChecks || fileChecks.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" style="text-align:center;color:var(--text-light);">점검된 파일이 없습니다.</td>';
    tbody.appendChild(row);
    return;
  }

  fileChecks.forEach((file) => {
    const row = document.createElement('tr');
    const path = document.createElement('td');
    path.textContent = file.path;
    const exists = document.createElement('td');
    exists.textContent = file.exists ? '존재함' : '없음';
    const size = document.createElement('td');
    size.textContent = `${file.sizeMB ?? 0} MB`;
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${file.status === 'Healthy' ? 'badge-success' : file.status === 'Warning' ? 'badge-warning' : 'badge-danger'}`;
    badge.textContent = file.status ?? 'Critical';
    status.appendChild(badge);
    row.append(path, exists, size, status);
    tbody.appendChild(row);
  });
}

function renderPorts(ports) {
  const tbody = document.getElementById('port-report-list');
  tbody.replaceChildren();
  if (!ports || ports.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" style="text-align:center;color:var(--text-light);">점검 대상으로 등록된 포트가 없습니다.</td>';
    tbody.appendChild(row);
    return;
  }

  ports.forEach((port) => {
    const row = document.createElement('tr');
    const protocol = document.createElement('td');
    protocol.textContent = port.protocol;
    const number = document.createElement('td');
    number.textContent = String(port.port);
    const description = document.createElement('td');
    description.textContent = port.description || '-';
    const state = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${port.listening ? 'badge-success' : 'badge-danger'}`;
    badge.textContent = port.listening ? '수신 중' : '미수신';
    state.appendChild(badge);
    const process = document.createElement('td');
    process.textContent = port.processName || '-';
    row.append(protocol, number, description, state, process);
    tbody.appendChild(row);
  });
}

init();
