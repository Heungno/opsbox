import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import path from 'path';

import { routes } from './routes';
import { registerErrorHandlers } from './utils/errorHandler';
import { UnauthorizedError } from './errors';
import { ok } from './utils/http';
import { readSessionCookie } from './services/authService';
import { startResultImportScheduler } from './services/resultImportService';

const app = Fastify({
  logger: {
    level: 'info',

    transport: {
      target: 'pino-pretty',

      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  },
});

registerErrorHandlers(app);

// 인증: 라우트가 없는 경로(404)보다 먼저 검사하도록 onRequest에서 처리합니다.
app.addHook('onRequest', async (request, reply) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const publicPaths = new Set(['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health']);
  if (publicPaths.has(pathname)) return;
  if (pathname.startsWith('/api/')) {
    if (!readSessionCookie(request.headers.cookie)) throw new UnauthorizedError('로그인이 필요합니다. 다시 로그인해 주세요.');
    return;
  }
  const protectedPage = ['/', '/dashboard', '/servers', '/settings/server-management', '/servers/detail', '/settings/server-management/detail', '/reports', '/reports/detail', '/settings/templates', '/settings/script-management', '/settings/policy-management', '/settings/common-code-management'].includes(pathname)
    || (/\.(html)$/.test(pathname) && /^\/(dashboard|reports|settings)\//.test(pathname));
  if (protectedPage) {
    if (!readSessionCookie(request.headers.cookie)) return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
  }
});

/*
 * Static Files
 */
app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'src', 'public'),
  prefix: '/',
});

/*
 * Home
 */
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

// Keep previous page URLs working for existing bookmarks.
app.get('/dashboard.html', async (request, reply) => reply.sendFile('dashboard/dashboard.html'));
app.get('/server', async (request, reply) => reply.redirect('/servers'));
app.get('/server.html', async (request, reply) => reply.redirect('/servers'));
app.get('/server-detail.html', async (request, reply) => reply.redirect(`/servers/detail${request.url.slice('/server-detail.html'.length)}`));
app.get('/report-list.html', async (request, reply) => reply.redirect('/reports'));
app.get('/report.html', async (request, reply) => reply.redirect(`/reports/detail${request.url.slice('/report.html'.length)}`));

/*
 * API Routes
 */
app.register(routes, {
  prefix: '/api',
});

/*
 * Health Check
 */
app.get('/api/health', async () => ok({ service: 'OpsBox', status: 'UP', timestamp: new Date().toISOString() }));

/*
 * Start Server
 */
async function start() {
  try {
    await app.listen({
      host: '0.0.0.0',
      port: 3000,
    });

    app.log.info('======================================');
    app.log.info('OpsBox Started');
    app.log.info('URL : http://localhost:3000');
    app.log.info('======================================');

    console.log(app.printRoutes());

    startResultImportScheduler({
      info: (message) => app.log.info(message),
      error: (message) => app.log.error(message),
    });
  } catch (error) {
    app.log.error(error);

    process.exit(1);
  }
}

start();
