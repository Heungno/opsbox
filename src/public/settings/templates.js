let templates = [];
let editingId = '';
let hasUnsavedChanges = false;
let pendingTemplate = null;
let commonCodes = null;

const form = document.getElementById('template-form');
const kind = document.getElementById('template-kind');
const help = document.getElementById('template-help');
const list = document.getElementById('template-list');
const editor = document.getElementById('template-content');
const highlight = document.querySelector('#template-highlight code');

kind.addEventListener('change', updateFormMode);
document.getElementById('template-item').addEventListener('change', renderOutputExample);
document.getElementById('template-filter').addEventListener('change', loadTemplates);
document.getElementById('btn-template-reset').addEventListener('click', resetForm);
form.addEventListener('submit', saveTemplate);
form.addEventListener('input', () => { hasUnsavedChanges = true; });
form.addEventListener('change', () => { hasUnsavedChanges = true; });
document.getElementById('unsaved-template-save-open').addEventListener('click', async () => {
  if (await persistTemplate()) { document.getElementById('unsaved-template-dialog').close(); openTemplate(pendingTemplate); }
});
document.getElementById('unsaved-template-discard-open').addEventListener('click', () => {
  document.getElementById('unsaved-template-dialog').close(); hasUnsavedChanges = false; openTemplate(pendingTemplate);
});
document.getElementById('unsaved-template-continue').addEventListener('click', () => {
  document.getElementById('unsaved-template-dialog').close(); pendingTemplate = null;
});
editor.addEventListener('input', renderHighlightedTemplate);
editor.addEventListener('scroll', () => {
  const layer = document.getElementById('template-highlight');
  layer.scrollTop = editor.scrollTop;
  layer.scrollLeft = editor.scrollLeft;
});

function renderHighlightedTemplate() {
  const source = editor.value || ' ';
  const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  highlight.innerHTML = source.split(/(\{\{[A-Z_]+\}\})/g).map((part) => /^\{\{[A-Z_]+\}\}$/.test(part)
    ? `<span class="template-variable">${escapeHtml(part)}</span>`
    : escapeHtml(part)).join('');
}

function updateFormMode() {
  const script = kind.value === 'SCRIPT' || kind.value === 'SCRIPT_PART';
  const part = kind.value === 'SCRIPT_PART';
  document.querySelectorAll('.template-script-option').forEach((node) => node.hidden = !script);
  document.querySelectorAll('.template-part-option').forEach((node) => node.hidden = !part);
  document.querySelectorAll('.template-target-option').forEach((node) => node.hidden = kind.value !== 'SCRIPT');
  const linuxOption = document.querySelector('#template-os option[value="Linux"]');
  linuxOption.disabled = part;
  if (part && document.getElementById('template-os').value !== 'Windows') document.getElementById('template-os').value = 'Windows';
  help.textContent = part
    ? '점검 항목별 스크립트는 서버 정책에서 선택한 항목만 다운로드 시 조립됩니다. 각 항목은 자기 점검 결과만 수집하고, 최종 JSON 예시는 오른쪽에 표시됩니다. 실행 준비 항목의 @@CONFIG_BASE64@@ 토큰은 지우지 마세요.'
    : kind.value === 'SCRIPT'
      ? '전체 스크립트 템플릿은 항목별 조립을 대체하는 고급 사용자 지정 기능입니다. 일반적인 수정은 점검 항목 스크립트 템플릿을 사용하세요.'
      : '쿼리는 Windows MSSQL 점검에서 실행할 SQL입니다. {{SERVER_IP}}와 {{SERVER_NAME}}을 사용할 수 있습니다. 결과는 SERVER|... 및 DATABASE|... 행 형식이어야 합니다.';
  renderOutputExample();
}

