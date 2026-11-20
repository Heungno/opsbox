import type { FastifyInstance } from 'fastify';
import { authenticate, clearSessionCookie, createSession, readSessionCookie, sessionCookie } from '../services/authService';

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (request) => ({ user: readSessionCookie(request.headers.cookie) ?? null }));

  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { username?: unknown; password?: unknown };
    if (typeof body?.username !== 'string' || typeof body.password !== 'string') {
      return reply.code(400).send({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
    }
    const user = authenticate(body.username, body.password);
    if (!user) return reply.code(401).send({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    const token = createSession(user.username);
    const secure = process.env.NODE_ENV === 'production';
    reply.header('Set-Cookie', sessionCookie(token, secure));
    return { success: true, user };
  });

  app.post('/auth/logout', async (_request, reply) => {
    const secure = process.env.NODE_ENV === 'production';
    reply.header('Set-Cookie', clearSessionCookie(secure));
    return { success: true };
  });
}
