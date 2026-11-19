async function applySharedLayout() {
  const root = document.getElementById('shared-layout-root');
  if (!root) return;
  const response = await fetch('/fragments/layout.html');
  if (!response.ok) throw new Error('공통 레이아웃을 불러오지 못했습니다.');
  root.innerHTML = await response.text();
  const page = document.getElementById('page-content');
  const content = document.getElementById('page-content-template');
  if (page && content) page.append(content.content.cloneNode(true));
}

async function loadSidebar() {
  await window.opsboxLayoutReady;
  const response = await fetch('/fragments/sidebar.html');

  const html = await response.text();

  const container = document.getElementById('sidebar-container');

  if (!container) {
    return;
  }

  container.innerHTML = html;

  restoreSidebarState();

  initializeSidebarTheme();

  bindSidebarToggle();

  activateCurrentMenu();
}

function initializeSidebarTheme() {
  const sidebar = document.getElementById('sidebar');
  const select = document.getElementById('sidebar-theme');
  if (!sidebar || !select) return;

  const themes = ['ocean', 'light', 'forest'];
  const savedTheme = localStorage.getItem('sidebar-theme');
  const theme = themes.includes(savedTheme) ? savedTheme : 'ocean';
  applyTheme(theme, sidebar);
  select.value = theme;

  select.addEventListener('change', () => {
    const selectedTheme = themes.includes(select.value) ? select.value : 'ocean';
    applyTheme(selectedTheme, sidebar);
    localStorage.setItem('sidebar-theme', selectedTheme);
  });
}

function applyTheme(theme, sidebar) {
  document.documentElement.dataset.theme = theme;
  sidebar.dataset.theme = theme;
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
  if (path.includes('settings')) activeMenu = 'settings';

  document.querySelectorAll('.sidebar-menu a').forEach((link) => {
    if (link.dataset.menu === activeMenu) {
      link.classList.add('active');
    }
  });
}

window.opsboxLayoutReady = applySharedLayout();

document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
});
