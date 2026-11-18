let serverCache = [];
const serverDialog = document.getElementById("server-form-dialog");

const serverForm = document.getElementById("server-form");

const searchBox = document.getElementById("search");

const serverList = document.getElementById("server-list");

const cancelButton = document.getElementById("btn-cancel");

const newButton = document.getElementById("btn-new");
const typeSelect = document.getElementById("type");
const productSelect = document.getElementById("product");
const productsByType = { WEB: ["WebtoB", "Apache HTTP Server", "IIS", "Nginx"], WAS: ["JEUS", "Apache Tomcat", "JBoss", "Node.js"] };
typeSelect?.addEventListener("change", () => populateProducts(typeSelect.value));
function populateProducts(type, selected = "") {
  if (!productSelect) return;
  productSelect.replaceChildren(new Option("제품 선택", ""));
  (productsByType[type] || []).forEach((product) => productSelect.add(new Option(product, product)));
  productSelect.value = selected;
}
populateProducts(typeSelect?.value || "WEB");

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

    type: document.getElementById("type").value,
    product: document.getElementById("product").value || undefined,

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
      server.type.toLowerCase().includes(keyword)
      || (server.product || "").toLowerCase().includes(keyword)
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

    typeTd.textContent = server.type;
    typeTd.textContent += server.product ? ` · ${server.product}` : "";

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
  populateProducts(typeSelect?.value || "WEB");
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

  const web = serverCache.filter((s) => s.type === "WEB").length;

  const was = serverCache.filter((s) => s.type === "WAS").length;

  const db = serverCache.filter((s) => s.type === "DB").length;

  document.getElementById("total-count").textContent = total;

  document.getElementById("web-count").textContent = web;

  document.getElementById("was-count").textContent = was;

  document.getElementById("db-count").textContent = db;
}

loadServers();
