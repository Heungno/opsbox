import { highlightConsoleOutput } from '../shared/js/syntax-highlight.js';
import { api, apiRequest, notifyError } from '/shared/js/api.js';

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
let currentServer = null;

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
    // 서버 정보는 보조 정보라 실패해도 보고서는 계속 표시합니다.
    const server = await api(`/api/servers/${encodeURIComponent(serverId)}`).catch(() => null);
    if (server) {
      currentServer = server;
      currentServerType = server.type || '';
      currentServerTypes = server.roles?.length ? server.roles : [server.type];
      currentServerProduct = server.product || '';
      currentServerProducts = server.products || { [server.type]: server.product };
      currentServerOS = server.os || '';
    }
    // 1. Fetch history results for comparison
    historyResults = (await api(`/api/results/${encodeURIComponent(serverId)}`)) || [];

    // 2. Populate comparison dropdown
    populateCompareSelect(fileName);

    // 3. Load current report data
    currentReportData = await apiRequest(`/api/results/${encodeURIComponent(serverId)}/file/${encodeURIComponent(fileName)}`);
    renderReport();

    // 4. Bind compare select change event
    document.getElementById('compare-select').addEventListener('change', () => {
      renderReport();
    });
  } catch (error) {
    notifyError(error, '보고서를 불러오지 못했습니다.');
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
  const osInfo = getOsInfo(data);
  document.getElementById('report-title').textContent = `서버: ${data.server || data.hostname || '-'} | 역할: ${typeLabel} | OS: ${osInfo.label || '-'} | 점검일시: ${data.checkDate}`;
  renderServerInfo(data, osInfo);
  document.getElementById('http-report-details').hidden = !serverTypes.some((role) => role === 'WEB' || role === 'WAS');

  renderHealth(health);
  renderPrintHeader(data, health, serverTypes);
  renderMetrics(data, compareData);
  const capturedPolicyDefinitions = data.checks?.policyDefinitions || {};
  const collectedBasicItems = data.checks?.policyItems || [];
  const collectedIds = new Set(collectedBasicItems.map((item) => item.item));
  const basicPolicyItems = [...collectedBasicItems];
  const capturedBasicOutputs = {
    HOST_INFO: { status: data.host?.status, detail: { rows: data.host ? [{ hostname: data.hostname, osName: data.host.osName, osVersion: data.host.osVersion, status: data.host.status }] : [] } },
    CPU: { value: data.cpu, status: data.resources?.cpu?.status },
    MEMORY: { value: data.memory, status: data.resources?.memory?.status },
    UPTIME: { value: data.uptimeMinutes, status: data.resources?.uptime?.status },
    DISK: { value: data.disk, status: data.resources?.disk?.status, rows: data.disks || [] },
    PROCESS: { status: data.checks?.processes?.status, rows: data.processes || [] },
    DIRECTORY: { status: data.checks?.directories?.status, rows: data.directories || [] },
    FILE_SIZE: { status: data.checks?.files?.status, rows: data.fileChecks || [] },
    PORT: { status: data.checks?.ports?.status, rows: data.ports || [] },
    HTTP: { status: data.checks?.http?.status, rows: data.httpChecks || [] },
  };
  Object.entries(capturedBasicOutputs).forEach(([id, output]) => {
    const definition = capturedPolicyDefinitions[id];
    const hasOutput = output.value !== undefined && output.value !== null || output.rows?.length > 0;
    if (definition && !collectedIds.has(id) && hasOutput) {
      const detail = output.detail || (output.rows ? { rows: output.rows } : { value: output.value });
      if (output.value !== undefined) detail.value = output.value;
      detail.status = output.status;
      basicPolicyItems.push({ item: id, name: definition.name || id, result: definition.result, status: output.status || 'NotCollected', detail });
    }
  });
  const basicPolicySection = document.getElementById('basic-policy-item-section');
  basicPolicySection.hidden = basicPolicyItems.length === 0;
  document.getElementById('basic-log-results').closest('.report-subsection').hidden = true;
  renderPolicyItemOutputs(basicPolicyItems, 'basic-policy-item-results');
  renderTypeReportForm(serverTypes, data, data.products || currentServerProduct);
  renderDisks(data.disks);
  renderProcesses(data.processes, compareData?.processes);
  renderDirectories(data.directories, compareData?.directories);
  renderFileChecks(data.fileChecks);
  renderPorts(data.ports);
  renderHttpChecks(data.httpChecks);
  // Only include sections that have data in this saved inspection result.
  // This keeps older reports faithful to the checks that actually ran.
  [
    ['process-report-details', data.processes],
    ['disk-report-details', data.disks],
    ['port-report-details', data.ports],
    ['directory-report-details', data.directories],
    ['file-report-details', data.fileChecks],
  ].forEach(([sectionId, items]) => {
    document.getElementById(sectionId).hidden = !Array.isArray(items) || items.length === 0;
  });
  document.getElementById('http-report-details').hidden = !Array.isArray(data.httpChecks) || data.httpChecks.length === 0;
}

