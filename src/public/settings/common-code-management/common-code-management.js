import { api, errorMessage, loadText, notifyError } from '/shared/js/api.js';
import { option } from '/shared/js/dom.js';
import { META, applyEdit, codeRows, groupsOf, isGrouped, removeCategory, removeRow, renderCategoryList, renderCodeTable } from './common-code-view.js';

const [entryModal, categoryModal, groupModal] = await Promise.all([
  loadText('/shared/fragments/common-code-entry-modal.html'),
  loadText('/shared/fragments/common-code-category-modal.html'),
  loadText('/shared/fragments/common-code-group-modal.html'),
]).catch((error) => {
  notifyError(error, '공통코드 화면을 불러오지 못했습니다.');
  throw error;
});
document.getElementById('code-dialog-container').innerHTML = entryModal;
document.getElementById('category-dialog-container').innerHTML = categoryModal;
document.getElementById('group-dialog-container').innerHTML = groupModal;

const select = document.getElementById('category-select');
const table = document.getElementById('codes-table');
const message = document.getElementById('codes-message');
const dialog = document.getElementById('code-dialog');
const categoryDialog = document.getElementById('category-dialog');
const groupDialog = document.getElementById('group-dialog');
/** 화면 상태: 관리 문서와 수정 중인 행 */
const state = { codes: {}, editing: null };

function current() { return select.value; }
function grouped() { return isGrouped(state.codes, current()); }
function groups() { return groupsOf(state.codes, current()); }
function rows(group) { return codeRows(state.codes, current(), group); }

function render() {
  const category = current();
  document.getElementById('group-add').hidden = !grouped();
  document.getElementById('entry-add').disabled = grouped() && groups().length === 0;
  document.getElementById('code-group-field').hidden = !grouped();
  const groupSelect = document.getElementById('code-group');
  const selectedGroup = groupSelect.value;
  groupSelect.replaceChildren(...groups().map((group) => option(group, group)));
  if (groups().includes(selectedGroup)) groupSelect.value = selectedGroup;
  document.getElementById('entry-heading').textContent = `${category || '코드'} 목록`;
  const tableGroups = groups().map((group) => ({ group, rows: rows(group) }));
  renderCodeTable(table, tableGroups, { onEdit: openEditor, onDelete: deleteRow });
  document.getElementById('codes-empty').hidden = tableGroups.some((entry) => entry.rows.length);
}
function renderCategories() {
  const previous = current();
  select.replaceChildren(...Object.keys(state.codes).filter((key) => key !== META).map((name) => option(name, name)));
  if (Object.hasOwn(state.codes, previous)) select.value = previous;
  renderCategoryListView();
  render();
}
function renderCategoryListView() {
  renderCategoryList(document.getElementById('category-list'), state.codes, current(), {
    onSelect: (name) => { select.value = name; renderCategoryListView(); render(); },
    onDelete: deleteCategory,
  });
}
async function deleteCategory(category) {
  if (!confirm(`'${category}' 분류와 포함된 코드를 모두 삭제할까요?`)) return;
  removeCategory(state.codes, category);
  try { await persist(); message.textContent = '분류를 삭제했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
async function persist() {
  try {
    state.codes = await api('/api/common-codes', { method: 'PUT', body: state.codes });
    renderCategories();
  } catch (error) {
    // 저장에 실패하면 화면을 서버에 저장된 상태로 되돌립니다.
    try { state.codes = await api('/api/common-codes/manage'); renderCategories(); } catch { /* 원래 오류를 보여줍니다 */ }
    throw error;
  }
}
async function load() { try { state.codes = await api('/api/common-codes/manage'); renderCategories(); message.textContent = ''; } catch (error) { message.textContent = errorMessage(error, '공통코드를 불러오지 못했습니다.'); } }
function openEditor(row) {
  state.editing = row || null;
  document.getElementById('dialog-title').textContent = row ? '코드 수정' : '코드 추가';
  document.getElementById('code-value').value = row?.value ?? '';
  document.getElementById('code-label').value = row?.label ?? '';
  document.getElementById('code-enabled').value = String(row?.enabled ?? true);
  document.getElementById('code-order').value = String(row?.sortOrder ?? (rows(row?.group || '').length));
  if (grouped()) document.getElementById('code-group').value = row?.group ?? groups()[0] ?? '';
  dialog.showModal();
}
async function saveRow(event) {
  event.preventDefault();
  const group = state.editing?.group ?? (grouped() ? document.getElementById('code-group').value : '');
  const problem = applyEdit(state.codes, current(), group, state.editing, {
    value: document.getElementById('code-value').value.trim(),
    label: document.getElementById('code-label').value.trim(),
    enabled: document.getElementById('code-enabled').value === 'true',
    sortOrder: Number(document.getElementById('code-order').value) || 0,
  });
  if (problem) { message.textContent = problem; return; }
  dialog.close();
  try { await persist(); message.textContent = '저장했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
async function deleteRow(row) {
  if (row.protected) { message.textContent = '시스템 코드는 삭제할 수 없습니다.'; return; }
  removeRow(state.codes, current(), row);
  try { await persist(); message.textContent = '코드를 삭제했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
select.addEventListener('change', () => { renderCategoryListView(); render(); });
document.getElementById('entry-add').addEventListener('click', () => {
  openEditor();
});
document.getElementById('code-form').addEventListener('submit', saveRow);
document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());
document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
async function saveCategory(event) {
  event.preventDefault();
  const key = document.getElementById('category-name').value.trim();
  if (!key || Object.hasOwn(state.codes, key)) { message.textContent = '분류명이 비어 있거나 이미 존재합니다.'; return; }
  state.codes[key] = document.getElementById('category-mapping').value === 'true' ? {} : [];
  categoryDialog.close();
  try { await persist(); select.value = key; renderCategoryListView(); render(); message.textContent = '분류를 추가했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
document.getElementById('category-add').addEventListener('click', () => {
  document.getElementById('category-name').value = '';
  document.getElementById('category-mapping').value = 'false';
  categoryDialog.showModal();
});
document.getElementById('category-form').addEventListener('submit', saveCategory);
document.getElementById('category-dialog-cancel').addEventListener('click', () => categoryDialog.close());
document.getElementById('category-dialog-close').addEventListener('click', () => categoryDialog.close());
document.getElementById('group-add').addEventListener('click', () => {
  document.getElementById('group-name').value = '';
  groupDialog.showModal();
});
document.getElementById('group-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('group-name').value.trim();
  if (!name) { message.textContent = '그룹명을 입력하세요.'; return; }
  if (Object.hasOwn(state.codes[current()], name)) { message.textContent = '같은 그룹명이 이미 있습니다.'; return; }
  state.codes[current()][name] = [];
  groupDialog.close();
  try { await persist(); document.getElementById('code-group').value = name; message.textContent = '그룹을 추가했습니다.'; }
  catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
});
document.getElementById('group-dialog-cancel').addEventListener('click', () => groupDialog.close());
document.getElementById('group-dialog-close').addEventListener('click', () => groupDialog.close());
load();
