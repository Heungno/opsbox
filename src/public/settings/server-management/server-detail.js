import { highlightJsonBlock } from '../../shared/js/syntax-highlight.js';
import { api, apiRequest, downloadFile, loadText, notifyError, showToast } from '/shared/js/api.js';
import { codeList, loadCodes } from '/shared/js/codes.js';
import { roleChoices } from './server-list-view.js';
import { createServerPicker } from '/shared/js/server-picker.js';
import { effectiveResultPath, healthOf, roleBadgeText } from './server-overview.js';
import { activeScriptItems, compatibleDbQueries, dbTargetHint, defaultQueryTemplateId, directoryFromInputs, defaultScriptTemplate, defaultScriptTemplateName, isDefaultScriptTemplate as isDefaultScript, policyCheckIds, policyRoleTabs, resolveQueryTemplateId as resolveQueryTemplate } from './server-policy-form.js';
import { scriptCommand, scriptDescription } from './server-script-panel.js';
import { loadStatusLabels, statusLabel } from '/shared/js/status.js';

await loadStatusLabels(); // 상태 이름(공통코드 healthStatuses)을 그리기 전에 불러옴

const params = new URLSearchParams(window.location.search);
/** 화면 상태 (서버·정책 선택, 저장 안 한 변경 여부, 불러온 공통코드·템플릿) */
/** 왼쪽 서버 목록 패널 (bindEvents에서 만듦) */
let picker;

const state = {
  serverId: params.get('id'),
  currentServer: null,
  managedTemplates: [],
  selectedScriptParts: {},
  selectedRoleChecks: {},
  selectedRolePolicySettings: {},
  selectedQueryTemplateId: '',
  selectedCustomQueryTemplateIds: [],
  commonCodes: {},
  policies: [],
  selectedBasicPolicyChecks: [],
  selectedCatalogPolicyIds: {},
  basicDetailSections: undefined,
  activePolicyRole: 'BASIC',
  serverInfoDirty: false,
  policyDirty: false,
  resultPathSettings: undefined,
  queryPrefixes: {},
};


function hasUnsavedChanges() { return state.serverInfoDirty || state.policyDirty; }
function confirmDiscardChanges(clear = false) {
  if (!hasUnsavedChanges()) return true;
  if (!confirm('현재 저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?')) return false;
  if (clear) { state.serverInfoDirty = false; state.policyDirty = false; }
  return true;
}

function getPolicyItemDefinition(itemId) {
  return state.policies.flatMap((policy) => policy.items || []).find((item) => item.id === itemId);
}

function isDbQueryItem(itemId) {
  return codeList('rolePolicies', 'DB').some((code) => code.value === itemId) || getPolicyItemDefinition(itemId)?.executor?.type === 'SQL_QUERY';
}

async function init() {
  document.getElementById('server-modal-container').innerHTML = await loadText('/shared/fragments/server-modal.html');
  document.getElementById('script-template-picker-container').innerHTML = await loadText('/shared/fragments/script-template-picker-modal.html');
  state.commonCodes = await loadCodes();
  state.queryPrefixes = await api('/api/scripts/db-query-prefixes').catch(() => ({}));
  state.policies = await api('/api/policies').catch((error) => { notifyError(error, '점검 정책 목록을 불러오지 못했습니다.'); return []; });
  populateOptions(document.getElementById('server-form-os'), codeList('operatingSystems'));
  bindScriptTemplatePicker();
  await loadManagedTemplates();
  bindServerEdit();
  document.querySelectorAll('[data-server-tab]').forEach((button) => button.addEventListener('click', async () => {
    if (button.getAttribute('aria-selected') === 'true' || !confirmDiscardChanges()) return;
    if (hasUnsavedChanges()) {
      state.serverInfoDirty = false;
      state.policyDirty = false;
      await loadServer();
    }
    const tab = button.dataset.serverTab;
    document.querySelectorAll('[data-server-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === button)));
    document.querySelectorAll('[data-server-panel]').forEach((panel) => { panel.hidden = panel.dataset.serverPanel !== tab; });
  }));
  document.getElementById('policy-role-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-policy-role-tab]');
    if (!button) return;
    state.activePolicyRole = button.dataset.policyRoleTab;
    updatePolicyRoleTabVisibility();
  });
  picker = createServerPicker({
    search: document.getElementById('server-search'),
    tabs: document.getElementById('server-picker-role-tabs'),
    list: document.getElementById('server-picker-list'),
    empty: document.getElementById('server-picker-empty'),
    fetchServers: () => api('/api/servers?includeInactive=1'),
    onSelect: selectServer,
  });
  document.getElementById('server-list-refresh')?.addEventListener('click', loadServerPicker);
  document.getElementById('btn-activate-server')?.addEventListener('click', activateCurrentServer);
  document.getElementById('policy-section').addEventListener('input', () => { state.policyDirty = true; });
  document.getElementById('policy-section').addEventListener('change', () => { state.policyDirty = true; });
  document.getElementById('policy-section').addEventListener('click', (event) => {
    if (event.target.closest('#btn-save-policy, [data-policy-role-tab]')) return;
    if (event.target.closest('button')) state.policyDirty = true;
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download') || !hasUnsavedChanges()) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
    if (!confirmDiscardChanges(true)) event.preventDefault();
  }, true);
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  await loadServerPicker();
}

// 미사용 서버도 목록에 보여 줍니다(상세에서 [다시 사용]을 누를 수 있게).
async function loadServerPicker() {
  const servers = await picker.load();
  if (!servers.length) {
    document.getElementById('server-title').textContent = '등록된 서버가 없습니다.';
    document.getElementById('policy-section').hidden = true;
    document.getElementById('script-list').textContent = '서버를 먼저 등록하세요.';
    return;
  }
  const selected = servers.find((server) => server.id === state.serverId) || servers[0];
  await selectServer(selected.id);
}

/** 정책에서 사용하는 점검 항목 id (사용 중인 항목만) */


async function activateCurrentServer() {
  try {
    await api(`/api/servers/${encodeURIComponent(state.currentServer.id)}/activate`, { method: 'POST' });
    showToast(`${state.currentServer.id} 서버를 다시 사용합니다.`, 'success');
    await picker.load();
    state.currentServer = null;
    await loadServer();
  } catch (error) {
    notifyError(error, '서버를 다시 사용하지 못했습니다.');
  }
}

async function selectServer(id) {
  if (id === state.serverId && state.currentServer) return;
  if (!confirmDiscardChanges(true)) return;
  state.serverId = id;
  history.replaceState(null, '', `/settings/server-management?id=${encodeURIComponent(id)}`);
  picker.setSelected(id);
  await loadServer();
}

async function loadManagedTemplates() {
  state.managedTemplates = await api('/api/templates').catch((error) => { notifyError(error, '스크립트 템플릿을 불러오지 못했습니다.'); return []; });
}

