/* 로그인 화면 (CSP script-src 'self'를 위해 HTML 안의 스크립트를 파일로 분리) */
import { api, apiRequest, errorMessage } from '/shared/js/api.js';

const params = new URLSearchParams(location.search);
// 로그인 후 이동할 주소는 같은 사이트 안의 경로만 허용합니다.
// ('/\evil.com'처럼 브라우저가 다른 사이트로 해석하는 값도 막도록 URL로 풀어서 출처를 비교)
function safeNext(value) {
  if (!value || !value.startsWith('/')) return '/';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}
const next = safeNext(params.get('next'));
const message = document.getElementById('message');
const form = document.getElementById('login-form');
const submit = form.querySelector('button[type="submit"]');

// 이미 로그인되어 있으면 이동 (확인 실패는 무시하고 로그인 화면 유지)
api('/api/auth/me', { redirectOnUnauthorized: false }).then((user) => { if (user) location.replace(next); }).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  message.textContent = '';
  submit.disabled = true;
  try {
    await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { username: String(data.get('username') || ''), password: String(data.get('password') || '') },
      redirectOnUnauthorized: false,
    });
    location.replace(next);
  } catch (error) {
    message.textContent = errorMessage(error, '로그인할 수 없습니다.');
    submit.disabled = false;
  }
});
