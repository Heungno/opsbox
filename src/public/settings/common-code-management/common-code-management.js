import { api, errorMessage, loadText, notifyError } from '/shared/js/api.js';

await window.opsboxLayoutReady;

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
let codes = {};
let editing = null;

const reservedMeta = '_codeMeta';
function metaKey(category, group, value) { return [category, group || '', value].join('::'); }
function getMeta(category, group, value) { return codes[reservedMeta]?.[metaKey(category, group, value)] || {}; }
function setMeta(category, group, value, meta) {
  codes[reservedMeta] ||= {};
  const key = metaKey(category, group, value);
  if (meta.enabled && meta.sortOrder === 0 && !meta.label) delete codes[reservedMeta][key];
  else codes[reservedMeta][key] = meta;
}
function current() { return select.value; }
function grouped() { const value = codes[current()]; return value && !Array.isArray(value) && typeof value === 'object'; }
function groups() { return grouped() ? Object.keys(codes[current()]) : ['']; }
function isSystemCode(category, item) {
  if (category !== 'scriptItems') return false;
  const value = item && typeof item === 'object' ? String(item.value) : String(item);
  return value === 'START' || value === 'SAVE' || item?.group === '시스템';
}
function rows(group) {
  const list = grouped() ? codes[current()][group] : codes[current()];
  return (Array.isArray(list) ? list : []).map((item, index) => {
    const object = item && typeof item === 'object';
    const value = object ? item.value : item;
    const extra = object ? item : {};
    const meta = getMeta(current(), group, String(value));
    return { group, index, value: String(value), label: meta.label ?? extra.label ?? String(value), enabled: meta.enabled ?? extra.enabled ?? true, sortOrder: Number(meta.sortOrder ?? extra.sortOrder ?? index), object, extra, protected: isSystemCode(current(), item) };
  }).sort((a,b) => a.sortOrder - b.sortOrder || a.index - b.index);
}
function render() {
  const category = current();
  document.getElementById('group-add').hidden = !grouped();
  document.getElementById('entry-add').disabled = grouped() && groups().length === 0;
  document.getElementById('code-group-field').hidden = !grouped();
  const groupSelect = document.getElementById('code-group');
  const selectedGroup = groupSelect.value;
  groupSelect.replaceChildren();
  for (const group of groups()) {
    const option = document.createElement('option'); option.value = group; option.textContent = group; groupSelect.append(option);
  }
  if (groups().includes(selectedGroup)) groupSelect.value = selectedGroup;
  document.getElementById('entry-heading').textContent = `${category || '코드'} 목록`;
  table.replaceChildren();
  let count = 0;
  for (const group of groups()) for (const row of rows(group)) {
    count++;
    const tr = document.createElement('tr');
    const values = [group ? `${group} / ${row.value}` : row.value, row.label, row.enabled ? '사용' : '미사용', String(row.sortOrder)];
    for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    const actions = document.createElement('td');
    const edit = document.createElement('button'); edit.className = 'btn btn-small'; edit.textContent = '수정'; edit.addEventListener('click', () => openEditor(row));
    actions.append(edit);
    if (!row.protected) {
      const remove = document.createElement('button'); remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.addEventListener('click', () => deleteRow(row));
      actions.append(document.createTextNode(' '), remove);
    } else {
      const protectedLabel = document.createElement('small'); protectedLabel.className = 'policy-help'; protectedLabel.textContent = '시스템';
      actions.append(document.createTextNode(' '), protectedLabel);
    }
    tr.append(actions); table.append(tr);
  }
  document.getElementById('codes-empty').hidden = count > 0;
}
function renderCategories() {
  const previous = current(); select.replaceChildren();
  for (const name of Object.keys(codes).filter((key) => key !== reservedMeta)) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
  if (Object.hasOwn(codes, previous)) select.value = previous;
  renderCategoryList();
  render();
}
function renderCategoryList() {
  const list = document.getElementById('category-list');
  list.replaceChildren();
  for (const name of Object.keys(codes).filter((key) => key !== reservedMeta)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `template-list-item${name === current() ? ' is-selected' : ''}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(name === current()));
    const title = document.createElement('strong');
    title.textContent = name;
    const count = document.createElement('small');
    count.textContent = `${Object.values(groupedFor(name) ? codes[name] : { '': codes[name] }).reduce((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0)}개 코드`;
    const info = document.createElement('div');
    info.append(title, count);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-small btn-danger';
    remove.textContent = '삭제';
    remove.setAttribute('aria-label', `${name} 분류 삭제`);
    remove.addEventListener('click', (event) => { event.stopPropagation(); deleteCategory(name); });
    item.append(info, remove);
    item.addEventListener('click', () => { select.value = name; renderCategoryList(); render(); });
    list.append(item);
  }
}
function groupedFor(category) { const value = codes[category]; return value && !Array.isArray(value) && typeof value === 'object'; }
async function deleteCategory(category) {
  if (!confirm(`'${category}' 분류와 포함된 코드를 모두 삭제할까요?`)) return;
  delete codes[category];
  if (codes[reservedMeta]) for (const key of Object.keys(codes[reservedMeta])) if (key.startsWith(`${category}::`)) delete codes[reservedMeta][key];
  try { await persist(); message.textContent = '분류를 삭제했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
async function persist() {
  try {
    codes = await api('/api/common-codes', { method: 'PUT', body: codes });
    renderCategories();
  } catch (error) {
    // 저장에 실패하면 화면을 서버에 저장된 상태로 되돌립니다.
    try { codes = await api('/api/common-codes/manage'); renderCategories(); } catch { /* 원래 오류를 보여줍니다 */ }
    throw error;
  }
}
async function load() { try { codes = await api('/api/common-codes/manage'); renderCategories(); message.textContent = ''; } catch (error) { message.textContent = errorMessage(error, '공통코드를 불러오지 못했습니다.'); } }
function openEditor(row) {
  editing = row || null;
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
  const value = document.getElementById('code-value').value.trim();
  const label = document.getElementById('code-label').value.trim();
  const group = editing?.group ?? (grouped() ? document.getElementById('code-group').value : '');
  const list = grouped() ? codes[current()][group] : codes[current()];
  const oldValue = editing?.value;
  if (list.some((item, i) => String(typeof item === 'object' ? item.value : item) === value && (!editing || i !== editing.index))) { message.textContent = '같은 코드 값이 이미 있습니다.'; return; }
  if (editing) list.splice(editing.index, 1);
  const enabled = document.getElementById('code-enabled').value === 'true';
  const sortOrder = Number(document.getElementById('code-order').value) || 0;
  const objectList = editing?.object ?? (Array.isArray(list) && list.some((item) => item && typeof item === 'object'));
  if (objectList) {
    const entry = { ...(editing?.extra || {}), value, label, enabled, sortOrder };
    list.push(entry);
  } else {
    list.push(value);
    setMeta(current(), group, value, { label: label === value ? '' : label, enabled, sortOrder });
  }
  if (editing && oldValue !== value) setMeta(current(), group, oldValue, { enabled: true, sortOrder: 0, label: '' });
  dialog.close();
  try { await persist(); message.textContent = '저장했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
async function deleteRow(row) {
  if (row.protected) { message.textContent = '시스템 코드는 삭제할 수 없습니다.'; return; }
  const list = grouped() ? codes[current()][row.group] : codes[current()];
  list.splice(row.index, 1); setMeta(current(), row.group, row.value, { enabled: true, sortOrder: 0, label: '' });
  try { await persist(); message.textContent = '코드를 삭제했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
}
select.addEventListener('change', () => { renderCategoryList(); render(); });
document.getElementById('entry-add').addEventListener('click', () => {
  openEditor();
});
document.getElementById('code-form').addEventListener('submit', saveRow);
document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());
document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
async function saveCategory(event) {
  event.preventDefault();
  const key = document.getElementById('category-name').value.trim();
  if (!key || Object.hasOwn(codes, key)) { message.textContent = '분류명이 비어 있거나 이미 존재합니다.'; return; }
  codes[key] = document.getElementById('category-mapping').value === 'true' ? {} : [];
  categoryDialog.close();
  try { await persist(); select.value = key; renderCategoryList(); render(); message.textContent = '분류를 추가했습니다.'; } catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
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
  if (Object.hasOwn(codes[current()], name)) { message.textContent = '같은 그룹명이 이미 있습니다.'; return; }
  codes[current()][name] = [];
  groupDialog.close();
  try { await persist(); document.getElementById('code-group').value = name; message.textContent = '그룹을 추가했습니다.'; }
  catch (error) { message.textContent = errorMessage(error, '저장하지 못했습니다.'); }
});
document.getElementById('group-dialog-cancel').addEventListener('click', () => groupDialog.close());
document.getElementById('group-dialog-close').addEventListener('click', () => groupDialog.close());
load();
