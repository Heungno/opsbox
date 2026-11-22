import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

import { randomUUID } from 'node:crypto';

import { routes } from './routes';
import { readSessionCookie } from './features/auth/service';
import { UnauthorizedError } from './shared/errors';
import { registerErrorHandlers } from './shared/error-handler';
import { ok } from './shared/http';
import { logger } from './shared/logger';
import { PAGE_PATHS, PUBLIC_ROOT, isPageSourceFile, pageRoutes } from './shared/pages';

/**
 * OpsBox 웹 앱 조립: 요청 로그·보안 헤더·로그인 확인 훅, 정적 파일, 화면·API 라우트.
 * listen과 스케줄러는 server.ts가 맡습니다(테스트는 이 앱을 inject로 씁니다).
 */
export function buildApp(): FastifyInstance {
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
    // /api/auth/me는 로그인 여부 확인(GET)만 공개, 내 정보 수정(PUT)은 로그인 필요
    if (publicPaths.has(pathname) && !(pathname === '/api/auth/me' && request.method !== 'GET')) return;
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

  return app;
}
