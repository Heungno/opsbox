/*
 * OpsBox API 클라이언트
 *
 * 서버 응답 규약
 *   성공: { success: true, data, ...meta }
 *   실패: { success: false, code, message, errors?, requestId? }
 *
 * 사용법
 *   import { api, apiRequest, notifyError, showToast } from '/shared/js/api.js';
 *   const servers = await api('/api/servers');                         // data만
 *   const { data, health } = await apiRequest('/api/results/A/latest'); // 응답 전체
 *   await api('/api/servers', { method: 'POST', body: server });        // body는 자동 JSON
 *
 * 실패하면 ApiError를 던집니다. (message는 화면에 그대로 보여줄 수 있는 한국어)
 * 401(로그인 만료)이면 로그인 화면으로 이동합니다.
 */

const DEFAULT_TIMEOUT_MS = 30000;

const STATUS_MESSAGES = {
  0: '서버에 연결할 수 없습니다. 네트워크 연결이나 서버 상태를 확인하세요.',
  400: '요청 내용이 올바르지 않습니다.',
  401: '로그인이 필요합니다.',
  403: '권한이 없습니다.',
  404: '요청한 항목을 찾을 수 없습니다.',
  408: '서버 응답이 너무 늦습니다. 잠시 후 다시 시도하세요.',
  409: '현재 상태에서 처리할 수 없습니다. 새로고침 후 다시 시도하세요.',
  413: '요청 데이터가 너무 큽니다.',
  500: '서버 처리 중 오류가 발생했습니다.',
  502: '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.',
  503: '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하세요.',
  504: '서버 응답 시간이 초과되었습니다.',
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', errors = [], requestId, url } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = Array.isArray(errors) ? errors : [];
    this.requestId = requestId;
    this.url = url;
  }
}

function defaultMessage(status) {
  return STATUS_MESSAGES[status] || (status >= 500 ? STATUS_MESSAGES[500] : STATUS_MESSAGES[400]);
}

let redirectingToLogin = false;
function redirectToLogin() {
  if (redirectingToLogin || location.pathname === '/login') return;
  redirectingToLogin = true;
  location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  return text;
}

/**
 * API를 호출하고 응답 본문 전체(envelope)를 돌려줍니다.
 * @param {string} url
 * @param {{ method?: string, body?: unknown, headers?: Record<string,string>, timeout?: number, signal?: AbortSignal, redirectOnUnauthorized?: boolean }} [options]
 */
export async function apiRequest(url, options = {}) {
  const { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT_MS, signal, redirectOnUnauthorized = true } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...headers }, signal: controller.signal };
  if (body !== undefined) {
    if (body instanceof FormData || typeof body === 'string') init.body = body;
    else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (signal?.aborted) throw error; // 호출한 쪽에서 취소한 경우 그대로 전달
    const timedOut = controller.signal.aborted;
    throw new ApiError(timedOut ? STATUS_MESSAGES[408] : STATUS_MESSAGES[0], { status: timedOut ? 408 : 0, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', url });
  } finally {
    clearTimeout(timer);
  }

  const payload = await readBody(response).catch(() => undefined);
  const envelope = payload && typeof payload === 'object' ? payload : undefined;

  if (!response.ok || envelope?.success === false) {
    const status = response.ok ? 400 : response.status;
    const error = new ApiError(envelope?.message || defaultMessage(status), {
      status,
      code: envelope?.code || (response.ok ? 'BAD_REQUEST' : `HTTP_${response.status}`),
      errors: envelope?.errors,
      requestId: envelope?.requestId,
      url,
    });
    if (status === 401 && redirectOnUnauthorized) redirectToLogin();
    throw error;
  }

  if (!envelope) {
    throw new ApiError('서버 응답 형식이 올바르지 않습니다.', { status: response.status, code: 'INVALID_RESPONSE', url });
  }
  return envelope;
}

/** API를 호출하고 data만 돌려줍니다. */
export async function api(url, options) {
  return (await apiRequest(url, options)).data;
}

/** HTML 조각(fragment) 불러오기 */
export async function loadText(url) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(STATUS_MESSAGES[0], { status: 0, code: 'NETWORK_ERROR', url });
  }
  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw new ApiError(`화면 구성 파일을 불러오지 못했습니다. (${response.status})`, { status: response.status, code: `HTTP_${response.status}`, url });
  return response.text();
}

/**
 * 파일 다운로드. 실패하면 서버의 오류 메시지로 ApiError를 던집니다.
 * (새 탭으로 열면 오류가 JSON 그대로 보이므로 fetch → Blob으로 받습니다.)
 */
export async function downloadFile(url, fallbackName = 'download') {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(STATUS_MESSAGES[0], { status: 0, code: 'NETWORK_ERROR', url });
  }
  if (!response.ok) {
    const payload = await readBody(response).catch(() => undefined);
    const envelope = payload && typeof payload === 'object' ? payload : {};
    if (response.status === 401) redirectToLogin();
    throw new ApiError(envelope.message || defaultMessage(response.status), { status: response.status, code: envelope.code || `HTTP_${response.status}`, errors: envelope.errors, requestId: envelope.requestId, url });
  }
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName;
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return fileName;
}

/** 오류를 화면에 보여줄 문장으로 바꿉니다. (필드 오류가 있으면 함께) */
export function errorMessage(error, fallback = '처리 중 오류가 발생했습니다.') {
  if (!error) return fallback;
  const base = error.message || fallback;
  const details = (error.errors || [])
    .map((item) => item?.message)
    .filter((message) => message && message !== base);
  const lines = [base, ...new Set(details)];
  if (error.requestId) lines.push(`(요청 ID: ${error.requestId})`);
  return lines.join('\n');
}

/* ---------- 알림(토스트) ---------- */

function toastContainer() {
  let container = document.getElementById('opsbox-toasts');
  if (!container) {
    container = document.createElement('div');
    container.id = 'opsbox-toasts';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.append(container);
  }
  return container;
}

/**
 * @param {string} message
 * @param {'error'|'success'|'info'} [type]
 */
export function showToast(message, type = 'info', { duration } = {}) {
  if (!document.body) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const text = document.createElement('div');
  text.className = 'toast-message';
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', '닫기');
  close.textContent = '×';
  const remove = () => toast.remove();
  close.addEventListener('click', remove);
  toast.append(text, close);
  toastContainer().append(toast);
  setTimeout(remove, duration ?? (type === 'error' ? 8000 : 3500));
}

/** 오류 알림 + 콘솔 기록. 로그인 화면으로 이동 중인 401은 알리지 않습니다. */
export function notifyError(error, fallback) {
  if (error?.name === 'AbortError') return;
  // 입력·요청 오류(4xx)는 경고, 서버·네트워크 오류는 에러로 기록합니다.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) console.warn(error);
  else console.error(error);
  if (error instanceof ApiError && error.status === 401 && redirectingToLogin) return;
  showToast(errorMessage(error, fallback), 'error');
}

/* 처리되지 않은 오류도 화면에 알립니다 (조용히 멈추지 않도록). */
if (!window.__opsboxErrorHooks) {
  window.__opsboxErrorHooks = true;
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    notifyError(event.reason, '처리 중 오류가 발생했습니다.');
  });
  window.addEventListener('error', (event) => {
    if (event.error) notifyError(event.error, '화면 처리 중 오류가 발생했습니다.');
  });
}

window.opsboxApi = { api, apiRequest, loadText, downloadFile, errorMessage, showToast, notifyError, ApiError };
