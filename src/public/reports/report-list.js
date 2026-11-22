import { api, notifyError } from '/shared/js/api.js';
import { codeList, loadCodes } from '/shared/js/codes.js';
import { groupReports, renderReportTree } from './report-list-view.js';

await loadCodes(); // 공통코드(역할·상태 이름)를 그리기 전에 불러옴

async function init() {
  bindEvents();
  await loadReports();
}

function bindEvents() {
  const form = document.getElementById('filter-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadReports();
  });

  const resetBtn = document.getElementById('btn-reset');
  resetBtn.addEventListener('click', async () => {
    document.getElementById('filter-server').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    await loadReports();
  });
}

async function loadReports() {
  const server = document.getElementById('filter-server').value.trim();
  const startDate = document.getElementById('filter-start-date').value;
  const endDate = document.getElementById('filter-end-date').value;

  const params = new URLSearchParams();
  if (server) params.set('serverId', server);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const url = `/api/reports?${params.toString()}`;

  try {
    renderReportList((await api(url)) || []);
  } catch (error) {
    notifyError(error, '보고서 목록을 불러오지 못했습니다.');
  }
}

function renderReportList(reports) {
  document.getElementById('report-count').textContent = reports.length;
  // 역할 묶음 순서·이름은 공통코드 serverRoles
  renderReportTree(document.getElementById('report-tree'), groupReports(reports, codeList('serverRoles').map((code) => code.value)));
}

init();