function renderTypeReportForm(serverTypes, data, productMap) {
  const container = document.getElementById('type-report-form');
  container.replaceChildren();
  for (const serverType of serverTypes) {
  const type = ['WEB', 'WAS', 'DB', 'OTHER'].includes(serverType) ? serverType : 'OTHER';
  if (type === 'OTHER' && !data.rolePolicies?.[type]?.items?.length) continue;
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
      highlightConsoleOutput(document.getElementById('webtob-check-output-WEB'), data.webtobCheck?.output || data.webtobCheck?.message || 'wsadmin 결과 없음');
    }
  }

  const wasRuntimeCheck = summarizeWasRuntime(data.wasChecks, product);
  const databaseCheck = summarizeDatabaseCheck(data.databaseChecks, product);
  const rolePolicyItems = data.rolePolicies?.[type]?.items ?? [];
  const checkRows = {
    WEB: [
      ...(product === 'WebtoB' ? [['WebtoB wsadmin', summarizeWebtoB(data.webtobCheck), 'WebtoB 정보·접속 수·서버/서비스 상태']] : []),
    ],
    WAS: [
      ['JVM Heap', wasRuntimeCheck, 'Windows JDK jstat로 수집한 JVM Heap 사용률'],
    ],
    DB: [
      ['DB 엔진 접속·상태', databaseCheck, '제품별 읽기 전용 CLI를 통한 연결 및 데이터베이스 상태'],
    ],
    OTHER: [],
  };
  renderChecklist('type-check-list', checkRows[type]);
  renderPolicyItemOutputs(rolePolicyItems);
  const legacyLogSection = document.getElementById('log-analysis-results' + reportRoleSuffix);
  if (legacyLogSection) legacyLogSection.closest('.report-subsection').hidden = true;
  if (type === 'WAS') renderWasHeapRows(data.wasChecks);
  if (type === 'DB') {
    renderDatabaseChecks(data.databaseChecks, product);
    document.getElementById('db-query-results' + reportRoleSuffix).hidden = true;
    document.getElementById('db-query-results' + reportRoleSuffix).previousElementSibling.hidden = true;
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

function renderLogAnalysisTables(items, targetId = 'log-analysis-results' + reportRoleSuffix) {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.replaceChildren();
  const logItems = (items || []).filter((item) => (['WEB_LOG', 'WAS_LOG'].includes(item.item) || item.executorType === 'LOG_ANALYSIS') && (item.result?.components?.some((component) => component.type === 'LOG_TABLE') ?? ['WEB_LOG', 'WAS_LOG'].includes(item.item)));
  container.closest('.report-subsection').hidden = logItems.length === 0;
  logItems.forEach((item) => {
    const detail = item.detail || {};
    const summary = document.createElement('p'); summary.className = 'policy-help';
    const categories = detail.categories || {};
    summary.textContent = `최근 ${detail.periodDays ?? 7}일 · 검색 ${detail.checkedFileCount ?? 0}개 파일 · 발견 ${detail.matchedLineCount ?? 0}건 · Fatal ${categories.fatal ?? 0} · Error ${categories.errorException ?? 0} · Warning ${categories.warning ?? 0} · HTTP 5xx ${categories.http5xx ?? 0} · HTTP 4xx ${categories.http4xx ?? 0}`;
    container.append(summary);
    if (detail.message) { const message = document.createElement('p'); message.className = 'policy-help'; message.textContent = detail.message; container.append(message); }
    const scroll = document.createElement('div'); scroll.className = 'table-scroll';
    const table = document.createElement('table'); table.className = 'server-table';
    const configuredColumns = item.result?.components?.find((component) => component.type === 'LOG_TABLE')?.columns;
    const columns = configuredColumns?.length ? configuredColumns : [{ key: 'timestamp', label: '시각' }, { key: 'severity', label: '심각도' }, { key: 'path', label: '파일 경로' }, { key: 'message', label: '로그 내용' }];
    const head = document.createElement('thead'); const headRow = document.createElement('tr');
    columns.forEach((column) => { const th = document.createElement('th'); th.textContent = column.label; headRow.append(th); });
    head.append(headRow); table.append(head);
    const body = document.createElement('tbody');
    const samples = Array.isArray(detail.samples) ? detail.samples : [];
    samples.forEach((sample) => {
      const text = String(sample.text || '');
      const severity = /\b(FATAL|CRITICAL|EMERGENCY)\b/i.test(text) ? '치명' : /\b(ERROR|ERR|EXCEPTION|SEVERE)\b/i.test(text) ? '오류' : /\b(WARN|WARNING)\b/i.test(text) ? '경고' : /\b5\d\d\b/.test(text) ? 'HTTP 5xx' : /\b4\d\d\b/.test(text) ? 'HTTP 4xx' : '확인';
      const row = document.createElement('tr');
      const values = { timestamp: sample.timestamp || '-', severity, path: sample.path || '-', message: text, text };
      columns.forEach((column) => { const td = document.createElement('td'); td.textContent = String(values[column.key] ?? sample[column.key] ?? ''); row.append(td); });
      body.append(row);
    });
    if (!samples.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = columns.length; cell.textContent = detail.status === 'NotCollected' ? (detail.message || '로그를 수집하지 못했습니다.') : '표시할 로그가 없습니다.'; row.append(cell); body.append(row); }
    table.append(body); scroll.append(table); container.append(scroll);
  });
}

function renderPolicyItemOutputs(items, targetId = 'policy-item-output-results' + reportRoleSuffix) {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.replaceChildren();
  (items || []).forEach((item) => {
    const components = item.result?.components || [];
    const views = components.map((component) => component.type);
    const detail = item.detail || {};
    views.filter((view) => view !== 'SUMMARY').forEach((view) => {
      const section = document.createElement('section'); section.className = 'report-subsection';
      const labels = { METRIC: '측정값', TABLE: '표', CONSOLE: '콘솔 결과', JSON: 'JSON 상세' };
      const heading = document.createElement('h3'); heading.textContent = `${item.name || item.item} · ${labels[view] || view}`; section.append(heading);
      if (view === 'LOG_TABLE') {
        const configuredColumns = components.find((component) => component.type === 'LOG_TABLE')?.columns || [];
        const samples = Array.isArray(detail.samples) ? detail.samples : [];
        const columns = configuredColumns.length ? configuredColumns : [{ key: 'timestamp', label: '시각' }, { key: 'path', label: '파일 경로' }, { key: 'message', label: '로그 내용' }];
        const rows = samples.map((sample) => ({ ...sample, message: sample.text || sample.message }));
        const table = document.createElement('table'); table.className = 'server-table';
        const head = document.createElement('thead'); const headerRow = document.createElement('tr'); columns.forEach((column) => { const th = document.createElement('th'); th.textContent = column.label || column.key; headerRow.append(th); }); head.append(headerRow);
        const body = document.createElement('tbody');
        if (!rows.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = columns.length; cell.textContent = detail.message || '표시할 로그 데이터가 없습니다.'; row.append(cell); body.append(row); }
        else rows.forEach((values) => { const row = document.createElement('tr'); columns.forEach((column) => { const cell = document.createElement('td'); cell.textContent = String(values[column.key] ?? ''); row.append(cell); }); body.append(row); });
        table.append(head, body); section.append(table);
      } else if (view === 'TABLE') {
        const configuredColumns = components.find((component) => component.type === 'TABLE')?.columns || [];
        const queryResults = Array.isArray(detail.queries) ? detail.queries : null;
        const rows = Array.isArray(detail.rows) ? detail.rows : [];
        const columns = Array.isArray(detail.columns) && detail.columns.length ? detail.columns : configuredColumns.length ? configuredColumns : (rows[0] && !Array.isArray(rows[0]) ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : []);
        if ((!columns.length || !rows.length) && !queryResults) { const message = document.createElement('p'); message.className = 'policy-help'; message.textContent = '표시할 행 데이터가 없습니다.'; section.append(message); }
        else if (!queryResults) {
          const scroll = document.createElement('div'); scroll.className = 'table-scroll'; const table = document.createElement('table'); table.className = 'server-table';
          const head = document.createElement('thead'); const headRow = document.createElement('tr');
          columns.forEach((column, index) => { const th = document.createElement('th'); th.textContent = column.label || configuredColumns[index]?.label || String(column.key || column); headRow.append(th); }); head.append(headRow);
          const body = document.createElement('tbody'); rows.forEach((values) => { const row = document.createElement('tr'); columns.forEach((column, index) => { const key = column.key || column; const cell = document.createElement('td'); const value = Array.isArray(values) ? values[index] : values?.[key]; cell.textContent = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); row.append(cell); }); body.append(row); });
          table.append(head, body); scroll.append(table); section.append(scroll);
        }
        if (queryResults) queryResults.forEach((query) => {
          const querySection = document.createElement('section'); querySection.className = 'report-subsection';
          const title = document.createElement('h4'); title.textContent = [query.name, query.target].filter(Boolean).join(' · ') || item.name || item.item; querySection.append(title);
          if (query.message) { const message = document.createElement('p'); message.className = 'policy-help'; message.textContent = query.message; querySection.append(message); }
          const queryColumns = configuredColumns.length ? configuredColumns : (query.columns || []).map((key) => ({ key, label: key }));
          const queryRows = query.rows || [];
          if (queryColumns.length && queryRows.length) {
            const queryTable = document.createElement('table'); queryTable.className = 'server-table';
            const queryHead = document.createElement('thead'); const queryHeaderRow = document.createElement('tr'); queryColumns.forEach((column) => { const th = document.createElement('th'); th.textContent = column.label || column.key; queryHeaderRow.append(th); }); queryHead.append(queryHeaderRow);
            const queryBody = document.createElement('tbody'); queryRows.forEach((values) => { const row = document.createElement('tr'); queryColumns.forEach((column, index) => { const cell = document.createElement('td'); const value = Array.isArray(values) ? values[index] : values?.[column.key]; cell.textContent = value == null ? '' : String(value); row.append(cell); }); queryBody.append(row); }); queryTable.append(queryHead, queryBody); querySection.append(queryTable);
          } else { const empty = document.createElement('p'); empty.className = 'policy-help'; empty.textContent = '표시할 행 데이터가 없습니다.'; querySection.append(empty); }
          section.append(querySection);
        });
      } else if (view === 'CONSOLE') {
        const output = detail.output || detail.console?.stdout || detail.command || detail.message || '콘솔 출력이 없습니다.';
        const pre = document.createElement('pre'); pre.className = 'webtob-console-output'; pre.textContent = String(output); section.append(pre);
      } else if (view === 'METRIC') {
        const values = detail.metrics || Object.fromEntries(Object.entries(detail).filter(([key, value]) => key !== 'status' && ['number', 'string'].includes(typeof value)));
        const table = document.createElement('table'); table.className = 'server-table';
        const body = document.createElement('tbody');
        Object.entries(values).forEach(([key, value]) => { const row = document.createElement('tr'); const name = document.createElement('th'); name.textContent = key; const cell = document.createElement('td'); cell.textContent = String(value); row.append(name, cell); body.append(row); });
        table.append(body); section.append(table);
      } else {
        const pre = document.createElement('pre'); pre.className = 'webtob-console-output'; pre.textContent = JSON.stringify(detail, null, 2); section.append(pre);
      }
      container.append(section);
    });
    if (views.includes('SUMMARY')) {
      const section = document.createElement('section'); section.className = 'report-subsection';
      const heading = document.createElement('h3'); heading.textContent = `${item.name || item.item} · 요약`; section.append(heading);
      const status = item.status || detail.status || 'NotCollected';
      const badge = document.createElement('span'); badge.className = `server-badge ${status === 'Healthy' ? 'badge-success' : status === 'Warning' ? 'badge-warning' : 'badge-danger'}`; badge.textContent = status;
      const summary = document.createElement('p'); summary.append(badge);
      const message = item.message || detail.message;
      if (message) summary.append(document.createTextNode(` ${message}`));
      section.append(summary); container.append(section);
    }
  });
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
    let columns = Array.isArray(query.columns) ? query.columns : query.columns ? [query.columns] : [];
    let rows = Array.isArray(query.rows) ? query.rows : query.rows ? [query.rows] : [];
    if (!columns.length && typeof query.output === 'string' && query.output.trim()) {
      const lines = query.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const parsed = lines.map((line) => line.split('|').map((cell) => cell.trim()));
      if (parsed.length === 1 && parsed[0].length > 1) {
        columns = ['항목', '값'];
        rows = [parsed[0]];
      } else if (parsed.length > 1) {
        columns = parsed[0];
        rows = parsed.slice(1).filter((row) => row.length === columns.length && !row.every((cell) => /^-+$/.test(cell)));
      } else {
        columns = ['결과'];
        rows = [[lines[0]]];
      }
    }
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
    } else if (query.message || query.output) {
      const message = document.createElement('p');
      message.className = 'db-query-result-message';
      message.textContent = query.message || query.output;
      section.appendChild(message);
    } else {
      const message = document.createElement('p');
      message.className = 'db-query-result-message';
      message.textContent = '표시할 컬럼 데이터가 없습니다.';
      section.appendChild(message);
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

// OS 정보: 점검 스크립트가 수집한 값(data.host)을 우선, 없으면 서버에 등록된 운영체제
function getOsInfo(data) {
  const name = data.host?.osName?.trim() || '';
  const version = data.host?.osVersion?.trim() || '';
  const registered = currentServer?.os || currentServerOS || '';
  if (name) {
    return { name, version, collected: true, label: version ? `${name} (${version})` : name };
  }
  return { name: registered, version, collected: false, label: registered };
}

function renderServerInfo(data, osInfo) {
  setPrintText('report-hostname', data.hostname || data.host?.hostname || data.server);
  setPrintText('report-ip', currentServer?.ip);
  setPrintText('report-os-name', osInfo.name ? (osInfo.collected ? osInfo.name : `${osInfo.name} (서버 등록 정보)`) : '');
  setPrintText('report-os-version', osInfo.version || '수집되지 않음');
}

// 인쇄용 문서 개요 (화면에서는 숨겨지고 인쇄할 때만 보임)
const PRINT_HEALTH_LABEL = { Healthy: '○ 정상 (Healthy)', Warning: '△ 주의 (Warning)', Critical: '× 위험 (Critical)' };

function setPrintText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '-';
}