function renderOutputExample() {
  const examples = {
    HOST_INFO: { host: { hostname: 'SERVER01', osName: 'Microsoft Windows Server', osVersion: '10.0.20348', status: 'Healthy' } },
    CPU: { resources: { cpu: { usagePercent: 28, status: 'Healthy' } } },
    MEMORY: { resources: { memory: { usagePercent: 62, status: 'Healthy' } } },
    UPTIME: { host: { uptimeMinutes: 123456 }, resources: { uptime: { minutes: 123456, status: 'Healthy' } } },
    DISK: { resources: { disk: { maxUsagePercent: 71, status: 'Warning', volumes: [{ device: 'C:', totalGB: 200, usedGB: 142, usagePercent: 71, status: 'Warning' }] } } },
    PROCESS: { checks: { processes: { status: 'Healthy', items: [{ name: 'w3wp', running: true, cpu: 1.2, memoryMB: 256, uptimeMinutes: 360 }] } } },
    DIRECTORY: { checks: { directories: { status: 'Healthy', items: [{ path: 'C:\\logs', exists: true, sizeGB: 2.4, usagePercent: 35 }] } } },
    FILE_SIZE: { checks: { files: { status: 'Warning', items: [{ path: 'C:\\logs\\app.log', exists: true, sizeMB: 120, status: 'Warning' }] } } },
    PORT: { checks: { ports: { status: 'Healthy', items: [{ protocol: 'TCP', port: 8080, listening: true, processName: 'java' }] } } },
    HTTP: { checks: { http: { status: 'Healthy', items: [{ name: 'health', url: 'http://localhost/health', expectedStatus: 200, statusCode: 200, responseTimeMs: 18, success: true }] } } },
    WEB: { checks: { web: { status: 'Healthy', product: 'WebtoB', detail: { status: 'Healthy', command: 'wsadmin: wi, ci -s, st -v, st -s' } } } },
    WAS: { checks: { was: { status: 'Healthy', product: 'JEUS', items: [{ processId: 1200, processName: 'java', heapUsagePercent: 48, status: 'Healthy' }] } } },
    DATABASE: { checks: { database: { status: 'Healthy', product: 'MSSQL', detail: { serverName: 'SQL01', version: '16.0', databaseCount: 4, offlineCount: 0 } } } },
  };
  const pane = document.getElementById('template-output-example');
  if (!pane) return;
  let example;
  if (kind.value === 'SCRIPT_PART') example = examples[document.getElementById('template-item').value] || {};
  else if (kind.value === 'QUERY') example = { output: ['SERVER|SQL01|16.0|Standard', 'DATABASE|appdb|ONLINE|FULL|512.00'] };
  else example = { schemaVersion: 2, server: { id: 'SERVER01', roles: ['WEB'] }, resources: {}, checks: {}, summary: { status: 'Healthy' } };
  pane.textContent = JSON.stringify(example, null, 2);
}

async function loadTemplates() {
  if (!commonCodes) {
    const codeResponse = await fetch('/api/common-codes');
    if (!codeResponse.ok) throw new Error('공통코드를 불러오지 못했습니다.');
    commonCodes = await codeResponse.json();
    populateCodeSelect(document.getElementById('template-kind'), commonCodes.templateKinds);
    populateCodeSelect(document.getElementById('template-os'), commonCodes.operatingSystems);
    populateCodeSelect(document.getElementById('template-item'), commonCodes.scriptItems);
    populateCodeSelect(document.getElementById('template-role'), commonCodes.serverRoles, '모든 역할');
    populateCodeSelect(document.getElementById('template-filter'), [{ value: '', label: '전체' }, ...commonCodes.templateKinds]);
  }
  const requestedKind = new URLSearchParams(location.search).get('kind');
  if (requestedKind && commonCodes.templateKinds.some((entry) => entry.value === requestedKind)) {
    document.getElementById('template-filter').value = requestedKind;
    kind.value = requestedKind;
    updateFormMode();
  }
  const filter = document.getElementById('template-filter').value;
  const response = await fetch(`/api/templates${filter ? `?kind=${filter}` : ''}`);
  templates = response.ok ? await response.json() : [];
  const requestedItem = new URLSearchParams(location.search).get('item');
  if (requestedItem) {
    kind.value = 'SCRIPT_PART';
    document.getElementById('template-item').value = requestedItem;
    updateFormMode();
    templates = templates.filter((item) => item.kind === 'SCRIPT_PART' && item.item === requestedItem);
  }
  renderList();
}

function populateCodeSelect(select, codes, placeholder) {
  if (!select) return;
  select.replaceChildren();
  if (placeholder !== undefined) select.add(new Option(placeholder, ''));
  codes.forEach(({ value, label }) => select.add(new Option(label, value)));
}

