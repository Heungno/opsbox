async function applySharedLayout() {
  let root = document.getElementById('shared-layout-root');
  let originalContent = null;
  let pageTemplate = document.getElementById('page-content-template');
  if (!root) {
    const currentLayout = document.querySelector('.layout');
    if (!currentLayout) return;
    const contentContainer = currentLayout.querySelector('.content > .container');
    if (!contentContainer) return;
    originalContent = [...contentContainer.childNodes];
    root = document.createElement('div');
    root.id = 'shared-layout-root';
    currentLayout.replaceWith(root);
  }
  const response = await fetch('/shared/fragments/layout.html');
  if (!response.ok) throw new Error('공통 레이아웃을 불러오지 못했습니다.');
  root.innerHTML = await response.text();
  const page = document.getElementById('page-content');
  if (!page) return;
  if (pageTemplate) page.append(pageTemplate.content.cloneNode(true));
  else if (originalContent) page.append(...originalContent);
}

async function loadSidebar() {
  await window.opsboxLayoutReady;
  const response = await fetch('/shared/fragments/sidebar.html');

  const html = await response.text();

  const container = document.getElementById('sidebar-container');

  if (!container) {
    return;
  }

  container.innerHTML = html;

  restoreSidebarState();

  initializeSidebarTheme();

  bindSidebarToggle();
  bindSettingsMenu();

  activateCurrentMenu();
}

function initializeSidebarTheme() {
  const sidebar = document.getElementById('sidebar');
  const button = document.getElementById('theme-toggle');
  if (!sidebar || !button) return;

  const savedTheme = localStorage.getItem('opsbox-theme');
  const theme = savedTheme === 'dark' ? 'dark' : 'light';
  applyTheme(theme, sidebar);
  button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, sidebar);
    localStorage.setItem('opsbox-theme', nextTheme);
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
    icon.textContent = theme === 'dark' ? '☀' : '☾';
    label.textContent = nextLabel;
    button.setAttribute('aria-label', `${nextLabel}로 전환`);
  }
}

function bindSidebarToggle() {
  const button = document.getElementById('sidebar-toggle');

  const sidebar = document.getElementById('sidebar');

  const layout = document.querySelector('.layout');

  if (!button || !sidebar || !layout) {
    return;
  }

  button.addEventListener('click', () => {
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
    if (sidebar?.classList.contains('collapsed')) {
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

  const collapsed = localStorage.getItem('sidebar-collapsed');

  if (collapsed === 'true') {
    sidebar.classList.add('collapsed');

    layout.classList.add('sidebar-collapsed');
  }
}

function activateCurrentMenu() {
  const path = window.location.pathname;

  let activeMenu = 'dashboard';

  if (path.includes('server')) {
    activeMenu = 'servers';
  }

  if (path.includes('report')) {
    activeMenu = 'reports';
  }
  if (path.includes('/settings/script-management') || path.includes('/settings/templates')) activeMenu = 'settings-scripts';

  document.querySelectorAll('.sidebar-menu a').forEach((link) => {
    if (link.dataset.menu === activeMenu) {
      link.classList.add('active');
    }
  });
  const settingsActive = ['servers', 'settings-scripts'].includes(activeMenu);
  const settingsButton = document.getElementById('settings-menu-toggle');
  const settingsSubmenu = document.getElementById('settings-submenu');
  if (settingsButton && settingsSubmenu) {
    settingsButton.classList.toggle('active', settingsActive);
    settingsButton.setAttribute('aria-expanded', String(settingsActive));
    settingsSubmenu.hidden = !settingsActive;
  }
}

window.opsboxLayoutReady = applySharedLayout();

document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
});
