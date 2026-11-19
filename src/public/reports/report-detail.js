await window.opsboxLayoutReady;

let currentReportData = null;
let historyResults = [];
let selectedCurrentFile = null;
let currentServerType = '';
let currentServerTypes = [];
let currentServerProduct = '';
let currentServerProducts = {};
let currentServerOS = '';
let reportRoleSuffix = '';

async function init() {
  const params = new URLSearchParams(location.search);
  const serverId = params.get('serverId');
  const file = params.get('file');

  if (!serverId || !file) {
    alert('잘못된 접근입니다.');
    location.href = '/settings/server-management';
    return;
  }

  selectedCurrentFile = file;

  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.href = `/settings/server-management/detail?id=${encodeURIComponent(serverId)}`;
  }

  await loadHistoryAndReport(serverId, file);
}

async function loadHistoryAndReport(serverId, fileName) {
  try {
    const serverResponse = await fetch(`/api/servers/${encodeURIComponent(serverId)}`);
    if (serverResponse.ok) {
      const server = await serverResponse.json();
      currentServerType = server.type || '';
      currentServerTypes = server.roles?.length ? server.roles : [server.type];
      currentServerProduct = server.product || '';
      currentServerProducts = server.products || { [server.type]: server.product };
      currentServerOS = server.os || '';
    }
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
    const typeLabel = item.serverType === 'OTHER' ? '기타' : (item.serverType || 'Server');
    option.textContent = `${item.checkDate} (${typeLabel})`;
    
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

  const serverTypes = data.serverTypes?.length ? data.serverTypes : (currentServerTypes.length ? currentServerTypes : [data.serverType || currentServerType || 'OTHER']);
  const serverType = serverTypes[0] || 'OTHER';
  const typeLabel = serverTypes.map((role) => role === 'OTHER' ? '기타' : role).join(' + ');
  document.getElementById('report-title').textContent = `서버: ${data.server || data.hostname || '-'} | 역할: ${typeLabel} | 점검일시: ${data.checkDate}`;
  document.getElementById('http-report-details').hidden = !serverTypes.some((role) => role === 'WEB' || role === 'WAS');

  renderHealth(health);
  renderMetrics(data, compareData);
  renderTypeReportForm(serverTypes, data, data.products || currentServerProduct);
  renderDisks(data.disks);
  renderProcesses(data.processes, compareData?.processes);
  renderDirectories(data.directories, compareData?.directories);
  renderFileChecks(data.fileChecks);
  renderPorts(data.ports);
  renderHttpChecks(data.httpChecks);
}

function renderTypeReportForm(serverTypes, data, productMap) {
  const container = document.getElementById('type-report-form');
  container.replaceChildren();
  for (const serverType of serverTypes) {
  const type = ['WEB', 'WAS', 'DB', 'OTHER'].includes(serverType) ? serverType : 'OTHER';
  const product = typeof productMap === 'string' ? productMap : productMap?.[type] || currentServerProducts[type] || (currentServerType === type ? (data.product || currentServerProduct) : '');
  reportRoleSuffix = `-${type}`;
  const template = document.getElementById(`report-form-${type}`);
  const fragment = template.content.cloneNode(true);
  fragment.querySelectorAll('[id]').forEach((node) => { node.id += reportRoleSuffix; });
  container.appendChild(fragment);
  if (type === 'WEB') {
    const webtobDetails = document.getElementById('webtob-report-details-WEB');
    if (webtobDetails) {
      webtobDetails.hidden = product !== 'WebtoB' || !data.webtobCheck;
      document.getElementById('webtob-check-output-WEB').textContent = data.webtobCheck?.output || data.webtobCheck?.message || 'wsadmin 결과 없음';
    }
  }

  const processCheck = summarizeProcesses(data.processes);
  const portCheck = summarizePorts(data.ports);
  const httpCheck = summarizeHttp(data.httpChecks);
  const diskCheck = summarizeDisks(data.disks, data.disk);
  const pathCheck = summarizePaths(data.directories, data.fileChecks);
  const cpuCheck = summarizeMetric(data.cpu);
  const memoryCheck = summarizeMetric(data.memory);
  const wasRuntimeCheck = summarizeWasRuntime(data.wasChecks, product);
  const databaseCheck = summarizeDatabaseCheck(data.databaseChecks, product);
  const rolePolicyItems = data.rolePolicies?.[type]?.items ?? [];
  const rolePolicyRows = rolePolicyItems.map((item) => [
    item.name || item.item || `${type} 점검`,
    { status: item.status || 'NotCollected', detail: summarizeRolePolicyDetail(item) },
    '정책에 연결한 항목별 스크립트 결과',
  ]);

  const checkRows = {
    WEB: [
      ['CPU 자원', cpuCheck, '서버 CPU 사용률'], ['메모리 자원', memoryCheck, '서버 메모리 사용률'],
      ['WEB 프로세스', processCheck, '등록된 웹 엔진 프로세스 실행 상태'], ['서비스 포트', portCheck, '등록한 TCP/UDP 포트의 로컬 리스닝 상태'],
      ...(product === 'WebtoB' ? [['WebtoB wsadmin', summarizeWebtoB(data.webtobCheck), 'WebtoB 정보·접속 수·서버/서비스 상태']] : []),
      ['HTTP 응답', httpCheck, '등록 URL의 기대 HTTP 상태 코드 및 응답 시간'], ['엔진·로그 경로', pathCheck, '등록 디렉토리·파일의 존재 및 크기'], ['파일시스템', diskCheck, '디스크별 사용률'],
      ...rolePolicyRows,
    ],
    WAS: [
      ['CPU 자원', cpuCheck, '서버 CPU 사용률'], ['메모리 자원', memoryCheck, '서버 메모리 사용률'],
      ['WAS 프로세스', processCheck, '등록된 WAS 프로세스 실행 상태'], ['서비스 포트', portCheck, '등록한 TCP/UDP 포트의 로컬 리스닝 상태'],
      ['JVM Heap', wasRuntimeCheck, 'Windows JDK jstat로 수집한 JVM Heap 사용률'], ['애플리케이션 HTTP', httpCheck, '등록 URL의 기대 HTTP 상태 코드 및 응답 시간'], ['로그·배포 경로', pathCheck, '등록 디렉토리·파일의 존재 및 크기'], ['파일시스템', diskCheck, '디스크별 사용률'],
      ...rolePolicyRows,
    ],
    DB: [
      ['CPU 자원', cpuCheck, '서버 CPU 사용률'], ['메모리 자원', memoryCheck, '서버 메모리 사용률'],
      ['DB 프로세스', processCheck, '등록한 DB 엔진 프로세스 실행 상태'], ['리스너 포트', portCheck, '등록한 DB 접속 포트의 로컬 리스닝 상태'],
      ['DB 엔진 접속·상태', databaseCheck, '제품별 읽기 전용 CLI를 통한 연결 및 데이터베이스 상태'],
      ['DB 로그·엔진 경로', pathCheck, '등록 로그/엔진 경로의 존재 및 크기'], ['파일시스템', diskCheck, '디스크별 사용률'],
      ...rolePolicyRows,
    ],
    OTHER: [
      ['CPU 자원', cpuCheck, '서버 CPU 사용률'], ['메모리 자원', memoryCheck, '서버 메모리 사용률'],
      ['프로세스', processCheck, '등록한 프로세스 실행 상태'], ['포트', portCheck, '등록한 포트의 로컬 리스닝 상태'],
      ['경로·파일', pathCheck, '등록 디렉토리·파일의 존재 및 크기'], ['파일시스템', diskCheck, '디스크별 사용률'], ['HTTP 응답', httpCheck, 'Windows에 등록된 HTTP URL 점검 결과'],
    ],
  };
  renderChecklist('type-check-list', checkRows[type]);
  if (type === 'WAS') renderWasHeapRows(data.wasChecks);
  if (type === 'DB') {
    renderDatabaseChecks(data.databaseChecks, product);
    renderDatabaseQueryTables(rolePolicyItems);
  }

  const pendingRows = {
    WEB: [
      ['외부 포트 접속', '방화벽/보안장비를 포함한 원격 접속 확인은 미수집'],
      ['사용자 요청량·처리시간', 'WEB 요청량 및 평균 처리시간은 제품 연계 필요'],
      ['WEB-WAS 연결 상태', '커넥션 풀/연동 세션 상세는 제품 연계 필요'],
    ],
    WAS: [
      ['JEUS 6 Thread Pool (ti)', 'JEUS 6 관리자 인증 및 대상 컨테이너 설정이 없어 현재 미수집'],
      ['DB Connection Pool', '풀 사용률 및 DB 세션 상태는 미수집'],
      ['Deploy·처리시간', '애플리케이션 배포 상태와 평균 처리시간은 미수집'],
      ['기동 스크립트 변경', '제품별 기동 스크립트 경로와 기준 버전 설정이 필요합니다.'],
    ],
    DB: [
      ['DB 백업·복구', '최근 백업 시각과 복구 가능 여부는 미수집'],
      ['DB 로그·용량', '트랜잭션 로그 및 제품별 저장영역 상세는 미수집'],
      ['복제·이중화', '제품별 동기화·복제 상태는 미수집'],
    ],
  };
  const configuredPolicyItems = new Set(rolePolicyItems.map((item) => item.item));
  const pendingItemMap = {
    WEB: { WEB_WAS_CONNECTION: 'WEB-WAS 연결 상태', WEB_REQUEST_VOLUME: '사용자 요청량·처리시간' },
    WAS: { WAS_THREAD_POOL: 'JEUS 6 Thread Pool (ti)', WAS_DB_CONNECTION_POOL: 'DB Connection Pool', WAS_DEPLOYMENT: 'Deploy·처리시간', WAS_STARTUP_SCRIPT: '기동 스크립트 변경' },
    DB: { DB_BACKUP: 'DB 백업·복구', DB_TABLESPACE: 'DB 로그·용량', DB_TRANSACTION_LOG: 'DB 로그·용량', DB_REPLICATION: '복제·이중화' },
  };
  if (pendingRows[type] && pendingItemMap[type]) {
    const configuredLabels = new Set([...configuredPolicyItems].map((item) => pendingItemMap[type][item]).filter(Boolean));
    pendingRows[type] = pendingRows[type].filter(([label]) => !configuredLabels.has(label));
  }
  if (type === 'DB' && product !== 'MSSQL') pendingRows.DB.unshift(['제품별 DB 연결', 'Windows CLI 연동 대상은 현재 MSSQL입니다. 다른 제품은 공통 프로세스·포트·파일시스템 점검 결과를 확인하세요.']);
  if (type === 'DB' && product === 'MSSQL' && currentServerOS === 'Linux') pendingRows.DB.unshift(['Linux MSSQL 연결', '현재 MSSQL sqlcmd 수집기는 Windows 점검 스크립트에 포함되어 있습니다.']);
  if (type === 'WAS' && product === 'Node.js') pendingRows.WAS.unshift(['Node.js Heap', '애플리케이션별 Node.js 런타임 수집기가 필요합니다.']);
  if (pendingRows[type]) renderPendingChecklist('type-pending-list', pendingRows[type]);
  }
  reportRoleSuffix = '';
}

function summarizeRolePolicyDetail(item) {
  if (item.message) return item.message;
  if (item.item === 'WEB_ENGINE_STATUS') {
    const command = item.detail?.command || item.command;
    return command ? `${command} 실행 결과 확인` : 'WebtoB 엔진 상태 확인';
  }
  if (['WEB_LOG', 'WAS_LOG'].includes(item.item) && item.detail?.categories) {
    const counts = item.detail.categories;
    const readError = item.detail.readErrors?.[0];
    const readWarning = item.detail.readErrorCount ? ` · 읽기 실패 ${item.detail.readErrorCount}개${readError ? ` (${readError.path}: ${readError.message})` : ''}` : '';
    return `최근 ${item.detail.periodDays ?? 7}일 · 파일 ${item.detail.checkedFileCount ?? 0}개 · Fatal ${counts.fatal ?? 0} · Error/Exception ${counts.errorException ?? 0} · Warning ${counts.warning ?? 0} · HTTP 5xx ${counts.http5xx ?? 0} · HTTP 4xx ${counts.http4xx ?? 0}${readWarning}`;
  }
  if (Array.isArray(item.detail?.queries)) return item.detail.queries.map((query) => `${query.target ? `[${query.target}] ` : ''}${query.name || query.id || item.detail.queryName || '쿼리'}: ${query.status}${query.rowCount !== undefined ? ` · ${query.rowCount}행` : ''}${query.output ? ` · ${query.output}` : query.message ? ` · ${query.message}` : ''}`).join('\n').slice(0, 1200);
  if (typeof item.detail === 'string') return item.detail.slice(0, 800);
  if (Array.isArray(item.detail)) return `${item.detail.length}개 상세 결과`;
  if (item.detail?.output) return String(item.detail.output).slice(0, 800);
  if (item.detail?.message) return item.detail.message;
  if (item.detail && typeof item.detail === 'object') return Object.entries(item.detail).map(([key, value]) => `${key}: ${value}`).join(' · ').slice(0, 800);
  return item.status || '결과 없음';
}

function summarizeWebtoB(check) {
  if (!check || check.status === 'NotCollected') return { status: 'NotCollected', detail: check?.message || 'wsadmin 결과 없음' };
  return { status: check.status, detail: check.message || `${check.command} 실행 결과 확인` };
}

function summarizeDatabaseCheck(check, product) {
  if (!check || check.status === 'NotCollected') return { status: 'NotCollected', detail: check?.message || `${product || 'DB'} 연결 결과 없음` };
  if (check.message) return { status: check.status, detail: check.message };
  if (check.instances?.length) {
    const failed = check.instances.filter((instance) => instance.status === 'Critical');
    if (failed.length) return { status: check.status, detail: failed.map((instance) => `${instance.target}: ${instance.message || '접속 실패'}`).join(' · ').slice(0, 800) };
    return { status: check.status, detail: `${check.instances.length}개 인스턴스 점검 · ${check.databaseCount ?? 0}개 DB · ${check.instances.map((instance) => instance.serverName || instance.target).join(', ')}` };
  }
  const serverInfo = [check.serverName, check.version, check.edition].filter(Boolean).join(' · ');
  const detail = `${check.databaseCount ?? 0}개 DB · 정상 ${Math.max(0, (check.databaseCount ?? 0) - (check.offlineCount ?? 0))}개${serverInfo ? ` · ${serverInfo}` : ''}`;
  return { status: check.status, detail };
}

function renderDatabaseChecks(check, product) {
  const summary = document.getElementById('database-check-summary' + reportRoleSuffix);
  const tbody = document.getElementById('database-check-list' + reportRoleSuffix);
  const instanceSummary = check?.instances?.length ? check.instances.map((instance) => `${instance.target}: ${instance.status}${instance.message ? ` (${instance.message})` : ''}`).join(' · ') : '';
  summary.textContent = check?.message || (check ? `${check.product || product} · ${instanceSummary || `${check.serverName || '서버 정보 없음'} · 버전 ${check.version || '미수집'}`} · DB ${check.databaseCount ?? 0}개` : `${product || 'DB'} 엔진 상세는 미수집입니다. 제품별 CLI가 필요합니다.`);
  tbody.replaceChildren();
  if (!check?.databases?.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    const failedTargets = check?.instances?.filter((instance) => instance.status === 'Critical') ?? [];
    cell.textContent = failedTargets.length ? failedTargets.map((instance) => `${instance.target}: ${instance.message || '접속 실패'}`).join(' · ') : check?.message || '데이터베이스 상세가 없습니다.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }
  check.databases.forEach((database) => {
    const row = document.createElement('tr');
    const target = document.createElement('td'); target.textContent = database.instanceTarget || '-';
    const name = document.createElement('td'); name.textContent = database.name;
    const state = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${database.status === 'Healthy' ? 'badge-success' : database.status === 'Warning' ? 'badge-warning' : 'badge-danger'}`;
    badge.textContent = `${database.state} · ${database.status === 'Healthy' ? '정상' : database.status === 'Warning' ? '확인 필요' : '위험'}`;
    state.appendChild(badge);
    const recovery = document.createElement('td'); recovery.textContent = database.recoveryModel || '-';
    const size = document.createElement('td'); size.textContent = Number.isFinite(Number(database.sizeMB)) ? Number(database.sizeMB).toLocaleString() : '-';
    row.append(target, name, state, recovery, size);
    tbody.appendChild(row);
  });
}

function renderDatabaseQueryTables(items) {
  const container = document.getElementById('db-query-results' + reportRoleSuffix);
  if (!container) return;
  container.replaceChildren();
  const results = [];
  (items || []).forEach((item) => (item.detail?.queries || []).forEach((query) => results.push({ item, query })));
  if (!results.length) {
    const empty = document.createElement('p');
    empty.className = 'policy-help';
    empty.textContent = '표시할 DB 쿼리 결과가 없습니다.';
    container.appendChild(empty);
    return;
  }
  results.forEach(({ item, query }) => {
    const section = document.createElement('section');
    section.className = 'db-query-result';
    const heading = document.createElement('div');
    heading.className = 'db-query-result-heading';
    const title = document.createElement('strong');
    title.textContent = `${item.name || item.item || 'DB 쿼리'}${query.name ? ` · ${query.name}` : ''}`;
    const meta = document.createElement('span');
    meta.textContent = `${query.target || '-'} · ${query.status || item.status || '미수집'}`;
    heading.append(title, meta);
    section.appendChild(heading);
    if (query.message) {
      const message = document.createElement('p');
      message.className = 'db-query-result-message';
      message.textContent = query.message;
      section.appendChild(message);
    }
    const columns = query.columns || [];
    const rows = query.rows || [];
    if (columns.length) {
      const scroll = document.createElement('div'); scroll.className = 'table-scroll';
      const table = document.createElement('table'); table.className = 'server-table db-query-result-table';
      const thead = document.createElement('thead'); const headRow = document.createElement('tr');
      columns.forEach((column) => { const th = document.createElement('th'); th.textContent = column === '__OPSBOX_STATUS' ? '상태' : column; headRow.appendChild(th); });
      thead.appendChild(headRow);
      const tbody = document.createElement('tbody');
      rows.forEach((row) => {
        const tr = document.createElement('tr');
        columns.forEach((column, index) => { const td = document.createElement('td'); const value = Array.isArray(row) ? row[index] : row?.[column]; td.textContent = value == null ? '' : String(value); tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = columns.length; td.textContent = query.status === 'NotCollected' ? '쿼리 결과를 수집하지 못했습니다.' : '조회 결과가 없습니다.'; tr.appendChild(td); tbody.appendChild(tr); }
      table.append(thead, tbody); scroll.appendChild(table); section.appendChild(scroll);
    }
    container.appendChild(section);
  });
}

function summarizeWasRuntime(items, product) {
  if (product === 'Node.js') return { status: 'NotCollected', detail: 'Node.js 런타임 수집기 미설정' };
  if (!items?.length) return { status: 'NotCollected', detail: 'JVM Heap 결과 없음' };
  const collected = items.filter((item) => item.heapUsagePercent !== undefined);
  if (!collected.length) return { status: 'NotCollected', detail: items[0].message || 'JDK jstat를 사용할 수 없음' };
  const worst = collected.reduce((max, item) => Math.max(max, Number(item.heapUsagePercent) || 0), 0);
  const status = collected.some((item) => item.status === 'Critical') ? 'Critical' : collected.some((item) => item.status === 'Warning') ? 'Warning' : 'Healthy';
  return { status, detail: `${collected.length}개 JVM · 최대 ${worst}%` };
}

function renderWasHeapRows(items) {
  const tbody = document.getElementById('was-heap-list' + reportRoleSuffix);
  if (!items?.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" style="text-align:center;color:var(--text-light);">JVM Heap 결과가 없습니다. 새 Windows 점검 스크립트를 실행하세요.</td>';
    tbody.appendChild(row);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = item.processName || 'java';
    const pid = document.createElement('td'); pid.textContent = item.processId ? String(item.processId) : '-';
    const usage = document.createElement('td'); usage.textContent = item.heapUsagePercent == null ? '-' : `${item.heapUsedMB} / ${item.heapCapacityMB} MB (${item.heapUsagePercent}%)`;
    const state = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `server-badge ${item.status === 'Healthy' ? 'badge-success' : item.status === 'Warning' ? 'badge-warning' : item.status === 'NotCollected' ? 'badge-muted' : 'badge-danger'}`;
    badge.textContent = item.status === 'Healthy' ? '정상' : item.status === 'Warning' ? '경고' : item.status === 'NotCollected' ? '미수집' : '위험';
    state.appendChild(badge);
    const note = document.createElement('td'); note.textContent = item.message || '-';
    row.append(name, pid, usage, state, note); tbody.appendChild(row);
  });
}

function summarizeMetric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'NotCollected', detail: '결과 값 없음' };
  return { status: value >= 90 ? 'Critical' : value >= 70 ? 'Warning' : 'Healthy', detail: `${value}%` };
}

function summarizeProcesses(items) {
  if (!items?.length) return { status: 'NotCollected', detail: '프로세스 결과 없음' };
  const stopped = items.filter((item) => item.running === false).map((item) => item.name);
  return { status: stopped.length ? 'Critical' : 'Healthy', detail: stopped.length ? `중지: ${stopped.join(', ')}` : `${items.length}개 프로세스 실행 중` };
}

function summarizePorts(items) {
  if (!items?.length) return { status: 'NotCollected', detail: '포트 점검 미등록' };
  const stopped = items.filter((item) => item.listening === false);
  return { status: stopped.length ? 'Critical' : 'Healthy', detail: stopped.length ? `${stopped.length}개 포트 미수신` : `${items.length}개 포트 수신 중` };
}

function summarizeHttp(items) {
  if (!items?.length) return { status: 'NotCollected', detail: 'HTTP 점검 미등록 또는 미수집' };
  const failed = items.filter((item) => item.success === false);
  const avg = Math.round(items.reduce((sum, item) => sum + (item.responseTimeMs || 0), 0) / items.length);
  return { status: failed.length ? 'Critical' : 'Healthy', detail: failed.length ? `${failed.length}개 URL 실패` : `${items.length}개 URL 정상 · 평균 ${avg} ms` };
}

function summarizeDisks(disks, totalUsage) {
  if (disks?.length) {
    const worst = disks.reduce((max, item) => Math.max(max, item.usagePercent || 0), 0);
    return { status: worst >= 90 ? 'Critical' : worst >= 70 ? 'Warning' : 'Healthy', detail: `${disks.length}개 디스크 · 최대 ${worst}%` };
  }
  return summarizeMetric(totalUsage);
}

function summarizePaths(directories, files) {
  const count = (directories?.length || 0) + (files?.length || 0);
  if (!count) return { status: 'NotCollected', detail: '경로·파일 점검 미등록' };
  const missing = (directories || []).filter((item) => item.exists === false).length + (files || []).filter((item) => item.status === 'Critical' || item.exists === false).length;
  const warning = (files || []).filter((item) => item.status === 'Warning').length;
  return { status: missing ? 'Critical' : warning ? 'Warning' : 'Healthy', detail: `${count}개 경로 점검 · ${missing ? `${missing}개 확인 필요` : '대상 확인됨'}` };
}

function renderChecklist(targetId, rows) {
  const tbody = document.getElementById(targetId + reportRoleSuffix);
  rows.forEach(([label, result, note]) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = label;
    const state = document.createElement('td');
    const badge = document.createElement('span'); badge.className = `server-badge ${result.status === 'Healthy' ? 'badge-success' : result.status === 'Warning' ? 'badge-warning' : result.status === 'NotCollected' ? 'badge-muted' : 'badge-danger'}`;
    badge.textContent = result.status === 'Healthy' ? '정상' : result.status === 'Warning' ? '경고' : result.status === 'NotCollected' ? '미수집' : '위험';
    state.appendChild(badge);
    const detail = document.createElement('td'); detail.textContent = `${result.detail} · ${note}`;
    row.append(name, state, detail); tbody.appendChild(row);
  });
}

function renderPendingChecklist(targetId, rows) {
  const tbody = document.getElementById(targetId + reportRoleSuffix);
  rows.forEach(([label, note]) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = label;
    const state = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'server-badge badge-muted'; badge.textContent = '미수집'; state.appendChild(badge);
    const detail = document.createElement('td'); detail.textContent = note;
    row.append(name, state, detail); tbody.appendChild(row);
  });
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
    { label: '가동 시간', value: data.uptimeMinutes ?? 0, prevVal: compareData?.uptimeMinutes, unit: '', formatter: formatUptime },
  ];

  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'result-item';

    const span = document.createElement('span');
    span.textContent = m.label;

    const strong = document.createElement('strong');
    strong.textContent = m.formatter ? m.formatter(m.value, data.uptimeParts) : `${m.value}${m.unit}`;

    if (m.prevVal !== undefined && m.prevVal !== null && typeof m.value === 'number') {
      const diffBadge = createDiffBadge(m.value, m.prevVal, m.unit === '%');
      if (diffBadge) {
        if (m.formatter && m.value !== m.prevVal) {
          const delta = m.value - m.prevVal;
          diffBadge.textContent = `${delta > 0 ? '▲ +' : '▼ -'}${m.formatter(Math.abs(delta))}`;
        }
        strong.appendChild(diffBadge);
      }
    }

    card.appendChild(span);
    card.appendChild(strong);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function formatUptime(minutes, parts) {
  let values;
  if (parts && ['years', 'months', 'days', 'hours', 'minutes'].some((key) => Number(parts[key]) > 0)) {
    values = [
      [Number(parts.years) || 0, '년'],
      [Number(parts.months) || 0, '개월'],
      [Number(parts.days) || 0, '일'],
      [Number(parts.hours) || 0, '시간'],
      [Number(parts.minutes) || 0, '분'],
    ];
  } else {
    let remaining = Math.max(0, Math.floor(Number(minutes) || 0));
    const minutesPerYear = 365 * 24 * 60;
    const minutesPerMonth = 30 * 24 * 60;
    let years = Math.floor(remaining / minutesPerYear);
    remaining %= minutesPerYear;
    let months = Math.floor(remaining / minutesPerMonth);
    remaining %= minutesPerMonth;
    if (months === 12) { years += 1; months = 0; }
    const days = Math.floor(remaining / (24 * 60));
    remaining %= 24 * 60;
    const hours = Math.floor(remaining / 60);
    const mins = remaining % 60;
    values = [[years, '년'], [months, '개월'], [days, '일'], [hours, '시간'], [mins, '분']];
  }
  const formatted = values.filter(([value]) => value > 0).map(([value, unit]) => `${value}${unit}`);
  return formatted.length ? formatted.join(' ') : '0분';
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
    uptimeTd.textContent = formatUptime(proc.uptimeMinutes);

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

function renderHttpChecks(checks) {
  const tbody = document.getElementById('http-check-report-list');
  tbody.replaceChildren();
  if (!checks || checks.length === 0) {
    const row = document.createElement('tr'); row.innerHTML = '<td colspan="5" style="text-align:center;color:var(--text-light);">HTTP 응답 점검 결과가 없습니다.</td>'; tbody.appendChild(row); return;
  }
  checks.forEach((check) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = check.name;
    const url = document.createElement('td'); url.textContent = check.url;
    const code = document.createElement('td'); code.textContent = check.statusCode ?? check.error ?? '응답 없음';
    const time = document.createElement('td'); time.textContent = check.responseTimeMs == null ? '-' : `${check.responseTimeMs} ms`;
    const state = document.createElement('td'); const badge = document.createElement('span');
    badge.className = `server-badge ${check.success ? 'badge-success' : 'badge-danger'}`; badge.textContent = check.success ? '정상' : '실패'; state.appendChild(badge);
    row.append(name, url, code, time, state); tbody.appendChild(row);
  });
}

init();
