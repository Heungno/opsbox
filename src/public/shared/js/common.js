import { api, notifyError } from './api.js';

/*
 * 공통 사이드바 동작
 * 레이아웃·사이드바 HTML, 현재 메뉴 강조, 로그인 사용자 이름은 서버가 화면에 넣어서 보냅니다(src/pages.ts).
 * 여기서는 브라우저에서만 할 수 있는 일(접힘 상태 복원, 테마, 버튼 동작)만 맡습니다.
 * module 스크립트는 HTML을 다 읽은 뒤 실행되므로 요소를 바로 찾을 수 있습니다.
 */
function initializeSidebar() {
  restoreSidebarState();
  initializeSidebarTheme();
  bindSidebarToggle();
  bindSettingsMenu();
  document.getElementById('logout-button')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      notifyError(error, '로그아웃 처리 중 오류가 발생했습니다.');
      return;
    }
    location.replace('/login');
  });
}

function initializeSidebarTheme() {
  const sidebar = document.getElementById('sidebar');
  const button = document.getElementById('theme-toggle');
  if (!sidebar || !button) return;

  // 직접 고른 테마가 없으면 기기 다크 모드 설정을 따르고, 기기 설정이 바뀌면 바로 반영합니다.
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = () => {
    try {
      const value = localStorage.getItem('opsbox-theme');
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  };
  const currentTheme = () => savedTheme() ?? (systemDark.matches ? 'dark' : 'light');

  applyTheme(currentTheme(), sidebar);
  systemDark.addEventListener('change', () => {
    if (!savedTheme()) applyTheme(currentTheme(), sidebar);
  });
  button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, sidebar);
    try { localStorage.setItem('opsbox-theme', nextTheme); } catch { /* 저장 불가(사생활 보호 모드 등)면 이번 화면에만 적용 */ }
  });
}

function applyTheme(theme, sidebar) {
  document.documentElement.dataset.theme = theme;
  sidebar.dataset.theme = theme;
  const button = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if (button && icon && label) {
    const nextLabel = theme === 'dark' ? '밝은 테마' : '어두운 테마';
    icon.innerHTML = theme === 'dark'
      ? '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8.5 8.5 0 1 0 19.5 15.2Z"/>';
    label.textContent = nextLabel;
    button.setAttribute('aria-label', `${nextLabel}로 전환`);
  }
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function bindSidebarToggle() {
  const button = document.getElementById('sidebar-toggle');

  const sidebar = document.getElementById('sidebar');

  const layout = document.querySelector('.layout');

  if (!button || !sidebar || !layout) {
    return;
  }

  button.setAttribute('aria-controls', 'sidebar');
  button.setAttribute('aria-expanded', 'false');

  button.addEventListener('click', () => {
    // 모바일에서는 메뉴를 여닫고, 데스크톱 접힘 상태는 건드리지 않습니다.
    if (isMobileLayout()) {
      const open = sidebar.classList.toggle('mobile-open');
      button.setAttribute('aria-expanded', String(open));
      return;
    }

    sidebar.classList.toggle('collapsed');

    layout.classList.toggle('sidebar-collapsed');

    const collapsed = sidebar.classList.contains('collapsed');

    localStorage.setItem('sidebar-collapsed', collapsed);
  });
}

function bindSettingsMenu() {
  const button = document.getElementById('settings-menu-toggle');
  const submenu = document.getElementById('settings-submenu');
  if (!button || !submenu) return;
  button.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const layout = document.querySelector('.layout');
    if (sidebar?.classList.contains('collapsed') && !isMobileLayout()) {
      sidebar.classList.remove('collapsed');
      layout?.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebar-collapsed', 'false');
      button.setAttribute('aria-expanded', 'true');
      submenu.hidden = false;
      return;
    }
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    submenu.hidden = expanded;
  });
}

function restoreSidebarState() {
  const sidebar = document.getElementById('sidebar');

  const layout = document.querySelector('.layout');

  if (!sidebar || !layout) {
    return;
  }

  // 모바일에서는 데스크톱 접힘 상태를 적용하지 않습니다 (메뉴는 햄버거로만 여닫음).
  if (isMobileLayout()) {
    return;
  }

  const collapsed = localStorage.getItem('sidebar-collapsed');

  if (collapsed === 'true') {
    sidebar.classList.add('collapsed');

    layout.classList.add('sidebar-collapsed');
  }
}

initializeSidebar();
