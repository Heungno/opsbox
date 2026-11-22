import fs from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import type { SessionUser } from '../features/auth/types';

/*
 * 화면(페이지) 조립
 * 각 페이지 HTML은 본문만 <template id="page-content-template"> 안에 담고,
 * 서버가 공통 레이아웃(shared/fragments/layout.html: 사이드바 + 본문 틀)에 끼워 한 번에 보냅니다.
 * 현재 메뉴 표시와 로그인 사용자 이름도 서버에서 채우므로, 브라우저는 레이아웃을 따로 불러오거나
 * 화면이 다 그려진 뒤 사이드바를 끼워 넣을 필요가 없습니다(깜빡임·추가 요청 없음).
 */

export const PUBLIC_ROOT = path.join(process.cwd(), 'src', 'public');

const LAYOUT_FILE = 'shared/fragments/layout.html';
const CONTENT_TEMPLATE_OPEN = '<template id="page-content-template">';

interface PageDefinition {
  /** 이 화면을 여는 주소들 (첫 번째가 대표 주소) */
  paths: string[];
  /** src/public 기준 페이지 파일 */
  file: string;
  /** 사이드바에서 강조할 메뉴 (layout.html의 data-menu 값) */
  menu: string;
}

export const PAGES: PageDefinition[] = [
  { paths: ['/', '/dashboard', '/dashboard.html'], file: 'dashboard/dashboard.html', menu: 'dashboard' },
  { paths: ['/reports'], file: 'reports/report-list.html', menu: 'reports' },
  { paths: ['/reports/detail'], file: 'reports/report-detail.html', menu: 'reports' },
  { paths: ['/servers'], file: 'settings/server-management/server-list.html', menu: 'servers' },
  { paths: ['/settings/server-management', '/servers/detail'], file: 'settings/server-management/server-detail.html', menu: 'servers' },
  { paths: ['/settings/script-management', '/settings/templates'], file: 'settings/script-management/script-management.html', menu: 'settings-scripts' },
  { paths: ['/settings/policy-management'], file: 'settings/policy-management/policy-management.html', menu: 'policy-management' },
  { paths: ['/settings/common-code-management'], file: 'settings/common-code-management/common-code-management.html', menu: 'common-code-management' },
  { paths: ['/settings/audit-logs'], file: 'settings/audit-logs/audit-logs.html', menu: 'audit-logs' },
  { paths: ['/account'], file: 'account/account.html', menu: 'account' },
];

/** 로그인해야 열 수 있는 화면 주소 */
export const PAGE_PATHS = new Set(PAGES.flatMap((page) => page.paths));

/** 그대로 열리면 안 되는 조립 전 원본 파일: 페이지 원본과 레이아웃 (정적 파일로는 내보내지 않음) */
const PAGE_FILES = new Set([...PAGES.map((page) => `/${page.file}`), `/${LAYOUT_FILE}`]);
export const isPageSourceFile = (pathname: string) => PAGE_FILES.has(pathname);

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** start 위치의 <template>과 짝이 맞는 </template> 위치 (안쪽에 template이 또 있어도 됨) */
function matchingTemplateEnd(html: string, start: number): number {
  const tag = /<(\/?)template\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index;
  }
  return -1;
}

/** 사이드바: 현재 메뉴 강조, 설정 하위 메뉴면 설정 그룹 펼침, 사용자 이름 */
function renderLayout(layout: string, menu: string, user?: SessionUser): string {
  const menuAttribute = `data-menu="${menu}"`;
  if (!layout.includes(menuAttribute)) throw new Error(`layout.html에 메뉴(${menu})가 없습니다.`);
  const submenu = layout.match(/<div id="settings-submenu"[\s\S]*?<\/div>/)?.[0] ?? '';
  const settingsOpen = submenu.includes(menuAttribute);
  const displayName = user?.displayName || user?.username || '알 수 없음';

  const values: Record<string, string> = {
    'settings-active': settingsOpen ? ' active' : '',
    'settings-expanded': String(settingsOpen),
    'settings-hidden': settingsOpen ? '' : ' hidden',
    'user-name': escapeHtml(displayName),
    'user-initial': escapeHtml([...displayName][0]?.toUpperCase() || '?'),
  };
  return layout
    .replace(/^\s*<!--[\s\S]*?-->\s*/, '')
    .replace(menuAttribute, `${menuAttribute} class="active" aria-current="page"`)
    .replace(/\{\{([a-z-]+)\}\}/g, (placeholder, key: string) => (key in values ? values[key] : placeholder));
}

/** 페이지 HTML의 본문 template을 레이아웃(사이드바 포함)으로 바꿔 끼운 완성 화면 */
export function composePage(pageHtml: string, layoutHtml: string, menu: string, user?: SessionUser): string {
  const start = pageHtml.indexOf(CONTENT_TEMPLATE_OPEN);
  const end = start < 0 ? -1 : matchingTemplateEnd(pageHtml, start);
  if (end < 0) throw new Error(`페이지에 ${CONTENT_TEMPLATE_OPEN}…</template> 본문이 없습니다.`);
  const content = pageHtml.slice(start + CONTENT_TEMPLATE_OPEN.length, end);
  const layout = renderLayout(layoutHtml, menu, user);
  if (!layout.includes('{{page-content}}')) throw new Error('layout.html에 {{page-content}} 자리가 없습니다.');
  return pageHtml.slice(0, start)
    + layout.replace('{{page-content}}', () => content)
    + pageHtml.slice(end + '</template>'.length);
}

const readPublic = (file: string) => fs.readFile(path.join(PUBLIC_ROOT, file), 'utf8');

/** 화면 주소 등록 (파일은 요청마다 읽어서 수정 내용이 바로 반영됨; 몇 KB라 부담 없음) */
export async function pageRoutes(app: FastifyInstance) {
  for (const page of PAGES) {
    for (const url of page.paths) {
      app.get(url, async (request, reply) => {
        const [pageHtml, layoutHtml] = await Promise.all([readPublic(page.file), readPublic(LAYOUT_FILE)]);
        return reply
          .type('text/html; charset=utf-8')
          .header('Cache-Control', 'no-cache')
          .send(composePage(pageHtml, layoutHtml, page.menu, request.user));
      });
    }
  }
}
