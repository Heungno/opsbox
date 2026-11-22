import { api, errorMessage, notifyError, showToast } from '/shared/js/api.js';

/* 내 정보: 표시 이름·비밀번호 변경 */
const $ = (id) => document.getElementById(id);
const PASSWORD_MIN = 12;

/** 사이드바의 이름·첫 글자도 새 이름으로 */
function showSidebarName(displayName) {
  const name = $('current-user-name');
  if (name) { name.textContent = displayName; name.title = displayName; }
  const avatar = $('current-user-avatar');
  if (avatar) avatar.textContent = [...displayName][0]?.toUpperCase() || '?';
}

async function loadMe() {
  const me = await api('/api/auth/me');
  if (!me) return;
  $('account-username').value = me.username;
  $('password-form-username').value = me.username; // 브라우저 비밀번호 관리자가 어느 계정인지 알 수 있게
  $('account-display-name').value = me.displayName;
}

$('profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('account-display-name');
  const displayName = input.value.trim();
  if (!displayName) { showToast('이름을 입력하세요.', 'error'); input.focus(); return; }
  try {
    const me = await api('/api/auth/me', { method: 'PUT', body: { displayName } });
    input.value = me.displayName;
    showSidebarName(me.displayName);
    showToast('이름을 저장했습니다.', 'success');
  } catch (error) {
    notifyError(error);
  }
});

const passwordError = $('password-error');
function showPasswordError(message, focusId) {
  passwordError.textContent = message;
  passwordError.hidden = !message;
  if (focusId) $(focusId).focus();
}

$('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = $('current-password').value;
  const newPassword = $('new-password').value;
  if (!currentPassword) return showPasswordError('현재 비밀번호를 입력하세요.', 'current-password');
  if (newPassword.length < PASSWORD_MIN) return showPasswordError(`새 비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`, 'new-password');
  if (newPassword !== $('confirm-password').value) return showPasswordError('새 비밀번호 확인이 일치하지 않습니다.', 'confirm-password');
  if (newPassword === currentPassword) return showPasswordError('새 비밀번호가 현재 비밀번호와 같습니다.', 'new-password');
  showPasswordError('');
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    await api('/api/auth/password', { method: 'PUT', body: { currentPassword, newPassword }, redirectOnUnauthorized: false });
    event.target.reset();
    $('password-form-username').value = $('account-username').value;
    showToast('비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.', 'success');
  } catch (error) {
    // 현재 비밀번호가 틀린 경우(401)는 로그인 화면으로 보내지 않고 이 자리에서 알려 줍니다.
    showPasswordError(errorMessage(error), error?.status === 401 ? 'current-password' : undefined);
  } finally {
    if (button) button.disabled = false;
  }
});

loadMe().catch(notifyError);
