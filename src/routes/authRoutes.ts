import type { FastifyInstance } from 'fastify';

import { BadRequestError, UnauthorizedError } from '../errors';
import { authenticate, clearSessionCookie, createSession, readSessionCookie, sessionCookie } from '../services/authService';
import type { LoginRequest } from '../types/auth';
import { ok, requireObject } from '../utils/http';

const isSecure = () => process.env.NODE_ENV === 'production';

export async function authRoutes(app: FastifyInstance) {
  // 로그인 여부 확인 (로그인 안 됨 → data: null)
  app.get('/auth/me', async (request) => ok(readSessionCookie(request.headers.cookie) ?? null));

  app.post<{ Body: Partial<LoginRequest> }>('/auth/login', async (request, reply) => {
    const body = requireObject<Partial<LoginRequest>>(request.body);
    if (typeof body.username !== 'string' || !body.username.trim() || typeof body.password !== 'string' || !body.password) {
      throw new BadRequestError('아이디와 비밀번호를 입력하세요.');
    }
    const user = authenticate(body.username, body.password);
    if (!user) throw new UnauthorizedError('아이디 또는 비밀번호가 올바르지 않습니다.');

    reply.header('Set-Cookie', sessionCookie(createSession(user.username, user.displayName), isSecure()));
    return ok(user);
  });

  app.post('/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', clearSessionCookie(isSecure()));
    return ok(null);
  });
}
