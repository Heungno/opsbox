let templates = [];
let editingId = '';

const form = document.getElementById('template-form');
const kind = document.getElementById('template-kind');
const help = document.getElementById('template-help');
const list = document.getElementById('template-list');

kind.addEventListener('change', updateFormMode);
document.getElementById('template-filter').addEventListener('change', loadTemplates);
document.getElementById('btn-template-reset').addEventListener('click', resetForm);
form.addEventListener('submit', saveTemplate);

function updateFormMode() {
  const script = kind.value === 'SCRIPT';
  document.querySelectorAll('.template-script-option').forEach((node) => node.hidden = !script);
  help.textContent = script
    ? '스크립트는 선택한 운영체제에서 실행할 전체 내용을 작성합니다. 사용 가능 변수: {{SERVER_ID}}, {{SERVER_NAME}}, {{SERVER_IP}}, {{SHARED_PATH}}, {{OS}}, {{ROLES}}, {{ROLES_JSON}}, {{PRODUCTS_JSON}}, {{PROCESSES_JSON}}, {{DIRECTORIES_JSON}}, {{FILE_CHECKS_JSON}}, {{PORTS_JSON}}, {{HTTP_CHECKS_JSON}}. 예제 템플릿은 수정해 저장하거나 복사해 새 템플릿으로 관리할 수 있습니다.'
    : '쿼리는 MSSQL 점검 스크립트에서 실행할 SQL입니다. {{SERVER_IP}}와 {{SERVER_NAME}}을 설정값으로 치환할 수 있습니다. 쿼리 결과는 기본 보고서의 컬럼 형식(SERVER|..., DATABASE|...)과 맞춰야 합니다.';
}

async function loadTemplates() {
  const filter = document.getElementById('template-filter').value;
  const response = await fetch(`/api/templates${filter ? `?kind=${filter}` : ''}`);
  templates = response.ok ? await response.json() : [];
  renderList();
}

function renderList() {
  list.replaceChildren();
  if (!templates.length) { list.textContent = '등록된 템플릿이 없습니다.'; return; }
  templates.forEach((item) => {
    const card = document.createElement('article'); card.className = 'template-list-item';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${item.kind === 'SCRIPT' ? `스크립트 · ${item.os || 'OS 미지정'}` : 'DB 쿼리'}${item.role ? ` · ${item.role}` : ''}${item.product ? ` · ${item.product}` : ''} · ${item.enabled ? '사용' : '중지'}`;
    info.append(title, meta);
    const actions = document.createElement('div'); actions.className = 'button-area';
    const edit = document.createElement('button'); edit.className = 'btn btn-small'; edit.textContent = '수정'; edit.addEventListener('click', () => editTemplate(item));
    const remove = document.createElement('button'); remove.className = 'btn btn-small btn-danger'; remove.textContent = '삭제'; remove.addEventListener('click', () => removeTemplate(item));
    actions.append(edit, remove); card.append(info, actions); list.appendChild(card);
  });
}

function editTemplate(item) {
  editingId = item.id;
  document.getElementById('template-form-title').textContent = '템플릿 수정';
  document.getElementById('btn-template-save').textContent = '변경 저장';
  document.getElementById('template-name').value = item.name;
  kind.value = item.kind;
  document.getElementById('template-os').value = item.os || 'Windows';
  document.getElementById('template-role').value = item.role || '';
  document.getElementById('template-product').value = item.product || '';
  document.getElementById('template-enabled').checked = item.enabled;
  document.getElementById('template-content').value = item.content;
  updateFormMode();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveTemplate(event) {
  event.preventDefault();
  const data = {
    name: document.getElementById('template-name').value.trim(), kind: kind.value,
    os: kind.value === 'SCRIPT' ? document.getElementById('template-os').value : undefined,
    role: kind.value === 'SCRIPT' ? document.getElementById('template-role').value || undefined : undefined,
    product: kind.value === 'SCRIPT' ? document.getElementById('template-product').value.trim() || undefined : undefined,
    enabled: document.getElementById('template-enabled').checked,
    content: document.getElementById('template-content').value,
  };
  const response = await fetch(editingId ? `/api/templates/${encodeURIComponent(editingId)}` : '/api/templates', {
    method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { alert(result.message || '템플릿 저장에 실패했습니다.'); return; }
  resetForm(); await loadTemplates();
}

async function removeTemplate(item) {
  if (!confirm(`'${item.name}' 템플릿을 삭제할까요?`)) return;
  const response = await fetch(`/api/templates/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
  if (!response.ok) { alert('템플릿 삭제에 실패했습니다.'); return; }
  await loadTemplates();
}

function resetForm() { editingId = ''; form.reset(); document.getElementById('template-form-title').textContent = '새 템플릿'; document.getElementById('btn-template-save').textContent = '템플릿 저장'; updateFormMode(); }

updateFormMode();
loadTemplates();