async function loadServer() {
  let server;
  try {
    server = await api(`/api/servers/${encodeURIComponent(state.serverId)}`);
  } catch (error) {
    notifyError(error, '서버 정보를 불러오지 못했습니다.');
    return;
  }

  state.currentServer = server;

  renderServerInfo(server);
  bindServerEdit(server);
  bindResultUpload();

  await loadScripts(server);
  await loadLatestResult(server.id);
  await loadResultHistory(server.id);
  await loadPolicy(state.serverId);
}

function renderServerInfo(server) {
  document.getElementById('server-title').textContent = `${server.id} - ${server.name}`;
  document.getElementById('server-id').textContent = server.id;
  document.getElementById('server-name').textContent = server.name;
  const roles = server.roles ?? [];
  renderPolicyRoleTabs(roles);
  document.getElementById('server-product').textContent = roles.map((role) => `${role}: ${server.products?.[role] || '미지정'}`).join(' · ');
  const httpPolicy = document.getElementById('http-check-policy');
  if (httpPolicy) httpPolicy.hidden = !roles.some((role) => role === 'WEB' || role === 'WAS');
  document.getElementById('server-ip').textContent = server.ip;
  renderResultPaths(server);
  document.getElementById('server-inactive-banner').hidden = server.enabled !== false;
  // 미사용 서버는 결과를 받지 않으므로 올리기 버튼을 숨깁니다(서버도 거부).
  document.getElementById('btn-upload-result').hidden = server.enabled === false;
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
  typeBadge.textContent = roleBadgeText(roles);
  typeCell.appendChild(typeBadge);

  const osCell = document.getElementById('server-os');
  osCell.replaceChildren();

  const osBadge = document.createElement('span');
  osBadge.className = 'server-badge';
  osBadge.textContent = server.os;
  osCell.appendChild(osBadge);
}

function renderPolicyRoleTabs(roles) {
  const nav = document.getElementById('policy-role-tabs');
  const tabs = policyRoleTabs(roles);
  const categories = tabs.map((tab) => tab.value);
  if (!categories.includes(state.activePolicyRole)) state.activePolicyRole = 'BASIC';
  nav.replaceChildren();
  for (const role of categories) {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('role', 'tab'); button.dataset.policyRoleTab = role;
    button.setAttribute('aria-selected', String(role === state.activePolicyRole));
    button.textContent = tabs.find((tab) => tab.value === role).label;
    nav.append(button);
  }
  updatePolicyRoleTabVisibility();
}

