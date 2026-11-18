let templates = [];
let editingId = '';

const form = document.getElementById('template-form');
const kind = document.getElementById('template-kind');
const help = document.getElementById('template-help');
const list = document.getElementById('template-list');
const editor = document.getElementById('template-content');
const highlight = document.querySelector('#template-highlight code');

kind.addEventListener('change', updateFormMode);
document.getElementById('template-filter').addEventListener('change', loadTemplates);
document.getElementById('btn-template-reset').addEventListener('click', resetForm);
form.addEventListener('submit', saveTemplate);
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
    ? '점검 항목 템플릿은 서버 설정에 맞춰 다운로드할 때 한 개의 PS1로 조립됩니다. 템플릿에서는 $opsboxConfig와 결과 배열을 사용합니다. 실행 준비 템플릿의 @@CONFIG_BASE64@@ 토큰은 지우지 마세요. OS·디스크와 결과 저장 항목은 필수이며, 나머지는 서버 정책과 역할에 따라 조립됩니다.'
    : kind.value === 'SCRIPT'
      ? '전체 스크립트 템플릿은 항목별 조립을 대체하는 고급 사용자 지정 기능입니다. 일반적인 수정은 점검 항목 스크립트 템플릿을 사용하세요.'
      : '쿼리는 Windows MSSQL 점검에서 실행할 SQL입니다. {{SERVER_IP}}와 {{SERVER_NAME}}을 사용할 수 있습니다. 결과는 SERVER|... 및 DATABASE|... 행 형식이어야 합니다.';
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
    const card = document.createElement('article'); card.className = `template-list-item${editingId === item.id ? ' is-selected' : ''}`;
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.name;
    const typeLabel = item.kind === 'SCRIPT_PART' ? `점검 항목 · ${item.item || '미지정'}` : item.kind === 'SCRIPT' ? '전체 스크립트' : 'DB 쿼리';
    const meta = document.createElement('small'); meta.textContent = `${typeLabel}${item.os ? ` · ${item.os}` : ''}${item.role ? ` · ${item.role}` : ''}${item.product ? ` · ${item.product}` : ''} · ${item.enabled ? '사용' : '중지'}`;
    info.append(title, meta);
    const actions = document.createElement('div'); actions.className = 'button-area';
    const edit = document.createElement('button'); edit.className = 'btn btn-small'; edit.textContent = '열기'; edit.setAttribute('aria-label', `${item.name} 템플릿 열기`); edit.addEventListener('click', () => editTemplate(item));
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
  if (!response.ok) { alert(result.message || '템플릿 저장에 실패했습니다.'); return; }
  resetForm(); await loadTemplates();
}

async function removeTemplate(item) {
  if (!confirm(`'${item.name}' 템플릿을 삭제할까요?`)) return;
  const response = await fetch(`/api/templates/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
  if (!response.ok) { alert('템플릿 삭제에 실패했습니다.'); return; }
  await loadTemplates();
}

function resetForm() { editingId = ''; form.reset(); renderHighlightedTemplate(); document.getElementById('template-form-title').textContent = '새 템플릿'; document.getElementById('btn-template-save').textContent = '템플릿 저장'; updateFormMode(); renderList(); }

updateFormMode();
renderHighlightedTemplate();
loadTemplates();
