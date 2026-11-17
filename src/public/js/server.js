let editId = null;
let serverCache = [];

const serverForm = document.getElementById('server-form');

const searchBox = document.getElementById('search');

const serverList = document.getElementById('server-list');

const cancelButton = document.getElementById('btn-cancel');

const newButton = document.getElementById('btn-new');

serverForm?.addEventListener('submit', saveServer);

cancelButton?.addEventListener('click', resetForm);

newButton?.addEventListener('click', showNewForm);

searchBox?.addEventListener('input', renderServers);

async function loadServers() {
  try {
    const response = await fetch('/api/servers');

    if (!response.ok) {
      throw new Error('서버 조회 실패');
    }

    serverCache = await response.json();

    updateSummary();

    renderServers();
  } catch (error) {
    console.error(error);

    alert('서버 목록 조회 실패');
  }
}

async function saveServer(event) {
  event.preventDefault();

  const server = {
    id: document.getElementById('id').value.trim(),

    name: document.getElementById('name').value.trim(),

    type: document.getElementById('type').value,

    os: document.getElementById('os').value,

    ip: document.getElementById('ip').value.trim(),

    sharedPath: document.getElementById('sharedPath').value.trim(),
  };

  try {
    if (editId) {
      const response = await fetch(`/api/servers/${editId}`, {
        method: 'PUT',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify(server),
      });

      if (!response.ok) {
        throw new Error('수정 실패');
      }
    } else {
      const response = await fetch('/api/servers', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify(server),
      });

      if (!response.ok) {
        throw new Error('등록 실패');
      }
    }

    resetForm();

    await loadServers();
  } catch (error) {
    console.error(error);

    alert('저장 실패');
  }
}

function renderServers() {
  if (!serverList) {
    return;
  }

  const keyword = searchBox?.value?.trim()?.toLowerCase() || '';

  const servers = serverCache.filter((server) => {
    return (
      server.id.toLowerCase().includes(keyword) ||
      server.name.toLowerCase().includes(keyword) ||
      server.ip.toLowerCase().includes(keyword) ||
      server.type.toLowerCase().includes(keyword)
    );
  });

  serverList.replaceChildren();

  servers.forEach((server) => {
    const tr = document.createElement('tr');

    const idTd = document.createElement('td');

    const link = document.createElement('a');

    link.href = `/server-detail.html?id=${server.id}`;

    link.textContent = server.id;

    idTd.appendChild(link);

    const nameTd = document.createElement('td');

    nameTd.textContent = server.name;

    const typeTd = document.createElement('td');

    typeTd.textContent = server.type;

    const osTd = document.createElement('td');

    osTd.textContent = server.os;

    const ipTd = document.createElement('td');

    ipTd.textContent = server.ip;

    const actionTd = document.createElement('td');

    const editButton = document.createElement('button');

    editButton.textContent = '수정';

    editButton.className = 'btn btn-small';

    editButton.addEventListener('click', () => fillEditForm(server));

    const deleteButton = document.createElement('button');

    deleteButton.textContent = '삭제';

    deleteButton.className = 'btn btn-danger btn-small';

    deleteButton.addEventListener('click', () => removeServer(server.id));

    actionTd.appendChild(editButton);

    actionTd.appendChild(deleteButton);

    tr.appendChild(idTd);

    tr.appendChild(nameTd);

    tr.appendChild(typeTd);

    tr.appendChild(osTd);

    tr.appendChild(ipTd);

    tr.appendChild(actionTd);

    serverList.appendChild(tr);
  });
}

function fillEditForm(server) {
  editId = server.id;

  document.getElementById('form-title').textContent = '서버 수정';

  document.getElementById('id').value = server.id;

  document.getElementById('name').value = server.name;

  document.getElementById('type').value = server.type;

  document.getElementById('os').value = server.os;

  document.getElementById('ip').value = server.ip;

  document.getElementById('sharedPath').value = server.sharedPath || '';

  document.getElementById('id').disabled = true;

  document.getElementById('server-form-section')?.scrollIntoView({
    behavior: 'smooth',
  });
}

async function removeServer(id) {
  const confirmed = confirm(`${id} 서버를 삭제하시겠습니까?`);

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/servers/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('삭제 실패');
    }

    await loadServers();
  } catch (error) {
    console.error(error);

    alert('삭제 실패');
  }
}

function resetForm() {
  editId = null;

  serverForm?.reset();

  document.getElementById('form-title').textContent = '서버 등록';

  document.getElementById('id').disabled = false;

  document.getElementById('sharedPath').value = '';
}

function showNewForm() {
  resetForm();

  document.getElementById('server-form-section')?.scrollIntoView({
    behavior: 'smooth',
  });

  document.getElementById('id').focus();
}

function updateSummary() {
  const total = serverCache.length;

  const web = serverCache.filter((s) => s.type === 'WEB').length;

  const was = serverCache.filter((s) => s.type === 'WAS').length;

  const db = serverCache.filter((s) => s.type === 'DB').length;

  document.getElementById('total-count').textContent = total;

  document.getElementById('web-count').textContent = web;

  document.getElementById('was-count').textContent = was;

  document.getElementById('db-count').textContent = db;
}

loadServers();
