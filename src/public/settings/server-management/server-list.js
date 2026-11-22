import { api, loadText, notifyError, showToast } from '/shared/js/api.js';
import { codeList, loadCodes } from '/shared/js/codes.js';
import { option } from '/shared/js/dom.js';
import { filterServers, renderRoleProductFields, renderRoleTabs, renderServerRows, renderSummaryCards, summarizeServers } from './server-list-view.js';

/* 서버 목록 (연결부): 요소 찾기, 이벤트, API 호출. 그리기·계산은 server-list-view.js */

/** 화면 상태 */
const state = { servers: [], activeRole: 'ALL', roleFields: null };
const $ = (id) => document.getElementById(id);

async function init() {
  $('server-modal-container').innerHTML = await loadText('/shared/fragments/server-modal.html');
  await loadCodes();
  $('server-form-os').replaceChildren(...codeList('operatingSystems').map(({ value, label }) => option(value, label)));
  resetForm();
  $('server-modal-form').addEventListener('submit', saveServer);
  $('server-modal-close').addEventListener('click', closeServerDialog);
  $('server-modal-cancel').addEventListener('click', closeServerDialog);
  $('btn-new').addEventListener('click', showNewForm);
  $('search').addEventListener('input', renderServers);
  $('show-inactive').addEventListener('change', loadServers);
  const roleTabs = $('server-role-tabs');
  roleTabs.addEventListener('click', (event) => { const tab = event.target.closest('[role="tab"]'); if (tab) setActiveRole(tab.dataset.role); });
  roleTabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...roleTabs.querySelectorAll('[role="tab"]')];
    const current = tabs.findIndex((tab) => tab.dataset.role === state.activeRole);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    setActiveRole(tabs[next].dataset.role);
    roleTabs.querySelector(`[data-role="${tabs[next].dataset.role}"]`)?.focus();
  });
  await loadServers();
}

function setActiveRole(role) {
  state.activeRole = role;
  renderServers();
}

async function loadServers() {
  try {
    const includeInactive = $('show-inactive').checked;
    state.servers = (await api(`/api/servers${includeInactive ? '?includeInactive=1' : ''}`)) || [];
    renderSummaryCards($('server-summary'), summarizeServers(state.servers, codeList('serverRoles')), codeList('serverRoles'));
    renderServers();
  } catch (error) {
    notifyError(error, '서버 목록을 불러오지 못했습니다.');
  }
}

function renderServers() {
  const matching = filterServers(state.servers, { keyword: $('search').value });
  renderRoleTabs($('server-role-tabs'), codeList('serverRoles'), matching, state.activeRole);
  renderServerRows($('server-list'), filterServers(matching, { role: state.activeRole }), { onToggle: (server) => setServerEnabled(server, server.enabled === false) });
}

async function saveServer(event) {
  event.preventDefault();
  const server = {
    id: $('server-form-id').value.trim(),
    name: $('server-form-name').value.trim(),
    ...state.roleFields.read(),
    os: $('server-form-os').value,
    ip: $('server-form-ip').value.trim(),
    resultPath: $('server-form-result-path').value.trim(),
  };
  try {
    await api('/api/servers', { method: 'POST', body: server });
    closeServerDialog();
    showToast('서버를 등록했습니다.', 'success');
    await loadServers();
  } catch (error) {
    notifyError(error, '서버를 등록하지 못했습니다.');
  }
}

async function setServerEnabled(server, enabled) {
  if (!enabled && !confirm(`${server.id} 서버를 미사용으로 바꿀까요?\n미사용으로 바꾸면 대시보드와 스크립트 내려받기에서 빠집니다. 점검 결과와 보고서는 그대로 남습니다.`)) return;
  try {
    await api(`/api/servers/${encodeURIComponent(server.id)}/${enabled ? 'activate' : 'deactivate'}`, { method: 'POST' });
    showToast(enabled ? `${server.id} 서버를 다시 사용합니다.` : `${server.id} 서버를 미사용으로 바꿨습니다.`, 'success');
    await loadServers();
  } catch (error) {
    notifyError(error, enabled ? '서버를 다시 사용하지 못했습니다.' : '서버를 미사용으로 바꾸지 못했습니다.');
  }
}

function resetForm() {
  $('server-modal-form').reset();
  state.roleFields = renderRoleProductFields($('server-form-role-products'), ['WEB']);
  $('server-form-result-path').value = '';
}

function showNewForm() {
  resetForm();
  $('server-modal').showModal();
  $('server-form-id').focus();
}

function closeServerDialog() {
  $('server-modal').close();
  resetForm();
}

init().catch((error) => notifyError(error, '서버 관리 화면을 초기화하지 못했습니다.'));
