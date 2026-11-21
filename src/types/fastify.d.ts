import 'fastify';

import type { SessionUser } from './auth';

declare module 'fastify' {
  interface FastifyRequest {
    /** 로그인한 사용자 (onRequest 인증 단계에서 설정, 비로그인 요청은 undefined) */
    user?: SessionUser;
  }
}