function renderList() {
  list.replaceChildren();
  if (!templates.length) { list.textContent = '등록된 템플릿이 없습니다.'; return; }
  templates.forEach((item) => {
    const card = document.createElement('article'); card.className = `template-list-item${editingId === item.id ? ' is-selected' : ''}`;
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `${item.name} 편집`);
    card.addEventListener('click', () => requestOpenTemplate(item));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestOpenTemplate(item); } });
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.name;
    const typeLabel = item.kind === 'SCRIPT_PART' ? `점검 항목 · ${item.item || '미지정'}` : item.kind === 'SCRIPT' ? '전체 스크립트' : 'DB 쿼리';
    const meta = document.createElement('small'); meta.textContent = `${typeLabel}${item.os ? ` · ${item.os}` : ''}${item.role ? ` · ${item.role}` : ''}${item.product ? ` · ${item.product}` : ''} · ${item.enabled ? '사용' : '중지'}`;
    info.append(title, meta);
    const actions = document.createElement('div'); actions.className = 'button-area';
    const remove = document.createElement('button'); remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `${item.name} 삭제`);
    remove.addEventListener('click', (event) => { event.stopPropagation(); removeTemplate(item); });
    actions.append(remove); card.append(info, actions); list.appendChild(card);
  });
}

function requestOpenTemplate(item) {
  if (editingId === item.id && !hasUnsavedChanges) return;
  if (!hasUnsavedChanges) { openTemplate(item); return; }
  pendingTemplate = item;
  document.getElementById('unsaved-template-message').textContent = `현재 편집 중인 템플릿에 저장하지 않은 변경사항이 있습니다. '${item.name}'을(를) 열까요?`;
  document.getElementById('unsaved-template-dialog').showModal();
}

function openTemplate(item) {
  if (!item) return;
  editingId = item.id;
  hasUnsavedChanges = false;
  document.getElementById('template-form-title').textContent = '템플릿 수정';
  document.getElementById('btn-template-save').textContent = '변경 저장';
  document.getElementById('template-name').value = item.name;
  kind.value = item.kind;
  document.getElementById('template-os').value = item.os || 'Windows';
  document.getElementById('template-item').value = item.item || 'START';
  document.getElementById('template-role').value = item.role || '';
  document.getElementById('template-product').value = item.product || '';
  document.getElementById('template-enabled').checked = item.enabled;
  document.getElementById('template-content').value = item.content;
  renderHighlightedTemplate();
  updateFormMode();
  renderList();
  if (window.matchMedia('(max-width: 900px)').matches) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveTemplate(event) {
  event.preventDefault();
  if (await persistTemplate()) { resetForm(); await loadTemplates(); }
}

async function persistTemplate() {
  const data = {
    name: document.getElementById('template-name').value.trim(), kind: kind.value,
    os: ['SCRIPT', 'SCRIPT_PART'].includes(kind.value) ? document.getElementById('template-os').value : undefined,
    item: kind.value === 'SCRIPT_PART' ? document.getElementById('template-item').value : undefined,
    role: kind.value === 'SCRIPT' ? document.getElementById('template-role').value || undefined : undefined,
    product: kind.value === 'SCRIPT' ? document.getElementById('template-product').value.trim() || undefined : undefined,
    enabled: document.getElementById('template-enabled').checked,
    content: document.getElementById('template-content').value,
  };
  const response = await fetch(editingId ? `/api/templates/${encodeURIComponent(editingId)}` : '/api/templates', {
    method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { alert(result.message || '템플릿 저장에 실패했습니다.'); return false; }
  const saved = result.data;
  templates = templates.some((item) => item.id === saved.id) ? templates.map((item) => item.id === saved.id ? saved : item) : [...templates, saved];
  editingId = saved.id;
  hasUnsavedChanges = false;
  renderList();
  return true;
}

async function removeTemplate(item) {
  if (!confirm(`'${item.name}' 템플릿을 삭제할까요?`)) return;
  const response = await fetch(`/api/templates/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
  if (!response.ok) { alert('템플릿 삭제에 실패했습니다.'); return; }
  await loadTemplates();
}

function resetForm() { editingId = ''; hasUnsavedChanges = false; form.reset(); renderHighlightedTemplate(); document.getElementById('template-form-title').textContent = '새 템플릿'; document.getElementById('btn-template-save').textContent = '템플릿 저장'; updateFormMode(); renderList(); }

updateFormMode();
renderHighlightedTemplate();
loadTemplates().catch((error) => { console.error(error); alert(error.message || '공통코드 또는 템플릿을 불러오지 못했습니다.'); });
