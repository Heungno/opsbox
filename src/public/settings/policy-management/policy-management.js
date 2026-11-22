import { api, loadText, notifyError, showToast } from '/shared/js/api.js';
import { codeLabel, codeList, loadCodes } from '/shared/js/codes.js';
import { mountCheckBuilderForm, readCheckBuilderSpec } from './check-builder-form.js?v=20261122-builder';
import { itemSummary, renderCategoryTabs as renderCategoryTabsView } from './policy-view.js';

const list = document.getElementById('policy-list');
const form = document.getElementById('policy-form');
/** 화면 상태 */
const state = { policies: [], codes: {}, templates: [], editingId: '', editingItems: [], draft: null, editingItemId: '', activeCategory: 'BASIC', hasUnsavedChanges: false };
function confirmDiscard() { if (!state.hasUnsavedChanges) return true; if (!confirm('현재 저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?')) return false; state.hasUnsavedChanges = false; return true; }

// 직접 편집한 점검 만들기 스크립트(삭제 시 확인)
function detachedTemplateNames(items) {
  return items.filter((item) => item.executor?.type === 'CHECK_BUILDER')
    .map((item) => state.templates.find((template) => template.id === item.executor.templateId))
    .filter((template) => template?.generatedState === 'DETACHED').map((template) => template.name);
}
function confirmDetachedLoss(items, action) {
  const names = detachedTemplateNames(items);
  return !names.length || confirm(`${action} 직접 편집한 점검 만들기 스크립트도 삭제됩니다.\n${names.join('\n')}\n\n편집한 내용은 스크립트 이력에 남습니다. 계속할까요?`);
}
function itemId() { return `CUSTOM_${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
function makeItem(name = '') { return { id: itemId(), name, enabled: true, executor: { type: document.getElementById('policy-category').value === 'DB' ? 'SQL_QUERY' : 'SCRIPT', options: {} }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } }; }
function renderItems() {
  const host = document.getElementById('policy-checks'); host.replaceChildren();
  state.editingItems.forEach((item) => {
    const row = document.createElement('article'); row.className = 'policy-check-selected-row';
    const summary = document.createElement('span'); summary.textContent = itemSummary(item);
    const actions = document.createElement('div'); actions.className = 'button-area'; actions.style.margin = '0';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-small'; edit.textContent = '편집'; edit.addEventListener('click', () => openItem(item));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.addEventListener('click', () => { if (!confirmDetachedLoss([item], '이 항목을 지우고 정책을 저장하면')) return; state.editingItems = state.editingItems.filter((entry) => entry.id !== item.id); state.hasUnsavedChanges = true; renderItems(); });
    actions.append(edit, remove); row.append(summary, actions); host.append(row);
  });
  if (!state.editingItems.length) { const empty = document.createElement('p'); empty.className = 'policy-help'; empty.textContent = '정책에 포함된 항목이 없습니다.'; host.append(empty); }
  document.getElementById('policy-check-count').textContent = `${state.editingItems.length}개`;
}
function renderList() {
  const os = document.getElementById('policy-os-filter').value; const keyword = document.getElementById('policy-search').value.trim().toLocaleLowerCase();
  const matching = state.policies.filter((policy) => (!os || policy.os === os) && policy.name.toLocaleLowerCase().includes(keyword));
  renderCategoryTabs(matching);
  const visible = matching.filter((policy) => policy.category === state.activeCategory); list.replaceChildren();
  visible.forEach((policy) => {
    const card = document.createElement('article'); card.className = `template-list-item${policy.id === state.editingId ? ' is-selected' : ''}`; card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `${policy.name} 편집`);
    const info = document.createElement('div'); const title = document.createElement('strong'); title.textContent = policy.name; const detail = document.createElement('small'); detail.textContent = `${policy.os} · ${codeLabel('policyCategories', policy.category)} · ${(policy.items || []).length}개 항목`; info.append(title, detail);
    const actions = document.createElement('div'); actions.className = 'button-area';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `${policy.name} 삭제`); remove.addEventListener('click', (event) => { event.stopPropagation(); if (confirmDiscard()) deletePolicy(policy); });
    actions.append(remove); card.append(info, actions); card.addEventListener('click', () => { if (policy.id === state.editingId) return; if (confirmDiscard()) openPolicy(policy); }); card.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === card) { event.preventDefault(); if (policy.id === state.editingId) return; if (confirmDiscard()) openPolicy(policy); } }); list.append(card);
  });
  document.getElementById('policy-empty').hidden = visible.length > 0;
  document.getElementById('policy-empty').textContent = `${codeLabel('policyCategories', state.activeCategory)} 정책이 없습니다. 새 정책을 만들어 보세요.`;
}
function renderCategoryTabs(matching = state.policies) { renderCategoryTabsView(document.getElementById('policy-category-tabs'), matching, state.activeCategory); }
function setActiveCategory(category) { if (codeList('policyCategories').some((entry) => entry.value === category)) { state.activeCategory = category; renderList(); } }
function resetForm() { state.editingId = ''; state.editingItems = []; state.hasUnsavedChanges = false; form.reset(); document.getElementById('policy-category').value = state.activeCategory; document.getElementById('policy-form-title').textContent = '새 정책'; renderItems(); renderList(); }
function openPolicy(policy) { state.editingId = policy.id; state.activeCategory = policy.category; state.hasUnsavedChanges = false; document.getElementById('policy-name').value = policy.name; document.getElementById('policy-os').value = policy.os; document.getElementById('policy-category').value = policy.category; document.getElementById('policy-form-title').textContent = '정책 수정'; state.editingItems = structuredClone(policy.items || []); renderItems(); renderList(); }
async function deletePolicy(policy) { if (!confirm(`'${policy.name}' 정책을 삭제할까요?`)) return; if (!confirmDetachedLoss(policy.items || [], '정책을 삭제하면')) return; try { await api(`/api/policies/${encodeURIComponent(policy.id)}`, { method: 'DELETE' }); if (state.editingId === policy.id) resetForm(); showToast('정책을 삭제했습니다.', 'success'); await loadPolicies(); } catch (error) { notifyError(error, '정책을 삭제하지 못했습니다.'); } }
function parseJson(id, fallback) { const input = document.getElementById(id); try { input.setCustomValidity(''); return JSON.parse(input.value || fallback); } catch { input.setCustomValidity('올바른 JSON 형식으로 입력하세요.'); input.reportValidity(); throw new Error(`${input.previousElementSibling?.textContent || 'JSON'} 형식을 확인하세요.`); } }
function populateItemDialog(item) {
  document.getElementById('policy-item-name').value = item.name || ''; document.getElementById('policy-item-executor').value = item.executor?.type || 'SCRIPT';
  const dbms = document.getElementById('policy-item-dbms'); dbms.replaceChildren(new Option('DBMS 선택', '')); (state.codes.productsByRole.DB || []).forEach((value) => dbms.add(new Option(value, value))); dbms.value = item.executor?.dbms || '';
  document.getElementById('policy-item-template-id').value = item.executor?.templateId || '';
  const selected = new Set((item.result?.components || []).map((component) => component.type)); const host = document.getElementById('policy-item-result-components'); host.replaceChildren();
  codeList('resultViews').forEach(({ value: type, label }) => { const wrapper = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = type; input.checked = selected.has(type); input.addEventListener('change', updateColumnVisibility); wrapper.append(input, document.createTextNode(label)); host.append(wrapper); });
  document.getElementById('policy-item-status-field').value = item.result?.statusField || '';
  const table = (item.result?.components || []).find((component) => ['TABLE', 'LOG_TABLE'].includes(component.type)); document.getElementById('policy-item-columns').value = (table?.columns || []).map((column) => `${column.key}=${column.label}`).join('\n');
  updateColumnVisibility();
  document.getElementById('policy-item-options').value = JSON.stringify(item.executor?.options || {}, null, 2); document.getElementById('policy-item-inputs').value = JSON.stringify(item.inputs || [], null, 2); document.getElementById('policy-item-status-rules').value = JSON.stringify(item.result?.statusRules || {}, null, 2);
  updateItemExecutorFields();
}
function updateColumnVisibility() {
  const hasTable = [...document.querySelectorAll('#policy-item-result-components input:checked')].some((input) => ['TABLE', 'LOG_TABLE'].includes(input.value));
  document.getElementById('policy-item-columns-group').hidden = !hasTable;
}
// 점검 만들기: 안내형 폼을 띄우고 직접 구성 칸(템플릿·결과·JSON)은 숨깁니다.
function mountBuilderForm() {
  const host = document.getElementById('check-builder-form');
  mountCheckBuilderForm(host, {
    os: document.getElementById('policy-os').value,
    category: document.getElementById('policy-category').value,
    item: state.draft,
    template: state.templates.find((template) => template.id === state.draft?.executor?.templateId),
    policyId: state.editingId,
    onNameSuggest: (name) => { const input = document.getElementById('policy-item-name'); if (!input.value.trim()) input.value = name; },
    onRegenerated: async () => { state.templates = await api('/api/templates').catch(() => state.templates); showToast('스크립트를 폼 기준으로 다시 만들었습니다.', 'success'); },
  });
}
function updateItemExecutorFields() {
  const type = document.getElementById('policy-item-executor').value; const isDb = type === 'SQL_QUERY';
  const isBuilder = type === 'CHECK_BUILDER';
  document.getElementById('policy-item-expert-fields').hidden = isBuilder;
  document.getElementById('check-builder-form').hidden = !isBuilder;
  if (isBuilder) mountBuilderForm();
  document.getElementById('policy-item-dbms').closest('.form-group').hidden = !isDb;
  document.getElementById('policy-item-select-template').closest('.form-group').hidden = !['SQL_QUERY', 'SCRIPT', 'CONSOLE_COMMAND'].includes(type);
  document.getElementById('policy-item-template-id').placeholder = isDb ? 'DB 쿼리 템플릿 선택' : '스크립트 템플릿 선택';
}
function showItemDialog() {
  const dialog = document.getElementById('policy-item-dialog'); dialog.showModal();
  requestAnimationFrame(() => { dialog.scrollTop = 0; dialog.querySelector('.modal-card').scrollTop = 0; document.getElementById('policy-item-name').focus({ preventScroll: true }); });
}
function openItem(item) { state.draft = structuredClone(item); state.editingItemId = item.id; document.getElementById('policy-item-dialog-title').textContent = '점검 항목 편집'; populateItemDialog(state.draft); showItemDialog(); }
function openNewItem() { state.draft = makeItem(); state.editingItemId = ''; document.getElementById('policy-item-dialog-title').textContent = '점검 항목 추가'; populateItemDialog(state.draft); showItemDialog(); }
function bindTemplatePicker() {
  const dialog = document.getElementById('script-template-picker'); const $ = (id) => document.getElementById(id);
  const pickerSelect = $('script-template-picker-select'); const querySelect = $('db-query-template-select');
  function selectedTemplate() { const isDb = state.draft?.executor?.type === 'SQL_QUERY'; return state.templates.find((template) => template.id === (isDb ? querySelect.value : pickerSelect.value)); }
  function refreshEditButton() { const template = selectedTemplate(); $('script-template-picker-edit').hidden = !template; $('script-template-picker-edit').textContent = state.draft?.executor?.type === 'SQL_QUERY' ? '선택 쿼리 수정' : '선택 스크립트 수정'; }
  function populate() {
    const db = state.draft.executor.type === 'SQL_QUERY'; pickerSelect.closest('.form-group').hidden = db; $('db-query-template-option').hidden = !db; $('db-query-template-help').hidden = true;
    $('script-template-picker-title').textContent = db ? 'DB 쿼리 템플릿 선택' : '스크립트 템플릿 선택';
    $('script-template-picker-label').textContent = `${document.getElementById('policy-os').value} · ${codeLabel('policyCategories', document.getElementById('policy-category').value)} · ${state.draft.name || '새 점검 항목'}`;
    pickerSelect.replaceChildren(new Option('템플릿 선택', ''));
    const scripts = state.templates.filter((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === document.getElementById('policy-os').value);
    scripts.forEach((template) => pickerSelect.add(new Option(template.name, template.id))); pickerSelect.value = state.draft.executor.templateId || '';
    querySelect.replaceChildren(new Option('DBMS를 선택하세요', ''));
    const dbms = document.getElementById('policy-item-dbms').value.toUpperCase();
    state.templates.filter((template) => template.enabled && template.kind === 'QUERY' && dbms && String(template.dbms || 'MSSQL').toUpperCase() === dbms).forEach((template) => querySelect.add(new Option(template.name, template.id)));
    querySelect.value = state.draft.executor.templateId || ''; refreshEditButton();
  }
  $('script-template-picker-close').addEventListener('click', () => dialog.close()); $('script-template-picker-cancel').addEventListener('click', () => dialog.close());
  $('script-template-picker-refresh').addEventListener('click', async () => { try { state.templates = await api('/api/templates'); populate(); } catch (error) { notifyError(error, '템플릿 목록을 새로고침하지 못했습니다.'); } });
  pickerSelect.addEventListener('change', refreshEditButton); querySelect.addEventListener('change', refreshEditButton);
  $('script-template-picker-edit').addEventListener('click', () => { const template = selectedTemplate(); if (template) window.open(`/settings/script-management?id=${encodeURIComponent(template.id)}`, '_blank', 'noopener'); });
  $('script-template-picker-save').addEventListener('click', () => { state.draft.executor.templateId = state.draft.executor.type === 'SQL_QUERY' ? querySelect.value : pickerSelect.value; document.getElementById('policy-item-template-id').value = state.draft.executor.templateId || ''; dialog.close(); });
  document.getElementById('policy-item-select-template').addEventListener('click', () => { populate(); dialog.showModal(); });
}

['policy-os-filter', 'policy-search'].forEach((id) => document.getElementById(id).addEventListener('input', renderList));
document.getElementById('policy-category-tabs').addEventListener('click', (event) => { const tab = event.target.closest('[role="tab"]'); if (tab) setActiveCategory(tab.dataset.category); });
document.getElementById('policy-category-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('#policy-category-tabs [role="tab"]')];
  const current = tabs.findIndex((tab) => tab.dataset.category === state.activeCategory);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next].focus(); setActiveCategory(tabs[next].dataset.category);
});
document.getElementById('policy-new').addEventListener('click', () => { if (confirmDiscard()) resetForm(); });
document.getElementById('policy-item-add').addEventListener('click', openNewItem);
form.addEventListener('input', () => { state.hasUnsavedChanges = true; });
form.addEventListener('change', () => { state.hasUnsavedChanges = true; });
document.getElementById('policy-item-dialog').addEventListener('input', () => { state.hasUnsavedChanges = true; });
document.getElementById('policy-item-dialog').addEventListener('change', () => { state.hasUnsavedChanges = true; });
document.getElementById('sidebar-container')?.addEventListener('click', (event) => { const link = event.target.closest('a[href]'); if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !confirmDiscard()) event.preventDefault(); });
window.addEventListener('beforeunload', (event) => { if (state.hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; } });
document.getElementById('policy-item-close').addEventListener('click', () => document.getElementById('policy-item-dialog').close());
document.getElementById('policy-item-executor').addEventListener('change', () => { if (state.draft) { const nextType = document.getElementById('policy-item-executor').value; if (state.draft.executor.type !== nextType) state.draft.executor.templateId = undefined; state.draft.executor.type = nextType; document.getElementById('policy-item-template-id').value = ''; } updateItemExecutorFields(); });
document.getElementById('policy-item-save').addEventListener('click', () => {
  const name = document.getElementById('policy-item-name').value.trim(); if (!name) { alert('항목 이름을 입력하세요.'); return; }
  if (document.getElementById('policy-item-executor').value === 'CHECK_BUILDER') {
    // 서버별 입력·결과 표시·스크립트는 정책 저장 시 서버가 폼 값으로 정합니다.
    state.draft.name = name;
    state.draft.executor = { type: 'CHECK_BUILDER', templateId: state.draft.executor?.templateId, options: { builder: readCheckBuilderSpec(document.getElementById('check-builder-form')) } };
    state.draft.inputs = Array.isArray(state.draft.inputs) ? state.draft.inputs : [];
    state.draft.result = state.draft.result?.components?.length ? state.draft.result : { components: [{ type: 'SUMMARY' }] };
    const index = state.editingItems.findIndex((item) => item.id === state.editingItemId); if (index >= 0) state.editingItems[index] = state.draft; else state.editingItems.push(state.draft);
    state.hasUnsavedChanges = true; document.getElementById('policy-item-dialog').close(); renderItems();
    return;
  }
  const components = [...document.querySelectorAll('#policy-item-result-components input:checked')].map((input) => ({ type: input.value })); if (!components.length) { alert('결과 구성 요소를 하나 이상 선택하세요.'); return; }
  try {
    const columns = document.getElementById('policy-item-columns').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const split = line.indexOf('='); return split < 0 ? { key: line, label: line } : { key: line.slice(0, split).trim(), label: line.slice(split + 1).trim() }; });
    components.filter((component) => ['TABLE', 'LOG_TABLE'].includes(component.type)).forEach((component) => { if (columns.length) component.columns = columns; });
    state.draft.name = name; state.draft.executor.type = document.getElementById('policy-item-executor').value; state.draft.executor.options = parseJson('policy-item-options', '{}'); state.draft.inputs = parseJson('policy-item-inputs', '[]'); state.draft.executor.dbms = document.getElementById('policy-item-dbms').value || undefined; state.draft.executor.templateId = document.getElementById('policy-item-template-id').value || undefined;
    state.draft.result = { components, statusField: document.getElementById('policy-item-status-field').value.trim() || undefined, statusRules: parseJson('policy-item-status-rules', '{}') };
    const index = state.editingItems.findIndex((item) => item.id === state.editingItemId); if (index >= 0) state.editingItems[index] = state.draft; else state.editingItems.push(state.draft); state.hasUnsavedChanges = true; document.getElementById('policy-item-dialog').close(); renderItems();
  } catch (error) { alert(error.message); }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = { name: document.getElementById('policy-name').value.trim(), os: document.getElementById('policy-os').value, category: document.getElementById('policy-category').value, enabled: true, items: state.editingItems };
  const previous = state.policies.find((policy) => policy.id === state.editingId);
  if (previous && previous.os !== payload.os && !confirmDetachedLoss(previous.items || [], '운영체제를 바꿔 저장하면 이전 OS용')) return;
  try { const saved = await api(state.editingId ? `/api/policies/${encodeURIComponent(state.editingId)}` : '/api/policies', { method: state.editingId ? 'PUT' : 'POST', body: payload }); showToast('정책을 저장했습니다.', 'success'); state.templates = await api('/api/templates').catch(() => state.templates); await loadPolicies(); openPolicy(saved); } catch (error) { notifyError(error, '정책을 저장하지 못했습니다.'); }
});
async function loadPolicies() { state.policies = (await api('/api/policies')) || []; state.templates = await api('/api/templates').catch(() => state.templates); renderList(); }
async function init() {
  document.getElementById('script-template-picker-container').innerHTML = await loadText('/shared/fragments/script-template-picker-modal.html');
  state.codes = await loadCodes(); // 공통코드: 분류·실행 방식·결과 표시 이름
  const fill = (id, entries, placeholder = '') => { const select = document.getElementById(id); select.replaceChildren(); if (placeholder) select.add(new Option(placeholder, '')); entries.forEach((entry) => select.add(new Option(entry.label || entry.value, entry.value))); };
  fill('policy-os-filter', state.codes.operatingSystems, '전체 OS'); fill('policy-os', state.codes.operatingSystems);
  fill('policy-category', state.codes.policyCategories); fill('policy-item-executor', state.codes.policyExecutors);
  const views = document.getElementById('policy-item-result-components'); views.replaceChildren();
  state.codes.resultViews.forEach((entry) => { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = entry.value; input.addEventListener('change', updateColumnVisibility); label.append(input, document.createTextNode(entry.label)); views.append(label); });
  state.templates = await api('/api/templates').catch((error) => { notifyError(error, '템플릿 목록을 불러오지 못했습니다.'); return []; });
  bindTemplatePicker(); renderItems(); await loadPolicies();
}
try { await init(); } catch (error) { document.getElementById('policy-error').hidden = false; notifyError(error, '점검 정책 화면을 초기화하지 못했습니다.'); }