function formatPrintDate(date) {
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function renderPrintHeader(data, health, serverTypes) {
  const server = currentServer || {};
  const products = server.products || {};
  const roles = serverTypes
    .map((role) => {
      const label = role === 'OTHER' ? '기타' : role;
      const product = products[role] || (role === server.type ? server.product : '');
      return product ? `${label} (${product})` : label;
    })
    .join(', ');

  setPrintText('print-server-name', server.name || data.server || data.hostname);
  setPrintText('print-server-id', server.id || new URLSearchParams(location.search).get('serverId'));
  setPrintText('print-role', roles);
  setPrintText('print-ip', server.ip);
  setPrintText('print-os', getOsInfo(data).label);
  setPrintText('print-check-date', data.checkDate);
  setPrintText('print-health', PRINT_HEALTH_LABEL[health] || health);
  updatePrintSigner();
}

// 작성자 이름은 사이드바가 불러온 로그인 사용자, 보고 일자는 인쇄하는 날
function updatePrintSigner() {
  const userName = document.getElementById('current-user-name')?.textContent?.trim();
  const author = userName && userName !== '확인 중…' ? userName : '';
  const today = formatPrintDate(new Date());
  setPrintText('print-author', author);
  setPrintText('print-closing-author', author || ' ');
  setPrintText('print-report-date', today);
  setPrintText('print-closing-date', today);
}

window.addEventListener('beforeprint', updatePrintSigner);

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
