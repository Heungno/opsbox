let serverCache = [];
const serverDialog = document.getElementById("server-form-dialog");

const serverForm = document.getElementById("server-form");

const searchBox = document.getElementById("search");

const serverList = document.getElementById("server-list");

const cancelButton = document.getElementById("btn-cancel");

const newButton = document.getElementById("btn-new");
const productsByType = { WEB: ["WebtoB", "Apache HTTP Server", "IIS", "Nginx"], WAS: ["JEUS", "Apache Tomcat", "JBoss", "Node.js"], DB: ["MSSQL", "MariaDB", "CUBRID", "PostgreSQL"] };
renderRoleProducts(document.getElementById('role-product-fields'));

function renderRoleProducts(container, selectedRoles = [], selectedProducts = {}) {
  if (!container) return;
  container.replaceChildren();
  ['WEB', 'WAS', 'DB', 'OTHER'].forEach((role) => {
    const row = document.createElement('div'); row.className = 'role-product-row';
    const label = document.createElement('label');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = role; checkbox.checked = selectedRoles.includes(role);
    label.append(checkbox, document.createTextNode(role === 'OTHER' ? ' 기타' : ` ${role}`)); row.appendChild(label);
    if (role !== 'OTHER') {
      const select = document.createElement('select'); select.dataset.roleProduct = role;
      select.add(new Option('제품 선택', '')); (productsByType[role] || []).forEach((product) => select.add(new Option(product, product)));
      select.value = selectedProducts[role] || ''; row.appendChild(select);
    }
    checkbox.addEventListener('change', () => { row.classList.toggle('active', checkbox.checked); if (!checkbox.checked) { const select = row.querySelector('select'); if (select) select.value = ''; } });
    checkbox.dispatchEvent(new Event('change')); container.appendChild(row);
  });
}
function getRoleProductSelection(container) {
  const roles = [...container.querySelectorAll('input[type=checkbox]:checked')].map((input) => input.value);
  const products = Object.fromEntries([...container.querySelectorAll('select[data-role-product]')].filter((select) => roles.includes(select.dataset.roleProduct) && select.value).map((select) => [select.dataset.roleProduct, select.value]));
  return { roles, products, type: roles[0], product: products[roles[0]] };
}

serverForm?.addEventListener("submit", saveServer);

cancelButton?.addEventListener("click", closeServerDialog);
document.getElementById("btn-cancel-form")?.addEventListener("click", closeServerDialog);

newButton?.addEventListener("click", showNewForm);

searchBox?.addEventListener("input", renderServers);

async function loadServers() {
  try {
    const response = await fetch("/api/servers");

    if (!response.ok) {
      throw new Error("서버 조회 실패");
    }

    serverCache = await response.json();

    updateSummary();

    renderServers();
  } catch (error) {
    console.error(error);

    alert("서버 목록 조회 실패");
  }
}

async function saveServer(event) {
  event.preventDefault();

  const server = {
    id: document.getElementById("id").value.trim(),

    name: document.getElementById("name").value.trim(),

    ...getRoleProductSelection(document.getElementById('role-product-fields')),

    os: document.getElementById("os").value,

    ip: document.getElementById("ip").value.trim(),

    sharedPath: document.getElementById("sharedPath").value.trim(),
  };

  try {
    const response = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(server),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "등록 실패");
    }

    closeServerDialog();

    await loadServers();
  } catch (error) {
    console.error(error);

    alert(error.message || "등록 실패");
  }
}

function renderServers() {
  if (!serverList) {
    return;
  }

  const keyword = searchBox?.value?.trim()?.toLowerCase() || "";

  const servers = serverCache.filter((server) => {
    return (
      server.id.toLowerCase().includes(keyword) ||
      server.name.toLowerCase().includes(keyword) ||
      server.ip.toLowerCase().includes(keyword) ||
      getRoles(server).join(' ').toLowerCase().includes(keyword)
      || Object.values(server.products || {}).join(' ').toLowerCase().includes(keyword)
    );
  });

  serverList.replaceChildren();

  servers.forEach((server) => {
    const tr = document.createElement("tr");

    const idTd = document.createElement("td");

    const link = document.createElement("a");

    link.href = `/servers/detail?id=${encodeURIComponent(server.id)}`;

    link.textContent = server.id;

    idTd.appendChild(link);

    const nameTd = document.createElement("td");

    nameTd.textContent = server.name;

    const typeTd = document.createElement("td");

    typeTd.textContent = getRoles(server).map((role) => `${getServerTypeLabel(role)}${server.products?.[role] ? ` · ${server.products[role]}` : ''}`).join(' / ');

    const osTd = document.createElement("td");

    osTd.textContent = server.os;

    const ipTd = document.createElement("td");

    ipTd.textContent = server.ip;

    const actionTd = document.createElement("td");

    const detailButton = document.createElement("a");
    detailButton.textContent = "상세";
    detailButton.className = "btn btn-small";
    detailButton.href = `/servers/detail?id=${encodeURIComponent(server.id)}`;

    const deleteButton = document.createElement("button");

    deleteButton.textContent = "삭제";

    deleteButton.className = "btn btn-danger btn-small";

    deleteButton.addEventListener("click", () => removeServer(server.id));

    actionTd.appendChild(detailButton);

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

async function removeServer(id) {
  const confirmed = confirm(`${id} 서버를 삭제하시겠습니까?`);

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/servers/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("삭제 실패");
    }

    await loadServers();
  } catch (error) {
    console.error(error);

    alert("삭제 실패");
  }
}

function resetForm() {
  serverForm?.reset();
  renderRoleProducts(document.getElementById('role-product-fields'), ['WEB']);
  document.getElementById("sharedPath").value = "";
}

function showNewForm() {
  resetForm();

  serverDialog?.showModal();
  document.getElementById("id").focus();
}

function closeServerDialog() {
  serverDialog?.close();
  resetForm();
}

function updateSummary() {
  const total = serverCache.length;

  const web = serverCache.filter((s) => getRoles(s).includes("WEB")).length;

  const was = serverCache.filter((s) => getRoles(s).includes("WAS")).length;

  const db = serverCache.filter((s) => getRoles(s).includes("DB")).length;

  document.getElementById("total-count").textContent = total;

  document.getElementById("web-count").textContent = web;

  document.getElementById("was-count").textContent = was;

  document.getElementById("db-count").textContent = db;
  document.getElementById("other-count").textContent = serverCache.filter((s) => getRoles(s).includes("OTHER")).length;
}

function getRoles(server) { return server.roles?.length ? server.roles : [server.type]; }

function getServerTypeLabel(type) {
  return type === "OTHER" ? "기타" : type;
}

loadServers();
