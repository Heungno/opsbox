import Fastify, { type FastifyBaseLogger } from 'fastify';
import fastifyStatic from '@fastify/static';

import path from 'path';
import { randomUUID } from 'node:crypto';

import { logger } from './logger';
import { purgeOldAuditLogs } from './services/auditService';

import { routes } from './routes';
import { registerErrorHandlers } from './utils/errorHandler';
import { UnauthorizedError } from './errors';
import { ok } from './utils/http';
import { readSessionCookie } from './services/authService';
import { startResultImportScheduler } from './services/resultImportService';
import { upgradeGeneratedTemplates } from './services/checkBuilder/templates';

const app = Fastify({
  loggerInstance: logger as FastifyBaseLogger,
  // 재시작해도 겹치지 않는 요청 ID (오류 알림·로그 파일·감사 로그에서 같은 값으로 추적)
  genReqId: () => randomUUID().replace(/-/g, '').slice(0, 12),
});

registerErrorHandlers(app);

// 보안 헤더: 다른 사이트의 iframe에 넣기(클릭재킹) 금지, MIME 추측 금지, 외부 스크립트·인라인 스크립트 금지.
// 화면이 style 속성을 쓰므로 style-src만 'unsafe-inline'을 허용합니다.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'same-origin');
  return payload;
});

// 인증: 라우트가 없는 경로(404)보다 먼저 검사하도록 onRequest에서 처리합니다.
app.addHook('onRequest', async (request, reply) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  request.user = readSessionCookie(request.headers.cookie);
  const publicPaths = new Set(['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health']);
  if (publicPaths.has(pathname)) return;
  if (pathname.startsWith('/api/')) {
    if (!request.user) throw new UnauthorizedError('로그인이 필요합니다. 다시 로그인해 주세요.');
    return;
  }
  const protectedPage = ['/', '/dashboard', '/servers', '/settings/server-management', '/servers/detail', '/settings/server-management/detail', '/reports', '/reports/detail', '/settings/templates', '/settings/script-management', '/settings/policy-management', '/settings/common-code-management', '/settings/audit-logs'].includes(pathname)
    || (/\.(html)$/.test(pathname) && /^\/(dashboard|reports|settings)\//.test(pathname));
  if (protectedPage) {
    if (!request.user) return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
  }
});

/* 정적 파일 (화면) */
app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'src', 'public'),
  prefix: '/',
});

/* 화면 경로 */
app.get('/', async (request, reply) => {
  return reply.sendFile('dashboard/dashboard.html');
});

app.get('/login', async (_request, reply) => reply.sendFile('login.html'));

app.get('/dashboard', async (request, reply) => reply.sendFile('dashboard/dashboard.html'));
app.get('/servers', async (request, reply) => reply.sendFile('settings/server-management/server-list.html'));
app.get('/settings/server-management', async (request, reply) => reply.sendFile('settings/server-management/server-detail.html'));
app.get('/servers/detail', async (request, reply) => reply.sendFile('settings/server-management/server-detail.html'));
app.get('/settings/server-management/detail', async (request, reply) => reply.redirect(`/settings/server-management${request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`));
app.get('/reports', async (request, reply) => reply.sendFile('reports/report-list.html'));
app.get('/reports/detail', async (request, reply) => reply.sendFile('reports/report-detail.html'));
app.get('/settings/templates', async (request, reply) => reply.sendFile('settings/script-management/script-management.html'));
app.get('/settings/script-management', async (request, reply) => reply.sendFile('settings/script-management/script-management.html'));
app.get('/settings/policy-management', async (request, reply) => reply.sendFile('settings/policy-management/policy-management.html'));
app.get('/settings/common-code-management', async (request, reply) => reply.sendFile('settings/common-code-management/common-code-management.html'));
app.get('/settings/audit-logs', async (_request, reply) => reply.sendFile('settings/audit-logs/audit-logs.html'));

// 예전 화면 주소(북마크)도 계속 열리도록 연결합니다.
app.get('/dashboard.html', async (request, reply) => reply.sendFile('dashboard/dashboard.html'));
app.get('/server', async (request, reply) => reply.redirect('/servers'));
app.get('/server.html', async (request, reply) => reply.redirect('/servers'));
app.get('/server-detail.html', async (request, reply) => reply.redirect(`/servers/detail${request.url.slice('/server-detail.html'.length)}`));
app.get('/report-list.html', async (request, reply) => reply.redirect('/reports'));
app.get('/report.html', async (request, reply) => reply.redirect(`/reports/detail${request.url.slice('/report.html'.length)}`));

/* API */
app.register(routes, {
  prefix: '/api',
});

/* 상태 확인 */
app.get('/api/health', async () => ok({ service: 'OpsBox', status: 'UP', timestamp: new Date().toISOString() }));

/* 서버 시작 */
async function start() {
  try {
    // 포트: OPSBOX_PORT (기본 3000). 데모 서버(npm run demo:dev)는 3001을 씁니다.
    const port = Number(process.env.OPSBOX_PORT) || 3000;
    await app.listen({
      host: '0.0.0.0',
      port,
    });

    app.log.info({ url: `http://localhost:${port}` }, 'OpsBox 시작');
    app.log.debug(`\n${app.printRoutes()}`);

    startResultImportScheduler();

    // 생성기 버전이 오른 점검 만들기 조각 다시 만들기 (직접 편집한 조각은 그대로)
    const upgraded = upgradeGeneratedTemplates();
    if (upgraded.length) app.log.info({ templates: upgraded }, '점검 만들기 스크립트를 새 생성기로 다시 만들었습니다');

    // 감사 로그 보관 기간 정리: 시작 시 1회 + 하루마다
    purgeOldAuditLogs();
    setInterval(purgeOldAuditLogs, 24 * 60 * 60 * 1000).unref();
  } catch (error) {
    app.log.fatal({ err: error }, 'OpsBox 시작 실패');
    await new Promise((resolve) => setTimeout(resolve, 200)); // 로그 파일에 쓸 시간
    process.exit(1);
  }
}

// 테스트에서 불러올 때는 서버를 띄우지 않고 app만 씁니다.
export { app };
if (require.main === module) runMain();

function runMain() {
  // 종료 신호: 처리 중인 요청을 마치고 로그를 남긴 뒤 종료
  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info({ signal }, 'OpsBox 종료');
      try {
        await app.close();
      } finally {
        logger.flush();
        setTimeout(() => process.exit(0), 200);
      }
    });
  }

  process.on('unhandledRejection', (reason) => app.log.error({ err: reason }, '처리되지 않은 Promise 오류'));
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, '처리되지 않은 예외로 종료합니다');
    setTimeout(() => process.exit(1), 200);
  });

  start();
}
