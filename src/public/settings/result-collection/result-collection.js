import { api, errorMessage, showToast } from '/shared/js/api.js';

/* 결과 수집: 수신함(읽기 전용)과 OS별 결과 저장 경로 기본값 */
const $ = (id) => document.getElementById(id);

function render(settings) {
  const list = $('inbox-list');
  list.replaceChildren(...settings.inboxes.map((dir) => {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = dir;
    item.append(code);
    return item;
  }));
  $('result-path-windows').value = settings.windows;
  $('result-path-linux').value = settings.linux;
}

async function load() {
  render(await api('/api/settings/result-paths'));
}

$('result-path-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('result-path-error');
  error.hidden = true;
  try {
    const saved = await api('/api/settings/result-paths', {
      method: 'PUT',
      body: { windows: $('result-path-windows').value.trim(), linux: $('result-path-linux').value.trim() },
    });
    render(saved);
    showToast('결과 저장 경로를 저장했습니다. 이미 내려받은 스크립트에는 반영되지 않으니 다시 내려받으세요.', 'success');
  } catch (failure) {
    error.textContent = errorMessage(failure);
    error.hidden = false;
  }
});

load().catch((failure) => {
  const error = $('result-path-error');
  error.textContent = errorMessage(failure, '설정을 불러오지 못했습니다.');
  error.hidden = false;
});
