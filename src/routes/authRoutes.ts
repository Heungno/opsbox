import type { FastifyInstance } from 'fastify';

import { BadRequestError, TooManyRequestsError, UnauthorizedError } from '../errors';
import { recordAudit } from '../services/auditService';
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from '../services/loginThrottle';
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
    const username = body.username.trim();
    // 잠긴 동안의 시도는 감사 로그에 남기지 않습니다 (대량 시도로 감사 로그가 넘치지 않게)
    try {
      assertLoginAllowed(username, request.ip);
    } catch (error) {
      if (error instanceof TooManyRequestsError) reply.header('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
    const user = authenticate(username, body.password);
    if (!user) {
      recordLoginFailure(username, request.ip);
      recordAudit(request, { action: 'LOGIN_FAILURE', targetId: username.slice(0, 64), username: username.slice(0, 64), summary: `로그인 실패: ${username.slice(0, 64)}` });
      throw new UnauthorizedError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    recordLoginSuccess(username);
    recordAudit(request, { action: 'LOGIN_SUCCESS', targetId: user.username, username: user.username, summary: `로그인: ${user.displayName}` });

    reply.header('Set-Cookie', sessionCookie(createSession(user.username, user.displayName), isSecure()));
    return ok(user);
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.user) recordAudit(request, { action: 'LOGOUT', targetId: request.user.username, summary: `로그아웃: ${request.user.displayName}` });
    reply.header('Set-Cookie', clearSessionCookie(isSecure()));
    return ok(null);
  });
}