function updatePolicyRoleTabVisibility() {
  document.querySelectorAll('[data-policy-role-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.policyRoleTab === state.activePolicyRole)));
  document.querySelectorAll('[data-policy-role-panel]').forEach((panel) => panel.classList.toggle('is-inactive', panel.dataset.policyRolePanel !== state.activePolicyRole));
}

function bindServerEdit() {
  const dialog = document.getElementById('server-modal');
  const form = document.getElementById('server-modal-form');
  const roleContainer = document.getElementById('server-form-role-products');
  const renderRoleProducts = (selectedRoles = [], selectedProducts = {}) => {
    roleContainer.replaceChildren();
    roleChoices(selectedRoles).forEach(({ value: role, label: roleLabel }) => {
      const row = document.createElement('div'); row.className = 'role-product-row';
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = role; checkbox.checked = selectedRoles.includes(role);
      checkbox.className = 'role-choice-checkbox'; label.className = 'role-choice-label';
      label.append(checkbox, document.createTextNode(` ${roleLabel}`)); row.append(label);
      if (codeList('productsByRole', role).length) { const select = document.createElement('select'); select.dataset.roleProduct = role; select.add(new Option('제품 선택', '')); codeList('productsByRole', role).forEach(({ value, label }) => select.add(new Option(label, value))); select.value = selectedProducts[role] || ''; row.append(select); }
      checkbox.addEventListener('change', () => { row.classList.toggle('active', checkbox.checked); if (!checkbox.checked && row.querySelector('select')) row.querySelector('select').value = ''; }); checkbox.dispatchEvent(new Event('change')); roleContainer.appendChild(row);
    });
  };
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  let creating = false;
  form.addEventListener('input', () => { state.serverInfoDirty = true; });
  form.addEventListener('change', () => { state.serverInfoDirty = true; });
  const closeDialog = () => {
    if (state.serverInfoDirty && !confirm('서버 정보에 저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫을까요?')) return;
    state.serverInfoDirty = false;
    dialog.close();
  };
  document.getElementById('server-add').addEventListener('click', () => {
    creating = true;
    state.serverInfoDirty = false;
    document.getElementById('server-modal-title').textContent = '신규 서버 등록';
    document.getElementById('server-modal-save').textContent = '등록';
    document.getElementById('server-id-group').hidden = false;
    document.getElementById('server-form-id').required = true;
    form.reset();
    roleContainer.replaceChildren(); renderRoleProducts();
    dialog.showModal();
  });
  document.getElementById('btn-edit-server').addEventListener('click', () => {
    creating = false;
    state.serverInfoDirty = false;
    document.getElementById('server-modal-title').textContent = '서버 정보 수정';
    document.getElementById('server-modal-save').textContent = '변경 저장';
    document.getElementById('server-id-group').hidden = true;
    document.getElementById('server-form-id').required = false;
    document.getElementById('server-form-name').value = state.currentServer.name;
    renderRoleProducts(state.currentServer.roles ?? [], state.currentServer.products || {});
    document.getElementById('server-form-os').value = state.currentServer.os;
    document.getElementById('server-form-ip').value = state.currentServer.ip;
    document.getElementById('server-form-result-path').value = state.currentServer.resultPath || '';
    dialog.showModal();
  });
  document.getElementById('server-modal-close').addEventListener('click', closeDialog);
  document.getElementById('server-modal-cancel').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => {
    if (state.serverInfoDirty && !confirm('서버 정보에 저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫을까요?')) event.preventDefault();
    else state.serverInfoDirty = false;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const roles = [...roleContainer.querySelectorAll('input[type=checkbox]:checked')].map((input) => input.value);
    const products = Object.fromEntries([...roleContainer.querySelectorAll('select[data-role-product]')].filter((select) => roles.includes(select.dataset.roleProduct) && select.value).map((select) => [select.dataset.roleProduct, select.value]));
    try {
      const data = {
        // 수정할 때는 ID를 보내지 않습니다 (ID 변경 불가, 입력칸도 숨김).
        ...(creating ? { id: document.getElementById('server-form-id').value.trim() } : {}),
        name: document.getElementById('server-form-name').value.trim(),
        roles, products,
        os: document.getElementById('server-form-os').value,
        ip: document.getElementById('server-form-ip').value.trim(),
        resultPath: document.getElementById('server-form-result-path').value.trim(),
      };
      await api(creating ? '/api/servers' : `/api/servers/${encodeURIComponent(state.currentServer.id)}`, { method: creating ? 'POST' : 'PUT', body: data });
      state.serverInfoDirty = false;
      showToast(creating ? '서버를 등록했습니다.' : '서버 정보를 저장했습니다.', 'success');
      dialog.close();
      if (creating) { await loadServerPicker(); await selectServer(data.id); }
      else await loadServer();
    } catch (error) {
      notifyError(error, '서버 정보를 저장하지 못했습니다.');
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
  desc.textContent = scriptDescription(server);

  const commandTitle = document.createElement('div');
  commandTitle.className = 'command-title';
  commandTitle.textContent = server.os === 'Windows' ? '실행 명령어 (로그는 콘솔, 결과는 JSON 저장)' : '실행 명령어 (JSON 결과 저장)';

  const scriptFileName = server.os.toLowerCase() === 'windows' ? `${server.id}.ps1` : `${server.id}.sh`;
  const command = scriptCommand(server);

  const commandBox = document.createElement('pre');
  commandBox.className = 'command-box';
  commandBox.textContent = command;

  const buttons = document.createElement('div');
  buttons.className = 'button-area';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'btn btn-primary';
  downloadButton.textContent = '스크립트 다운로드';
  downloadButton.onclick = () => {
    downloadFile(`/api/scripts/generate/${encodeURIComponent(server.id)}`, `${server.id}.ps1`)
      .catch((error) => notifyError(error, '점검 스크립트를 만들지 못했습니다.'));
  };

  const copyButton = document.createElement('button');
  copyButton.className = 'btn';
  copyButton.textContent = '명령어 복사';
  copyButton.onclick = async () => {
    await navigator.clipboard.writeText(command);
    alert('실행 명령어가 복사되었습니다.');
  };

  // 미사용 서버는 스크립트를 내려받을 수 없습니다(서버도 거부).
  if (server.enabled !== false) buttons.appendChild(downloadButton);
  buttons.appendChild(copyButton);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(commandTitle);
  card.appendChild(commandBox);
  card.appendChild(buttons);

  container.appendChild(card);
}

async function loadLatestResult(id) {
  let result;
  try {
    result = await apiRequest(`/api/results/${encodeURIComponent(id)}/latest`);
  } catch (error) {
    document.getElementById('latest-result').textContent = '최근 점검 결과를 불러오지 못했습니다.';
    notifyError(error, '최근 점검 결과를 불러오지 못했습니다.');
    return;
  }

  if (!result.data) {
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

  badge.textContent = statusLabel(health);

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

  badge.textContent = statusLabel(health);

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

/* 결과 저장 경로(대상 서버가 보는 경로)와 OpsBox 수신함. 우선순위: 서버 지정 → OS별 기본값 → 스크립트 폴더 */
async function loadResultPathSettings() {
  state.resultPathSettings ??= await api('/api/settings/result-paths').catch(() => ({ windows: '', linux: '', inboxes: [] }));
  return state.resultPathSettings;
}



async function renderResultPaths(server) {
  const settings = await loadResultPathSettings();
  const { path, source } = effectiveResultPath(server, settings);
  const cell = document.getElementById('server-result-path');
  cell.replaceChildren();
  if (path) { const code = document.createElement('code'); code.textContent = path; cell.append(code, ' '); }
  const note = document.createElement('small'); note.textContent = path ? `(${source})` : source; cell.append(note);
  document.getElementById('server-inbox-path').textContent = settings.inboxes.join(' · ') || '-';
}

// 점검자가 내려받은 결과 파일 올리기 (여러 개 선택 가능)
function bindResultUpload() {
  const button = document.getElementById('btn-upload-result');
  const input = document.getElementById('upload-result-input');
  if (!button || !input || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (!files.length || !state.currentServer) return;
    button.disabled = true;
    const label = button.textContent;
    button.textContent = '올리는 중…';
    let imported = 0;
    let duplicates = 0;
    const failures = [];
    for (const file of files) {
      try {
        const stored = await api('/api/results/upload', {
          method: 'POST',
          body: { fileName: file.name, content: await file.text(), serverId: state.currentServer.id },
        });
        if (stored.outcome === 'imported') imported++;
        else duplicates++;
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }
    button.disabled = false;
    button.textContent = label;
    const parts = [];
    if (imported) parts.push(`${imported}건을 가져왔습니다`);
    if (duplicates) parts.push(`${duplicates}건은 이미 있는 결과입니다`);
    if (parts.length) showToast(`결과 파일 ${parts.join(', ')}.`, 'success');
    if (failures.length) showToast(`올리지 못한 파일 ${failures.length}건\n${failures.join('\n')}`, 'error', { duration: 15000 });
    if (imported) {
      await loadLatestResult(state.currentServer.id);
      await loadResultHistory(state.currentServer.id);
    }
  });
}

async function loadResultHistory(id) {
  try {
    renderResultHistory((await api(`/api/results/${encodeURIComponent(id)}`)) || []);
  } catch (error) {
    document.getElementById('result-history').textContent = '점검 이력을 불러오지 못했습니다.';
    notifyError(error, '점검 이력을 불러오지 못했습니다.');
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
    const health = healthOf(item);
    const badge = document.createElement('span');

    badge.className = `history-status ${health.toLowerCase()}`;
    badge.textContent = statusLabel(health);
    statusCell.appendChild(badge);

    const report = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'btn btn-small btn-primary';
    link.textContent = 'Report';
    link.href = `/reports/detail?serverId=${encodeURIComponent(state.currentServer.id)}&file=${encodeURIComponent(item.fileName)}`;
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



async function loadPolicy(id) {
  let config;
  try {
    config = await api(`/api/servers/${encodeURIComponent(id)}/check-config`);
  } catch (error) {
    notifyError(error, '점검 정책 설정을 불러오지 못했습니다.');
    return;
  }
  state.selectedQueryTemplateId = config.queryTemplateId || state.currentServer?.queryTemplateId || '';
  state.selectedCustomQueryTemplateIds = config.customQueryTemplateIds ?? state.currentServer?.customQueryTemplateIds ?? [];
  state.selectedRoleChecks = config.roleChecks ?? state.currentServer?.roleChecks ?? {};
  state.selectedCatalogPolicyIds = config.policyIds ?? state.currentServer?.policyIds ?? {};
  state.selectedScriptParts = config.scriptParts ?? state.currentServer?.scriptParts ?? {};
  const applicableCategories = policyRoleTabs(state.currentServer?.roles ?? []).map((tab) => tab.value);
  applicableCategories.forEach((category) => {
    const currentId = state.selectedCatalogPolicyIds[category];
    const currentPolicy = state.policies.find((item) => item.id === currentId && item.os === state.currentServer?.os && item.category === category);
    const policy = currentPolicy ?? state.policies.find((item) => item.os === state.currentServer?.os && item.category === category);
    if (policy) state.selectedCatalogPolicyIds[category] = policy.id;
  });
  for (const [category, policyId] of Object.entries(state.selectedCatalogPolicyIds)) {
    const policy = state.policies.find((item) => item.id === policyId);
    if (!policy || policy.os !== state.currentServer?.os) continue;
    if (category === 'BASIC') state.selectedBasicPolicyChecks = policyCheckIds(policy);
    else if (category !== 'BASIC') state.selectedRoleChecks[category] = policyCheckIds(policy);
  }
  const basicPolicy = getSelectedBasicPolicy();
  basicPolicy?.items.filter((item) => item.enabled).forEach((item) => {
    if (!state.selectedScriptParts[item.id]) {
      const defaultTemplate = getDefaultScriptTemplate(item.id);
      if (defaultTemplate) state.selectedScriptParts[item.id] = defaultTemplate.id;
    }
  });
  state.selectedRolePolicySettings = config.rolePolicySettings ?? state.currentServer?.rolePolicySettings ?? {};
  renderPolicyScriptControls(config.scriptParts ?? state.currentServer?.scriptParts ?? {}, config.queryTemplateId ?? state.currentServer?.queryTemplateId ?? '', state.selectedRoleChecks);
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
  return [...document.querySelectorAll('.directory-row')].map((row) => directoryFromInputs(
    row.querySelector('.directory-path').value,
    row.querySelector('.directory-warning').value,
    row.querySelector('.directory-critical').value,
  ));
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
  codeList('portProtocols').forEach(({ value, label }) => protocol.add(new Option(label, value)));
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
    const scriptParts = { ...state.selectedScriptParts };
    const rolePolicySettings = structuredClone(state.selectedRolePolicySettings);
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
      if (!isDbQueryItem(item)) return;
      rolePolicySettings[item] = {
        ...(rolePolicySettings[item] ?? {}),
        instanceTargets: input.value.split(/\r?\n/).map((target) => target.trim()).filter(Boolean),
      };
    });
    document.querySelectorAll('[data-policy-item-input]').forEach((input) => {
      const [item, key] = input.dataset.policyItemInput.split('::');
      const setting = rolePolicySettings[item] ?? {};
      const values = { ...(setting.inputs ?? {}) };
      values[key] = input.type === 'number' ? Number(input.value) : input.value;
      rolePolicySettings[item] = { ...setting, inputs: values };
    });
    const queryTemplateId = '';
    await api(`/api/servers/${encodeURIComponent(state.serverId)}/check-config`, {
      method: 'PUT',
      body: {
        processes,
        directories,
        fileChecks,
        ports,
        httpChecks,
        scriptParts,
        roleChecks: state.selectedRoleChecks,
        rolePolicySettings,
        queryTemplateId,
        customQueryTemplateIds: state.selectedCustomQueryTemplateIds,
        policyIds: state.selectedCatalogPolicyIds,
      },
    });

    state.policyDirty = false;
    showToast('정책이 저장되었습니다.', 'success');
    state.currentServer.processes = processes;
    state.currentServer.directories = directories;
    state.currentServer.fileChecks = fileChecks;
    state.currentServer.ports = ports;
    state.currentServer.httpChecks = httpChecks;
    state.currentServer.scriptParts = scriptParts;
    state.currentServer.roleChecks = state.selectedRoleChecks;
    state.selectedRolePolicySettings = rolePolicySettings;
    state.currentServer.rolePolicySettings = rolePolicySettings;
    state.currentServer.queryTemplateId = queryTemplateId;
    state.currentServer.customQueryTemplateIds = state.selectedCustomQueryTemplateIds;
    state.currentServer.policyIds = state.selectedCatalogPolicyIds;
    renderPolicyScriptControls(scriptParts, queryTemplateId);
  } catch (error) {
    notifyError(error, '정책을 저장하지 못했습니다.');
    if (error?.errors?.length) focusPolicyValidationError(error.errors[0]);
  }
}

function focusPolicyValidationError(error) {
  if (!error?.field) return;
  const field = String(error.field);
  const roleSetting = field.match(/^rolePolicySettings\.([^.]+)\.([^.]+)/);
  let target;
  if (roleSetting) {
    const [, item, setting] = roleSetting;
    const row = document.querySelector(`[data-role-policy-item="${CSS.escape(item)}"]`);
    if (setting === 'queryTemplateId') target = row?.querySelector('.policy-script-select');
    else if (setting === 'instanceTargets') target = row?.querySelector(`[data-db-instance-targets="${CSS.escape(item)}"]`);
    else if (setting === 'logDirectories') target = row?.querySelector(`[data-log-directories="${CSS.escape(item)}"]`);
    else if (setting === 'periodDays') target = row?.querySelector(`[data-log-period-days="${CSS.escape(item)}"]`);
    target ??= row;
  } else if (field.startsWith('roleChecks.')) {
    target = document.getElementById(`${field.split('.')[1].toLowerCase()}-role-policy`);
  } else if (field.startsWith('scriptParts.')) {
    target = document.querySelector(`[data-role-policy-item="${CSS.escape(field.split('.')[1])}"] .policy-script-select`);
  } else {
    const indexedRows = { processes: '.process-row', directories: '.directory-row', fileChecks: '.file-check-row', ports: '.port-row', httpChecks: '.http-check-row' };
    const selector = indexedRows[field];
    if (selector && Number.isInteger(error.index)) target = document.querySelectorAll(selector)[error.index];
    if (!target) target = document.getElementById(`${field.replace(/([A-Z])/g, '-$1').toLowerCase()}-container`);
  }
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusTarget = target.matches('input, select, textarea, button, [tabindex]')
    ? target
    : target.querySelector('input, select, textarea, button, [tabindex]') ?? target;
  if (!focusTarget.matches('input, select, textarea, button, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
}

function renderPolicyScriptControls(selectedParts = {}, queryTemplateId = '', roleChecks = state.selectedRoleChecks) {
  if (!state.currentServer) return;
  const roles = state.currentServer.roles ?? [];
  const products = state.currentServer.products || {};
  state.selectedScriptParts = Object.fromEntries(Object.entries(selectedParts).filter(([item]) => !isDbQueryItem(item)));
  state.selectedRoleChecks = structuredClone(roleChecks || {});
  state.selectedRoleChecks.DB = (state.selectedRoleChecks.DB ?? []).filter((item) => item !== 'DB_CUSTOM_QUERY');
  state.selectedCustomQueryTemplateIds = [];
  state.selectedQueryTemplateId = queryTemplateId || '';
  const isWindows = state.currentServer.os === 'Windows';
  populatePolicySources();
  const commonPanel = document.getElementById('common-script-policy');
  const commonItems = ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'].filter((item) => state.selectedBasicPolicyChecks.includes(item));
  commonPanel.hidden = commonItems.length === 0;
  const commonControls = document.getElementById('common-script-controls');
  commonControls.replaceChildren();
  commonItems.forEach((item) => commonControls.appendChild(createPolicyScriptControl(item, getScriptItemLabel(item), true)));
  renderBasicPolicyItems();

  const policyControls = [
    ['PROCESS', 'process-script-control'], ['DIRECTORY', 'directory-script-control'],
    ['FILE_SIZE', 'file-script-control'], ['PORT', 'port-script-control'], ['HTTP', 'http-script-control'],
  ];
  policyControls.forEach(([item, id]) => {
    const container = document.getElementById(id);
    container.replaceChildren(createPolicyScriptControl(item, getScriptItemLabel(item)));
    container.hidden = !state.selectedBasicPolicyChecks.includes(item) || (item === 'HTTP' && !roles.some((role) => role === 'WEB' || role === 'WAS'));
    const section = container.closest('.policy-section');
    if (section) section.hidden = container.hidden;
  });

  renderRolePolicyGroups(roles, products, isWindows);
  renderFinalJsonExample(getActiveScriptItems(roles, state.selectedRoleChecks), state.selectedRoleChecks);
}

function getSelectedBasicPolicy() {
  return state.policies.find((policy) => policy.id === state.selectedCatalogPolicyIds.BASIC && policy.os === state.currentServer?.os && policy.category === 'BASIC');
}

function renderBasicPolicyItems() {
  const container = document.getElementById('basic-policy-items');
  const commonPanel = document.getElementById('common-script-policy');
  if (!container || !commonPanel) return;
  const builtInIds = new Set(codeList('scriptItems').map((item) => item.value));
  const policy = getSelectedBasicPolicy();
  const items = policy
    ? policy.items.filter((item) => item.enabled)
    : state.selectedBasicPolicyChecks.map((id) => ({ id, name: getScriptItemLabel(id), enabled: true, executor: { type: 'SCRIPT' }, inputs: [], result: { components: [] } }));
  state.basicDetailSections ??= new Map([
    ['PROCESS', document.getElementById('process-script-control')?.closest('.policy-section')],
    ['DIRECTORY', document.getElementById('directory-script-control')?.closest('.policy-section')],
    ['FILE_SIZE', document.getElementById('file-script-control')?.closest('.policy-section')],
    ['PORT', document.getElementById('port-script-control')?.closest('.policy-section')],
    ['HTTP', document.getElementById('http-script-control')?.closest('.policy-section')],
  ]);
  const detailSections = state.basicDetailSections;
  container.replaceChildren();
  commonPanel.hidden = true;
  detailSections.forEach((section) => { if (section) section.hidden = true; });
  items.forEach((item) => {
    const label = item.name || getScriptItemLabel(item.id);
    const section = detailSections.get(item.id);
    if (builtInIds.has(item.id) && section) {
      const title = section.querySelector('h3');
      if (title) title.textContent = label;
      const help = document.createElement('p');
      help.className = 'policy-help basic-policy-item-summary';
      help.textContent = `${item.executor?.type || 'SCRIPT'} · ${(item.result?.components || []).map((component) => component.type).join(', ') || '결과 구성 미지정'}`;
      section.querySelector('.section-header')?.after(help);
      [...section.querySelectorAll('.basic-policy-item-summary')].slice(0, -1).forEach((entry) => entry.remove());
      appendBasicPolicyInputs(item, section);
      section.hidden = false;
      container.appendChild(section);
      return;
    }
    const row = document.createElement('section');
    row.className = 'policy-section role-policy-row';
    row.dataset.basicPolicyItem = item.id;
    const description = document.createElement('div');
    description.className = 'role-policy-description';
    const name = document.createElement('strong');
    name.textContent = label;
    const details = document.createElement('small');
    details.textContent = `${item.executor?.type || 'SCRIPT'} · ${(item.result?.components || []).map((component) => component.type).join(', ') || '결과 구성 미지정'}`;
    description.append(name, details);
    appendBasicPolicyInputs(item, description);
    const control = createPolicyScriptControl(item.id, label);
    row.append(description, control);
    container.appendChild(row);
  });
}

function appendBasicPolicyInputs(item, host) {
  host.querySelectorAll('.basic-policy-input-field').forEach((field) => field.remove());
  (item.inputs ?? []).forEach((input) => {
    const field = document.createElement('label');
    field.className = 'role-policy-option basic-policy-input-field';
    const fieldName = document.createElement('span');
    fieldName.textContent = `${input.label || input.key}${input.required ? ' *' : ''}`;
    const stored = state.selectedRolePolicySettings?.[item.id]?.inputs?.[input.key];
    const defaultValue = input.defaultValue ?? '';
    if (input.scope === 'SERVER') {
      let control;
      if (input.type === 'PATH_LIST' || input.type === 'TARGET_LIST') {
        control = document.createElement('textarea');
        control.rows = 2;
        control.value = String(stored ?? defaultValue).replaceAll(';', '\n');
        control.placeholder = input.type === 'TARGET_LIST' ? '한 줄에 하나씩, 호스트:포트 (예: db01:1433)' : '한 줄에 하나씩 경로';
      } else {
        control = document.createElement('input');
        control.type = input.type === 'NUMBER' || input.type === 'PORT' ? 'number' : 'text';
        control.value = String(stored ?? defaultValue);
        if (input.type === 'PORT') { control.min = '1'; control.max = '65535'; }
      }
      control.dataset.policyItemInput = `${item.id}::${input.key}`;
      control.required = input.required === true;
      field.append(fieldName, control);
    } else {
      const policyValue = document.createElement('small');
      policyValue.textContent = `정책 기본값: ${String(defaultValue || '미지정')}`;
      field.append(fieldName, policyValue);
    }
    host.appendChild(field);
  });
}

function populatePolicySources() {
  const os = state.currentServer.os;
  const basic = document.getElementById('basic-policy-source');
  [basic, ...['WEB', 'WAS', 'DB'].map((role) => document.getElementById(`${role.toLowerCase()}-policy-source`))].forEach((select, index) => {
    const category = index === 0 ? 'BASIC' : ['WEB', 'WAS', 'DB'][index - 1];
    const oldValue = select.value;
    select.replaceChildren(new Option('정책 선택', ''));
    state.policies.filter((policy) => policy.os === os && policy.category === category).forEach((policy) => select.add(new Option(policy.name, policy.id)));
    const savedPolicyId = state.selectedCatalogPolicyIds[category];
    select.value = savedPolicyId || oldValue || '';
  });
}

function applyCatalogPolicy(category) {
  const select = document.getElementById(`${category === 'BASIC' ? 'basic' : category.toLowerCase()}-policy-source`);
  const policy = state.policies.find((item) => item.id === select.value);
  if (!policy) { alert('적용할 정책을 선택하세요.'); return; }
  if (category === 'BASIC') {
    state.selectedBasicPolicyChecks = policyCheckIds(policy);
    state.selectedCatalogPolicyIds.BASIC = policy.id;
    policy.items?.forEach((item) => {
      if (item.executor?.type !== 'SQL_QUERY') state.selectedScriptParts[item.id] = item.executor?.templateId || getDefaultScriptTemplate(item.id)?.id || state.selectedScriptParts[item.id];
    });
    renderPolicyScriptControls(state.selectedScriptParts, state.selectedQueryTemplateId, state.selectedRoleChecks);
    return;
  }
  state.selectedCatalogPolicyIds[category] = policy.id;
  state.selectedRoleChecks[category] = policyCheckIds(policy);
  policy.items?.forEach((item) => {
    if (item.executor?.type === 'SQL_QUERY') state.selectedRolePolicySettings[item.id] = { ...(state.selectedRolePolicySettings[item.id] || {}), queryTemplateId: item.executor.templateId || '', dbms: item.executor.dbms };
    else if (item.executor?.templateId) state.selectedScriptParts[item.id] = item.executor.templateId;
  });
  renderRolePolicyGroups(state.currentServer.roles ?? [], state.currentServer.products || {}, state.currentServer.os === 'Windows');
  renderFinalJsonExample(getActiveScriptItems(state.currentServer.roles ?? [], state.selectedRoleChecks), state.selectedRoleChecks);
}

document.getElementById('basic-policy-apply')?.addEventListener('click', () => applyCatalogPolicy('BASIC'));
document.querySelectorAll('[data-policy-apply]').forEach((button) => button.addEventListener('click', () => applyCatalogPolicy(button.dataset.policyApply)));

function renderRolePolicyGroups(roles, products, isWindows) {
  ['WEB', 'WAS', 'DB'].forEach((role) => {
    const suffix = role.toLowerCase();
    const block = document.getElementById(`${suffix}-role-policy`);
    const container = document.getElementById(`${suffix}-role-policy-controls`);
    block.hidden = !roles.includes(role);
    container.replaceChildren();
    if (block.hidden) return;
    document.getElementById(`${suffix}-role-policy-title`).textContent = `${role} 점검 · ${products[role] || role}`;
    const currentItems = state.selectedRoleChecks[role] ?? [];
    const list = document.createElement('div'); list.className = 'role-policy-list';
    currentItems.forEach((item) => {
      const assignedPolicy = state.policies.find((entry) => entry.id === state.selectedCatalogPolicyIds[role] && entry.category === role);
      const definition = assignedPolicy?.items?.find((entry) => entry.id === item);
      const policy = codeList('scriptItems').find((entry) => entry.value === item) || definition || getPolicyItemDefinition(item);
      const policyLabel = policy?.label || policy?.name || item;
      const row = document.createElement('div'); row.className = 'role-policy-row';
      row.dataset.rolePolicyItem = item;
      const description = document.createElement('div'); description.className = 'role-policy-description';
      const name = document.createElement('strong'); name.textContent = policyLabel;
      const help = document.createElement('small'); help.textContent = policy?.description || '점검 결과는 연결된 항목별 스크립트가 생성합니다.';
      description.append(name, help);
      appendBasicPolicyInputs(definition || { id: item, inputs: [] }, description);
      const scriptControl = createPolicyScriptControl(item, policyLabel);
      if (['WEB_LOG', 'WAS_LOG'].includes(item)) {
        const setting = state.selectedRolePolicySettings[item] ?? { logDirectories: [], periodDays: 7 };
        const folderField = document.createElement('label'); folderField.className = 'role-policy-option';
        const folderLabel = document.createElement('span'); folderLabel.textContent = `${role} 로그 폴더 (한 줄에 하나씩)`;
        const folderInput = document.createElement('textarea'); folderInput.rows = 2; folderInput.placeholder = item === 'WEB_LOG' ? '예: C:\\WebtoB\\log' : '예: C:\\JEUS6\\domains\\domain1\\servers\\server1\\logs'; folderInput.value = (setting.logDirectories ?? []).join('\n');
        folderInput.setAttribute('data-log-directories', item);
        const folderHelp = document.createElement('small'); folderHelp.textContent = '지정한 폴더의 하위 폴더도 함께 검사합니다.';
        folderInput.addEventListener('input', () => {
          state.selectedRolePolicySettings[item] = { ...setting, ...(state.selectedRolePolicySettings[item] ?? {}), logDirectories: folderInput.value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean) };
        });
        folderField.append(folderLabel, folderInput, folderHelp);
        description.appendChild(folderField);
        const periodField = document.createElement('label'); periodField.className = 'role-policy-option';
        const periodLabel = document.createElement('span'); periodLabel.textContent = '조회 기간 (최근 일)';
        const periodInput = document.createElement('input'); periodInput.type = 'number'; periodInput.min = '1'; periodInput.max = '90'; periodInput.step = '1'; periodInput.value = String(setting.periodDays ?? 7);
        periodInput.setAttribute('data-log-period-days', item);
        periodInput.addEventListener('input', () => {
          const periodDays = Number(periodInput.value);
          state.selectedRolePolicySettings[item] = { ...setting, ...(state.selectedRolePolicySettings[item] ?? {}), periodDays };
        });
        periodField.append(periodLabel, periodInput);
        description.appendChild(periodField);
      }
      const targetHint = role === 'DB' ? dbTargetHint(products.DB, isWindows) : null;
      if (targetHint) {
        const setting = state.selectedRolePolicySettings[item] ?? {};
        const instanceField = document.createElement('label'); instanceField.className = 'role-policy-option';
        const instanceLabel = document.createElement('span'); instanceLabel.textContent = targetHint.label;
        const instanceInput = document.createElement('textarea'); instanceInput.rows = 2;
        instanceInput.placeholder = targetHint.placeholder;
        const inheritedTargets = state.selectedRolePolicySettings.DB_INSTANCE_STATUS?.instanceTargets;
        // Windows MSSQL은 서버 IP의 1433 포트가 기본값, Linux는 비워 두면 이 서버의 기본 접속(로컬)
        const initialTargets = Array.isArray(setting.instanceTargets)
          ? setting.instanceTargets
          : inheritedTargets?.length ? inheritedTargets : (isWindows ? [`${state.currentServer.ip},1433`] : []);
        instanceInput.value = initialTargets.join('\n');
        instanceInput.setAttribute('data-db-instance-targets', item);
        const instanceHelp = document.createElement('small');
        instanceHelp.textContent = `${item === 'DB_CUSTOM_QUERY' ? '선택한 사용자 쿼리를' : '이 항목에서 선택한 SQL 쿼리를'} 입력한 각 대상에서 실행합니다. ${targetHint.help}`;
        instanceInput.addEventListener('input', () => {
          state.selectedRolePolicySettings[item] = {
            ...(state.selectedRolePolicySettings[item] ?? setting),
            instanceTargets: instanceInput.value.split(/\r?\n/).map((target) => target.trim()).filter(Boolean),
          };
        });
        instanceField.append(instanceLabel, instanceInput, instanceHelp);
        description.appendChild(instanceField);
      }
      if (item === 'DB_CUSTOM_QUERY') {
        const queryCount = document.createElement('small'); queryCount.className = 'custom-query-count';
        queryCount.textContent = `쿼리 ${state.selectedCustomQueryTemplateIds.length}개 선택`;
        scriptControl.appendChild(queryCount);
      }
      row.append(description, scriptControl);
      list.appendChild(row);
    });
    container.appendChild(list);
  });
  updatePolicyRoleTabVisibility();
}

/** DB 쿼리 접속 대상 입력 안내 (없으면 대상 입력칸을 보이지 않음) */



function getDefaultQueryTemplateId(item) { return defaultQueryTemplateId(state.queryPrefixes, state.currentServer?.products?.DB, item); }

/** 실제로 쓸 쿼리 id: 선택한 쿼리가 서버 DB 제품용이면 그것, 아니면 제품 기본 쿼리 */
/** 실제로 쓸 쿼리 id: 선택한 쿼리가 서버 DB 제품용이면 그것, 아니면 제품 기본 쿼리 */
function resolveQueryTemplateId(item, selectedId) { return resolveQueryTemplate(state.managedTemplates, state.queryPrefixes, state.currentServer?.products?.DB, item, selectedId); }

function getScriptItemLabel(item) {
  return codeList('scriptItems').find((entry) => entry.value === item)?.label || item;
}

function usesQueryTemplate(item) {
  if (isDbQueryItem(item)) return true;
  const selectedId = state.selectedScriptParts[item];
  const template = selectedId
    ? state.managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  return template?.usesQueryTemplate === true;
}

function createPolicyScriptControl(item, label, showLabel = false) {
  const wrapper = document.createElement('div'); wrapper.className = `policy-script-control${showLabel ? ' is-common' : ''}`;
  wrapper.hidden = false;
  if (showLabel) { const title = document.createElement('label'); title.textContent = label; wrapper.appendChild(title); }
  if (isDbQueryItem(item)) {
    const setting = state.selectedRolePolicySettings[item] ?? {};
    const query = state.managedTemplates.find((template) => template.id === resolveQueryTemplateId(item, setting.queryTemplateId) && template.kind === 'QUERY');
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'btn btn-small policy-script-select';
    choose.textContent = item === 'DB_CUSTOM_QUERY' ? `쿼리 ${state.selectedCustomQueryTemplateIds.length}개 선택` : (query?.name || `${label} 쿼리 선택`);
    choose.setAttribute('aria-label', `${label} DB 쿼리 선택`);
    choose.addEventListener('click', () => openScriptTemplatePicker(item, label));
    wrapper.append(choose);
    return wrapper;
  }
  const available = state.managedTemplates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === state.currentServer.os && template.item === item);
  const selectedId = state.selectedScriptParts[item] || '';
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
    if (!isDbQueryItem(dialog.dataset.item)) updateQueryTemplatePicker(dialog.dataset.item);
  });
  document.getElementById('db-query-template-select').addEventListener('change', updateSelectedTemplateEditButton);
  document.getElementById('script-template-picker-save').addEventListener('click', () => {
    state.policyDirty = true;
    const item = dialog.dataset.item;
    const templateId = document.getElementById('script-template-picker-select').value;
    if (isDbQueryItem(item)) {
      const setting = state.selectedRolePolicySettings[item] ?? {};
      if (item === 'DB_CUSTOM_QUERY') state.selectedCustomQueryTemplateIds = [...document.getElementById('db-query-template-select').selectedOptions].map((option) => option.value).filter(Boolean);
      else state.selectedRolePolicySettings[item] = { ...setting, queryTemplateId: document.getElementById('db-query-template-select').value || getDefaultQueryTemplateId(item) };
      dialog.close();
      renderPolicyScriptControls(state.selectedScriptParts, state.selectedQueryTemplateId);
      return;
    }
    if (templateId) state.selectedScriptParts[item] = templateId; else delete state.selectedScriptParts[item];
    const queryOptionHidden = document.getElementById('db-query-template-option').hidden;
    if (item === 'DB_INSTANCE_STATUS') state.selectedQueryTemplateId = queryOptionHidden ? '' : document.getElementById('db-query-template-select').value;
    if (item === 'DB_CUSTOM_QUERY') state.selectedCustomQueryTemplateIds = queryOptionHidden ? [] : [...document.getElementById('db-query-template-select').selectedOptions].map((option) => option.value).filter(Boolean);
    dialog.close();
    renderPolicyScriptControls(state.selectedScriptParts, state.selectedQueryTemplateId);
  });
}

function updateSelectedTemplateEditButton() {
  const item = document.getElementById('script-template-picker').dataset.item;
  if (isDbQueryItem(item)) {
    const queryId = document.getElementById('db-query-template-select').value;
    const query = state.managedTemplates.find((candidate) => candidate.id === queryId && candidate.kind === 'QUERY');
    const editButton = document.getElementById('script-template-picker-edit');
    editButton.hidden = !query;
    editButton.textContent = '선택 쿼리 수정';
    return;
  }
  const selectedId = document.getElementById('script-template-picker-select').value;
  const template = selectedId
    ? state.managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  const editButton = document.getElementById('script-template-picker-edit');
  editButton.hidden = !template;
  editButton.textContent = selectedId ? '선택 스크립트 수정' : '기본 스크립트 수정';
}

function openScriptTemplatePicker(item, label) {
  const dialog = document.getElementById('script-template-picker');
  dialog.dataset.item = item;
  document.getElementById('script-template-picker-title').textContent = isDbQueryItem(item) ? `${label} 쿼리 선택` : `${label} 스크립트 선택`;
  const dbmsContext = isDbQueryItem(item) ? ` · ${getServerDbms() || 'DBMS 미지정'}` : '';
  document.getElementById('script-template-picker-label').textContent = `${state.currentServer.name} · ${state.currentServer.os}${dbmsContext}`;
  dialog.showModal();
  loadManagedTemplates().then(() => populateScriptTemplatePicker(item));
}

function populateScriptTemplatePicker(item) {
  const select = document.getElementById('script-template-picker-select');
  const isDatabasePolicy = isDbQueryItem(item);
  select.closest('.form-group').hidden = isDatabasePolicy;
  const defaultTemplate = getDefaultScriptTemplate(item);
  const scriptItem = isDatabasePolicy ? 'DB_QUERY_RUNNER' : item;
  const scriptDefault = getDefaultScriptTemplate(scriptItem);
  select.replaceChildren(new Option(
    scriptDefault ? `기본 제공 · ${scriptDefault.name}` : `기본값 사용 · ${defaultTemplate?.name || getDefaultScriptTemplateName(item)}`,
    '',
  ));
  const available = state.managedTemplates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === state.currentServer.os);
  const selectableTemplates = available;
  let selectedId = state.selectedScriptParts[scriptItem] || '';
  if (selectedId && isDefaultScriptTemplate(available.find((template) => template.id === selectedId) || {}, scriptItem)) {
    delete state.selectedScriptParts[scriptItem];
    selectedId = '';
  }
  selectableTemplates.forEach((template) => {
    const category = '사용자 지정';
    select.add(new Option(`${category} · ${template.name}`, template.id));
  });
  if (selectedId && !selectableTemplates.some((template) => template.id === selectedId)) select.add(new Option('저장된 템플릿을 찾을 수 없음', selectedId));
  select.value = selectedId;
  updateSelectedTemplateEditButton();
  const querySelect = document.getElementById('db-query-template-select');
  querySelect.multiple = item === 'DB_CUSTOM_QUERY';
  querySelect.size = querySelect.multiple ? 7 : 1;
  querySelect.replaceChildren();
  if (isDatabasePolicy) {
    const setting = state.selectedRolePolicySettings[item] ?? {};
    const dbms = getServerDbms();
    const compatibleQueries = getCompatibleDbQueries(dbms);
    const queryLabel = document.querySelector('#db-query-template-option label');
    queryLabel.textContent = `${getScriptItemLabel(item)} 쿼리 템플릿 · ${dbms || 'DBMS 미지정'}`;
    if (!dbms) querySelect.add(new Option('서버 기본 정보에서 DB 제품을 지정하세요', ''));
    else if (compatibleQueries.length === 0) querySelect.add(new Option(`${dbms}용 쿼리 템플릿이 없습니다`, ''));
    if (item !== 'DB_CUSTOM_QUERY' && dbms === 'MSSQL' && !compatibleQueries.some((template) => template.id === `WINDOWS-QUERY-${item}`)) querySelect.add(new Option('기본 쿼리 사용', `WINDOWS-QUERY-${item}`));
    compatibleQueries.forEach((template) => querySelect.add(new Option(template.name, template.id)));
    if (item === 'DB_CUSTOM_QUERY') [...querySelect.options].forEach((option) => { option.selected = state.selectedCustomQueryTemplateIds.includes(option.value); });
    else querySelect.value = resolveQueryTemplateId(item, setting.queryTemplateId) || getDefaultQueryTemplateId(item);
  } else if (item === 'DB_INSTANCE_STATUS' || item === 'DB_CUSTOM_QUERY') {
    state.managedTemplates.filter((template) => template.enabled && template.kind === 'QUERY').forEach((template) => querySelect.add(new Option(template.name, template.id)));
    querySelect.value = state.selectedQueryTemplateId;
  }
  updateSelectedTemplateEditButton();
  document.getElementById('db-query-template-option').hidden = !isDatabasePolicy;
  document.getElementById('db-query-template-help').hidden = true;
  document.querySelector('#db-query-template-option label').textContent = item === 'DB_CUSTOM_QUERY'
    ? `실행할 DB 쿼리 템플릿 · ${getServerDbms() || 'DBMS 미지정'} (여러 개 선택 가능)`
    : `${getScriptItemLabel(item)} 쿼리 템플릿 · ${getServerDbms() || 'DBMS 미지정'}`;
}

function getServerDbms() {
  const product = state.currentServer?.products?.DB || '';
  return String(product || '').trim().toLocaleUpperCase();
}

function getCompatibleDbQueries(dbms) { return compatibleDbQueries(state.managedTemplates, dbms); }

function updateQueryTemplatePicker(item) {
  const queryOption = document.getElementById('db-query-template-option');
  const selectedId = document.getElementById('script-template-picker-select').value;
  const scriptTemplate = selectedId
    ? state.managedTemplates.find((template) => template.id === selectedId && template.kind === 'SCRIPT_PART')
    : state.managedTemplates.find((template) => template.id === `WINDOWS-PART-${item}` && template.kind === 'SCRIPT_PART');
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
  const item = document.getElementById('script-template-picker').dataset.item;
  if (isDbQueryItem(item)) {
    const queryId = document.getElementById('db-query-template-select').value;
    const query = state.managedTemplates.find((candidate) => candidate.id === queryId && candidate.kind === 'QUERY');
    if (!query) { alert('수정할 DB 쿼리를 선택하세요.'); return; }
    window.open(`/settings/script-management?id=${encodeURIComponent(query.id)}`, '_blank', 'noopener');
    return;
  }
  const selectedId = document.getElementById('script-template-picker-select').value;
  const template = selectedId
    ? state.managedTemplates.find((candidate) => candidate.id === selectedId && candidate.kind === 'SCRIPT_PART')
    : getDefaultScriptTemplate(item);
  if (!template) { alert('수정할 스크립트를 찾을 수 없습니다. 스크립트 관리에서 확인하세요.'); return; }
  window.open(`/settings/script-management?id=${encodeURIComponent(template.id)}`, '_blank', 'noopener');
}

function getDefaultScriptTemplate(item) { return defaultScriptTemplate(state.managedTemplates, state.currentServer?.os, item); }

function getDefaultScriptTemplateName(item) { return defaultScriptTemplateName(state.currentServer?.os, item); }

function isDefaultScriptTemplate(template, item) { return isDefaultScript(template, state.currentServer?.os, item); }

function getActiveScriptItems(roles, roleChecks) {
  return activeScriptItems({ server: state.currentServer, roles, roleChecks, basicPolicy: getSelectedBasicPolicy(), scriptItems: codeList('scriptItems') });
}

function renderFinalJsonExample(activeItems, roleChecks) {
  const roles = state.currentServer.roles ?? [];
  const example = {
    schemaVersion: 2,
    server: { id: state.currentServer.id, name: state.currentServer.name, roles, products: state.currentServer.products || {} },
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
    WEB: { status: 'Healthy', product: state.currentServer.products?.WEB, detail: { status: 'Healthy' } },
    WAS: { status: 'Healthy', product: state.currentServer.products?.WAS, items: [{ processId: 1200, heapUsagePercent: 48, status: 'Healthy' }] },
    DATABASE: { status: 'Healthy', product: state.currentServer.products?.DB, detail: { serverName: 'SQL01', databaseCount: 4, offlineCount: 0 } },
  };
  const keys = { PROCESS: 'processes', DIRECTORY: 'directories', FILE_SIZE: 'files', PORT: 'ports', HTTP: 'http', WEB: 'web', WAS: 'was', DATABASE: 'database' };
  activeItems.forEach((item) => { if (shapes[item]) example.checks[keys[item]] = shapes[item]; });
  const basicPolicy = getSelectedBasicPolicy();
  const builtInIds = new Set(codeList('scriptItems').map((item) => item.value));
  const customBasicItems = (basicPolicy?.items ?? []).filter((item) => item.enabled && !builtInIds.has(item.id));
  if (customBasicItems.length) {
    example.checks.policyItems = customBasicItems.map((item) => ({
      role: 'BASIC', item: item.id, name: item.name,
      result: item.result, executorType: item.executor?.type, status: 'NotCollected',
      message: '연결된 점검 스크립트가 결과를 기록하면 상세 결과가 표시됩니다.',
    }));
  }
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

init().catch((error) => notifyError(error, '서버 상세 화면을 초기화하지 못했습니다.'));
