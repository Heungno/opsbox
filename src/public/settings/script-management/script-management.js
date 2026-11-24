import { api, notifyError, showToast } from '/shared/js/api.js';
import { customScriptItems, filterTemplates, generatedNoteText, groupCounts, renderTemplateList, templateGroup } from './script-view.js';


/** 화면 상태 */
const state = { templates: [], allTemplates: [], editingId: '', hasUnsavedChanges: false, pendingTemplate: null, commonCodes: null, activeGroup: 'ALL' };

const form = document.getElementById('template-form');
const kind = document.getElementById('template-kind');
const help = document.getElementById('template-help');
const list = document.getElementById('template-list');
const editor = document.getElementById('template-content');
const highlight = document.querySelector('#template-highlight code');

kind.addEventListener('change', updateFormMode);
document.getElementById('template-item').addEventListener('change', () => { updateFormMode(); renderOutputExample(); });
document.getElementById('template-filter').addEventListener('change', applyTemplateFilters);
document.getElementById('template-os-filter').addEventListener('change', applyTemplateFilters);
document.getElementById('template-item-filter').addEventListener('change', applyTemplateFilters);
document.getElementById('template-group-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) setActiveGroup(tab.dataset.group);
});
document.getElementById('template-group-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('#template-group-tabs [role="tab"]')];
  const current = tabs.findIndex((tab) => tab.dataset.group === state.activeGroup);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next].focus(); setActiveGroup(tabs[next].dataset.group);
});
document.getElementById('btn-template-history').addEventListener('click', showTemplateHistory);
document.getElementById('template-history-close').addEventListener('click', () => document.getElementById('template-history-dialog').close());
document.getElementById('btn-template-reset').addEventListener('click', () => {
  if (state.hasUnsavedChanges && !confirm('현재 템플릿에 저장하지 않은 변경사항이 있습니다. 저장하지 않고 새 템플릿을 작성할까요?')) return;
  resetForm();
});
form.addEventListener('submit', saveTemplate);
form.addEventListener('input', () => { state.hasUnsavedChanges = true; });
form.addEventListener('change', () => { state.hasUnsavedChanges = true; });
document.getElementById('unsaved-template-save-open').addEventListener('click', async () => {
  if (await persistTemplate()) { document.getElementById('unsaved-template-dialog').close(); openTemplate(state.pendingTemplate); }
});
document.getElementById('unsaved-template-discard-open').addEventListener('click', () => {
  document.getElementById('unsaved-template-dialog').close(); state.hasUnsavedChanges = false; openTemplate(state.pendingTemplate);
});
document.getElementById('unsaved-template-continue').addEventListener('click', () => {
  document.getElementById('unsaved-template-dialog').close(); state.pendingTemplate = null;
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
  if (kind.value === 'COMMAND') { highlight.textContent = source; document.getElementById('template-highlight').dataset.language = 'plain'; return; }
  const language = kind.value === 'QUERY' ? 'sql' : document.getElementById('template-os').value === 'Linux' ? 'bash' : 'powershell';
  const definitions = {
    sql: {
      token: /\{\{[A-Z_]+\}\}|--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|@[A-Za-z_][\w$]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w$]*/g,
      keywords: new Set('ADD ALL ALTER AND AS ASC BACKUP BEGIN BETWEEN BY CASE CAST CHECK CHECKPOINT CLOSE COALESCE COLLATE COLUMN COMMIT CONSTRAINT CONVERT CREATE CROSS CURSOR DATABASE DBCC DECLARE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXEC EXECUTE EXISTS FETCH FILEPROPERTY FOR FOREIGN FROM FULL FUNCTION GROUP HAVING IF IN INDEX INNER INSERT IS JOIN KEY LEFT LIKE MAX MIN NEXT NOCOUNT NOT NULL ON OPEN OR ORDER OUTER OVER PARTITION PRIMARY PROCEDURE QUOTENAME REFERENCES RESTORE RETURN RIGHT ROLLBACK SELECT SET SUM TABLE THEN TOP TRANSACTION TRUNCATE UNION UNIQUE UPDATE USE VALUES WHEN WHERE WHILE WITH'.split(' ')),
      builtins: new Set('AVG COUNT DATEADD DATEDIFF GETDATE ISNULL LOWER MAX NEWID SERVERPROPERTY SUM UPPER'.split(' ')),
      variable: /^@/,
    },
    powershell: {
      token: /\{\{[A-Z_]+\}\}|<#[\s\S]*?#>|#[^\r\n]*|'(?:''|[^'])*'|"(?:`.|[^"`])*"|\$\{[^}]+\}|\$[A-Za-z_?][\w:?]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w-]*/g,
      keywords: new Set('begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function if in inlineparam param process return switch throw trap try until using var while workflow'.split(' ')),
      builtins: new Set('add-content add-member convertfrom-json convertto-json get-childitem get-command get-content get-date get-filehash get-item get-location get-process get-service get-wmiobject measure-object new-item out-file select-object set-content sort-object split-path test-path where-object write-error write-host write-output'.split(' ')),
      variable: /^\$/,
    },
    bash: {
      token: /\{\{[A-Z_]+\}\}|#[^\r\n]*|'[^']*'|"(?:\\.|[^"\\])*"|\$\{[^}]+\}|\$[A-Za-z_?][\w?!#@*:$-]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w-]*/g,
      keywords: new Set('case do done elif else esac fi for function if in select then time until while'.split(' ')),
      builtins: new Set('awk cat cd chmod cp date df dirname echo eval exec exit export false find grep head local printf pwd read rm sed set shift sleep source stat sudo test trap true type uname unset wc which'.split(' ')),
      variable: /^\$/,
    },
  };
  const rules = definitions[language];
  const status = document.getElementById('template-highlight');
  status.dataset.language = language;
  let html = '';
  let position = 0;
  for (const match of source.matchAll(rules.token)) {
    const token = match[0];
    const offset = match.index ?? position;
    html += escapeHtml(source.slice(position, offset));
    let type = '';
    const lower = token.toLowerCase();
    if (/^\{\{[A-Z_]+\}\}$/.test(token)) type = 'template-variable';
    else if ((language === 'sql' && /^(--|\/\*)/.test(token)) || (language !== 'sql' && /^(#|<#)/.test(token))) type = 'syntax-comment';
    else if (/^(?:'|"|`)/.test(token)) type = 'syntax-string';
    else if (rules.variable.test(token)) type = 'syntax-variable';
    else if (/^\d/.test(token)) type = 'syntax-number';
    else if (rules.keywords.has(lower)) type = 'syntax-keyword';
    else if (rules.builtins.has(lower) || (language === 'powershell' && /^(get|set|new|remove|write|read|test|start|stop|invoke|convert|select|where|measure|out|import|export)-/i.test(token))) type = 'syntax-builtin';
    html += type ? `<span class="${type}">${escapeHtml(token)}</span>` : escapeHtml(token);
    position = offset + token.length;
  }
  html += escapeHtml(source.slice(position));
  highlight.innerHTML = html;
}

function updateFormMode() {
  const part = kind.value === 'SCRIPT_PART';
  const command = kind.value === 'COMMAND';
  const script = part;
  if (state.commonCodes) {
    const itemSelect = document.getElementById('template-item');
    const previousItem = itemSelect.value;
    const itemCodes = kind.value === 'QUERY'
      ? state.commonCodes.scriptItems.filter((entry) => entry.role === 'DB' && entry.value !== 'DB_QUERY_RUNNER')
      : command
        ? state.commonCodes.scriptItems.filter((entry) => entry.role === 'WEB' || entry.role === 'WAS')
        : state.commonCodes.scriptItems;
    populateCodeSelect(itemSelect, itemCodes);
    if (itemCodes.some((entry) => entry.value === previousItem)) itemSelect.value = previousItem;
  }
  document.querySelectorAll('.template-script-option').forEach((node) => node.hidden = !script);
  document.querySelectorAll('.template-part-option').forEach((node) => node.hidden = !part && !command);
  document.querySelectorAll('.template-command-option').forEach((node) => node.hidden = !command);
  if (!command) document.querySelectorAll('.template-part-option').forEach((node) => node.hidden = !part);
  document.querySelectorAll('.template-query-dbms-option').forEach((node) => node.hidden = kind.value !== 'QUERY');
  const linuxOption = document.querySelector('#template-os option[value="Linux"]');
  if (linuxOption) linuxOption.disabled = part;
  if (part && document.getElementById('template-os').value !== 'Windows') document.getElementById('template-os').value = 'Windows';
  const selectedItem = state.commonCodes?.scriptItems.find((entry) => entry.value === document.getElementById('template-item').value);
  document.querySelectorAll('.template-query-option').forEach((node) => { node.hidden = !(part && selectedItem?.value === 'DB_QUERY_RUNNER'); });
  help.textContent = command ? COMMAND_HELP : part
    ? '점검 항목별 스크립트는 서버 정책에서 선택한 항목만 다운로드 시 조립됩니다. 각 항목은 자기 점검 결과만 수집하고, 최종 JSON 예시는 오른쪽에 표시됩니다. 실행 준비 항목의 @@CONFIG_BASE64@@ 토큰은 지우지 마세요.'
    : kind.value === 'QUERY'
      ? '선택한 DBMS에서 실행할 SQL입니다. 점검 항목과 분리해 여러 항목에서 재사용할 수 있습니다. 결과는 컬럼명과 행을 읽어 보고서 표로 표시합니다. 첫 번째 컬럼을 __OPSBOX_STATUS로 지정하면 Healthy, Warning, Critical 상태도 함께 판정할 수 있습니다.'
      : '';
  renderHighlightedTemplate();
  renderOutputExample();
}

const COMMAND_HELP = [
  '관리 도구 명령을 실행해 상태를 판정하는 템플릿입니다. 머리 주석: @opsbox-product(제품 이름), @opsbox-tool(도구 이름: PATH, 그다음 @opsbox-home의 bin에서 찾음), @opsbox-home(설치 경로 변수), @opsbox-args(도구 인자), @opsbox-require(필수 환경 변수), @opsbox-quit(종료 명령), @opsbox-timeout(초, 기본 20), @opsbox-status <수준> ~ <정규식>. 주석이 아닌 빈 줄 아닌 줄은 도구에 보낼 명령입니다.',
  '판정은 Critical, Warning, Healthy 순서로 처음 맞는 규칙을 씁니다. 정규식은 ERE 범위만 쓰세요(Linux는 bash grep -E, Windows는 .NET 정규식이 읽으므로 \\d, 전방탐색 등은 쓰지 않습니다). 출력을 대문자로 바꾼 뒤 맞춰 보므로 패턴도 대문자로 씁니다.',
  '@opsbox-args 값에는 공백을 쓸 수 없습니다. 비밀번호는 직접 쓰지 말고 ${환경변수}로 지정하세요.',
].join('\n');

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
    WEB_LOG: { checks: { rolePolicies: { WEB: { status: 'Warning', items: [{ item: 'WEB_LOG', name: 'WEB 로그 상태', status: 'Warning', detail: { periodDays: 7, checkedFileCount: 18, matchedLineCount: 5, categories: { fatal: 0, errorException: 2, warning: 1, http5xx: 1, http4xx: 1 } } }] } } } },
    WAS_LOG: { checks: { rolePolicies: { WAS: { status: 'Warning', items: [{ item: 'WAS_LOG', name: 'WAS 로그 상태', status: 'Warning', detail: { periodDays: 7, checkedFileCount: 12, matchedLineCount: 3, categories: { fatal: 0, errorException: 2, warning: 1, http5xx: 0, http4xx: 0 } } }] } } } },
    WAS: { checks: { was: { status: 'Healthy', product: 'JEUS', items: [{ processId: 1200, processName: 'java', heapUsagePercent: 48, status: 'Healthy' }] } } },
    DATABASE: { checks: { database: { status: 'Healthy', product: 'MSSQL', detail: { serverName: 'SQL01', version: '16.0', databaseCount: 4, offlineCount: 0 } } } },
    DB_CUSTOM_QUERY: { checks: { rolePolicies: { DB: { status: 'Healthy', items: [{ item: 'DB_CUSTOM_QUERY', name: '기타 사용자 쿼리', status: 'Healthy', detail: { queries: [{ name: '활성 세션 조회', status: 'Healthy', rowCount: 1, output: 'session_count | 12' }] } }] } } } },
  };
  const pane = document.getElementById('template-output-example');
  if (!pane) return;
  let example;
  if (kind.value === 'SCRIPT_PART') {
    const item = document.getElementById('template-item').value;
    const definition = state.commonCodes?.scriptItems.find((entry) => entry.value === item);
    example = examples[item] || (definition?.role ? {
      checks: { rolePolicies: { [definition.role]: { status: 'Healthy', items: [{ item, name: definition.label, status: 'Healthy', detail: { sample: true } }] } } },
    } : {});
  }
  else if (kind.value === 'COMMAND') example = { product: 'JEUS 6', status: 'Healthy', command: 'jeusadmin: allenginenames, pidlist', output: '…', message: null };
  else if (kind.value === 'QUERY') example = { columns: ['__OPSBOX_STATUS', 'databaseName', 'state'], rows: [['Healthy', 'appdb', 'ONLINE']] };
  else example = { schemaVersion: 2, server: { id: 'SERVER01', roles: ['WEB'] }, resources: {}, checks: {}, summary: { status: 'Healthy' } };
  pane.textContent = JSON.stringify(example, null, 2);
}

async function loadTemplates() {
  if (!state.commonCodes) {
    state.commonCodes = await api('/api/common-codes');
    const policies = await api('/api/policies').catch((error) => { notifyError(error, '점검 정책 목록을 불러오지 못했습니다.'); return null; });
    if (policies) state.commonCodes.scriptItems.push(...customScriptItems(policies));
    populateCodeSelect(document.getElementById('template-kind'), state.commonCodes.templateKinds);
    populateCodeSelect(document.getElementById('template-os'), state.commonCodes.operatingSystems);
    populateCodeSelect(document.getElementById('template-item'), state.commonCodes.scriptItems);
    populateCodeSelect(document.getElementById('template-product'), [...new Set([...state.commonCodes.productsByRole.WEB, ...state.commonCodes.productsByRole.WAS].map((entry) => typeof entry === 'string' ? entry : entry.value))]);
    populateCodeSelect(document.getElementById('template-dbms'), state.commonCodes.productsByRole.DB);
    populateCodeSelect(document.getElementById('template-filter'), [{ value: '', label: '전체' }, ...state.commonCodes.templateKinds]);
    populateCodeSelect(document.getElementById('template-os-filter'), [{ value: '', label: '전체 OS' }, ...state.commonCodes.operatingSystems]);
    updateTemplateItemFilter();
    updateFormMode();
  }
  const requestedKind = new URLSearchParams(location.search).get('kind');
  if (requestedKind && state.commonCodes.templateKinds.some((entry) => entry.value === requestedKind)) {
    document.getElementById('template-filter').value = requestedKind;
    kind.value = requestedKind;
    updateFormMode();
  }
  state.allTemplates = (await api('/api/templates')) || [];
  const requestedParams = new URLSearchParams(location.search);
  const requestedItem = requestedParams.get('item');
  const requestedId = requestedParams.get('id');
  if (requestedItem) {
    kind.value = 'SCRIPT_PART';
    document.getElementById('template-item').value = requestedItem;
    const definition = state.commonCodes.scriptItems.find((entry) => entry.value === requestedItem);
    state.activeGroup = definition?.role || (['START', 'SAVE'].includes(requestedItem) ? 'SYSTEM' : 'COMMON');
    updateTemplateItemFilter();
    document.getElementById('template-item-filter').value = requestedItem;
    updateFormMode();
  }
  applyTemplateFilters();
  if (requestedId) {
    const selected = state.allTemplates.find((item) => item.id === requestedId);
    if (selected) {
      openTemplate(selected);
    }
  }
}

function getTemplateGroup(template) { return templateGroup(template, state.commonCodes.scriptItems); }

function updateTemplateItemFilter() {
  if (!state.commonCodes) return;
  const items = state.commonCodes.scriptItems.filter((entry) => state.activeGroup === 'ALL' || getTemplateGroup({ kind: 'SCRIPT_PART', item: entry.value, role: entry.role }) === state.activeGroup);
  populateCodeSelect(document.getElementById('template-item-filter'), [{ value: '', label: '전체 항목' }, ...items]);
}

function setActiveGroup(group) {
  state.activeGroup = group;
  updateTemplateItemFilter();
  applyTemplateFilters();
}

function currentFilters() {
  return {
    kind: document.getElementById('template-filter').value,
    os: document.getElementById('template-os-filter').value,
    group: state.activeGroup,
    item: document.getElementById('template-item-filter').value,
  };
}

function renderGroupTabs() {
  const tabs = [...document.querySelectorAll('#template-group-tabs [role="tab"]')];
  const counts = groupCounts(state.allTemplates, currentFilters(), state.commonCodes.scriptItems, tabs.map((tab) => tab.dataset.group));
  for (const tab of tabs) {
    const group = tab.dataset.group;
    tab.setAttribute('aria-selected', String(group === state.activeGroup));
    tab.tabIndex = group === state.activeGroup ? 0 : -1;
    tab.querySelector('span').textContent = counts[group];
  }
}

function applyTemplateFilters() {
  if (!state.commonCodes) return;
  renderGroupTabs();
  state.templates = filterTemplates(state.allTemplates, currentFilters(), state.commonCodes.scriptItems);
  renderList();
}

function populateCodeSelect(select, codes, placeholder) {
  if (!select) return;
  select.replaceChildren();
  if (placeholder !== undefined) select.add(new Option(placeholder, ''));
  // 공통코드는 { value, label } 객체 또는 문자열(예: productsByRole) 둘 다 올 수 있습니다.
  (codes || []).forEach((entry) => { const value = typeof entry === 'string' ? entry : entry.value; const label = typeof entry === 'string' ? entry : entry.label || entry.value; select.add(new Option(label, value)); });
}

function renderList() {
  renderTemplateList(list, state.templates, { selectedId: state.editingId, onOpen: requestOpenTemplate, onDelete: removeTemplate });
}

/** 편집기 머리 안내: 점검 만들기 조각이면 정책 항목에서 관리된다는 것과 직접 편집 시 영향 */
function renderGeneratedNote(item) {
  const title = document.getElementById('template-form-title');
  let note = document.getElementById('template-generated-note');
  if (!item?.generatedState) { note?.remove(); return; }
  if (!note) { note = document.createElement('p'); note.id = 'template-generated-note'; note.className = 'check-builder-warning'; title.closest('.section-header').after(note); }
  note.textContent = generatedNoteText(item);
}

function requestOpenTemplate(item) {
  if (state.editingId === item.id && !state.hasUnsavedChanges) return;
  if (!state.hasUnsavedChanges) { openTemplate(item); return; }
  state.pendingTemplate = item;
  document.getElementById('unsaved-template-message').textContent = `현재 편집 중인 템플릿에 저장하지 않은 변경사항이 있습니다. '${item.name}'을(를) 열까요?`;
  document.getElementById('unsaved-template-dialog').showModal();
}

function openTemplate(item) {
  if (!item) return;
  renderGeneratedNote(item);
  state.editingId = item.id;
  state.hasUnsavedChanges = false;
  document.getElementById('template-form-title').textContent = '템플릿 수정';
  document.getElementById('btn-template-history').hidden = false;
  document.getElementById('btn-template-save').textContent = '변경 저장';
  document.getElementById('template-name').value = item.name;
  kind.value = item.kind;
  updateFormMode();
  document.getElementById('template-os').value = item.os || 'Windows';
  document.getElementById('template-item').value = item.item || 'START';
  if (item.product) document.getElementById('template-product').value = item.product;
  document.getElementById('template-dbms').value = item.dbms || 'MSSQL';
  document.getElementById('template-uses-query').checked = item.usesQueryTemplate === true;
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
    os: kind.value === 'SCRIPT_PART' ? document.getElementById('template-os').value : undefined,
    product: kind.value === 'COMMAND' ? document.getElementById('template-product').value : undefined,
    item: kind.value === 'COMMAND' ? document.getElementById('template-item').value : undefined,
    dbms: kind.value === 'QUERY' ? document.getElementById('template-dbms').value : undefined,
    usesQueryTemplate: false,
    enabled: document.getElementById('template-enabled').checked,
    content: document.getElementById('template-content').value,
  };
  let saved;
  try {
    saved = await api(state.editingId ? `/api/templates/${encodeURIComponent(state.editingId)}` : '/api/templates', { method: state.editingId ? 'PUT' : 'POST', body: data });
  } catch (error) {
    notifyError(error, '템플릿을 저장하지 못했습니다.');
    return false;
  }
  showToast('템플릿을 저장했습니다.', 'success');
  const { warnings = [], ...template } = saved;
  saved = template;
  for (const warning of warnings) showToast(warning, 'info', { duration: 10000 });
  state.allTemplates = state.allTemplates.some((item) => item.id === saved.id) ? state.allTemplates.map((item) => item.id === saved.id ? saved : item) : [...state.allTemplates, saved];
  state.editingId = saved.id;
  state.hasUnsavedChanges = false;
  document.getElementById('btn-template-history').hidden = false;
  applyTemplateFilters();
  return true;
}

async function showTemplateHistory() {
  if (!state.editingId) return;
  if (state.hasUnsavedChanges && !confirm('현재 저장하지 않은 변경사항은 이력에서 복원할 때 사라집니다. 이력을 계속 볼까요?')) return;
  let versions;
  try {
    versions = (await api(`/api/templates/${encodeURIComponent(state.editingId)}/history`)) || [];
  } catch (error) {
    notifyError(error, '변경 이력을 불러오지 못했습니다.');
    return;
  }
  const historyList = document.getElementById('template-history-list');
  historyList.replaceChildren();
  if (!versions.length) {
    const empty = document.createElement('p');
    empty.textContent = '아직 저장된 이전 버전이 없습니다. 스크립트 내용을 변경해 저장하면 이전 버전이 여기에 보관됩니다.';
    historyList.append(empty);
  }
  versions.forEach((version, index) => {
    const row = document.createElement('article');
    row.className = 'template-list-item';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${index === 0 ? '직전 버전' : `이전 버전 ${index + 1}`} · ${new Date(version.savedAt).toLocaleString()}`;
    const detail = document.createElement('small');
    detail.textContent = `${version.template.name} · ${version.template.content.length.toLocaleString()}자`;
    info.append(title, detail);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn btn-small';
    restore.textContent = '이 버전 복원';
    restore.addEventListener('click', async () => {
      if (!confirm(`'${version.template.name}'의 이 버전을 복원할까요? 현재 내용도 변경 이력에 저장됩니다.`)) return;
      let restored;
      try {
        restored = await api(`/api/templates/${encodeURIComponent(state.editingId)}/history/${encodeURIComponent(version.versionId)}/restore`, { method: 'POST' });
      } catch (error) {
        notifyError(error, '버전을 복원하지 못했습니다.');
        return;
      }
      document.getElementById('template-history-dialog').close();
      showToast('이전 버전으로 복원했습니다.', 'success');
      await loadTemplates();
      openTemplate(restored);
    });
    row.append(info, restore);
    historyList.append(row);
  });
  document.getElementById('template-history-dialog').showModal();
}

async function removeTemplate(item) {
  if (!confirm(`'${item.name}' 템플릿을 삭제할까요?`)) return;
  try {
    await api(`/api/templates/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
  } catch (error) {
    notifyError(error, '템플릿을 삭제하지 못했습니다.');
    return;
  }
  showToast('템플릿을 삭제했습니다.', 'success');
  await loadTemplates();
}

function resetForm() { state.editingId = ''; state.hasUnsavedChanges = false; form.reset(); renderHighlightedTemplate(); document.getElementById('template-form-title').textContent = '새 템플릿'; document.getElementById('btn-template-save').textContent = '템플릿 저장'; document.getElementById('btn-template-history').hidden = true; updateFormMode(); renderList(); }

renderHighlightedTemplate();
loadTemplates().catch((error) => notifyError(error, '공통코드 또는 템플릿을 불러오지 못했습니다.'));
