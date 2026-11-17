let currentReportData = null;
let historyResults = [];
let selectedCurrentFile = null;

async function init() {
  const params = new URLSearchParams(location.search);
  const serverId = params.get('serverId');
  const file = params.get('file');

  if (!serverId || !file) {
    alert('잘못된 접근입니다.');
    location.href = '/server.html';
    return;
  }

  selectedCurrentFile = file;

  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.href = `/server-detail.html?id=${serverId}`;
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
  renderProcesses(data.processes, compareData?.processes);
  renderDirectories(data.directories, compareData?.directories);
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

init();
