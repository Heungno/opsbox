import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import path from 'path';

import { routes } from './routes';
import { handleError } from './utils/errorHandler';

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

app.setErrorHandler((error, request, reply) => {
  const response = handleError(reply, error);

  reply.send(response);
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
  return reply.sendFile('dashboard/index.html');
});

app.get('/dashboard', async (request, reply) => reply.sendFile('dashboard/index.html'));
app.get('/servers', async (request, reply) => reply.sendFile('servers/index.html'));
app.get('/servers/detail', async (request, reply) => reply.sendFile('servers/detail.html'));
app.get('/reports', async (request, reply) => reply.sendFile('reports/index.html'));
app.get('/reports/detail', async (request, reply) => reply.sendFile('reports/detail.html'));
app.get('/settings/templates', async (request, reply) => reply.sendFile('settings/templates.html'));

// Keep previous page URLs working for existing bookmarks.
app.get('/dashboard.html', async (request, reply) => reply.sendFile('dashboard/index.html'));
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
app.get('/api/health', async () => {
  return {
    success: true,
    service: 'OpsBox',
    status: 'UP',
    timestamp: new Date().toISOString(),
  };
});

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
  } catch (error) {
    app.log.error(error);

    process.exit(1);
  }
}

start();
