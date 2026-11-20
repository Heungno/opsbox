const select = document.getElementById('category-select');
const table = document.getElementById('codes-table');
const message = document.getElementById('codes-message');
const dialog = document.getElementById('code-dialog');
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
function rows(group) {
  const list = grouped() ? codes[current()][group] : codes[current()];
  return (Array.isArray(list) ? list : []).map((item, index) => {
    const object = item && typeof item === 'object';
    const value = object ? item.value : item;
    const extra = object ? item : {};
    const meta = getMeta(current(), group, String(value));
    return { group, index, value: String(value), label: meta.label ?? extra.label ?? String(value), enabled: meta.enabled ?? extra.enabled ?? true, sortOrder: Number(meta.sortOrder ?? extra.sortOrder ?? index), object, extra };
  }).sort((a,b) => a.sortOrder - b.sortOrder || a.index - b.index);
}
function render() {
  const category = current();
  document.getElementById('entry-heading').textContent = `${category || '코드'} 목록`;
  document.getElementById('category-remove').disabled = !category;
  table.replaceChildren();
  let count = 0;
  for (const group of groups()) for (const row of rows(group)) {
    count++;
    const tr = document.createElement('tr');
    const values = [group ? `${group} / ${row.value}` : row.value, row.label, row.enabled ? '사용' : '미사용', String(row.sortOrder)];
    for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    const actions = document.createElement('td');
    const edit = document.createElement('button'); edit.className = 'btn btn-small'; edit.textContent = '수정'; edit.addEventListener('click', () => openEditor(row));
    const remove = document.createElement('button'); remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.addEventListener('click', () => deleteRow(row));
    actions.append(edit, document.createTextNode(' '), remove); tr.append(actions); table.append(tr);
  }
  document.getElementById('codes-empty').hidden = count > 0;
}
function renderCategories() {
  const previous = current(); select.replaceChildren();
  for (const name of Object.keys(codes).filter((key) => key !== reservedMeta)) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
  if (Object.hasOwn(codes, previous)) select.value = previous;
  render();
}
async function persist() {
  const response = await fetch('/api/common-codes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(codes) });
  const result = await response.json(); if (!response.ok) throw new Error(result.message || '저장에 실패했습니다.'); codes = result; renderCategories();
}
async function load() { try { const response = await fetch('/api/common-codes/manage'); if (!response.ok) throw new Error('불러오기에 실패했습니다.'); codes = await response.json(); renderCategories(); message.textContent = ''; } catch (error) { message.textContent = error.message; } }
function openEditor(row) {
  editing = row || null;
  document.getElementById('dialog-title').textContent = row ? '코드 수정' : '코드 추가';
  document.getElementById('code-value').value = row?.value ?? '';
  document.getElementById('code-label').value = row?.label ?? '';
  document.getElementById('code-enabled').value = String(row?.enabled ?? true);
  document.getElementById('code-order').value = String(row?.sortOrder ?? (rows(row?.group || '').length));
  dialog.showModal();
}
async function saveRow(event) {
  event.preventDefault();
  const value = document.getElementById('code-value').value.trim();
  const label = document.getElementById('code-label').value.trim();
  const group = editing?.group ?? (grouped() ? groups()[0] || '' : '');
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
  try { await persist(); message.textContent = '저장했습니다.'; } catch (error) { message.textContent = error.message; }
}
async function deleteRow(row) {
  const list = grouped() ? codes[current()][row.group] : codes[current()];
  list.splice(row.index, 1); setMeta(current(), row.group, row.value, { enabled: true, sortOrder: 0, label: '' });
  try { await persist(); message.textContent = '코드를 삭제했습니다.'; } catch (error) { message.textContent = error.message; }
}
select.addEventListener('change', render);
document.getElementById('entry-add').addEventListener('click', () => {
  if (grouped() && !groups().length) {
    const group = prompt('코드를 추가할 그룹명을 입력하세요.'); if (!group) return;
    codes[current()][group.trim()] = [];
    render();
  }
  openEditor();
});
document.getElementById('code-form').addEventListener('submit', saveRow);
document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());
document.getElementById('category-add').addEventListener('click', async () => {
  const name = prompt('새 코드 분류명을 입력하세요.'); if (!name) return;
  const key = name.trim(); if (!key || Object.hasOwn(codes, key)) { message.textContent = '분류명이 비어 있거나 이미 존재합니다.'; return; }
  const mapping = confirm('역할·그룹별 코드 목록으로 만들까요?\n확인: 그룹형 / 취소: 일반 목록');
  codes[key] = mapping ? {} : [];
  try { await persist(); select.value = key; render(); message.textContent = '분류를 추가했습니다.'; } catch (error) { message.textContent = error.message; }
});
document.getElementById('category-remove').addEventListener('click', async () => {
  const category = current(); if (!category || !confirm(`'${category}' 분류와 포함된 코드를 모두 삭제할까요?`)) return;
  delete codes[category];
  if (codes[reservedMeta]) for (const key of Object.keys(codes[reservedMeta])) if (key.startsWith(`${category}::`)) delete codes[reservedMeta][key];
  try { await persist(); message.textContent = '분류를 삭제했습니다.'; } catch (error) { message.textContent = error.message; }
});
load();
