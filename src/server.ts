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
  return reply.sendFile('dashboard.html');
});

/*
 * Home
 */
app.get('/server', async (request, reply) => {
  return reply.sendFile('server.html');
});

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
