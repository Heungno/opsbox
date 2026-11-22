import Fastify, { type FastifyBaseLogger } from 'fastify';
import fastifyStatic from '@fastify/static';

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
import { PAGE_PATHS, PUBLIC_ROOT, isPageSourceFile, pageRoutes } from './pages';

const app = Fastify({
  loggerInstance: logger as FastifyBaseLogger,
  // 재시작해도 겹치지 않는 요청 ID (오류 알림·로그 파일·감사 로그에서 같은 값으로 추적)
  genReqId: () => randomUUID().replace(/-/g, '').slice(0, 12),
  // 요청 시작·완료를 따로 남기는 기본 로그 대신, 응답이 끝날 때 한 줄로 남깁니다(아래 onResponse).
  disableRequestLogging: true,
});

// 요청 로그: 콘솔에는 'GET /경로 → 200 (5ms) [요청ID]' 한 줄, 파일에는 method·url·statusCode·responseTime 필드까지
app.addHook('onResponse', async (request, reply) => {
  request.log.info(
    { method: request.method, url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime, ip: request.ip },
    `${request.method} ${request.url} → ${reply.statusCode} (${Math.round(reply.elapsedTime)}ms)`,
  );
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
  const protectedPage = PAGE_PATHS.has(pathname)
    || (/\.(html)$/.test(pathname) && /^\/(dashboard|reports|settings)\//.test(pathname));
  if (protectedPage) {
    if (!request.user) return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
  }
});

/* 정적 파일 (CSS·JS·글꼴·모달 조각). 페이지 원본 HTML은 레이아웃을 끼운 화면 주소로만 엽니다. */
app.register(fastifyStatic, {
  root: PUBLIC_ROOT,
  prefix: '/',
  allowedPath: (pathname) => !isPageSourceFile(pathname),
});

/* 화면 경로 (공통 레이아웃을 끼워서 보냄: src/pages.ts) */
app.register(pageRoutes);

app.get('/login', async (_request, reply) => reply.sendFile('login.html'));
app.get('/settings/server-management/detail', async (request, reply) => reply.redirect(`/settings/server-management${request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`));

// 예전 화면 주소(북마크)도 계속 열리도록 연결합니다. (/dashboard.html은 pages.ts에서 처리)
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

    app.log.info({ address: `http://localhost:${port}` }, 'OpsBox 시작');
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
